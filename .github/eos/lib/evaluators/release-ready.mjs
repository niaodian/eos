// release-ready (G8) — Release candidate is shippable.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadComplianceProfile, evaluateDataBoundary } from '../../../hooks/lib/compliance-profile.mjs';
import { gatePolicy, scopeState, ARTIFACTS } from '../state.mjs';
import { readEvidence } from '../evidence.mjs';
import { currentProductTree, compareProductTree, uncommittedProductChanges } from '../product-tree.mjs';
import { readSummary, summaryTreeMismatch, producerTrust, SUMMARY_PATHS } from '../machine-summary.mjs';
import { readStageRecord, substantive, STAGE_RECORDS } from '../stage-record.mjs';
import { readManifest, manifestProblems, manifestPath } from '../release.mjs';
import { resolve as applyProviderVerdict } from '../../adapters/contract.mjs';
import { expiredWaivers } from '../waivers.mjs';
import { verifyRelease } from '../release-integrity.mjs';
import { todayOf } from '../deferrals.mjs';
import { readAdrConfirmation, oneWayDoors } from '../adr.mjs';
import {
  ok, fail, blocked, na, awaiting, runHook, runProjectGate, manifestStories, thresholdMet,
  runCommandList, RUNBOOKS, findTopologyAdr, decisionIsPlaceholder, isRegulated, evidenceIntegrity,
} from '../gate-primitives.mjs';

export const evaluators = {
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
    const r = runProjectGate(ctx);
    if (r.command) ctx.commands.push(r.command);
    if (r.status === 'PASS') return ok('the declared quality commands ran and passed on the current candidate tree');
    if (r.status === 'ERROR') return { status: 'ERROR', detail: r.detail };
    if (r.status === 'BLOCKED') return blocked(`the product-quality gate is BLOCKED on the candidate: ${r.detail}`);
    if (r.status === 'NOT_APPLICABLE') return blocked('the product-quality gate executed no quality command on the candidate, so nothing about it was verified');
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
  /**
   * The signature over the manifest — the same verdict `eos release verify` prints. Present: it must
   * verify, on every track. Absent: FAIL on the Regulated track, NOT_APPLICABLE on Standard. (ADR-012)
   */
  releaseManifestSignature(ctx) {
    const m = readManifest(ctx.root, ctx.scopeId);
    if (!m.manifest) return awaiting(manifestPath(ctx.scopeId));
    const v = verifyRelease(ctx.root, ctx.snapshot.project, m.manifest);
    return { status: v.signature.status, detail: v.signature.detail, artifact: m.path };
  },
  /** Artifacts, provenance, SBOM and ledger head, bound — worst of the four. (ADR-012) */
  releaseIntegrity(ctx) {
    const m = readManifest(ctx.root, ctx.scopeId);
    if (!m.manifest) return awaiting(manifestPath(ctx.scopeId));
    const v = verifyRelease(ctx.root, ctx.snapshot.project, m.manifest);
    return { status: v.integrity.status, detail: v.integrity.detail, artifact: m.path };
  },
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
    // The release scope tells spec-align which stories ship, for a profile whose stories are the spec.
    const r = runHook(ctx, '.github/hooks/spec-align.mjs', ['--strict', ...(ctx.scopeType === 'release' ? ['--release', String(ctx.scopeId)] : [])]);
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
    if (!profile.present) return fail('a regulated regime is declared but docs/compliance-profile.json does not exist — record the structured data-boundary decision via /eos-compliance');
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
    const runbook = RUNBOOKS.find((p) => existsSync(join(ctx.root, p)));
    if (!runbook) return fail(`no runbook found (looked for ${RUNBOOKS.join(', ')}) — run /eos-runbook`);
    const text = readFileSync(join(ctx.root, runbook), 'utf8');
    // The release prompt asks a human for rollback, gradual rollout and health/readiness. If the
    // machine gate only looks for "rollback", the other two are advisory theatre. (EOS-AUD-007)
    // The words are English; a project that declares language "zh" writes its runbook in Chinese, so the
    // same three topics are recognised by their Chinese terms too (eos-2.6.0).
    const zh = /^zh\b/i.test(ctx.snapshot.project?.language || '');
    const either = (en, cjk) => (zh ? new RegExp(`${en.source}|${cjk}`, 'i') : en);
    const required = [
      { key: 'rollback', re: either(/\brollback\b/i, '回滚|回退|撤销发布'), fix: 'the exact steps to undo this release' },
      { key: 'canary / gradual rollout', re: either(/\b(canary|gradual rollout|progressive delivery|blue[- ]?green|ring deployment|percentage rollout)\b/i, '灰度|金丝雀|渐进(?:式)?发布|分批发布|逐步放量|蓝绿'), fix: 'how the change reaches users incrementally (or why it cannot)' },
      { key: 'health / readiness', re: either(/\b(health ?check|healthz|readiness|liveness|\/health\b|\/ready\b)\b/i, '健康检查|就绪|存活|探针'), fix: 'the signal that says the deployment is serving' },
    ];
    const absent = required.filter((r) => !r.re.test(text));
    return absent.length
      ? fail(`${runbook} does not document ${absent.map((a) => `${a.key} (${a.fix})`).join('; ')} — run /eos-runbook and /eos-deploy-topology`)
      : ok(`${runbook} documents rollback, gradual rollout and health/readiness`);
  },
  /**
   * The operational mechanisms must belong to the topology that was actually chosen. A serverless
   * product claiming a blue/green cluster rollback is documentation, not a plan.
   */
  releaseDeploymentTopology(ctx) {
    const topology = findTopologyAdr(ctx.root);
    if (!topology) {
      return fail('no deployment-topology decision record under docs/adr/ — run /eos-deploy-topology so rollback, canary and health/readiness are the mechanisms this topology actually has');
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

  /**
   * A one-way door is not through until a person has confirmed it. An unattended run may decide the
   * stack, the topology or the data model provisionally (G4 passes, and says so); shipping needs the
   * ADR accepted and signed by name. Not waivable, like the rest of release-ready.
   */
  releaseOneWayDoorsConfirmed(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return na(`${STAGE_RECORDS.architecture.path} does not exist, so there is no one-way decision to confirm`);
    const doors = oneWayDoors(r.data);
    if (!doors.length) return na('no architecture decision cites an ADR, so there is no one-way decision to confirm');
    const open = [];
    for (const door of doors) {
      const adr = readAdrConfirmation(ctx.root, door.adr);
      if (!adr.present) open.push(`${door.key}: ${door.adr} does not exist`);
      else if (adr.status === 'proposed') open.push(`${door.key}: ${door.adr} is still "proposed"`);
      else if (!adr.confirmedBy) open.push(`${door.key}: ${door.adr} has no "Confirmed by"`);
    }
    return open.length
      ? fail(`one-way decision(s) no person has confirmed: ${open.join(' · ')} — read each ADR, set "Status: accepted" and add "Confirmed by: <name>" and "Confirmed at: <YYYY-MM-DD>", then commit`)
      : ok(`${doors.length} one-way decision(s) confirmed by name`);
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
        else if (t.dueBy && t.dueBy < todayOf(ctx.now)) problems.push(`${t.id}: the deferral is overdue (dueBy ${t.dueBy}) — measure it, or defer it again with a new dueBy and a fresh approval`);
        else deferrals.push(`${t.id} → ${t.owner} (${t.trigger}; ${t.dueBy ? `due by ${t.dueBy}` : 'NO dueBy — it cannot be promoted without one'})`);
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
    if (deferrals.length) return { status: 'DEFERRED', detail: `NFR target(s) deferred with an owner and a trigger: ${deferrals.join('; ')} — visible and time-bound, never passed. A Standard-track release can be promoted with these when each has a dueBy in the future and the approval is given for this list; a regulated or controlled release cannot` };
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
};
