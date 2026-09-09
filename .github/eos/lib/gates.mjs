// Gate & transition engine — the deterministic evaluators behind `.eos/gates.json`.
//
// Two rules govern everything here:
//   1. A missing tool, an unreadable file, a crashed validator or "there are no tests" is BLOCKED
//      or ERROR — never PASS. Absence of proof is never proof.
//   2. Evidence is only meaningful while its inputs are unchanged, so every run records the input
//      hashes and every read re-checks them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectStacks } from '../../hooks/lib/project-config.mjs';
import { loadComplianceProfile, evaluateDataBoundary } from '../../hooks/lib/compliance-profile.mjs';
import { EVALUATOR_VERSION, posix } from './registry.mjs';
import { gatePolicy, changeTypeOf, scopeState, gateInputs, ARTIFACTS } from './state.mjs';
import { hashInputs, GOVERNANCE_INPUTS, writeEvidence, readEvidence, evidenceFreshness } from './evidence.mjs';
import { findWaiver, expiredWaivers } from './waivers.mjs';
import { AC_ID } from './story.mjs';

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'PENDING', 'WAIVED', 'NOT_APPLICABLE', 'STALE', 'ERROR'];
const SEVERITY = { ERROR: 6, BLOCKED: 5, FAIL: 4, STALE: 3, PENDING: 2, WAIVED: 1, NOT_APPLICABLE: 0, PASS: 0 };
export const isBlocking = (s) => ['ERROR', 'BLOCKED', 'FAIL', 'STALE'].includes(s);

/** Checks that shell out to another process. They are skipped (→ PENDING) in "cheap" mode. */
const EXPENSIVE = new Set(['tests-executed', 'eval-threshold', 'spec-alignment', 'secret-scan']);

const ok = (detail = '') => ({ status: 'PASS', detail });
const fail = (detail) => ({ status: 'FAIL', detail });
const blocked = (detail) => ({ status: 'BLOCKED', detail });
const na = (detail) => ({ status: 'NOT_APPLICABLE', detail });

/** Run a bundled validator, recording the real argv + exit code into the evidence. */
function runHook(ctx, relScript, args = []) {
  const full = join(ctx.root, relScript);
  if (!existsSync(full)) return { status: 'BLOCKED', detail: `${relScript} is not present in this repository — the check cannot be proven`, command: null };
  const argv = [process.execPath, full, ...args];
  const r = spawnSync(argv[0], argv.slice(1), { cwd: ctx.root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const command = { argv: [posix(relScript), ...args], exitCode: r.status ?? null, detail: out.split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 400) };
  if (r.error) return { status: 'ERROR', detail: `${relScript} could not be executed: ${r.error.message}`, command };
  return { status: r.status === 0 ? 'PASS' : 'FAIL', detail: command.detail, out, command, exitCode: r.status };
}

// ------------------------------------------------------------------ activation (G0)
const evaluators = {
  projectDeclaration(ctx) {
    if (!ctx.snapshot.projectPresent) return fail('.eos/project.json does not exist — EOS cannot tell what this project is or how it is verified');
    if (ctx.snapshot.projectErrors.length) return fail(ctx.snapshot.projectErrors.join(' · '));
    return ok(`declared ${ctx.snapshot.project.projectType}${ctx.snapshot.project.stacks.length ? ` · ${ctx.snapshot.project.stacks.join(', ')}` : ''}`);
  },
  declarationMatchesRepo(ctx) {
    const p = ctx.snapshot.project;
    if (!p) return blocked('the declaration could not be read');
    const detected = detectStacks(ctx.root);
    if (p.projectType === 'config-only' && detected.length) {
      return fail(`.eos/project.json still declares "config-only" but ${detected.join(', ')} manifest(s) exist — declare "application" (or "library") with commands.test so the quality gate actually runs`);
    }
    const undeclared = detected.filter((s) => !p.stacks.includes(s));
    if (p.projectType !== 'config-only' && undeclared.length) {
      return fail(`stack manifest(s) found but not declared in "stacks": ${undeclared.join(', ')} — their tests would never run`);
    }
    return ok(detected.length ? `declaration matches the detected stack(s): ${detected.join(', ')}` : 'no product stack detected yet');
  },
  workflowProfileResolves(ctx) {
    if (!ctx.snapshot.workflow) return blocked('.eos/workflow.json could not be loaded');
    if (!ctx.snapshot.profile) return fail(`workflowProfile "${ctx.snapshot.profileName}" is not defined in .eos/workflow.json`);
    return ok(`profile "${ctx.snapshot.profileName}"`);
  },
  activationLedger(ctx) {
    if (!ctx.snapshot.artifacts.activation) return fail('docs/eos/activation.md is missing — the one-time hardening items are untracked');
    const text = readFileSync(join(ctx.root, ARTIFACTS.activation), 'utf8');
    const pending = (text.match(/^\s*-\s*\[ \]/gm) || []).length;
    return pending ? ok(`${pending} hardening item(s) still pending (advisory — server-side protection cannot be verified locally)`) : ok('all hardening items are marked done or waived');
  },

  // ---------------------------------------------------------------- prd-ready (G3)
  prdPresent(ctx) {
    return ctx.snapshot.prd.present ? ok('docs/prd.md exists') : fail('docs/prd.md does not exist — the PRD is the single source of truth downstream');
  },
  prdAcParseable(ctx) {
    if (!ctx.snapshot.prd.present) return blocked('no PRD to parse');
    return ctx.snapshot.prd.ids.length
      ? ok(`${ctx.snapshot.prd.ids.length} acceptance criteria`)
      : fail('the PRD contains no parseable acceptance criteria (expected ids of the form AC<n>.<n>)');
  },
  prdAcUnique(ctx) {
    if (!ctx.snapshot.prd.present) return blocked('no PRD to parse');
    const dupes = ctx.snapshot.prd.duplicates;
    return dupes.length ? fail(`duplicate acceptance-criterion id(s): ${dupes.join(', ')} — each id must address exactly one statement`) : ok('every acceptance-criterion id is unique');
  },
  prdNoOpenBlockers(ctx) {
    if (!ctx.snapshot.prd.present) return blocked('no PRD to parse');
    const b = ctx.snapshot.prd.blockers;
    return b.length ? fail(`${b.length} unresolved marker(s) in the PRD: ${b[0].trim().slice(0, 120)}`) : ok('no unresolved BLOCKER / TBD marker');
  },

  // ---------------------------------------------------------------- story-ready (G5)
  storyPresent(ctx) {
    if (!ctx.story) return blocked(`no story with id "${ctx.scopeId}" under docs/stories/ — the gate has nothing to evaluate (create it with the eos-plan agent)`);
    if (ctx.story.errors?.length) return { status: 'ERROR', detail: ctx.story.errors.join(' · ') };
    return ok(`${ctx.story.path}`);
  },
  storyStateNotHandEdited(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.declaredState) return ok('state is not declared in the file — the ledger is authoritative');
    const ledger = scopeState(ctx.snapshot, 'story', ctx.scopeId);
    return ctx.story.declaredState === ledger
      ? ok(`declared state mirrors the ledger (${ledger})`)
      : fail(`the story file claims state "${ctx.story.declaredState}" but the ledger says "${ledger}" — hand-edited state is not evidence; use \`eos transition\``);
  },
  storyAcResolves(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.acs.length) return fail('the story has no acceptance criteria table');
    if (!ctx.snapshot.prd.present) {
      return gatePolicy(ctx.snapshot, ctx.changeType, 'prd-ready') === 'not_applicable'
        ? na(`no PRD is required for a ${ctx.changeType} change`)
        : fail('docs/prd.md does not exist, so the referenced acceptance criteria cannot be resolved');
    }
    const missing = ctx.story.acs.filter((a) => !ctx.snapshot.prd.ids.includes(a.id)).map((a) => a.id);
    return missing.length
      ? fail(`acceptance criteria not found in docs/prd.md: ${missing.join(', ')} — add them to the PRD first or reference the real ids`)
      : ok(`${ctx.story.acs.length} criteria resolve against the PRD`);
  },
  storyAcTestIntent(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.acs.length) return fail('the story has no acceptance criteria table');
    const missing = ctx.story.acs.filter((a) => !a.testIntent).map((a) => a.id);
    return missing.length
      ? fail(`${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no acceptance-test intent — design the test before the implementation (bmad-testarch-atdd)`)
      : ok('every acceptance criterion has a test intent');
  },
  storyAgenticEvalCase(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic, so no acceptance criterion is model-backed');
    if (!ctx.story) return blocked('no story file');
    const missing = ctx.story.acs.filter((a) => !/EVAL-\d+/i.test(a.evalCase) && !a.evalDeclaredNotApplicable).map((a) => a.id);
    return missing.length
      ? fail(`${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no eval case — an agentic product needs EVAL-<n> per criterion, or an explicit "N/A — deterministic" cell`)
      : ok('every acceptance criterion carries an eval case or an explicit N/A');
  },
  storyOpsTasks(ctx) {
    if (!ctx.story) return blocked('no story file');
    const missing = Object.entries(ctx.story.ops).filter(([, v]) => !v).map(([k]) => k);
    if (ctx.story.dependencies === null) missing.push('dependencies');
    return missing.length
      ? fail(`missing concrete task(s): ${missing.join(', ')} — add them under "## Operational tasks" / "## Dependencies" (or record SKIP + reason)`)
      : ok('telemetry, authorization, rollback and dependencies are concrete');
  },

  // ---------------------------------------------------------------- verified (G7)
  testsExecuted(ctx) {
    const p = ctx.snapshot.project;
    if (!p) return blocked('.eos/project.json is missing, so there is no test command to execute');
    if (p.projectType === 'config-only') {
      return blocked('this repository declares projectType "config-only" — a story cannot be verified where no product code is declared');
    }
    const r = runHook(ctx, '.github/hooks/project-gate.mjs', ['--skip-install']);
    if (r.command) ctx.commands.push(r.command);
    if (r.status === 'PASS') return ok('the declared quality commands ran and passed');
    if (r.status === 'ERROR') return { status: 'ERROR', detail: r.detail };
    if (/BLOCKED/.test(r.out || '')) return blocked(`the product-quality gate is BLOCKED: ${r.detail}`);
    return fail(`the product-quality gate failed (exit ${r.exitCode}): ${r.detail}`);
  },
  traceComplete(ctx) {
    if (!ctx.story) return blocked('no story file');
    const rel = ARTIFACTS.traceMatrix;
    if (!existsSync(join(ctx.root, rel))) return fail(`${rel} does not exist — every acceptance criterion needs a traced, passing test at G7`);
    const text = readFileSync(join(ctx.root, rel), 'utf8');
    const passing = new Set();
    const present = new Set();
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((s) => s.trim()).filter(Boolean);
      if (cells.length < 2 || !AC_ID.test(cells[0])) continue;
      present.add(cells[0]);
      if (/✅|✓|\bPASS\b/i.test(cells.at(-1))) passing.add(cells[0]);
    }
    const missing = ctx.story.acs.filter((a) => !present.has(a.id)).map((a) => a.id);
    const failing = ctx.story.acs.filter((a) => present.has(a.id) && !passing.has(a.id)).map((a) => a.id);
    if (missing.length) return fail(`no trace-matrix row for ${missing.join(', ')}`);
    if (failing.length) return fail(`trace-matrix row(s) not passing: ${failing.join(', ')}`);
    return ok(`${ctx.story.acs.length} criteria traced to passing tests`);
  },
  evalThreshold(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic');
    if (!ctx.snapshot.artifacts.evalPlan) return fail('docs/eval-plan.md is missing — an agentic product cannot be verified without an eval design (/eval-spec)');
    if (!ctx.snapshot.project?.commands?.eval) return fail('.eos/project.json declares an agentic product but has no commands.eval — G-EVAL cannot be proven');
    const testsRan = ctx.results.find((c) => c.id === 'tests-executed');
    if (!testsRan || testsRan.status === 'PENDING') return { status: 'PENDING', detail: 'the eval command runs as part of the product-quality gate; run this gate to execute it' };
    return testsRan.status === 'PASS'
      ? ok('the declared eval command ran as part of the product-quality gate and passed')
      : blocked('the eval result is unknown because the product-quality gate did not complete');
  },
  evidenceCurrent(ctx) {
    if (gatePolicy(ctx.snapshot, ctx.changeType, 'story-ready') === 'not_applicable') return na('story readiness does not apply to this change type');
    const prior = readEvidence(ctx.root, 'story-ready', 'story', ctx.scopeId);
    if (prior.error) return { status: 'ERROR', detail: prior.error };
    if (!prior.present) return fail(`no story-ready evidence for ${ctx.scopeId} — run \`eos check --gate story-ready --scope ${ctx.scopeId}\` first`);
    const def = ctx.snapshot.gates?.gates.find((g) => g.id === 'story-ready');
    const f = evidenceFreshness(ctx.root, prior.evidence, { gateDefinition: def });
    if (f.status === 'STALE') {
      // Name the command that actually clears this: re-running THIS gate cannot refresh the
      // PREREQUISITE gate's evidence, and sending the developer round that loop is the exact
      // "you are blocked but not told what to do" failure this layer exists to remove.
      return {
        status: 'STALE',
        detail: `the story-ready evidence is stale: ${f.reasons.join('; ')} — re-run story-ready first, then this gate`,
        command: `node .github/eos/eos.mjs check --gate story-ready --scope ${ctx.scopeId} && node .github/eos/eos.mjs check --gate verified --scope ${ctx.scopeId}`,
      };
    }
    if (prior.evidence.status !== 'PASS' && prior.evidence.status !== 'WAIVED') {
      return fail(`story-ready is ${prior.evidence.status} for ${ctx.scopeId} — a story cannot be verified before it was ready`);
    }
    return ok('the prerequisite story-ready evidence is present and fresh');
  },

  // ---------------------------------------------------------------- release-ready (G8)
  releaseStoriesVerified(ctx) {
    const relevant = ctx.snapshot.stories.filter((s) => !['SPIKE', 'DOC_ONLY'].includes(s.changeType || 'FEATURE'));
    if (!relevant.length) return blocked('there is no story in this release — a release must carry verified content');
    const unfinished = relevant
      .map((s) => ({ id: s.id, state: scopeState(ctx.snapshot, 'story', s.id) }))
      .filter((s) => !['VERIFIED', 'MERGED'].includes(s.state));
    return unfinished.length
      ? fail(`not verified: ${unfinished.map((s) => `${s.id} (${s.state})`).join(', ')}`)
      : ok(`${relevant.length} story/stories verified`);
  },
  releaseSpecAlignment(ctx) {
    const r = runHook(ctx, '.github/hooks/spec-align.mjs', ['--strict']);
    if (r.command) ctx.commands.push(r.command);
    if (r.status === 'PASS') return ok('spec-align --strict passes');
    if (r.status === 'BLOCKED' || r.status === 'ERROR') return { status: r.status, detail: r.detail };
    return fail(`spec-align --strict failed: ${r.detail}`);
  },
  releaseSecretScan(ctx) {
    const r = runHook(ctx, '.github/hooks/secret-scan.mjs');
    if (r.command) ctx.commands.push(r.command);
    if (r.status === 'PASS') return ok('no hardcoded secret found');
    if (r.status === 'BLOCKED' || r.status === 'ERROR') return { status: r.status, detail: r.detail };
    return fail(`the secret scan reported findings: ${r.detail}`);
  },
  releaseComplianceBoundary(ctx) {
    const declaredRegulated = ctx.snapshot.project?.complianceProfile === 'regulated';
    const profile = loadComplianceProfile(ctx.root);
    if (profile.errors.length) return fail(`docs/compliance-profile.json: ${profile.errors.join(' · ')}`);
    const regulated = profile.profile ? profile.profile.regulated || declaredRegulated : declaredRegulated;
    if (!regulated) return na('no regulated regime is declared for this product');
    if (!profile.present) return fail('a regulated regime is declared but docs/compliance-profile.json does not exist — record the structured data-boundary decision via /compliance');
    const problems = evaluateDataBoundary(profile.profile);
    return problems.length ? fail(problems.join(' · ')) : ok('the structured data-boundary decision is approved and implemented');
  },
  releaseWaiversValid(ctx) {
    const expired = expiredWaivers(ctx.root);
    return expired.length
      ? fail(`expired waiver(s): ${expired.map((w) => `${w.file} (${w.waiver.expiresOn})`).join(', ')}`)
      : ok('no waiver has expired');
  },
  releaseOpsArtifacts(ctx) {
    const runbooks = ['ops/runbook.md', 'docs/runbook.md', 'ops/RUNBOOK.md'];
    const runbook = runbooks.find((p) => existsSync(join(ctx.root, p)));
    if (!runbook) return fail(`no runbook found (looked for ${runbooks.join(', ')}) — run /runbook`);
    const text = readFileSync(join(ctx.root, runbook), 'utf8');
    return /rollback/i.test(text) ? ok(`${runbook} documents a rollback`) : fail(`${runbook} does not document a rollback procedure`);
  },
};

function aggregate(results) {
  if (!results.length) return 'ERROR';
  const worst = results.reduce((acc, r) => (SEVERITY[r.status] > SEVERITY[acc] ? r.status : acc), 'PASS');
  if (worst === 'PASS' && results.every((r) => r.status === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return worst;
}

/**
 * Evaluate one gate.
 * @param {'all'|'cheap'} mode  'cheap' never spawns a process: expensive checks fall back to the
 *   stored evidence, or PENDING. That is what makes `eos next` instant while `eos check` is proof.
 */
export function evaluateGate(snapshot, gateId, scopeType, scopeId, { mode = 'all', now = new Date() } = {}) {
  const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
  if (!def) return { gate: gateId, status: 'ERROR', policy: 'required', checks: [], detail: `unknown gate "${gateId}"`, commands: [] };

  const changeType = changeTypeOf(snapshot, scopeType, scopeId);
  const policy = gatePolicy(snapshot, changeType, def.id);
  if (policy === 'not_applicable') {
    return {
      gate: def.id, code: def.code, status: 'NOT_APPLICABLE', policy, changeType, commands: [],
      checks: def.checks.map((c) => ({ id: c.id, status: 'NOT_APPLICABLE', detail: `${changeType} declares ${def.id} not applicable`, fix: c.fix })),
      detail: `${def.id} does not apply to a ${changeType} change (recorded, not skipped)`,
    };
  }

  const story = scopeType === 'story' ? snapshot.stories.find((s) => s.id === scopeId) || null : null;
  const prior = readEvidence(snapshot.root, def.id, scopeType, scopeId);
  const ctx = { root: snapshot.root, snapshot, scopeType, scopeId, story, changeType, commands: [], results: [] };

  for (const check of def.checks) {
    let result;
    if (mode === 'cheap' && EXPENSIVE.has(check.id)) {
      const stored = prior.present && prior.evidence ? (prior.evidence.checks || []).find((c) => c.id === check.id) : null;
      const fresh = prior.evidence ? evidenceFreshness(snapshot.root, prior.evidence, { gateDefinition: def }) : { status: 'STALE', reasons: [] };
      if (stored && fresh.status === 'FRESH') result = { status: stored.status, detail: `${stored.detail || ''} (from recorded evidence)`.trim() };
      else if (stored) result = { status: 'STALE', detail: `previous result ${stored.status} is stale: ${fresh.reasons.join('; ')}` };
      else result = { status: 'PENDING', detail: `not executed yet — run \`eos check --gate ${def.id}${scopeType === 'story' ? ` --scope ${scopeId}` : ''}\`` };
    } else {
      const fn = evaluators[check.evaluator];
      if (!fn) result = { status: 'ERROR', detail: `no evaluator implemented for "${check.evaluator}"` };
      else {
        try { result = fn(ctx); } catch (e) { result = { status: 'ERROR', detail: `evaluator ${check.evaluator} crashed: ${e.message}` }; }
      }
    }
    ctx.results.push({ id: check.id, title: check.title, fix: check.fix, ...result });
  }

  let status = aggregate(ctx.results);
  let waiver = null;
  if (isBlocking(status) && status !== 'ERROR') {
    const found = findWaiver(snapshot.root, { gateId: def.id, scopeType, scopeId, now });
    if (found.waiver && def.waivable !== false && policy === 'waivable') {
      waiver = { file: found.file, reason: found.status.reason };
      status = 'WAIVED';
    } else if (found.waiver) {
      ctx.results.push({
        id: 'waiver-rejected', title: 'waiver applicability', status: 'FAIL',
        detail: `a waiver exists (${found.file}) but ${def.waivable === false ? `gate "${def.id}" is not waivable` : `the ${changeType} policy marks ${def.id} "${policy}", not "waivable"`}`,
      });
    } else if (found.rejected.length) {
      ctx.results.push({ id: 'waiver-rejected', title: 'waiver applicability', status: 'FAIL', detail: found.rejected.map((r) => `${r.file}: ${r.reason}`).join(' · ') });
    }
  }

  return {
    gate: def.id, code: def.code, title: def.title, summary: def.summary, scopeType, scopeId,
    status, policy, changeType, waiver, checks: ctx.results, commands: ctx.commands, mode,
  };
}

/** Run a gate for real and persist the evidence. */
export function runGate(snapshot, gateId, scopeType, scopeId, { now = new Date() } = {}) {
  const result = evaluateGate(snapshot, gateId, scopeType, scopeId, { mode: 'all', now });
  if (result.status === 'ERROR' && !result.checks.length) return { result, evidenceFile: null };
  const def = snapshot.gates?.gates.find((g) => g.id === result.gate);
  const evidence = {
    schemaVersion: 1,
    gate: result.gate,
    gateVersion: def?.version || '0.0.0',
    evaluatorVersion: EVALUATOR_VERSION,
    scope: { type: scopeType, id: String(scopeId) },
    changeType: result.changeType,
    status: result.status,
    commit: snapshot.commit,
    inputs: hashInputs(snapshot.root, gateInputs(snapshot, result.gate, scopeType, scopeId)),
    governanceInputs: hashInputs(snapshot.root, GOVERNANCE_INPUTS),
    commands: result.commands,
    checks: result.checks.map((c) => ({ id: c.id, status: c.status, ...(c.detail ? { detail: String(c.detail).slice(0, 600) } : {}), ...(c.fix ? { fix: c.fix } : {}) })),
    generatedAt: now.toISOString(),
  };
  const evidenceFile = writeEvidence(snapshot.root, evidence);
  return { result, evidence, evidenceFile };
}

/** The recorded (not live) status of a gate — what a transition guard is allowed to trust. */
export function recordedGateStatus(snapshot, gateId, scopeType, scopeId) {
  const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
  if (!def) return { status: 'ERROR', detail: `unknown gate "${gateId}"` };
  const changeType = changeTypeOf(snapshot, scopeType, scopeId);
  if (gatePolicy(snapshot, changeType, def.id) === 'not_applicable') {
    return { status: 'NOT_APPLICABLE', detail: `${def.id} does not apply to a ${changeType} change` };
  }
  const { present, evidence, error } = readEvidence(snapshot.root, def.id, scopeType, scopeId);
  if (error) return { status: 'ERROR', detail: error };
  if (!present) return { status: 'PENDING', detail: `${def.id} has never been run for ${scopeId} — run \`eos check --gate ${def.id}${scopeType === 'story' ? ` --scope ${scopeId}` : ''}\`` };
  const f = evidenceFreshness(snapshot.root, evidence, { gateDefinition: def });
  if (f.status === 'STALE') return { status: 'STALE', detail: `the recorded ${evidence.status} is STALE: ${f.reasons.join('; ')}`, evidence };
  return { status: evidence.status, detail: `recorded ${evidence.status} at ${evidence.generatedAt}`, evidence };
}
