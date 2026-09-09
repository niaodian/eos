// Append-only, hash-chained ledger. `.eos/ledger/events.jsonl` is the authority for story and
// release state: a state can only change through a validated transition event, never by editing a
// Markdown field. Each line carries `prevHash` + `hash` over the canonical event body, so deleting
// or rewriting an earlier line is detectable offline by `eos ledger --verify` (and in CI).
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

export const LEDGER_PATH = '.eos/ledger/events.jsonl';
// A forward-only chain cannot notice that the TAIL was cut off: deleting the last lines leaves
// every seq and prevHash intact. The head record pins the expected length + last hash, so
// truncation now requires forging two tracked files instead of trimming one. [review]
export const LEDGER_HEAD_PATH = '.eos/ledger/head.json';

const HASHED_FIELDS = ['seq', 'ts', 'type', 'scope', 'changeType', 'from', 'to', 'gate', 'status', 'evidenceSha256', 'actor', 'commit', 'notApplicableGates', 'detail', 'prevHash'];

/** Stable serialization: only the declared fields, in a fixed order, so the hash is reproducible. */
function canonical(event) {
  const out = {};
  for (const f of HASHED_FIELDS) if (event[f] !== undefined) out[f] = event[f];
  return JSON.stringify(out);
}

export const hashEvent = (event) => createHash('sha256').update(canonical(event)).digest('hex');

/** @returns {{events: object[], errors: string[]}} */
export function readEvents(root) {
  const full = join(root, LEDGER_PATH);
  if (!existsSync(full)) return { events: [], errors: [] };
  const errors = [];
  const events = [];
  let raw;
  try { raw = readFileSync(full, 'utf8'); } catch (e) { return { events: [], errors: [`${LEDGER_PATH}: unreadable (${e.message})`] }; }
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { events.push(JSON.parse(line)); } catch { errors.push(`${LEDGER_PATH}:${i + 1}: not valid JSON — the ledger is append-only and must never be hand-edited`); }
  });
  return { events, errors };
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
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify({ schemaVersion: 1, count: events.length, hash: events.at(-1)?.hash || null }, null, 2) + '\n', 'utf8');
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
      if (head.count !== events.length) problems.push(`${LEDGER_HEAD_PATH} expects ${head.count} event(s) but the ledger has ${events.length} — line(s) were removed from the end`);
      if ((head.hash ?? null) !== (events.at(-1)?.hash ?? null)) problems.push(`${LEDGER_HEAD_PATH} does not point at the last event — the tail of the ledger was rewritten`);
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

export function appendEvent(root, event) {
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
