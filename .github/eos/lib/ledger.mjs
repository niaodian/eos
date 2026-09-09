// Append-only, hash-chained ledger. `.eos/ledger/events.jsonl` is the authority for story and
// release state: a state can only change through a validated transition event, never by editing a
// Markdown field. Each line carries `prevHash` + `hash` over the canonical event body, so deleting
// or rewriting an earlier line is detectable offline by `eos ledger --verify` (and in CI).
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const LEDGER_PATH = '.eos/ledger/events.jsonl';

const HASHED_FIELDS = ['seq', 'ts', 'type', 'scope', 'changeType', 'from', 'to', 'gate', 'status', 'actor', 'commit', 'notApplicableGates', 'detail', 'prevHash'];

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

/** @returns {{ok: boolean, problems: string[]}} */
export function verifyChain(events) {
  const problems = [];
  let prevHash = null;
  events.forEach((e, i) => {
    const at = `event #${i + 1}`;
    if (e.seq !== i + 1) problems.push(`${at}: seq ${e.seq} is out of order (expected ${i + 1}) — a line was inserted or removed`);
    if ((e.prevHash ?? null) !== prevHash) problems.push(`${at}: prevHash does not chain to the previous event — the ledger was rewritten`);
    const expected = hashEvent(e);
    if (e.hash !== expected) problems.push(`${at}: hash mismatch — this event was tampered with after it was recorded`);
    prevHash = e.hash;
  });
  return { ok: problems.length === 0, problems };
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
