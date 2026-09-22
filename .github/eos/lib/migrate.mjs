// Version compatibility and migration for the governance files.
//
// THE PROBLEM: every governance file carries a `schemaVersion`, and nothing has ever READ one.
// They were written and then ignored, which makes them decoration rather than a contract. Two
// failures follow from that:
//
//   BEHIND  A repository created against an older EOS keeps running against a newer engine with no
//           indication that the file it is being judged by has moved on.
//   AHEAD   A repository written by a NEWER EOS is read by an older one, which does not understand
//           the new fields — and, because unknown properties are rejected rather than ignored,
//           fails with a schema error that describes a symptom rather than the cause.
//
// AHEAD is the dangerous direction and it fails CLOSED here with an explicit diagnosis: an old
// engine must never quietly reinterpret a file it does not fully understand.
//
// Migrations are deliberately data-in / data-out pure functions, so `--plan` can show a real diff
// of what `--apply` would do. An automatic migration nobody could review before it ran would be a
// worse problem than the one it solves.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic.mjs';

/**
 * The schemaVersion THIS engine writes and fully understands, per governance file.
 * Bumping one of these is a deliberate act that must come with a migration below.
 */
export const CURRENT_VERSIONS = {
  '.eos/workflow.json': 1,
  '.eos/gates.json': 1,
  '.eos/agent-map.json': 1,
  '.eos/test-budget.json': 1,
};

/**
 * Registered migrations: `path -> { fromVersion: (data) => data }`.
 *
 * A migration takes the parsed file at version N and returns it at version N+1, including the
 * bumped `schemaVersion`. Empty is the correct state today — every shipped file is at its current
 * version — and the machinery exists so the FIRST breaking change is a reviewable, testable
 * function rather than a hand-edit note in a release blog.
 */
export const MIGRATIONS = {};

/** @returns {'CURRENT'|'BEHIND'|'AHEAD'|'MISSING'|'UNREADABLE'|'UNVERSIONED'} */
function classify(found, current) {
  if (found === null) return 'UNVERSIONED';
  if (found === current) return 'CURRENT';
  return found < current ? 'BEHIND' : 'AHEAD';
}

/** Read every governance file and say where each one stands relative to this engine. */
export function inspectVersions(root) {
  const files = [];
  for (const [rel, current] of Object.entries(CURRENT_VERSIONS)) {
    const full = join(root, rel);
    if (!existsSync(full)) { files.push({ path: rel, state: 'MISSING', found: null, current, detail: 'not present' }); continue; }
    let data;
    try { data = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
      files.push({ path: rel, state: 'UNREADABLE', found: null, current, detail: `invalid JSON (${e.message})` });
      continue;
    }
    const found = typeof data.schemaVersion === 'number' ? data.schemaVersion : null;
    const state = classify(found, current);
    const steps = state === 'BEHIND' ? migrationPath(rel, found, current) : [];
    files.push({
      path: rel,
      state,
      found,
      current,
      steps: steps.map((s) => s.from),
      detail: {
        CURRENT: `schemaVersion ${found}`,
        BEHIND: steps.length
          ? `written for schemaVersion ${found}, this engine writes ${current} — ${steps.length} migration step(s) available`
          : `written for schemaVersion ${found}, this engine writes ${current} — NO migration is registered for that jump`,
        AHEAD: `written by a NEWER EOS (schemaVersion ${found}, this engine understands ${current}) — upgrade EOS rather than editing the file`,
        UNVERSIONED: 'no schemaVersion field — it predates the version contract',
        MISSING: 'not present',
        UNREADABLE: 'invalid JSON',
      }[state],
    });
  }
  return files;
}

function migrationPath(rel, from, to) {
  const steps = [];
  const table = MIGRATIONS[rel] || {};
  for (let v = from; v < to; v += 1) {
    const fn = table[v];
    if (!fn) return [];
    steps.push({ from: v, to: v + 1, fn });
  }
  return steps;
}

/**
 * Work out what migrating would do, without doing it.
 *
 * `blocked` is the part that matters. A file that is AHEAD, unreadable, or BEHIND with no
 * registered migration must stop the run: continuing would mean an engine acting on a file whose
 * meaning it is guessing at.
 */
export function planMigration(root) {
  const files = inspectVersions(root);
  const changes = [];
  const blocked = [];
  for (const f of files) {
    if (f.state === 'AHEAD') { blocked.push({ path: f.path, reason: f.detail }); continue; }
    if (f.state === 'UNREADABLE') { blocked.push({ path: f.path, reason: f.detail }); continue; }
    if (f.state !== 'BEHIND') continue;
    const steps = migrationPath(f.path, f.found, f.current);
    if (!steps.length) { blocked.push({ path: f.path, reason: f.detail }); continue; }
    const before = JSON.parse(readFileSync(join(root, f.path), 'utf8'));
    let after = before;
    for (const s of steps) after = s.fn(JSON.parse(JSON.stringify(after)));
    after.schemaVersion = f.current;
    changes.push({
      path: f.path,
      from: f.found,
      to: f.current,
      steps: steps.map((s) => `${s.from} → ${s.to}`),
      diff: diffKeys(before, after),
      after,
    });
  }
  return { files, changes, blocked, ok: blocked.length === 0 };
}

/** A shallow, readable description of what changed — enough to review, not a full patch format. */
function diffKeys(before, after, prefix = '') {
  const out = [];
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  for (const k of keys) {
    const a = before?.[k];
    const b = after?.[k];
    const at = prefix ? `${prefix}.${k}` : k;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a === undefined) out.push(`+ ${at}`);
    else if (b === undefined) out.push(`- ${at}`);
    else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) out.push(...diffKeys(a, b, at));
    else out.push(`~ ${at}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
  return out;
}

/** Apply a plan. Refuses to write anything at all when any file is blocked. */
export function applyMigration(root) {
  const plan = planMigration(root);
  if (!plan.ok) return { ...plan, written: [] };
  const written = [];
  for (const c of plan.changes) {
    writeFileAtomic(join(root, c.path), `${JSON.stringify(c.after, null, 2)}\n`);
    written.push(c.path);
  }
  return { ...plan, written };
}

/**
 * The compatibility check the engine runs on every command.
 *
 * Only the AHEAD case is fatal: an older engine reading a newer file does not know what the new
 * fields mean, and the schema validator rejects unknown properties, so the failure it would produce
 * otherwise describes a symptom instead of the cause.
 */
export function compatibilityErrors(root) {
  return inspectVersions(root)
    .filter((f) => f.state === 'AHEAD')
    .map((f) => `${f.path}: ${f.detail}`);
}
