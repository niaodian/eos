// Gate & transition engine — what runs the rules and records what happened.
//
// The rules themselves live in gate-evaluators.mjs and the vocabulary they are written in lives in
// gate-primitives.mjs. This file is the part that decides WHICH rules apply (the change-type
// policy), runs them, aggregates a verdict, resolves waivers and providers, and writes the evidence
// that makes the verdict checkable later.
//
// Two rules govern everything here:
//   1. A missing tool, an unreadable file, a crashed validator or "there are no tests" is BLOCKED
//      or ERROR — never PASS. Absence of proof is never proof.
//   2. Evidence is only meaningful while its inputs are unchanged, so every run records the input
//      hashes and every read re-checks them.
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
import { evaluators } from './gate-evaluators.mjs';
import { STATUSES, SEVERITY, EXPENSIVE, isBlocking, insideRepo, parseTraceMatrix, aggregate, evidenceIntegrity } from './gate-primitives.mjs';

// Re-exported so existing importers (and the tests) keep working: these are part of the engine's
// public surface, and where they physically live is an implementation detail.
export { STATUSES, isBlocking, insideRepo, parseTraceMatrix, evidenceIntegrity };

/**
 * Evaluate one gate.
 * @param {'all'|'cheap'} mode  'cheap' never spawns a process: expensive checks fall back to the
 *   stored evidence, or PENDING. That is what makes `eos next` instant while `eos check` is proof.
 */
export function evaluateGate(snapshot, gateId, scopeType, scopeId, { mode = 'all', now = new Date(), providerVerdicts = null } = {}) {
  const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
  if (!def) return { gate: gateId, status: 'ERROR', policy: 'required', checks: [], detail: `unknown gate "${gateId}"`, commands: [] };

  const changeType = changeTypeOf(snapshot, scopeType, scopeId);
  const policy = gatePolicy(snapshot, changeType, def.id);
  if (policy === 'not_applicable') {
    return {
      gate: def.id, code: def.code, status: 'NOT_APPLICABLE', policy, changeType, commands: [],
      checks: def.checks.map((c) => ({ id: c.id, status: 'NOT_APPLICABLE', detail: `${changeType} declares ${def.id} not applicable`, fix: c.fix, artifact: null })),
      detail: `${def.id} does not apply to a ${changeType} change (recorded, not skipped)`,
      ...diagnosticContext(snapshot, def, scopeType, scopeId, changeType, policy),
    };
  }

  const story = scopeType === 'story' ? snapshot.stories.find((s) => s.id === scopeId) || null : null;
  const prior = readEvidence(snapshot.root, def.id, scopeType, scopeId);
  const ctx = { root: snapshot.root, snapshot, scopeType, scopeId, story, changeType, commands: [], results: [], providerVerdicts: providerVerdicts || {} };

  for (const check of def.checks) {
    let result;
    if (mode === 'cheap' && EXPENSIVE.has(check.id)) {
      const stored = prior.present && prior.evidence ? (prior.evidence.checks || []).find((c) => c.id === check.id) : null;
      const fresh = prior.evidence ? evidenceFreshness(snapshot.root, prior.evidence, {
        gateDefinition: def,
        expectedInputs: gateInputs(snapshot, def.id, scopeType, scopeId),
        collections: gateCollections(snapshot, def.id, scopeType, scopeId),
        now,
      }) : { status: 'STALE', reasons: [] };
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
    ctx.results.push({ id: check.id, title: check.title, fix: check.fix, artifact: null, ...result });
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
    ...diagnosticContext(snapshot, def, scopeType, scopeId, changeType, policy),
  };
}

/**
 * The part of a verdict that makes it ACTIONABLE rather than merely true.
 *
 * A status and a sentence tell you that something is wrong. They do not tell you which rule decided
 * this gate applies (so you cannot argue with it), which files the verdict is about (so a tool
 * cannot navigate to them), or how to run it again yourself (so you re-derive the command from
 * documentation every time). Every field here already existed as prose somewhere; this makes it
 * machine-readable so an agent can act on a gate result instead of parsing English.
 *
 *   policySource      the exact JSON path that made this gate required/waivable/not_applicable
 *   affectedArtifacts the files the verdict is computed from — the same set evidence binds
 *   rerunCommand      the command that reproduces this verdict
 *   waiverEligible    whether a waiver could legally lift this, without having to infer it
 */
function diagnosticContext(snapshot, def, scopeType, scopeId, changeType, policy) {
  const profile = snapshot.profileName || snapshot.project?.workflowProfile || 'standard-product';
  const scopeArg = scopeType === 'product' ? '' : ` --scope ${scopeId}`;
  return {
    policySource: {
      file: WORKFLOW_PATH,
      profile,
      changeType,
      pointer: `profiles.${profile}.changeTypes.${changeType}.gates.${def.id}`,
      value: policy,
    },
    affectedArtifacts: gateInputs(snapshot, def.id, scopeType, scopeId),
    rerunCommand: `node .github/eos/eos.mjs check --gate ${def.id}${scopeArg}`,
    waiverEligible: policy === 'waivable' && def.waivable !== false,
  };
}

/** Run a gate for real and persist the evidence. */
export function runGate(snapshot, gateId, scopeType, scopeId, { now = new Date(), providerVerdicts = null } = {}) {
  const result = evaluateGate(snapshot, gateId, scopeType, scopeId, { mode: 'all', now, providerVerdicts });
  if (result.status === 'ERROR' && !result.checks.length) return { result, evidenceFile: null };
  const def = snapshot.gates?.gates.find((g) => g.id === result.gate);
  // The honoring waiver becomes an INPUT, so deleting it, editing it, or letting it expire makes
  // the recorded WAIVED stale instead of permanent.
  const inputPaths = gateInputs(snapshot, result.gate, scopeType, scopeId);
  if (result.waiver?.file) inputPaths.push(result.waiver.file);
  const collections = Object.entries(gateCollections(snapshot, result.gate, scopeType, scopeId)).map(([key, digest]) => ({ key, digest }));
  // The tested product tree is recorded only for gates that DECLARE they assert something about the
  // product. Recording it everywhere would make an activation PASS expire on an unrelated edit.
  const tree = def?.bindsProductTree ? currentProductTree(snapshot.root) : { available: false, identity: null };
  const evidence = {
    schemaVersion: 2,
    gate: result.gate,
    gateVersion: def?.version || '0.0.0',
    evaluatorVersion: EVALUATOR_VERSION,
    scope: { type: scopeType, id: String(scopeId) },
    changeType: result.changeType,
    status: result.status,
    commit: snapshot.commit,
    inputs: hashInputs(snapshot.root, inputPaths),
    governanceInputs: hashInputs(snapshot.root, GOVERNANCE_INPUTS),
    ...(collections.length ? { collections } : {}),
    ...(tree.identity ? { productTree: tree.identity } : {}),
    ...(Object.keys(providerVerdicts || {}).length ? { providerVerdicts: Object.values(providerVerdicts) } : {}),
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
  const integrity = evidenceIntegrity(snapshot, evidence);
  if (integrity.length) return { status: 'ERROR', detail: `${evidenceFile(def.id, scopeType, scopeId)}: ${integrity.join('; ')}. Re-run \`eos check --gate ${def.id}${scopeType === 'story' ? ` --scope ${scopeId}` : ''}\`.`, evidence };
  const f = evidenceFreshness(snapshot.root, evidence, {
    gateDefinition: def,
    expectedInputs: gateInputs(snapshot, def.id, scopeType, scopeId),
    collections: gateCollections(snapshot, def.id, scopeType, scopeId),
  });
  if (f.status === 'STALE') return { status: 'STALE', detail: `the recorded ${evidence.status} is STALE: ${f.reasons.join('; ')}`, evidence };
  if (!STATUSES.includes(evidence.status)) return { status: 'ERROR', detail: `evidence records an unknown status "${evidence.status}"` };
  return { status: evidence.status, detail: `recorded ${evidence.status} at ${evidence.generatedAt}`, evidence };
}

