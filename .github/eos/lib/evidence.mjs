// Gate evidence: write it, read it back, and decide whether it still means anything.
//
// The rule that matters: a previous PASS is only a PASS while the things it was computed from are
// unchanged. Evidence therefore binds the commit, the gate-definition version, the evaluator
// version and a SHA-256 of every input file — plus the governance files themselves, so changing
// .eos/gates.json or .eos/workflow.json invalidates prior evidence by construction.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { posix, EVALUATOR_VERSION, WORKFLOW_PATH, GATES_PATH } from './registry.mjs';

export const EVIDENCE_DIR = '.eos/evidence';
export const GOVERNANCE_INPUTS = [GATES_PATH, WORKFLOW_PATH];

export function sha256File(root, rel) {
  const full = join(root, rel);
  if (!existsSync(full)) return null;
  try { return createHash('sha256').update(readFileSync(full)).digest('hex'); } catch { return null; }
}

export const hashInputs = (root, paths) =>
  [...new Set(paths.map(posix))].sort().map((path) => ({ path, sha256: sha256File(root, path) }));

export const evidenceFile = (gateId, scopeType, scopeId) =>
  `${EVIDENCE_DIR}/${gateId}__${scopeType}__${String(scopeId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

export function writeEvidence(root, evidence) {
  const rel = evidenceFile(evidence.gate, evidence.scope.type, evidence.scope.id);
  const full = join(root, rel);
  mkdirSync(join(root, EVIDENCE_DIR), { recursive: true });
  writeFileSync(full, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  return rel;
}

export function readEvidence(root, gateId, scopeType, scopeId) {
  const full = join(root, evidenceFile(gateId, scopeType, scopeId));
  if (!existsSync(full)) return { present: false, evidence: null, error: null };
  try { return { present: true, evidence: JSON.parse(readFileSync(full, 'utf8')), error: null }; } catch (e) {
    return { present: true, evidence: null, error: `${evidenceFile(gateId, scopeType, scopeId)}: invalid JSON (${e.message})` };
  }
}

/**
 * Is stored evidence still current?
 * @returns {{status:'FRESH'|'STALE', reasons:string[]}}
 */
export function evidenceFreshness(root, evidence, { gateDefinition = null } = {}) {
  const reasons = [];
  if (!evidence) return { status: 'STALE', reasons: ['no evidence'] };
  if (evidence.evaluatorVersion !== EVALUATOR_VERSION) {
    reasons.push(`evaluator version changed (${evidence.evaluatorVersion} → ${EVALUATOR_VERSION})`);
  }
  if (gateDefinition && evidence.gateVersion !== gateDefinition.version) {
    reasons.push(`gate definition version changed (${evidence.gateVersion} → ${gateDefinition.version})`);
  }
  for (const input of evidence.inputs || []) {
    const now = sha256File(root, input.path);
    if (now !== input.sha256) reasons.push(now === null ? `input disappeared: ${input.path}` : `input changed: ${input.path}`);
  }
  for (const input of evidence.governanceInputs || []) {
    const now = sha256File(root, input.path);
    if (now !== input.sha256) reasons.push(`governance file changed: ${input.path} (previous results are invalidated by design)`);
  }
  return { status: reasons.length ? 'STALE' : 'FRESH', reasons };
}

export function listEvidence(root) {
  const dir = join(root, EVIDENCE_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try { out.push({ file: `${EVIDENCE_DIR}/${name}`, evidence: JSON.parse(readFileSync(join(dir, name), 'utf8')) }); } catch {
      out.push({ file: `${EVIDENCE_DIR}/${name}`, evidence: null });
    }
  }
  return out;
}
