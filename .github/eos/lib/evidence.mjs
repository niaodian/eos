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
import { validate } from './schema.mjs';
import { waiverStatus } from './waivers.mjs';

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

/** Evidence is machine-written; anything that does not match its schema is an ERROR, not a PASS. */
export function readEvidence(root, gateId, scopeType, scopeId) {
  const rel = evidenceFile(gateId, scopeType, scopeId);
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, evidence: null, error: null };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, evidence: null, error: `${rel}: invalid JSON (${e.message})` };
  }
  let schema = null;
  try { schema = JSON.parse(readFileSync(join(root, '.eos/schemas/gate-evidence.schema.json'), 'utf8')); } catch { /* schema absent: fall through */ }
  if (schema) {
    const v = validate(schema, parsed, { label: rel });
    if (!v.valid) return { present: true, evidence: null, error: `${rel}: not valid gate evidence — ${v.errors.slice(0, 3).join('; ')}. Evidence is machine-written; regenerate it with \`eos check\`.` };
  }
  if (parsed.gate !== gateId || parsed.scope?.type !== scopeType || String(parsed.scope?.id) !== String(scopeId)) {
    return { present: true, evidence: null, error: `${rel}: records ${parsed.gate}/${parsed.scope?.type}/${parsed.scope?.id}, not ${gateId}/${scopeType}/${scopeId}` };
  }
  return { present: true, evidence: parsed, error: null };
}

/**
 * Is stored evidence still current?
 * @returns {{status:'FRESH'|'STALE', reasons:string[]}}
 */
export function evidenceFreshness(root, evidence, { gateDefinition = null, expectedInputs = null, collections = null, now = new Date() } = {}) {
  const reasons = [];
  if (!evidence) return { status: 'STALE', reasons: ['no evidence'] };
  // The recorded input SET must equal the set the gate would record today. Without this, evidence
  // declaring `inputs: []` would have nothing to mismatch and would stay FRESH forever.
  if (expectedInputs) {
    const recorded = new Set((evidence.inputs || []).map((i) => i.path));
    const expected = new Set(expectedInputs.map(posix));
    const missing = [...expected].filter((p) => !recorded.has(p));
    const extra = [...recorded].filter((p) => !expected.has(p) && !p.startsWith('.eos/waivers/'));
    if (missing.length) reasons.push(`evidence does not cover ${missing.join(', ')}`);
    if (extra.length) reasons.push(`evidence covers files the gate no longer reads: ${extra.join(', ')}`);
  }
  // Collection digests catch membership changes that no single file hash can: a story ADDED after a
  // release gate ran changes no recorded hash, yet it changes what "all stories verified" means.
  for (const [key, digest] of Object.entries(collections || {})) {
    const recorded = (evidence.collections || []).find((c) => c.key === key);
    if (!recorded) reasons.push(`evidence predates the ${key} membership check`);
    else if (recorded.digest !== digest) reasons.push(`the set of ${key} changed since this evidence was produced`);
  }
  if (evidence.status === 'WAIVED') {
    // A recorded WAIVED must not outlive the waiver that justified it.
    const wPath = (evidence.inputs || []).map((i) => i.path).find((p) => p.startsWith('.eos/waivers/'));
    if (!wPath) reasons.push('recorded as WAIVED but no waiver file is bound to the evidence');
    else {
      let waiver = null;
      try { waiver = JSON.parse(readFileSync(join(root, wPath), 'utf8')); } catch { /* handled below */ }
      const s = waiver ? waiverStatus(waiver, { gateId: evidence.gate, scopeType: evidence.scope.type, scopeId: evidence.scope.id, now }) : { honored: false, reason: `${wPath} is missing or unreadable` };
      if (!s.honored) reasons.push(`the waiver no longer holds: ${s.reason}`);
    }
  }
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

/**
 * Is this object usable as evidence at all? `doctor` must be able to REPORT a malformed evidence
 * file, not crash on it — it is exactly the file it exists to diagnose.
 * @returns {string|null} a reason, or null when the shape is usable
 */
export function validateEvidenceShape(root, evidence) {
  if (!evidence || typeof evidence !== 'object') return 'not a JSON object';
  if (typeof evidence.gate !== 'string' || !evidence.scope || typeof evidence.scope.type !== 'string' || evidence.scope.id === undefined) {
    return 'missing gate/scope identity — evidence is machine-written; regenerate it with `eos check`';
  }
  let schema = null;
  try { schema = JSON.parse(readFileSync(join(root, '.eos/schemas/gate-evidence.schema.json'), 'utf8')); } catch { return null; }
  const v = validate(schema, evidence, { label: 'evidence' });
  return v.valid ? null : `not valid gate evidence — ${v.errors.slice(0, 2).join('; ')}`;
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
