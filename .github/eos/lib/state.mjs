// Project state reader — the single deterministic snapshot every other component works from.
// Nothing here reads a chat transcript, a prose summary or a hand-written status field: state is
// derived from the tracked registries, the artifacts on disk, the append-only ledger and evidence.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProjectConfig } from '../../hooks/lib/project-config.mjs';
import { loadWorkflow, loadGates, loadAgentMap, loadActiveWork, posix } from './registry.mjs';
import { LEDGER_PATH } from './ledger.mjs';
import { readEvents, stateOf, verifyChain } from './ledger.mjs';
import { listStories, prdAcceptanceCriteria } from './story.mjs';
import { SUMMARY_PATHS } from './machine-summary.mjs';
import { manifestPath, readManifest } from './release.mjs';

export const ARTIFACTS = {
  discovery: 'docs/discovery.md',
  discoveryRecord: 'docs/discovery.json',
  requirements: 'docs/requirements.md',
  requirementsRecord: 'docs/requirements.json',
  prd: 'docs/prd.md',
  experience: 'docs/EXPERIENCE.md',
  design: 'docs/DESIGN.md',
  designRecord: 'docs/design.json',
  architecture: 'docs/architecture.md',
  architectureRecord: 'docs/architecture.json',
  traceMatrix: 'docs/trace-matrix.md',
  evalPlan: 'docs/eval-plan.md',
  releaseGate: 'docs/release-gate.md',
  telemetry: 'docs/telemetry-plan.md',
  telemetryRecord: 'docs/telemetry.json',
  iterationRecord: 'docs/iteration.json',
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
  // Story and release state come from this file, so trusting it without verifying the chain would
  // make the whole tamper-evidence story decorative. A broken chain is an ERROR for every consumer.
  const chain = verifyChain(events, { root });
  for (const p of chain.problems) errors.push(`${LEDGER_PATH}: ${p} — run \`node .github/eos/eos.mjs ledger --verify\` and restore the file from version control`);
  for (const w of chain.warnings) warnings.push(`${LEDGER_PATH}: ${w}`);

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
    // The story file is tracked and reviewable, so it is the only thing allowed to classify a
    // story. `.eos/local/active-work.json` is gitignored and carries NO authority: letting it
    // supply a change type would let an untracked local file switch this story's gates off.
    const s = snapshot.stories.find((x) => x.id === scopeId);
    return s?.changeType || snapshot.profile?.defaultChangeType || 'FEATURE';
  }
  if (scopeType === 'release') return 'RELEASE';
  if (scopeType === 'product') return 'PRODUCT_BASELINE';
  if (snapshot.activeWork?.scopeId === scopeId && snapshot.activeWork?.changeType) return snapshot.activeWork.changeType;
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
  if (gateId === 'discovery-ready') inputs.push(ARTIFACTS.discovery, ARTIFACTS.discoveryRecord);
  if (gateId === 'requirements-ready') inputs.push(ARTIFACTS.requirements, ARTIFACTS.requirementsRecord);
  if (gateId === 'prd-ready') inputs.push(ARTIFACTS.prd);
  if (gateId === 'ux-ready') inputs.push(ARTIFACTS.designRecord, ARTIFACTS.design, ARTIFACTS.experience);
  if (gateId === 'architecture-ready') inputs.push(ARTIFACTS.architecture, ARTIFACTS.architectureRecord, ARTIFACTS.requirementsRecord);
  if (gateId === 'story-ready') { inputs.push(ARTIFACTS.prd); if (story) inputs.push(story.path); }
  if (gateId === 'verified') {
    inputs.push(ARTIFACTS.traceMatrix, ARTIFACTS.prd);
    // The machine summaries are EXCLUDED from the product tree (a verification run writes them, so
    // counting them would make the digest they embed impossible to satisfy). They are bound here
    // instead: editing one after the gate ran makes the recorded PASS STALE, exactly like any other
    // input. Both properties, no self-reference.
    inputs.push(SUMMARY_PATHS.testRun, SUMMARY_PATHS.evalSummary);
    if (story) inputs.push(story.path);
  }
  if (gateId === 'release-ready') {
    inputs.push(ARTIFACTS.prd, ARTIFACTS.traceMatrix, SUMMARY_PATHS.nfrSummary, SUMMARY_PATHS.testRun);
    // The manifest decides what ships, so editing it must invalidate the recorded result.
    if (scopeType === 'release') inputs.push(manifestPath(scopeId));
    for (const s of snapshot.stories) inputs.push(s.path);
  }
  if (gateId === 'telemetry-ready') inputs.push(ARTIFACTS.telemetryRecord, ARTIFACTS.telemetry, ARTIFACTS.discoveryRecord);
  if (gateId === 'iteration-ready') inputs.push(ARTIFACTS.iterationRecord, ARTIFACTS.telemetryRecord);
  return inputs.filter(Boolean);
}

/**
 * Set-membership digests a gate depends on. `release-ready` asserts something about the SET of
 * stories, so adding a story after the gate ran must invalidate it even though no recorded file
 * hash changed.
 */
export function gateCollections(snapshot, gateId, scopeType = null, scopeId = null) {
  if (gateId !== 'release-ready') return {};
  // Membership now comes from the manifest, so the digest covers the stories the release CLAIMS
  // plus the files they resolve to. Adding an unrelated story no longer invalidates a release;
  // changing one that IS in the release still does.
  const included = scopeType === 'release' && scopeId !== null
    ? (readManifest(snapshot.root, scopeId).manifest?.includedStories || null)
    : null;
  const stories = included
    ? snapshot.stories.filter((s) => included.includes(s.id))
    : snapshot.stories;
  const ids = stories.map((s) => `${s.id}:${s.path}`).sort().join('\n');
  return { stories: createHash('sha256').update(ids).digest('hex') };
}

/** Read a doc once, tolerating absence (callers decide whether absence is a failure). */
export function readDoc(root, rel) {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
}
