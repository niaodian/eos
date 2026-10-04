// Waivers — controlled exceptions. EOS can DRAFT one; it never approves one.
// A waiver is honored only when: it validates against the schema, it targets this gate + scope,
// the gate is declared waivable AND the change-type policy marks it waivable, it has not expired,
// and the approver is a different person from the requester — or, in a solo project (ADR-023), the
// requester's own `<name> (self)`, which is honored and labelled as a self-approval.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate, loadSchema } from './schema.mjs';
import { isSoloProject } from '../../hooks/lib/project-config.mjs';
import { isSelfApprover } from './policy.mjs';

export const WAIVERS_DIR = '.eos/waivers';

/** Is this repository's project declared solo (approvalMode "solo", Standard track)? Read straight from the declaration. */
export function soloApprovals(root) {
  try { return isSoloProject(JSON.parse(readFileSync(join(root, '.eos/project.json'), 'utf8'))); } catch { return false; }
}

export function loadWaivers(root) {
  const dir = join(root, WAIVERS_DIR);
  const waivers = [];
  const errors = [];
  if (!existsSync(dir)) return { waivers, errors };
  const { schema } = loadSchema(root, 'waiver.schema.json'); // validated below only if present
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const rel = `${WAIVERS_DIR}/${name}`;
    let data;
    try { data = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); continue; }
    if (schema) {
      const v = validate(schema, data, { label: rel });
      if (!v.valid) { errors.push(...v.errors); continue; }
    }
    waivers.push({ file: rel, waiver: data });
  }
  return { waivers, errors };
}

/** @returns {{honored: boolean, reason: string}} */
export function waiverStatus(waiver, { gateId, scopeType, scopeId, now = new Date(), solo = false }) {
  if (!waiver) return { honored: false, reason: 'no waiver' };
  if (waiver.gate !== gateId) return { honored: false, reason: `waiver targets gate "${waiver.gate}", not "${gateId}"` };
  if (waiver.scope?.type !== scopeType || waiver.scope?.id !== scopeId) {
    return { honored: false, reason: `waiver targets ${waiver.scope?.type}/${waiver.scope?.id}, not ${scopeType}/${scopeId}` };
  }
  if (!waiver.approver || !waiver.approver.trim()) {
    return { honored: false, reason: 'waiver has no approver — EOS drafts waivers but never approves them' };
  }
  const self = isSelfApprover(waiver.approver);
  if (self && !solo) {
    return { honored: false, reason: 'a self-approved waiver needs approvalMode "solo" in .eos/project.json (Standard track) — otherwise a second person must approve' };
  }
  if (!self && waiver.approver.trim().toLowerCase() === String(waiver.requestedBy || '').trim().toLowerCase()) {
    return { honored: false, reason: 'the approver is the requester — a high-risk exception needs a second person' };
  }
  const expiry = new Date(`${waiver.expiresOn}T23:59:59Z`);
  if (Number.isNaN(expiry.getTime())) return { honored: false, reason: `unparseable expiresOn "${waiver.expiresOn}"` };
  if (expiry < now) return { honored: false, reason: `waiver expired on ${waiver.expiresOn}` };
  if (!(waiver.compensatingControls || []).length) return { honored: false, reason: 'waiver declares no compensating controls' };
  return { honored: true, assurance: self ? 'self' : 'independent', reason: `waived until ${waiver.expiresOn} by ${waiver.approver}${self ? ' — a self-approval, solo project' : ''} (${waiver.reason})` };
}

/** The first honored waiver for this gate+scope, plus every rejected candidate and why. */
export function findWaiver(root, { gateId, scopeType, scopeId, now = new Date() }) {
  const { waivers, errors } = loadWaivers(root);
  const rejected = [];
  const solo = soloApprovals(root);
  for (const { file, waiver } of waivers) {
    if (waiver.gate !== gateId || waiver.scope?.id !== scopeId) continue;
    const s = waiverStatus(waiver, { gateId, scopeType, scopeId, now, solo });
    if (s.honored) return { waiver, file, status: s, rejected, errors };
    rejected.push({ file, reason: s.reason });
  }
  return { waiver: null, file: null, status: null, rejected, errors };
}

/** Every waiver that has expired — release readiness must not sit on top of one. */
export function expiredWaivers(root, now = new Date()) {
  const { waivers } = loadWaivers(root);
  return waivers.filter(({ waiver }) => {
    const expiry = new Date(`${waiver.expiresOn}T23:59:59Z`);
    return Number.isNaN(expiry.getTime()) || expiry < now;
  });
}
