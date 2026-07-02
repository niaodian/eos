// consent.mjs — per-purpose, versioned, revocable consent.
// GDPR Art.6/7 (lawful basis; withdrawal as easy as giving); PIPL separate consent for
// sensitive PI / cross-border (per-purpose flags, never a bundled all-or-nothing checkbox).
//
// In-memory stub: swap `store` for your DB table
//   (subject_id, purpose, granted, basis, version, at) with the latest row per (subject, purpose).
import { audit } from './audit.mjs';

export function createConsentStore(log = audit()) {
  const store = new Map(); // `${subjectId}::${purpose}` -> latest record
  const key = (s, p) => `${s}::${p}`;

  return {
    // Record consent for ONE purpose. Separate purposes = separate consent (PIPL).
    grant(subjectId, purpose, { basis = 'consent', version = 'v1' } = {}) {
      const rec = { subjectId, purpose, granted: true, basis, version, at: new Date().toISOString() };
      store.set(key(subjectId, purpose), rec);
      log.record({ type: 'consent.grant', subjectId, purpose, version, basis });
      return rec;
    },

    // Withdrawal must be as easy as granting (GDPR Art.7(3)). No data logged, just the action.
    revoke(subjectId, purpose) {
      const rec = { subjectId, purpose, granted: false, at: new Date().toISOString() };
      store.set(key(subjectId, purpose), rec);
      log.record({ type: 'consent.revoke', subjectId, purpose });
      return rec;
    },

    // Gate a purpose-bound processing step on this.
    check(subjectId, purpose) {
      return store.get(key(subjectId, purpose))?.granted === true;
    },

    // Queryable consent state for a subject (feeds DSAR "access" + your consent dashboard).
    state(subjectId) {
      const out = {};
      for (const [k, v] of store) {
        const [s, p] = k.split('::');
        if (s === subjectId) out[p] = v;
      }
      return out;
    },

    log,
  };
}
