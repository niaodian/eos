// dsar.mjs — Data Subject Access Requests: export (access/portability) + erase (right to erasure).
// GDPR Art.15/17/20 · PIPL 45/47. Landing point: data-api "Support subject deletion / export
// where PII is stored (GDPR/CCPA-style 'right to erasure/access')" + "Every deletion … is audited".
//
// A `source` is any store that can export/erase ONE subject's rows — register one adapter per
// table/service. This is the pluggable "your data" seam:
//   { name, async export(subjectId) -> rows, async erase(subjectId) -> count }
import { audit } from './audit.mjs';

// Access + Portability: structured, machine-readable bundle (GDPR Art.20).
export async function exportSubject(subjectId, sources, log = audit()) {
  const data = {};
  for (const s of sources) data[s.name] = await s.export(subjectId);
  log.record({ type: 'dsar.export', subjectId, sources: sources.map((s) => s.name) });
  return { subjectId, generatedAt: new Date().toISOString(), data };
}

// Right to erasure. Returns an audit-friendly record of WHAT was erased WHERE (not the data itself).
export async function eraseSubject(subjectId, sources, { reason = 'dsar.erasure' } = {}, log = audit()) {
  const erased = {};
  for (const s of sources) erased[s.name] = await s.erase(subjectId);
  // Backups inherit the same rule: re-run erasure on restore, or document the retention window
  // and encryption so restored data self-expires. (.github/instructions/data-api)
  log.record({ type: 'dsar.erase', subjectId, reason, erased });
  return { subjectId, erasedAt: new Date().toISOString(), reason, erased };
}
