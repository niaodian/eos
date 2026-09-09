// Project state reader — the single deterministic snapshot every other component works from.
// Nothing here reads a chat transcript, a prose summary or a hand-written status field: state is
// derived from the tracked registries, the artifacts on disk, the append-only ledger and evidence.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProjectConfig } from '../../hooks/lib/project-config.mjs';
import { loadWorkflow, loadGates, loadAgentMap, loadActiveWork, posix } from './registry.mjs';
import { readEvents, stateOf } from './ledger.mjs';
import { listStories, prdAcceptanceCriteria } from './story.mjs';

export const ARTIFACTS = {
  discovery: 'docs/discovery.md',
  requirements: 'docs/requirements.md',
  prd: 'docs/prd.md',
  experience: 'docs/EXPERIENCE.md',
  design: 'docs/DESIGN.md',
  architecture: 'docs/architecture.md',
  traceMatrix: 'docs/trace-matrix.md',
  evalPlan: 'docs/eval-plan.md',
  releaseGate: 'docs/release-gate.md',
  telemetry: 'docs/telemetry-plan.md',
  activation: 'docs/eos/activation.md',
};

function gitInfo(root) {
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return r.status === 0 ? (r.stdout || '').trim() : null;
  };
  return { commit: git(['rev-parse', 'HEAD']), changed: git(['status', '--porcelain']) };
}

/**
 * Build the full state snapshot.
 * `errors` means EOS itself cannot be evaluated (exit 3 territory) — it is never downgraded.
 */
export function readSnapshot(root, { withGit = true } = {}) {
  const errors = [];
  const warnings = [];

  const proj = loadProjectConfig(root);
  const wf = loadWorkflow(root);
  const gt = loadGates(root);
  const am = loadAgentMap(root);
  const aw = loadActiveWork(root);

  if (proj.present && proj.errors.length) errors.push(...proj.errors);
  if (wf.present && wf.workflow === null) errors.push(...wf.errors);
  if (gt.present && gt.gates === null) errors.push(...gt.errors);
  if (am.present && am.agentMap === null) warnings.push(...am.errors);
  warnings.push(...aw.errors);

  const { events, errors: ledgerErrors } = readEvents(root);
  errors.push(...ledgerErrors);

  const artifacts = {};
  for (const [key, rel] of Object.entries(ARTIFACTS)) artifacts[key] = existsSync(join(root, rel)) ? posix(rel) : null;

  const profileName = proj.config?.workflowProfile || wf.workflow?.defaultProfile || 'standard-product';
  const profile = wf.workflow?.profiles?.[profileName] || null;
  if (wf.workflow && !profile) {
    errors.push(`.eos/project.json: workflowProfile "${profileName}" is not defined in .eos/workflow.json (available: ${Object.keys(wf.workflow.profiles).join(', ')})`);
  }

  const stories = listStories(root);
  const prd = prdAcceptanceCriteria(root);
  const git = withGit ? gitInfo(root) : { commit: null, changed: null };

  const agentic = !!(proj.config && (proj.config.evalRequired === true
    || (proj.config.evalRequired === undefined && (proj.config.productParadigms || []).includes('agentic'))));

  return {
    root,
    commit: git.commit,
    changedFiles: git.changed === null ? null : git.changed.split('\n').filter(Boolean).map((l) => posix(l.slice(3))),
    projectPresent: proj.present,
    project: proj.config,
    projectErrors: proj.errors,
    workflow: wf.workflow,
    gates: gt.gates,
    agentMap: am.agentMap,
    agentMapErrors: am.errors,
    profileName,
    profile,
    activeWork: aw.activeWork,
    events,
    artifacts,
    stories,
    prd,
    agentic,
    errors,
    warnings,
  };
}

/** Gate policy for a change type: 'required' | 'waivable' | 'not_applicable' (deny-by-default). */
export function gatePolicy(snapshot, changeType, gateId) {
  const ct = snapshot.profile?.changeTypes?.[changeType];
  if (!ct) return 'required';
  return ct.gates?.[gateId] || 'not_applicable';
}

export function changeTypeOf(snapshot, scopeType, scopeId) {
  if (scopeType === 'story') {
    const s = snapshot.stories.find((x) => x.id === scopeId);
    if (s?.changeType) return s.changeType;
  }
  if (scopeType === 'release') return 'RELEASE';
  if (snapshot.activeWork?.scopeId === scopeId && snapshot.activeWork?.changeType) return snapshot.activeWork.changeType;
  if (scopeType === 'product') return 'PRODUCT_BASELINE';
  return snapshot.profile?.defaultChangeType || 'FEATURE';
}

/** Ledger-authoritative state for story / release scopes. */
export const scopeState = (snapshot, scopeType, scopeId) =>
  stateOf(snapshot.events, snapshot.workflow, scopeType, scopeId);

/** Every input file that feeds a gate — recorded in evidence so staleness is automatic. */
export function gateInputs(snapshot, gateId, scopeType, scopeId) {
  const inputs = ['.eos/project.json'];
  const story = snapshot.stories.find((s) => s.id === scopeId);
  if (gateId === 'activation') inputs.push(ARTIFACTS.activation);
  if (gateId === 'prd-ready') inputs.push(ARTIFACTS.prd);
  if (gateId === 'story-ready') { inputs.push(ARTIFACTS.prd); if (story) inputs.push(story.path); }
  if (gateId === 'verified') {
    inputs.push(ARTIFACTS.traceMatrix, ARTIFACTS.prd);
    if (story) inputs.push(story.path);
  }
  if (gateId === 'release-ready') {
    inputs.push(ARTIFACTS.prd, ARTIFACTS.traceMatrix);
    for (const s of snapshot.stories) inputs.push(s.path);
  }
  return inputs.filter(Boolean);
}

/** Read a doc once, tolerating absence (callers decide whether absence is a failure). */
export function readDoc(root, rel) {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
}
