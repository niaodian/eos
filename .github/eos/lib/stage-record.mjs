// Stage records — the structured half of the phase documents.
//
// EOS-AUD-003: G1/G2/G-UX/G4 used to be existence checks. An empty docs/discovery.md, an empty
// docs/requirements.md and an empty docs/architecture.md with no docs/DESIGN.md at all still
// carried the product to "architecture approved", because nothing ever looked inside.
//
// Keyword-sniffing the Markdown would not fix it: prose is precisely what a gate can be talked
// past. So each stage keeps its human document AND a small machine record next to it, and the gate
// reads the record. Markdown stays the thing people read; the record is the thing that promotes.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from './schema.mjs';

export const STAGE_RECORDS = {
  discovery: { path: 'docs/discovery.json', schema: 'discovery.schema.json', doc: 'docs/discovery.md', prompt: 'the eos-discovery agent' },
  requirements: { path: 'docs/requirements.json', schema: 'requirements.schema.json', doc: 'docs/requirements.md', prompt: '/requirements' },
  design: { path: 'docs/design.json', schema: 'design.schema.json', doc: 'docs/DESIGN.md', prompt: '/ux-spec' },
  architecture: { path: 'docs/architecture.json', schema: 'architecture.schema.json', doc: 'docs/architecture.md', prompt: 'the eos-architecture agent' },
  telemetry: { path: 'docs/telemetry.json', schema: 'telemetry.schema.json', doc: 'docs/telemetry-plan.md', prompt: '/telemetry-plan' },
  iteration: { path: 'docs/iteration.json', schema: 'iteration.schema.json', doc: 'docs/retrospective.md', prompt: 'the eos-review agent' },
};

/**
 * Read + schema-validate one stage record.
 * @returns {{present:boolean, path:string, data:object|null, errors:string[]}}
 */
export function readStageRecord(root, kind) {
  const spec = STAGE_RECORDS[kind];
  const full = join(root, spec.path);
  if (!existsSync(full)) return { present: false, path: spec.path, data: null, errors: [] };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, path: spec.path, data: null, errors: [`${spec.path}: invalid JSON (${e.message})`] };
  }
  // Fail closed: an absent schema disables validation, which would make deleting one file a way to
  // weaken the gate that reads this record.
  let schema;
  try { schema = JSON.parse(readFileSync(join(root, `.eos/schemas/${spec.schema}`), 'utf8')); } catch (e) {
    return { present: true, path: spec.path, data: null, errors: [`.eos/schemas/${spec.schema} is missing or unreadable (${e.message}) — ${spec.path} cannot be validated, so it cannot be trusted`] };
  }
  const v = validate(schema, parsed, { label: spec.path });
  if (!v.valid) return { present: true, path: spec.path, data: null, errors: v.errors.slice(0, 4) };
  return { present: true, path: spec.path, data: parsed, errors: [] };
}

/**
 * Is the human document actually written? A file created by `touch` (or one holding nothing but a
 * heading) is the exact artifact the audit walked straight through.
 * @returns {string|null} a reason, or null when the document carries content
 */
export function emptyDocReason(root, rel, { minWords = 60 } = {}) {
  const full = join(root, rel);
  if (!existsSync(full)) return `${rel} does not exist`;
  let text;
  try {
    if (statSync(full).size === 0) return `${rel} is empty`;
    text = readFileSync(full, 'utf8');
  } catch (e) { return `${rel} could not be read (${e.message})`; }
  const body = text
    .replace(/^---[\s\S]*?\r?\n---/, '')            // front matter
    .replace(/```[\s\S]*?```/g, ' ')                // fenced blocks (backtick)
    .replace(/~~~[\s\S]*?~~~/g, ' ')                // fenced blocks (tilde)
    .replace(/<!--[\s\S]*?-->/g, ' ')               // comments
    .replace(/^\s*#{1,6}\s+.*$/gm, ' ')             // headings
    .replace(/[|:\-*+>_`#]/g, ' ');
  // CJK prose has no spaces, so splitting on whitespace would count a whole Chinese paragraph as
  // one "word" and reject a perfectly good document. Count ideographs/kana/hangul individually and
  // space-delimited words as one unit each — a rough parity that works for both writing systems.
  const cjk = (body.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g) || []).length;
  const latin = body
    .replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const words = latin + Math.round(cjk / 2);
  if (words < minWords) {
    return `${rel} has ${words} word(s) of content outside its headings — that is a placeholder, not a specification (at least ${minWords} expected)`;
  }
  return null;
}

/**
 * Is this text an actual answer, or characters standing where an answer should be?
 * `"..............."`, `"-"`, `"<!-- todo -->"` and `"n/a"` all satisfy a length check while saying
 * nothing, which is how a "reason" requirement becomes a formality. A reason must carry words.
 */
export function substantive(text, minChars = 15) {
  const value = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[`*_~>|]/g, ' ')
    .trim();
  if (!value) return false;
  if (/^(?:tbd|todo|fixme|n\/?a|none|-+|\?+|\.+)$/i.test(value)) return false;
  // Count characters that can carry meaning: letters, digits, or CJK ideographs/kana/hangul.
  const meaningful = (value.match(/[\p{L}\p{N}]/gu) || []).length;
  return meaningful >= minChars;
}

/** Structured decision validation shared by the operational pre-flight and the architecture record. */
export function decisionProblem(key, d, { adoptField = 'note', minReason = 15 } = {}) {
  if (!d || typeof d !== 'object') return `${key}: no decision recorded`;
  if (d.decision === 'ADOPT' || d.status === 'DECIDED' || d.status === 'COVERED' || d.status === 'UPDATED') {
    const value = d[adoptField] || d.summary || d.ref || '';
    return substantive(value, 10) ? null : `${key}: recorded as adopted but says nothing about what will be built`;
  }
  if (d.decision === 'SKIP' || d.status === 'NOT_APPLICABLE') {
    // EOS-AUD-005: a bare "SKIP" is the cheapest way to switch an operational concern off, and a
    // row of dots is the second cheapest.
    return substantive(d.reason, minReason)
      ? null
      : `${key}: SKIP / N/A without a reason (>= ${minReason} characters of actual explanation) — record WHY this product genuinely does not need it`;
  }
  if (d.decision === 'DEFER') {
    const missing = [];
    if (!substantive(d.owner, 1)) missing.push('owner');
    if (!substantive(d.trigger, 5)) missing.push('trigger');
    return missing.length ? `${key}: DEFER without ${missing.join(' and ')} — a deferral nobody owns and nothing ends is a silent skip` : null;
  }
  return `${key}: unknown decision "${d.decision ?? d.status}"`;
}

/** Unresolved BLOCKER-severity questions in a stage record. */
export const openBlockers = (record) => (record?.openQuestions || [])
  .filter((q) => q.status === 'OPEN' && (q.severity || 'BLOCKER') === 'BLOCKER')
  .map((q) => q.question);
