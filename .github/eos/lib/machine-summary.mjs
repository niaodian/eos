// Machine summaries — the structured half of "it was verified".
//
// EOS's original trace matrix and eval gate read Markdown: a row ending in "PASS" counted as a
// passing test, and `commands.eval` exiting 0 counted as a met threshold. Both are claims a human
// (or a model) can write without running anything (EOS-AUD-006 / EOS-AUD-004).
//
// These readers give the gates a second, machine-produced source that a person is not supposed to
// author by hand: a schema-valid summary emitted by the runner, bound to the product tree it ran
// against. Markdown keeps its job — expressing the human decision "this AC is proven by that
// test" — and the summary proves the run happened.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from './schema.mjs';

/** Where a runner is expected to drop its machine summary. */
export const SUMMARY_PATHS = {
  testRun: 'docs/evidence/test-run.json',
  evalSummary: 'docs/evidence/eval-summary.json',
  nfrSummary: 'docs/evidence/nfr-summary.json',
};

const SCHEMAS = {
  testRun: 'test-run.schema.json',
  evalSummary: 'eval-summary.schema.json',
  nfrSummary: 'nfr-summary.schema.json',
};

/**
 * Read + schema-validate one machine summary.
 * Absent is `present:false` (the caller decides whether that is a failure); malformed is ALWAYS an
 * error — a summary EOS cannot parse must never be read as "nothing to complain about".
 * @returns {{present:boolean, path:string, data:object|null, errors:string[]}}
 */
export function readSummary(root, kind) {
  const rel = SUMMARY_PATHS[kind];
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, path: rel, data: null, errors: [] };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, path: rel, data: null, errors: [`${rel}: invalid JSON (${e.message})`] };
  }
  // A missing schema must not silently DISABLE validation: deleting one file would then weaken
  // every gate that reads this summary.
  let schema;
  try { schema = JSON.parse(readFileSync(join(root, `.eos/schemas/${SCHEMAS[kind]}`), 'utf8')); } catch (e) {
    return { present: true, path: rel, data: null, errors: [`.eos/schemas/${SCHEMAS[kind]} is missing or unreadable (${e.message}) — ${rel} cannot be validated, so it cannot be trusted`] };
  }
  const v = validate(schema, parsed, { label: rel });
  if (!v.valid) return { present: true, path: rel, data: null, errors: v.errors.slice(0, 4) };
  return { present: true, path: rel, data: parsed, errors: [] };
}

/**
 * Does a summary describe the tree we are standing on?
 * `productTree` is optional in the schema so a first-time integration is not blocked on wiring the
 * digest — but when it IS recorded, a mismatch is decisive: those results describe other code.
 * @returns {string|null} a reason, or null when the binding holds (or was not claimed)
 */
export function summaryTreeMismatch(summary, currentDigest) {
  const claimed = summary?.productTree?.digest;
  // An unbound summary is a file of numbers with no statement about WHICH system produced them.
  // Accepting one would leave exactly the freshness hole this contract exists to close, so the
  // binding is required — `eos product-tree --json` prints the digest to embed.
  if (!claimed) return 'it records no productTree.digest, so it does not say which code produced these results — add it from `eos product-tree --json`';
  if (!currentDigest) return 'the current product tree is unknown, so this summary cannot be bound to it';
  return claimed === currentDigest
    ? null
    : `it was produced against product tree ${String(claimed).slice(0, 12)} but the tree is now ${currentDigest.slice(0, 12)} — re-run it`;
}
