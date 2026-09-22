// Append-only, hash-chained ledger. `.eos/ledger/events.jsonl` is the authority for story and
// release state: a state can only change through a validated transition event, never by editing a
// Markdown field. Each line carries `prevHash` + `hash` over the canonical event body, so deleting
// or rewriting an earlier line is detectable offline by `eos ledger --verify` (and in CI).
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { withLock, writeFileAtomic } from './atomic.mjs';

export const LEDGER_PATH = '.eos/ledger/events.jsonl';
// A forward-only chain cannot notice that the TAIL was cut off: deleting the last lines leaves
// every seq and prevHash intact. The head record pins the expected length + last hash, so
// truncation now requires forging two tracked files instead of trimming one. [review]
export const LEDGER_HEAD_PATH = '.eos/ledger/head.json';
// Held for the whole read-modify-write in `appendEvent`. Never committed: it is process
// coordination, not project state.
export const LEDGER_LOCK_PATH = '.eos/ledger/.lock';

const HASHED_FIELDS = ['seq', 'ts', 'type', 'scope', 'changeType', 'from', 'to', 'gate', 'status', 'evidenceSha256', 'manifestDigest', 'actor', 'commit', 'notApplicableGates', 'detail', 'prevHash'];

/** Stable serialization: only the declared fields, in a fixed order, so the hash is reproducible. */
function canonical(event) {
  const out = {};
  for (const f of HASHED_FIELDS) if (event[f] !== undefined) out[f] = event[f];
  return JSON.stringify(out);
}

export const hashEvent = (event) => createHash('sha256').update(canonical(event)).digest('hex');

/** Git conflict markers. Their presence changes the diagnosis completely, so they are detected. */
const CONFLICT_RE = /^(<{7}|={7}|>{7})/;

/** @returns {{events: object[], errors: string[], conflicted: boolean}} */
export function readEvents(root) {
  const full = join(root, LEDGER_PATH);
  if (!existsSync(full)) return { events: [], errors: [], conflicted: false };
  const errors = [];
  const events = [];
  let raw;
  try { raw = readFileSync(full, 'utf8'); } catch (e) { return { events: [], errors: [`${LEDGER_PATH}: unreadable (${e.message})`], conflicted: false }; }
  const conflicted = raw.split('\n').some((l) => CONFLICT_RE.test(l));
  if (conflicted) {
    // Reporting this as "not valid JSON … must never be hand-edited" accused the developer of
    // tampering when what actually happened is that two branches both appended and git could not
    // merge an append-only log. Different cause, different fix.
    return {
      events: [],
      conflicted: true,
      errors: [`${LEDGER_PATH} contains git conflict markers — two branches both appended to the append-only ledger. `
        + 'Do NOT resolve this by hand: picking a side loses events, and keeping both breaks the hash chain. '
        + 'Run `node .github/eos/eos.mjs ledger --resolve` to replay both sides into one valid chain.'],
    };
  }
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { events.push(JSON.parse(line)); } catch { errors.push(`${LEDGER_PATH}:${i + 1}: not valid JSON — the ledger is append-only and must never be hand-edited`); }
  });
  return { events, errors, conflicted: false };
}

/**
 * Split a conflicted ledger into the two sides git could not reconcile.
 *
 * Both sides share everything before the branch point, so the shared prefix appears in neither
 * conflict hunk and is returned as `common`.
 *
 * @returns {{common: object[], ours: object[], theirs: object[]}}
 */
export function parseConflicted(raw) {
  const common = [];
  const ours = [];
  const theirs = [];
  let target = common;
  for (const line of raw.split('\n')) {
    if (/^<{7}/.test(line)) { target = ours; continue; }
    if (/^={7}/.test(line)) { target = theirs; continue; }
    if (/^>{7}/.test(line)) { target = common; continue; }
    if (!line.trim()) continue;
    try { target.push(JSON.parse(line)); } catch { /* a non-JSON line inside a hunk is not an event */ }
  }
  return { common, ours, theirs };
}

/**
 * Replay events into one valid chain.
 *
 * THE POLICY, and why it is the only honest one: the ledger is append-only and hash-chained, so a
 * "merge" cannot interleave lines — every event after the branch point has a `prevHash` that no
 * longer points anywhere. Reconciliation therefore REPLAYS the divergent events onto the shared
 * prefix, re-deriving `seq`, `prevHash` and `hash`.
 *
 * What is preserved: every event, and every field that says what happened — `ts`, `actor`, `type`,
 * `scope`, `gate`, `status`, `evidenceSha256`, `detail`. Nothing is dropped and nothing is invented.
 * What necessarily changes: chain position. That is not a rewrite of history, it is history being
 * given a single order — and the ORDER is by timestamp, so it reflects when things actually
 * happened rather than which branch won.
 *
 * Deduplication is by hash, which is exactly right: the shared prefix is identical on both sides
 * and collapses, while two genuinely separate runs of the same gate have different hashes and are
 * both kept. Collapsing those would be inventing a history in which one of them never ran.
 */
export function reconcileEvents(groups) {
  const seen = new Set();
  const all = [];
  for (const group of groups) {
    for (const e of group || []) {
      if (!e || typeof e !== 'object') continue;
      const key = e.hash || JSON.stringify(e);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(e);
    }
  }
  // Stable: timestamp first, then the order encountered, so an identical input yields an identical
  // output and two people resolving the same conflict get the same chain.
  const ordered = all
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (String(a.e.ts || '') === String(b.e.ts || '') ? a.i - b.i : String(a.e.ts || '').localeCompare(String(b.e.ts || ''))))
    .map((x) => x.e);

  const replayed = [];
  let prevHash = null;
  for (const [index, source] of ordered.entries()) {
    const body = {};
    for (const f of HASHED_FIELDS) if (f !== 'seq' && f !== 'prevHash' && source[f] !== undefined) body[f] = source[f];
    const event = { seq: index + 1, ts: source.ts, ...body, prevHash };
    event.hash = hashEvent(event);
    replayed.push(event);
    prevHash = event.hash;
  }
  return replayed;
}

/** Write a reconciled chain, replacing the ledger and its head record atomically. */
export function writeLedger(root, events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  writeFileAtomic(join(root, LEDGER_PATH), body);
  writeHead(root, events);
  return events.length;
}

/**
 * Did this ledger DIVERGE (two branches appended, then merged) rather than get tampered with?
 *
 * A duplicated `seq` is the fingerprint: an attacker editing a line leaves the sequence intact,
 * whereas a textual merge of two appended tails produces two events claiming the same position.
 * Naming the two apart matters — one is a git accident with a mechanical fix, the other is an
 * accusation.
 */
export function divergence(events) {
  const bySeq = new Map();
  for (const e of events) bySeq.set(e.seq, (bySeq.get(e.seq) || 0) + 1);
  const duplicated = [...bySeq.entries()].filter(([, n]) => n > 1).map(([seq]) => seq).sort((a, b) => a - b);
  return { diverged: duplicated.length > 0, duplicatedSeq: duplicated };
}

export function readHead(root) {
  const full = join(root, LEDGER_HEAD_PATH);
  if (!existsSync(full)) return { present: false, head: null, error: null };
  try { return { present: true, head: JSON.parse(readFileSync(full, 'utf8')), error: null }; } catch (e) {
    return { present: true, head: null, error: `${LEDGER_HEAD_PATH}: invalid JSON (${e.message})` };
  }
}

function writeHead(root, events) {
  const full = join(root, LEDGER_HEAD_PATH);
  // Atomic: a half-written head record would be unparseable, and an unparseable head is reported as
  // tamper evidence — an interrupted write must never look like an attack.
  writeFileAtomic(full, JSON.stringify({ schemaVersion: 1, count: events.length, hash: events.at(-1)?.hash || null }, null, 2) + '\n');
}

/**
 * @returns {{ok: boolean, problems: string[], warnings: string[]}}
 * `problems` are tamper evidence (hard ERROR everywhere). `warnings` are migration facts — a
 * ledger written before the head record existed cannot be *verified* for truncation, but it is not
 * itself evidence of tampering, so it must not brick an existing repository.
 */
export function verifyChain(events, { root = null } = {}) {
  const problems = [];
  const warnings = [];
  // A merged ledger is not a tampered one. Diagnose it first, so the report names the real cause
  // and the mechanical fix instead of accusing whoever ran `git merge` of rewriting history.
  const merge = divergence(events);
  if (merge.diverged) {
    problems.push(
      `${LEDGER_PATH} has ${merge.duplicatedSeq.length} duplicated sequence number(s) (${merge.duplicatedSeq.join(', ')}) — `
      + 'this is a MERGE DIVERGENCE, not tampering: two branches each appended to the append-only ledger and the histories were combined. '
      + 'Run `node .github/eos/eos.mjs ledger --resolve` to replay both sides into one valid chain; every event is kept.',
    );
    // The per-event walk below would now emit a cascade of "the ledger was rewritten" for the same
    // single cause, which buries the one line that explains what to do.
    return { ok: false, problems, warnings };
  }
  let prevHash = null;
  events.forEach((e, i) => {
    const at = `event #${i + 1}`;
    if (e.seq !== i + 1) problems.push(`${at}: seq ${e.seq} is out of order (expected ${i + 1}) — a line was inserted or removed`);
    if ((e.prevHash ?? null) !== prevHash) problems.push(`${at}: prevHash does not chain to the previous event — the ledger was rewritten`);
    const expected = hashEvent(e);
    if (e.hash !== expected) problems.push(`${at}: hash mismatch — this event was tampered with after it was recorded`);
    prevHash = e.hash;
  });
  if (root) {
    const { present, head, error } = readHead(root);
    if (error) problems.push(error);
    else if (!present) {
      // "Never had one" (a ledger predating this record) is a migration fact. "Had one and it is
      // gone" is exactly what deleting the truncation defence looks like, so git decides which
      // it is; with no git repository we stay on the safe side of the two only for the tracked case.
      if (events.length) {
        const tracked = spawnSync('git', ['ls-files', '--error-unmatch', LEDGER_HEAD_PATH], { cwd: root, encoding: 'utf8' }).status === 0;
        if (tracked) problems.push(`${LEDGER_HEAD_PATH} is tracked in git but missing from the working tree — the truncation defence was removed; restore it from version control`);
        else warnings.push(`${LEDGER_HEAD_PATH} is missing, so this ledger cannot be checked for truncation. It is written on the next recorded event; review that diff.`);
      }
    } else {
      // Direction matters, and the old message asserted one direction for both. Fewer events than
      // the head expects is the truncation this record exists to catch. MORE events than it expects
      // is the opposite failure — an append that completed while the head write did not — which is
      // a recoverable interruption, not evidence of an attack, and naming it as truncation sent
      // people looking for a tamper that never happened.
      if (head.count > events.length) {
        problems.push(`${LEDGER_HEAD_PATH} expects ${head.count} event(s) but the ledger has ${events.length} — line(s) were removed from the end`);
      } else if (head.count < events.length) {
        problems.push(`${LEDGER_HEAD_PATH} records ${head.count} event(s) but the ledger has ${events.length} — a recorded event did not update the head (an interrupted write). The chain itself is verified above; re-run the command that was interrupted, or restore ${LEDGER_HEAD_PATH} from version control.`);
      } else if ((head.hash ?? null) !== (events.at(-1)?.hash ?? null)) {
        problems.push(`${LEDGER_HEAD_PATH} does not point at the last event — the tail of the ledger was rewritten`);
      }
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

export function appendEvent(root, event) {
  // The ENTIRE read-modify-write is the critical section. `seq` and `prevHash` are derived from the
  // events already on disk, so two concurrent appenders that both read N events would both write
  // seq N+1 with the same prevHash — a forked chain that `verifyChain` reports as tampering. The
  // lock is what makes "append-only" true under concurrency rather than only in the happy path.
  return withLock(join(root, LEDGER_LOCK_PATH), () => {
    const { events, errors } = readEvents(root);
    if (errors.length) throw new Error(errors.join('; '));
    const prev = events.at(-1) || null;
    const body = {
      seq: events.length + 1,
      ts: new Date().toISOString(),
      actor: process.env.EOS_ACTOR || process.env.USER || process.env.USERNAME || 'unknown',
      ...event,
      prevHash: prev ? prev.hash : null,
    };
    body.hash = hashEvent(body);
    const full = join(root, LEDGER_PATH);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, JSON.stringify(body) + '\n', 'utf8');
    writeHead(root, [...events, body]);
    return body;
  });
}

/** Current state of a scope from the ledger, falling back to the machine's initial state. */
export function stateOf(events, workflow, scopeType, scopeId) {
  const machine = workflow?.stateMachines?.[scopeType];
  let state = machine ? machine.initial : null;
  for (const e of events) {
    if (e.type === 'transition' && e.scope?.type === scopeType && e.scope?.id === scopeId && e.to) state = e.to;
  }
  return state;
}

export const eventsFor = (events, scopeType, scopeId) =>
  events.filter((e) => e.scope?.type === scopeType && e.scope?.id === scopeId);

export function lastGateEvent(events, scopeType, scopeId, gate) {
  let found = null;
  for (const e of events) {
    if (e.type === 'gate' && e.gate === gate && e.scope?.type === scopeType && e.scope?.id === scopeId) found = e;
  }
  return found;
}

/** Every scope id the ledger has ever seen for a scope type (used by release aggregation). */
export function knownScopes(events, scopeType) {
  const ids = new Set();
  for (const e of events) if (e.scope?.type === scopeType) ids.add(e.scope.id);
  return [...ids];
}
