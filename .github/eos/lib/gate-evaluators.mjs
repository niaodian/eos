// The gate rules — one evaluator per check in .eos/gates.json.
//
// Every entry here has the same shape: `(ctx) => { status, detail, artifact? }`, where ctx carries
// the repository root, the snapshot, the scope, the story (when there is one), the change type, and
// a place to record the commands that were actually executed. That uniformity is the GateContract:
// a check is a pure-ish function of project state, and the engine in gates.mjs neither knows nor
// cares which one it is calling.
//
// Adding a gate means adding an entry to .eos/gates.json naming an evaluator, and an evaluator
// here. Nothing else changes — which is the property that makes the registry worth having.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, isAbsolute, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectStacks } from '../../hooks/lib/project-config.mjs';
import { loadComplianceProfile, evaluateDataBoundary } from '../../hooks/lib/compliance-profile.mjs';
import { EVALUATOR_VERSION, posix, WORKFLOW_PATH } from './registry.mjs';
import { gatePolicy, changeTypeOf, scopeState, gateInputs, gateCollections, ARTIFACTS } from './state.mjs';
import { hashInputs, GOVERNANCE_INPUTS, writeEvidence, readEvidence, evidenceFreshness, evidenceFile, sha256File } from './evidence.mjs';
import { currentProductTree, compareProductTree, uncommittedProductChanges } from './product-tree.mjs';
import { readSummary, summaryTreeMismatch, producerTrust, SUMMARY_PATHS } from './machine-summary.mjs';
import { readStageRecord, emptyDocReason, decisionProblem, openBlockers, substantive, STAGE_RECORDS } from './stage-record.mjs';
import { readManifest, manifestProblems, manifestPath } from './release.mjs';
import { resolve as applyProviderVerdict } from '../adapters/contract.mjs';
import { lastGateEvent } from './ledger.mjs';
import { findWaiver, expiredWaivers } from './waivers.mjs';
import { AC_ID, opsDecisionProblem } from './story.mjs';
import {
  STATUSES, SEVERITY, EXPENSIVE, isBlocking, insideRepo, parseTraceMatrix,
  ok, fail, blocked, na, awaiting, runHook, refMatches, selectorPresent,
  stageDocCheck, manifestStories, thresholdMet, listAdrs, runCommandList, aggregate,
  WORKSPACE_RULE, PROVISIONAL_STACK, TEST_REF,
  repoFileExists, duplicates, decisionIsPlaceholder, isRegulated, evidenceIntegrity,
} from './gate-primitives.mjs';

export const evaluators = {
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

  // ---------------------------------------------------------------- discovery-ready (G1)
  discoveryWritten(ctx) {
    return stageDocCheck(ctx, 'discovery', 80);
  },
  discoveryProblemFalsifiable(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const p = r.data.problem;
    // "Users want a better experience" is unfalsifiable, so it can never be wrong — and a problem
    // that can never be wrong cannot tell you when you are done.
    return p.falsifiableBy.trim().length >= 20
      ? ok(`falsifiable: "${p.falsifiableBy.slice(0, 70)}"`)
      : fail('problem.falsifiableBy does not state what observation would prove the problem wrong');
  },
  discoveryMetricMeasurable(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const m = r.data.successMetric;
    const problems = [];
    if (String(m.target ?? '').trim().length === 0) problems.push('no target value');
    if (String(m.dataSource ?? '').trim().length < 5) problems.push('no data source — the number cannot be obtained, only quoted');
    return problems.length ? fail(`successMetric "${m.name}": ${problems.join('; ')}`) : ok(`metric "${m.name}" targets ${m.target}${m.unit || ''} from ${m.dataSource}`);
  },
  discoveryScopeBounded(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const { in: inScope, out } = r.data.scope;
    return inScope.length && out.length
      ? ok(`${inScope.length} in scope · ${out.length} explicitly out of scope`)
      : fail('scope.in and scope.out must both be non-empty — a scope with no boundary is not a scope');
  },
  discoveryNoOpenBlockers(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const open = openBlockers(r.data);
    return open.length ? fail(`${open.length} unresolved blocking question: ${open[0].slice(0, 120)}`) : ok('no unresolved blocking question');
  },

  // ---------------------------------------------------------------- requirements-ready (G2)
  requirementsWritten(ctx) {
    return stageDocCheck(ctx, 'requirements', 80);
  },
  requirementsFunctional(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const dupes = duplicates(r.data.functional.map((f) => f.id));
    if (dupes.length) return fail(`duplicate functional requirement id(s): ${dupes.join(', ')}`);
    return ok(`${r.data.functional.length} functional requirement(s)`);
  },
  requirementsNfr(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const dupes = duplicates(r.data.nfr.map((n) => n.id));
    if (dupes.length) return fail(`duplicate NFR id(s): ${dupes.join(', ')}`);
    const vague = r.data.nfr.filter((n) => !(n.target || '').trim()).map((n) => n.id);
    return vague.length
      ? fail(`NFR(s) with no target: ${vague.join(', ')} — an unquantified NFR cannot be verified at G8`)
      : ok(`${r.data.nfr.length} NFR(s), each with a target`);
  },
  /**
   * The operational pre-flight. Documented as a hard gate, previously satisfied by the string
   * "SKIP". Each of the 1-N concerns is now ADOPT / SKIP+reason / DEFER+owner+trigger. (EOS-AUD-005)
   */
  requirementsOperationalPreFlight(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const pre = r.data.operationalPreFlight;
    const required = ['telemetry', 'authz', 'audit', 'rollback', 'monitoring', 'canary', 'quota', 'i18n', 'multiTenancy', 'capacitySlo', 'dr'];
    if (isRegulated(ctx)) required.push('compliance');
    const problems = [];
    for (const key of required) {
      const problem = decisionProblem(key, pre[key]);
      if (problem) problems.push(problem);
    }
    const deferred_ = required.filter((k) => pre[k]?.decision === 'DEFER');
    if (problems.length) return fail(`operational pre-flight incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`);
    return ok(`${required.length} operational concern(s) decided${deferred_.length ? ` (${deferred_.length} deferred with an owner and a trigger)` : ''}`);
  },
  requirementsNoOpenBlockers(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const open = openBlockers(r.data);
    return open.length ? fail(`${open.length} unresolved blocking question: ${open[0].slice(0, 120)}`) : ok('no unresolved blocking question');
  },

  // ---------------------------------------------------------------- ux-ready (G-UX)
  uxApplicabilityDecided(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; ') };
    if (!r.present) {
      return fail(`${STAGE_RECORDS.design.path} does not exist — a product must state whether it has a user-facing surface. A non-UI product records { "userInterface": false, "skipReason": "…" }; run ${STAGE_RECORDS.design.prompt}.`);
    }
    if (!r.data) return blocked(`${r.path} could not be read`);
    if (r.data.userInterface === false) {
      return (r.data.skipReason || '').trim().length >= 20
        ? na(`no user-facing surface: ${r.data.skipReason.slice(0, 90)}`)
        : fail('userInterface is false but skipReason does not explain why — "SKIP" is not a decision');
    }
    return ok('this product has a user-facing surface, so the UX contract applies');
  },
  uxDocumentsPresent(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (!r.data) return awaiting(STAGE_RECORDS.design.path);
    if (r.data.userInterface === false) return na('no user-facing surface');
    // The audit walked a UI product through with NO docs/DESIGN.md at all: EXPERIENCE alone was
    // enough because only its existence was checked, and only for one of the two files.
    const problems = [ARTIFACTS.design, ARTIFACTS.experience]
      .map((rel) => emptyDocReason(ctx.root, rel, { minWords: 60 }))
      .filter(Boolean);
    return problems.length
      ? fail(`a user-facing product needs both a design and an experience contract: ${problems.join(' · ')} — run ${STAGE_RECORDS.design.prompt}`)
      : ok('docs/DESIGN.md and docs/EXPERIENCE.md both exist and carry content');
  },
  uxCoverageComplete(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (!r.data) return awaiting(STAGE_RECORDS.design.path);
    if (r.data.userInterface === false) return na('no user-facing surface');
    if (!r.data.coverage) return fail('userInterface is true but no coverage is recorded — flows, states, accessibility, tokens and responsive behaviour each need an answer');
    const problems = [];
    for (const [key, value] of Object.entries(r.data.coverage)) {
      if (value.status === 'COVERED') {
        if ((value.ref || '').trim().length < 5) problems.push(`${key}: COVERED but names no document or section`);
      } else {
        const problem = decisionProblem(key, value, { minReason: 15 });
        if (problem) problems.push(problem);
      }
    }
    return problems.length ? fail(`UX coverage incomplete: ${problems.join(' · ')}`) : ok('flows, states, accessibility, tokens and responsive behaviour are each covered or scoped out with a reason');
  },

  // ---------------------------------------------------------------- architecture-ready (G4)
  architectureWritten(ctx) {
    return stageDocCheck(ctx, 'architecture', 100);
  },
  architectureDecisions(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    const d = r.data.decisions;
    const required = ['techStack', 'deploymentTopology', 'authz', 'security', 'audit', 'rollback', 'disasterRecovery', 'dataModel', 'apiContract', 'eventContract'];
    // An agentic product without a tool allow-list, a bounded loop and an eval architecture is not
    // "the same system with an LLM in it" — those ARE its failure modes.
    if (ctx.snapshot.agentic) required.push('toolAllowList', 'boundedOrchestration', 'memoryLayering', 'asyncBoundary', 'evalArchitecture');
    if (isRegulated(ctx)) required.push('regulatedDataBoundary', 'approvalBoundary');
    const problems = [];
    for (const key of required) {
      const problem = decisionProblem(key, d[key], { adoptField: 'summary' });
      if (problem) { problems.push(problem); continue; }
      if (d[key].status === 'DECIDED' && d[key].adr && !repoFileExists(ctx.root, d[key].adr)) {
        problems.push(`${key}: cites ${d[key].adr}, which does not exist inside this repository`);
      }
    }
    // The two irreversible ones must be decided, not declared inapplicable.
    for (const key of ['techStack', 'deploymentTopology']) {
      if (d[key]?.status === 'NOT_APPLICABLE') problems.push(`${key}: cannot be NOT_APPLICABLE — every product runs on some stack, in some topology`);
      else if (d[key]?.status === 'DECIDED' && !d[key].adr) problems.push(`${key}: an irreversible decision needs an ADR (docs/adr/…)`);
    }
    return problems.length
      ? fail(`architecture decisions incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`)
      : ok(`${required.length} architectural concern(s) decided or explicitly N/A with a reason`);
  },
  architectureNfrLanding(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    const req = readStageRecord(ctx.root, 'requirements');
    if (!req.data) return blocked(`${STAGE_RECORDS.requirements.path} is required to check that every NFR lands somewhere`);
    const landed = new Set(r.data.nfrLandingPoints.map((p) => p.nfr));
    const missing = req.data.nfr.map((n) => n.id).filter((id) => !landed.has(id));
    return missing.length
      ? fail(`NFR(s) with no landing point in the architecture: ${missing.join(', ')} — name the component and the mechanism that satisfies each one`)
      : ok(`${landed.size} NFR(s) land on a named component and mechanism`);
  },
  /**
   * Locking the stack in an ADR is only half the decision: every agent in every later session reads
   * the always-on workspace rule, not the ADR. While that rule still carries the PROVISIONAL
   * placeholder it actively contradicts the architecture — a Python project keeps telling agents to
   * run `npm ci`. An ADR nobody's tooling reads is not a locked stack.
   */
  architectureStackLanded(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    if (r.data.decisions?.techStack?.status !== 'DECIDED') {
      return na('the tech stack is not DECIDED yet, so there is nothing to land in the workspace rule');
    }
    if (!repoFileExists(ctx.root, WORKSPACE_RULE)) {
      // The failure this check exists to prevent is a placeholder CONTRADICTING the ADR. With no
      // workspace rule there is no contradiction, and inventing a file-must-exist requirement here
      // would be G4 enforcing something it was never about.
      return na(`${WORKSPACE_RULE} does not exist, so no always-on rule can contradict the locked stack`);
    }
    const text = readFileSync(join(ctx.root, WORKSPACE_RULE), 'utf8');
    return PROVISIONAL_STACK.test(text)
      ? fail(`${WORKSPACE_RULE} still carries the PROVISIONAL placeholder while docs/architecture.json declares the stack DECIDED — declare the stack in .eos/project.json, then run \`node .github/eos/eos.mjs stack sync --write\` to render the "Local commands" block from it`)
      : ok(`${WORKSPACE_RULE} no longer carries the provisional stack placeholder`);
  },

  // ---------------------------------------------------------------- prd-ready (G3)
  prdPresent(ctx) {
    return ctx.snapshot.prd.present ? ok('docs/prd.md exists') : fail('docs/prd.md does not exist — the PRD is the single source of truth downstream');
  },
  prdAcParseable(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const prd = ctx.snapshot.prd;
    if (!prd.defined.length) {
      return fail(prd.referenced.length
        ? `the PRD mentions ${prd.referenced.join(', ')} but DEFINES none of them — a criterion is defined by a list item, table row or heading that states it, not by a sentence that names it`
        : 'the PRD contains no parseable acceptance criteria (expected ids of the form AC<n>.<n>)');
    }
    // EOS-AUD-004: an id that only ever appears inside prose is a reference, and a story that
    // claims to implement it is claiming to implement a sentence.
    if (prd.referencedOnly.length) {
      return fail(`referenced but never defined: ${prd.referencedOnly.join(', ')} — state each one as a list item, table row or heading with its criterion text, or stop citing it`);
    }
    if (prd.unstated.length) {
      return fail(`declared with no statement: ${prd.unstated.join(', ')} — an id with an empty criterion is a placeholder`);
    }
    return ok(`${prd.defined.length} acceptance criteria, each with a statement`);
  },
  /** Every requirement must have at least one acceptance criterion, or it is unspecified. */
  prdCoversRequirements(ctx) {
    const req = readStageRecord(ctx.root, 'requirements');
    if (!req.present) return na('no structured requirements record to cross-check (docs/requirements.json)');
    if (!req.data) return { status: 'ERROR', detail: `${req.path}: ${req.errors.join('; ')}` };
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const { sections, statements } = ctx.snapshot.prd;
    const uncovered = [];
    for (const fr of req.data.functional) {
      const idRe = new RegExp(`\\b${fr.id}\\b`);
      const inline = [...statements.entries()].some(([, s]) => idRe.test(s));
      const inSection = sections.some((s) => s.acs.length && idRe.test(s.text));
      if (!inline && !inSection) uncovered.push(fr.id);
    }
    return uncovered.length
      ? fail(`requirement(s) with no acceptance criterion in the PRD: ${uncovered.join(', ')} — cite the requirement id next to its criteria, or in the heading section that defines them`)
      : ok(`${req.data.functional.length} requirement(s) each carry at least one acceptance criterion`);
  },
  prdAcUnique(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const dupes = ctx.snapshot.prd.duplicates;
    return dupes.length ? fail(`duplicate acceptance-criterion id(s): ${dupes.join(', ')} — each id must address exactly one statement`) : ok('every acceptance-criterion id is unique');
  },
  prdNoOpenBlockers(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
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
    const labels = { telemetry: 'Telemetry', authorization: 'Authorization', rollback: 'Rollback' };
    const problems = Object.entries(ctx.story.ops)
      .map(([key, value]) => opsDecisionProblem(labels[key], value))
      .filter(Boolean);
    // An empty "## Dependencies" heading used to satisfy this check, because only a MISSING
    // heading was treated as unanswered.
    const deps = (ctx.story.dependencies || '').replace(/[-*+\s]/g, '');
    if (ctx.story.dependencies === null) problems.push('Dependencies: no "## Dependencies" section');
    else if (!deps.length) problems.push('Dependencies: the section is empty — list them, or write "none — <why nothing blocks this story>"');
    else if (/^none$/i.test(deps)) problems.push('Dependencies: "none" on its own — say why nothing blocks this story');
    return problems.length
      ? fail(`${problems.join(' · ')}`)
      : ok('telemetry, authorization, rollback and dependencies are decided (adopted with an owner and a verification, or skipped/deferred with a reason)');
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
    if (!existsSync(join(ctx.root, rel))) return fail(`${rel} does not exist — every acceptance criterion needs a traced, executed test at G7`);
    const rows = parseTraceMatrix(readFileSync(join(ctx.root, rel), 'utf8'));

    // (1) The human mapping: which test is claimed to prove which criterion.
    const missing = ctx.story.acs.filter((a) => !rows.has(a.id)).map((a) => a.id);
    if (missing.length) return fail(`no trace-matrix row for ${missing.join(', ')}`);

    // (2) The machine result. A row ending in "PASS" is a claim; this file is the run. Without it
    //     the gate certifies prose, which is the whole of EOS-AUD-006.
    const run = readSummary(ctx.root, 'testRun');
    if (run.errors.length) return { status: 'ERROR', detail: `${run.path}: ${run.errors.join('; ')}` };
    if (!run.present) {
      return fail(`${SUMMARY_PATHS.testRun} does not exist — a hand-written PASS in ${rel} is a claim, not a result. Emit the machine test-run summary from your runner (see docs/eos/examples/trace-evidence/).`);
    }
    const tree = currentProductTree(ctx.root);
    const mismatch = summaryTreeMismatch(run.data, tree.identity?.digest || null);
    // Nothing is WRONG with these results — they describe other code. That is staleness, and
    // reporting it as a failure would send a developer to debug a passing suite.
    if (mismatch) {
      return {
        status: 'STALE',
        detail: `${run.path} does not describe this code: ${mismatch}. Re-run the tests so the runner regenerates it, then re-run this gate.`,
      };
    }

    const byAc = new Map();
    for (const r of run.data.results) {
      if (!byAc.has(r.ac)) byAc.set(r.ac, []);
      byAc.get(r.ac).push(r);
    }

    const problems = [];
    for (const ac of ctx.story.acs) {
      const row = rows.get(ac.id);
      const executed = byAc.get(ac.id) || [];
      if (!executed.length) { problems.push(`${ac.id}: no executed test result in ${run.path}`); continue; }
      const failed = executed.filter((r) => r.status !== 'PASS');
      if (failed.length) { problems.push(`${ac.id}: ${failed.map((f) => `${f.testPath} ${f.status}`).join(', ')}`); continue; }
      // (3) The test file must EXIST. A trace row pointing at a path that was never written is the
      //     cheapest possible fake, and a summary can name it just as cheaply.
      for (const r of executed) {
        if (!repoFileExists(ctx.root, r.testPath)) { problems.push(`${ac.id}: the executed test path "${r.testPath}" does not exist inside this repository`); continue; }
        // (4) The selector, when the file is readable text, must actually appear in it.
        if (r.selector && !selectorPresent(ctx.root, r.testPath, r.selector)) {
          problems.push(`${ac.id}: "${r.selector}" was reported as executed but does not appear in ${r.testPath}`);
        }
      }
      // (5) The human row and the machine result must agree on WHICH test proves the criterion.
      // A row that names a selector must be answered by a result that HAS one: accepting a
      // selector-less result would let one coarse "the file ran" stand in for every criterion in it.
      const namedSelectors = row.testRefs.filter((ref) => ref.includes('::'));
      if (namedSelectors.length && executed.some((r) => !r.selector)) {
        problems.push(`${ac.id}: ${rel} names a specific test but the recorded result has no selector`);
      }
      if (row.testRefs.length && !row.testRefs.some((ref) => executed.some((r) => refMatches(ref, r)))) {
        problems.push(`${ac.id}: ${rel} points at ${row.testRefs.join(' / ')} but the executed test was ${executed.map((r) => r.testPath).join(', ')}`);
      }
      if (!row.testRefs.length) problems.push(`${ac.id}: the ${rel} row names no test file — a trace row without a test reference proves nothing`);
    }
    return problems.length
      ? fail(`trace evidence incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`)
      : ok(`${ctx.story.acs.length} criteria traced to executed, passing tests (run ${run.data.runId || run.data.generatedAt})`);
  },
  evalThreshold(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic');
    if (!ctx.snapshot.artifacts.evalPlan) return fail('docs/eval-plan.md is missing — an agentic product cannot be verified without an eval design (/eval-spec)');
    if (!ctx.snapshot.project?.commands?.eval) return fail('.eos/project.json declares an agentic product but has no commands.eval — G-EVAL cannot be proven');
    const testsRan = ctx.results.find((c) => c.id === 'tests-executed');
    if (!testsRan || testsRan.status === 'PENDING') return { status: 'PENDING', detail: 'the eval command runs as part of the product-quality gate; run this gate to execute it' };
    if (testsRan.status !== 'PASS') return blocked('the eval result is unknown because the product-quality gate did not complete');

    // Exit code 0 says a process ended, not that a threshold was met. The summary says which
    // prompt / model / dataset / grader produced which number against which threshold.
    const summary = readSummary(ctx.root, 'evalSummary');
    if (summary.errors.length) return { status: 'ERROR', detail: `${summary.path}: ${summary.errors.join('; ')}` };
    if (!summary.present) {
      return fail(`the eval command exited 0 but ${SUMMARY_PATHS.evalSummary} does not exist — exit code 0 is not a met threshold. Make commands.eval write the machine summary (see docs/eos/examples/eval-starter/).`);
    }
    const tree = currentProductTree(ctx.root);
    const mismatch = summaryTreeMismatch(summary.data, tree.identity?.digest || null);
    if (mismatch) return { status: 'STALE', detail: `${summary.path} does not describe this system: ${mismatch}` };

    const failed = summary.data.cases.filter((c) => c.status !== 'PASS' || !thresholdMet(c));
    if (failed.length) {
      return fail(`eval case(s) below threshold: ${failed.map((c) => `${c.id} ${c.metric} ${c.observed} vs ${c.comparator || '>='} ${c.threshold}${c.status === 'PASS' ? ' (reported PASS — the numbers say otherwise)' : ''}`).join('; ')}`);
    }

    // Every eval case the story declares must appear in the summary — otherwise "all cases passed"
    // can be satisfied by reporting one trivial case and omitting the rest.
    const declared = new Set((ctx.story?.acs || []).flatMap((a) => (a.evalCase.match(/EVAL-\d+/gi) || []).map((s) => s.toUpperCase())));
    const reported = new Set(summary.data.cases.map((c) => c.id.toUpperCase()));
    const absent = [...declared].filter((id) => !reported.has(id));
    if (absent.length) return fail(`the story declares eval case(s) the summary does not report: ${absent.join(', ')}`);

    const s = summary.data.subject;
    return ok(`${summary.data.cases.length} eval case(s) met their threshold (${s.model}${s.modelVersion ? `@${s.modelVersion}` : ''} · ${s.datasetRef} · ${s.graderRef})`);
  },
  evidenceCurrent(ctx) {
    if (gatePolicy(ctx.snapshot, ctx.changeType, 'story-ready') === 'not_applicable') return na('story readiness does not apply to this change type');
    const prior = readEvidence(ctx.root, 'story-ready', 'story', ctx.scopeId);
    if (prior.error) return { status: 'ERROR', detail: prior.error };
    if (!prior.present) return fail(`no story-ready evidence for ${ctx.scopeId} — run \`eos check --gate story-ready --scope ${ctx.scopeId}\` first`);
    const tampered = evidenceIntegrity(ctx.snapshot, prior.evidence);
    if (tampered.length) return { status: 'ERROR', detail: `the story-ready evidence is not trustworthy: ${tampered.join('; ')}` };
    const def = ctx.snapshot.gates?.gates.find((g) => g.id === 'story-ready');
    const f = evidenceFreshness(ctx.root, prior.evidence, {
      gateDefinition: def,
      expectedInputs: gateInputs(ctx.snapshot, 'story-ready', 'story', ctx.scopeId),
      collections: gateCollections(ctx.snapshot, 'story-ready', 'story', ctx.scopeId),
    });
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

  /**
   * The identity of what was tested. Without this the whole `verified` gate asserts only "some
   * commands exited 0 at some point", which a later rewrite of the source silently invalidates
   * while every recorded hash keeps matching. (EOS-AUD-001)
   */
  productTreeBound(ctx) {
    const current = currentProductTree(ctx.root);
    if (!current.available) return blocked(`${current.reason} — run this gate inside a git repository`);
    ctx.productTree = current.identity;
    return ok(`bound to ${current.identity.fileCount} product file(s) · ${current.identity.digest.slice(0, 12)}`);
  },

  // ---------------------------------------------------------------- release-ready (G8)
  /**
   * Re-run the product quality commands ON THE CANDIDATE. `stories-verified` only reads story
   * state, so without this a release could ship a tree that no test has ever seen. (EOS-AUD-001/007)
   */
  releaseCandidateQuality(ctx) {
    const p = ctx.snapshot.project;
    if (!p) return blocked('.eos/project.json is missing, so there is no test command to execute for the candidate');
    if (p.projectType === 'config-only') {
      return blocked('this repository declares projectType "config-only" — a release candidate cannot be proven where no product code is declared');
    }
    const r = runHook(ctx, '.github/hooks/project-gate.mjs', ['--skip-install']);
    if (r.command) ctx.commands.push(r.command);
    if (r.status === 'PASS') return ok('the declared quality commands ran and passed on the current candidate tree');
    if (r.status === 'ERROR') return { status: 'ERROR', detail: r.detail };
    if (/BLOCKED/.test(r.out || '')) return blocked(`the product-quality gate is BLOCKED on the candidate: ${r.detail}`);
    return fail(`the product-quality gate failed on the candidate (exit ${r.exitCode}): ${r.detail}`);
  },
  /**
   * Every included story must have been verified against THIS tree. A story verified two commits
   * ago carries a VERIFIED state that says nothing about the candidate.
   */
  releaseStoryEvidenceCurrent(ctx) {
    const relevant = manifestStories(ctx);
    if (relevant === null) return awaiting(manifestPath(ctx.scopeId));
    if (!relevant.length) return blocked('the manifest includes no story, so there is no verification to bind to the candidate');
    const current = currentProductTree(ctx.root);
    if (!current.available) return blocked(`${current.reason} — a release cannot be bound to an unknown tree`);
    const problems = [];
    for (const s of relevant) {
      if (gatePolicy(ctx.snapshot, s.changeType || 'FEATURE', 'verified') === 'not_applicable') continue;
      const prior = readEvidence(ctx.root, 'verified', 'story', s.id);
      if (prior.error) { problems.push(`${s.id}: ${prior.error}`); continue; }
      if (!prior.present) { problems.push(`${s.id}: no verified evidence at all`); continue; }
      const tampered = evidenceIntegrity(ctx.snapshot, prior.evidence);
      if (tampered.length) { problems.push(`${s.id}: ${tampered[0]}`); continue; }
      // Ledger state says a gate passed ONCE. This file is the current result, and a later re-run
      // that produced a FAIL must not be accepted merely because it is fresh and well-formed.
      if (!['PASS', 'WAIVED'].includes(prior.evidence.status)) {
        problems.push(`${s.id}: its latest verification is ${prior.evidence.status}, not PASS`);
        continue;
      }
      const cmp = compareProductTree(ctx.root, prior.evidence.productTree || null, { recordedCommit: prior.evidence.commit || null });
      if (cmp.status !== 'MATCH') problems.push(`${s.id}: ${cmp.reasons[0]}`);
    }
    return problems.length
      ? fail(`story verification does not describe this candidate — re-verify: ${problems.join(' · ')}`)
      : ok(`${relevant.length} story/stories were verified against this exact candidate tree`);
  },
  /** A candidate is a committed thing: an uncommitted edit is not in any artifact anyone can ship. */
  releaseCandidateCommitted(ctx) {
    if (!ctx.snapshot.commit) return blocked('the current commit is unknown (no git repository), so this candidate cannot be identified');
    const dirty = uncommittedProductChanges(ctx.root);
    if (dirty === null) return blocked('git could not report the working-tree status, so candidate cleanliness is unproven');
    return dirty.length
      ? fail(`the working tree has ${dirty.length} uncommitted product change(s) (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', …' : ''}) — commit them, then re-verify the candidate`)
      : ok(`candidate ${ctx.snapshot.commit.slice(0, 8)} has no uncommitted product change`);
  },

  /**
   * The manifest IS the release's membership. Without it EOS would have to infer membership from
   * "every story that exists", which re-verifies finished work against every future candidate and
   * makes two release trains impossible.
   */
  releaseManifest(ctx) {
    const r = readManifest(ctx.root, ctx.scopeId);
    if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; ') };
    if (!r.present) {
      return fail(`${manifestPath(ctx.scopeId)} does not exist — a release must state which stories it ships. `
        + `Create it with \`node .github/eos/eos.mjs release init --release ${ctx.scopeId}\` (it proposes a manifest from the current stories; you decide what is in it).`);
    }
    const problems = manifestProblems(ctx.snapshot, r.manifest);
    if (problems.length) return fail(`${r.path}: ${problems.join(' · ')}`);
    ctx.manifest = r.manifest;
    ctx.manifestDigest = r.digest;
    // A manifest written for a different PRODUCT is a plan for a different candidate. The binding
    // that decides is the product tree, not the commit: committing the manifest itself advances the
    // commit while changing nothing about the product, and failing on that would be self-reference
    // (the tree deliberately excludes `.eos/releases/` for exactly this reason).
    if (r.manifest.productTreeDigest) {
      const current = currentProductTree(ctx.root);
      if (!current.available) return blocked(`${current.reason} — a manifest cannot be bound to an unknown tree`);
      if (r.manifest.productTreeDigest !== current.identity.digest) {
        return fail(`${r.path} was written for product tree ${String(r.manifest.productTreeDigest).slice(0, 12)}`
          + ` but the tree is now ${current.identity.digest.slice(0, 12)}`
          + `${r.manifest.candidateCommit && ctx.snapshot.commit ? ` (recorded candidate ${String(r.manifest.candidateCommit).slice(0, 8)}, HEAD ${ctx.snapshot.commit.slice(0, 8)})` : ''}`
          + ` — review what changed, then re-bind with \`eos release bind --release ${ctx.scopeId}\``);
      }
    }
    const inc = r.manifest.includedStories.length;
    const exc = (r.manifest.excludedStories || []).length;
    return ok(`${inc} story/stories included, ${exc} explicitly excluded`);
  },

  releaseStoriesVerified(ctx) {
    const included = manifestStories(ctx);
    if (included === null) return awaiting(manifestPath(ctx.scopeId));
    if (!included.length) return blocked('the manifest includes no story — a release must carry verified content, or state in `note` why it ships none');
    const unfinished = included
      .map((s) => ({ id: s.id, state: scopeState(ctx.snapshot, 'story', s.id) }))
      .filter((s) => !['VERIFIED', 'MERGED'].includes(s.state));
    return unfinished.length
      ? fail(`not verified: ${unfinished.map((s) => `${s.id} (${s.state})`).join(', ')}`)
      : ok(`${included.length} story/stories verified`);
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
    // The release prompt asks a human for rollback, gradual rollout and health/readiness. If the
    // machine gate only looks for "rollback", the other two are advisory theatre. (EOS-AUD-007)
    const required = [
      { key: 'rollback', re: /\brollback\b/i, fix: 'the exact steps to undo this release' },
      { key: 'canary / gradual rollout', re: /\b(canary|gradual rollout|progressive delivery|blue[- ]?green|ring deployment|percentage rollout)\b/i, fix: 'how the change reaches users incrementally (or why it cannot)' },
      { key: 'health / readiness', re: /\b(health ?check|healthz|readiness|liveness|\/health\b|\/ready\b)\b/i, fix: 'the signal that says the deployment is serving' },
    ];
    const absent = required.filter((r) => !r.re.test(text));
    return absent.length
      ? fail(`${runbook} does not document ${absent.map((a) => `${a.key} (${a.fix})`).join('; ')} — run /runbook and /deploy-topology`)
      : ok(`${runbook} documents rollback, gradual rollout and health/readiness`);
  },
  /**
   * The operational mechanisms must belong to the topology that was actually chosen. A serverless
   * product claiming a blue/green cluster rollback is documentation, not a plan.
   */
  releaseDeploymentTopology(ctx) {
    const adrs = listAdrs(ctx.root);
    const topology = adrs.find((a) => /deployment|topology|hosting|infrastructure/i.test(a.name) || /deployment topology/i.test(a.text));
    if (!topology) {
      return fail('no deployment-topology decision record under docs/adr/ — run /deploy-topology so rollback, canary and health/readiness are the mechanisms this topology actually has');
    }
    if (decisionIsPlaceholder(topology.text)) {
      return fail(`${topology.path} records no decided topology (it is still a template / TBD) — decide it before shipping`);
    }
    return ok(`deployment topology decided in ${topology.path}`);
  },
  /**
   * Dependency / supply-chain audit. Three outcomes that are NOT "pass": findings (FAIL), no
   * declared command (FAIL — it cannot be proven), and no network (DEFERRED — honest, visible, and
   * never green). For a regulated product a deferral is not available: it BLOCKS.
   */
  releaseDependencyAudit(ctx) {
    const regulated = isRegulated(ctx);
    const cmd = ctx.snapshot.project?.commands?.audit;
    if (!cmd) {
      const detail = 'no commands.audit is declared in .eos/project.json, so the supply chain is unaudited (npm audit / pip-audit / cargo audit / govulncheck …)';
      return regulated ? blocked(`${detail} — a regulated product may not ship unaudited`) : fail(detail);
    }
    const r = runCommandList(ctx, 'audit', cmd);
    if (r.status === 'PASS') return ok('the declared dependency audit reported no blocking finding');
    if (r.status === 'BLOCKED') {
      return regulated
        ? blocked(`the dependency audit could not run (${r.detail}) — a regulated product may not ship on an unproven supply chain`)
        : { status: 'DEFERRED', detail: `the dependency audit could not run (${r.detail}). This is DEFERRED, not passed: re-run it with the toolchain/network available before shipping.` };
    }
    if (r.offline) {
      return regulated
        ? blocked(`the dependency audit needs the registry and this machine is offline (${r.detail}) — a regulated release may not defer it`)
        : { status: 'DEFERRED', detail: `the dependency audit needs network access and could not reach the registry (${r.detail}). DEFERRED: it must be re-run online before this candidate ships.` };
    }
    return fail(`the dependency audit reported findings (exit ${r.exitCode}): ${r.detail}`);
  },
  /** Measured NFR results, not a checklist of intentions. */
  /**
   * How trustworthy is the evidence this release rests on? EOS reports the level honestly and lets
   * the project decide: a regulated product may not ship on evidence that is indistinguishable from
   * a hand-written file, while everyone else is not forced into a CI dependency they do not want.
   */
  releaseEvidenceTrust(ctx) {
    const required = readManifest(ctx.root, ctx.scopeId).manifest?.requiredEvidence || [];
    // The project states how much provenance it needs; EOS enforces THAT, rather than choosing for
    // it. Demanding CI of everyone would exclude air-gapped users — who are often the most
    // regulated — and assuming `local` would silently lower the bar. (ADR-005 · D2)
    const policy = ctx.snapshot.project?.evidencePolicy || 'local';
    const MINIMUM = { local: 0, ci: 1, attested: 2 };
    const LEVEL = { UNATTESTED_LOCAL: 0, SELF_REPORTED_CI: 1, ATTESTED: 2 };
    const kinds = [['testRun', 'test-run'], ['nfrSummary', 'nfr-summary'], ...(ctx.snapshot.agentic ? [['evalSummary', 'eval-summary']] : [])];
    const levels = [];
    for (const [kind, label] of kinds) {
      const s = readSummary(ctx.root, kind);
      if (!s.data) continue;
      const trust = producerTrust(s.data);
      levels.push(`${label}: ${trust.level}`);
      // `attested` is a claim until an authority confirms it. Without a provider the honest answer
      // is that it is unverified — which under D4 is exactly what EOS said before adapters existed.
      if (trust.level === 'ATTESTED' && policy === 'attested') {
        const verdict = ctx.providerVerdicts['evidence-provenance'] || null;
        const applied = applyProviderVerdict({ status: 'UNVERIFIED', detail: `${s.path} claims ${trust.attestation} provenance, and no provider is configured to verify it` }, verdict);
        if (applied.status !== 'PASS') {
          return { status: applied.status === 'UNVERIFIED' ? 'BLOCKED' : applied.status, detail: applied.detail };
        }
        levels[levels.length - 1] = `${label}: ATTESTED (${applied.provider})`;
        continue;
      }
      if (LEVEL[trust.level] < MINIMUM[policy]) {
        return fail(`this project declares evidencePolicy "${policy}" but ${s.path} ${trust.detail}`
          + `${policy === 'attested' ? ' — and EOS Core verifies no attestation itself: enable the matching provider adapter' : ''}`);
      }
      if (required.includes(label) && trust.level === 'UNATTESTED_LOCAL') {
        return fail(`the manifest requires ${label} evidence, but ${s.path} ${trust.detail}`);
      }
    }
    if (!levels.length) return na('no machine summary is present for this release');
    // Reported, not blocking, once the declared policy is met. EOS is local-first: a release gate
    // that can never be green on a developer's machine would make the tool unusable for the people
    // it is for, and would quietly turn a cloud service into a dependency.
    const weak = levels.some((l) => l.includes('UNATTESTED_LOCAL'));
    return ok(`policy "${policy}" satisfied — ${levels.join(', ')}`
      + `${weak && policy === 'local' ? '. Local evidence is honest but unattested; raise evidencePolicy to "ci" or "attested" when that matters.' : ''}`);
  },

  releaseNfrEvidence(ctx) {
    const summary = readSummary(ctx.root, 'nfrSummary');
    if (summary.errors.length) return { status: 'ERROR', detail: `${summary.path}: ${summary.errors.join('; ')}` };
    if (!summary.present) {
      return fail(`${SUMMARY_PATHS.nfrSummary} does not exist — the release prompt asks for verified NFR targets, so the machine gate requires the measurements (bmad-testarch-nfr)`);
    }
    const tree = currentProductTree(ctx.root);
    const mismatch = summaryTreeMismatch(summary.data, tree.identity?.digest || null);
    if (mismatch) return { status: 'STALE', detail: `${summary.path} does not describe this candidate: ${mismatch}` };
    const problems = [];
    const deferrals = [];
    for (const t of summary.data.targets) {
      if (t.decision === 'ADOPT') {
        if (t.observed === undefined || t.threshold === undefined) problems.push(`${t.id}: ADOPT with no measurement (needs threshold + observed)`);
        // The verdict is RECOMPUTED. A summary that reports PASS beside numbers that miss the
        // threshold is reporting an intention, which is the thing this check replaced.
        else if (!thresholdMet(t)) problems.push(`${t.id}: ${t.observed}${t.unit || ''} does not meet ${t.comparator || '>='} ${t.threshold}${t.unit || ''}${t.status === 'PASS' ? ' (reported PASS — the numbers say otherwise)' : ''}`);
        else if (t.status !== 'PASS') problems.push(`${t.id}: recorded ${t.status || 'no status'}`);
      } else if (t.decision === 'SKIP') {
        if (!substantive(t.reason, 15)) problems.push(`${t.id}: SKIP without a real reason`);
      } else if (t.decision === 'DEFER') {
        if (!substantive(t.owner, 1) || !substantive(t.trigger, 5)) problems.push(`${t.id}: DEFER without an owner and a trigger`);
        else deferrals.push(`${t.id} → ${t.owner} (${t.trigger})`);
      }
    }
    // Only the targets the summary CHOOSES to mention were checked, so an NFR could be dropped
    // simply by leaving it out. Coverage is therefore driven by the requirements record.
    const req = readStageRecord(ctx.root, 'requirements');
    if (req.data) {
      const covered = new Set(summary.data.targets.map((t) => t.id));
      const uncovered = req.data.nfr.map((n) => n.id).filter((id) => !covered.has(id));
      if (uncovered.length) problems.push(`no result for NFR(s) declared in ${req.path}: ${uncovered.join(', ')}`);
    }
    if (problems.length) return fail(`NFR evidence incomplete: ${problems.join(' · ')}`);
    if (deferrals.length) return { status: 'DEFERRED', detail: `NFR target(s) deferred with an owner and a trigger: ${deferrals.join('; ')} — visible and time-bound, not passed` };
    return ok(`${summary.data.targets.length} NFR target(s) measured or explicitly scoped out`);
  },
  /**
   * Enforcement authority. EOS runs locally and CANNOT see server-side branch protection, so the
   * honest outcome is "recorded" or "unverified" — never a self-issued PASS. (EOS-AUD-007)
   */
  releaseActivationAuthority(ctx) {
    if (!ctx.snapshot.artifacts.activation) return fail('docs/eos/activation.md is missing — there is no record of who can enforce these gates');
    const text = readFileSync(join(ctx.root, ARTIFACTS.activation), 'utf8');
    const items = text.match(/^\s*-\s*\[( |x|X|~)\]\s*(.+)$/gm) || [];
    // An EMPTY ledger has no unchecked item either, so "no open items" alone is satisfied by
    // deleting the list — the cheapest way to make an enforcement claim.
    if (!items.length) return fail(`${ARTIFACTS.activation} tracks no activation item at all — an empty ledger is not an attestation; restore it with /eos-init`);
    const waived = items.filter((l) => /\[~\]/.test(l));
    const unexplained = waived.filter((l) => !substantive(l.replace(/^\s*-\s*\[~\]\s*/, ''), 25));
    if (unexplained.length) {
      return fail(`${unexplained.length} activation item(s) are marked waived with no reason — \`[~] <item> — waived: <why>\` is the contract`);
    }
    const open = items.filter((l) => /\[ \]/.test(l)).map((l) => l.replace(/^\s*-\s*\[ \]\s*/, '').trim());
    // What EOS can conclude on its own. This is the FLOOR: a provider may raise it, never lower it,
    // so configuring one can never make a project worse off than it is today. (ADR-005 · D4)
    const fallback = open.length
      ? { status: 'BLOCKED', detail: `${open.length} enforcement item(s) are still open, and EOS cannot verify server-side settings from here: ${open.slice(0, 3).map((l) => l.slice(0, 80)).join(' · ')} — close them, or mark each \`[~] waived — <reason>\` in docs/eos/activation.md. UNVERIFIED is not PASS.` }
      : { status: 'PASS', detail: `all ${items.length} activation item(s) are closed or explicitly waived-with-reason` };
    const applied = applyProviderVerdict(fallback, ctx.providerVerdicts['enforcement-authority'] || null);
    return { status: applied.status, detail: applied.detail };
  },

  // ---------------------------------------------------------------- telemetry-ready (G9)
  telemetryPlanWritten(ctx) {
    return stageDocCheck(ctx, 'telemetry', 60);
  },
  /** Every discovery success metric must be carried by a real, named signal. */
  telemetrySignalsLand(ctx) {
    const r = readStageRecord(ctx.root, 'telemetry');
    if (!r.data) return awaiting(STAGE_RECORDS.telemetry.path);
    const discovery = readStageRecord(ctx.root, 'discovery');
    if (!discovery.data) return blocked(`${STAGE_RECORDS.discovery.path} is required: G9 proves the SUCCESS METRIC is observable, so it must know what that metric is`);
    const emitted = r.data.signals.map((s) => s.metric.toLowerCase());
    const target = discovery.data.successMetric.name;
    const covered = emitted.some((m) => m.includes(target.toLowerCase()) || target.toLowerCase().includes(m));
    return covered
      ? ok(`the success metric "${target}" is emitted as ${r.data.signals.find((s) => s.metric.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(s.metric.toLowerCase())).emittedAs}`)
      : fail(`the discovery success metric "${target}" is not among the emitted signals (${emitted.join(', ') || 'none'}) — shipping without it means the release cannot be judged`);
  },
  telemetryObservability(ctx) {
    const r = readStageRecord(ctx.root, 'telemetry');
    if (!r.data) return awaiting(STAGE_RECORDS.telemetry.path);
    const problems = [];
    if (r.data.release !== undefined && String(r.data.release) !== String(ctx.scopeId)) {
      problems.push(`this record observes release "${r.data.release}", not "${ctx.scopeId}"`);
    }
    if (!r.data.dashboards.length) problems.push('no dashboard is recorded');
    if (!r.data.alerts.length) problems.push('no alert is recorded');
    const unrouted = r.data.alerts.filter((a) => !(a.routesTo || '').trim()).map((a) => a.name);
    if (unrouted.length) problems.push(`alert(s) that reach nobody: ${unrouted.join(', ')}`);
    if (!(r.data.owner || '').trim()) problems.push('no owner reads these signals');
    if (!(r.data.rolloutMetrics?.rollbackTrigger || '').trim()) problems.push('no rollback trigger — a canary with no abort condition is just a slow deploy');
    // A sink name is naturally short ("audit-log"), so this one is checked on its own terms rather
    // than through the generic decision validator's "say what you will build" minimum.
    const audit = r.data.sensitiveOperationAudit;
    if (audit?.status === 'COVERED') {
      if (!(audit.sink || '').trim()) problems.push('sensitiveOperationAudit is COVERED but names no sink — an audit trail nobody can read is not an audit trail');
      else if (!(audit.operations || []).length) problems.push('sensitiveOperationAudit is COVERED but lists no operation');
    } else if (audit?.status === 'NOT_APPLICABLE') {
      if ((audit.reason || '').trim().length < 15) problems.push('sensitiveOperationAudit is N/A without a reason — say why this product performs no sensitive operation');
    } else {
      problems.push('sensitiveOperationAudit: no decision recorded');
    }
    return problems.length ? fail(`observability incomplete: ${problems.join(' · ')}`) : ok(`${r.data.dashboards.length} dashboard(s), ${r.data.alerts.length} routed alert(s), owner ${r.data.owner}`);
  },

  // ---------------------------------------------------------------- iteration-ready (G10)
  iterationWriteBack(ctx) {
    const r = readStageRecord(ctx.root, 'iteration');
    if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; ') };
    if (!r.present) return fail(`${STAGE_RECORDS.iteration.path} does not exist — what production taught has not been written back, so the specs and the running system are already drifting apart (${STAGE_RECORDS.iteration.prompt})`);
    if (!r.data) return blocked(`${r.path} could not be read`);
    // The record names a release. If nobody checks it, one write-back closes the loop for every
    // release that follows — the learning is written once and reused as a formality.
    if (String(r.data.release) !== String(ctx.scopeId)) {
      return fail(`${r.path} records the write-back for release "${r.data.release}", not "${ctx.scopeId}" — each release closes its own loop`);
    }
    const missing = r.data.specWriteBack.filter((w) => !repoFileExists(ctx.root, w.target)).map((w) => w.target);
    if (missing.length) return fail(`the write-back cites document(s) that do not exist: ${missing.join(', ')}`);
    // "We updated the PRD" is a claim about a file. Binding the content makes reverting it visible,
    // instead of leaving a closed loop that quietly reopened.
    const drifted = r.data.specWriteBack
      .filter((w) => sha256File(ctx.root, w.target) !== w.targetDigest)
      .map((w) => w.target);
    return drifted.length
      ? fail(`the write-back records a different version of ${drifted.join(', ')} than what is on disk — the learning was recorded and then changed or reverted; re-record it with the current digest`)
      : ok(`${r.data.learnings.length} learning(s) written back into ${r.data.specWriteBack.length} spec document(s), each bound to its content`);
  },
  iterationAgenticFeedback(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic');
    const r = readStageRecord(ctx.root, 'iteration');
    if (!r.data) return awaiting(STAGE_RECORDS.iteration.path);
    const problems = [];
    const dataset = r.data.evalDatasetUpdate;
    if (!dataset) problems.push('evalDatasetUpdate is missing — for an agentic product, production feedback must reach the eval dataset or the model never learns from it');
    else {
      const p = decisionProblem('evalDatasetUpdate', { status: dataset.status === 'UPDATED' ? 'DECIDED' : 'NOT_APPLICABLE', summary: dataset.datasetRef, reason: dataset.reason }, { adoptField: 'summary' });
      if (p) problems.push(p);
    }
    if (!r.data.baselineRebaselined) problems.push('baselineRebaselined is missing — state whether the prompt/model/tool surface changed and, if so, which new baseline replaces the old one');
    return problems.length ? fail(problems.join(' · ')) : ok('production feedback reaches the eval dataset and the baseline decision is recorded');
  },
  iterationDecisionRecorded(ctx) {
    const r = readStageRecord(ctx.root, 'iteration');
    if (!r.data) return awaiting(STAGE_RECORDS.iteration.path);
    const d = r.data.decision;
    return (d.owner || '').trim()
      ? ok(`${d.outcome}, owned by ${d.owner}`)
      : fail('the iteration decision has no owner — EOS records the decision, it does not make it');
  },
};
