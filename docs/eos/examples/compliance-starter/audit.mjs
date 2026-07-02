// audit.mjs — append-only who/when/what trail shared by consent + DSAR.
// Landing point: data-api "Every deletion of user data is audited (who/when/what),
// without logging the data itself." (.github/instructions/data-api/20-data-api.instructions.md)
//
// Stub: swap the in-memory array for a WORM store / append-only audit table.
// NEVER write raw PII here — log identifiers + action, not the personal data.
export function audit() {
  const entries = [];
  return {
    record(entry) {
      const e = Object.freeze({ at: new Date().toISOString(), ...entry });
      entries.push(e);
      return e;
    },
    all() {
      return entries.slice(); // read-only copy — callers can't mutate the trail
    },
  };
}
