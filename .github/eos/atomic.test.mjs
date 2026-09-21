// Atomic, concurrency-safe state writes — the guarantee, asserted.
//
// EOS's central claim is that `.eos/ledger/events.jsonl` is an append-only, hash-chained authority.
// That claim used to hold only when exactly one process wrote at a time. `appendEvent` derives
// `seq` and `prevHash` from the events already on disk, so two concurrent writers — two agents, a
// hook racing a terminal, CI racing a local run — both read N events and both emit seq N+1 with the
// same prevHash. The chain forks, and `eos ledger --verify` then reports TAMPERING for something
// nobody tampered with: the worst possible failure for a tool whose product is trustworthy verdicts.
//
// These tests run REAL concurrent processes. An in-process mutex would pass a single-process test
// and still lose the race that actually happens, so nothing here is simulated.
//
//   node --test .github/eos/atomic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, openSync, closeSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { appendEvent, readEvents, verifyChain, LEDGER_PATH, LEDGER_HEAD_PATH, LEDGER_LOCK_PATH } from './lib/ledger.mjs';
import { writeFileAtomic, withLock, LockTimeoutError } from './lib/atomic.mjs';

const EOS_DIR = dirname(fileURLToPath(import.meta.url));
const LEDGER_MODULE = join(EOS_DIR, 'lib/ledger.mjs');
const ATOMIC_MODULE = join(EOS_DIR, 'lib/atomic.mjs');

const dirs = [];
const sandbox = () => { const d = mkdtempSync(join(tmpdir(), 'eos-atomic-')); dirs.push(d); return d; };
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Run a snippet in its own process so the OS, not the event loop, schedules the contention. */
const node = (code) => new Promise((resolve) => {
  execFile(process.execPath, ['--input-type=module', '-e', code], { timeout: 30000 }, (err, stdout, stderr) => {
    resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}` });
  });
});

// --------------------------------------------------------------------------------- the real race

test('concurrent appends from separate processes produce one unforked chain', { timeout: 60000 }, async () => {
  const dir = sandbox();
  const WRITERS = 8;
  const results = await Promise.all(
    Array.from({ length: WRITERS }, (_, i) => node(`
      import { appendEvent } from ${JSON.stringify(LEDGER_MODULE)};
      appendEvent(${JSON.stringify(dir)}, { type: 'gate', gate: 'verified', status: 'PASS', scope: { type: 'story', id: 'STORY-${i}' } });
    `)),
  );
  for (const r of results) assert.equal(r.code, 0, `a writer failed: ${r.out}`);

  const { events, errors } = readEvents(dir);
  assert.deepEqual(errors, [], 'every line must be valid JSON');
  assert.equal(events.length, WRITERS, 'no append may be lost');

  // The defect this test exists for: duplicated seq numbers sharing one prevHash.
  const seqs = events.map((e) => e.seq);
  assert.deepEqual(seqs, Array.from({ length: WRITERS }, (_, i) => i + 1), 'seq must be a gapless 1..N with no duplicates');

  const v = verifyChain(events, { root: dir });
  assert.deepEqual(v.problems, [], 'the chain must verify — a forked chain reads as tampering');
  assert.ok(v.ok);
});

test('the head record still points at the last event after concurrent appends', { timeout: 60000 }, async () => {
  const dir = sandbox();
  await Promise.all(Array.from({ length: 6 }, (_, i) => node(`
    import { appendEvent } from ${JSON.stringify(LEDGER_MODULE)};
    appendEvent(${JSON.stringify(dir)}, { type: 'note', detail: 'n${i}', scope: { type: 'product', id: 'product' } });
  `)));
  const { events } = readEvents(dir);
  const head = JSON.parse(readFileSync(join(dir, LEDGER_HEAD_PATH), 'utf8'));
  assert.equal(head.count, events.length);
  assert.equal(head.hash, events.at(-1).hash);
});

test('the lock is released, not leaked, once the writers finish', { timeout: 60000 }, async () => {
  const dir = sandbox();
  await Promise.all(Array.from({ length: 4 }, () => node(`
    import { appendEvent } from ${JSON.stringify(LEDGER_MODULE)};
    appendEvent(${JSON.stringify(dir)}, { type: 'note', detail: 'x', scope: { type: 'product', id: 'product' } });
  `)));
  assert.equal(existsSync(join(dir, LEDGER_LOCK_PATH)), false, 'a leaked lock would wedge the repository');
});

// --------------------------------------------------------------------------------- atomic writes

test('writeFileAtomic replaces content wholesale and leaves no temp file behind', () => {
  const dir = sandbox();
  const target = join(dir, 'nested/deep/state.json');
  writeFileAtomic(target, '{"v":1}\n');
  assert.equal(readFileSync(target, 'utf8'), '{"v":1}\n');
  writeFileAtomic(target, '{"v":2}\n');
  assert.equal(readFileSync(target, 'utf8'), '{"v":2}\n');
  assert.deepEqual(readdirSync(join(dir, 'nested/deep')).filter((f) => f.endsWith('.tmp')), []);
});

test('a failed atomic write leaves the previous version intact', () => {
  const dir = sandbox();
  const target = join(dir, 'state.json');
  writeFileAtomic(target, 'original\n');
  // A directory where the temp file must go cannot be written; the original must survive untouched.
  assert.throws(() => writeFileAtomic(join(dir, 'state.json/impossible'), 'x'));
  assert.equal(readFileSync(target, 'utf8'), 'original\n');
});

test('concurrent atomic writers never yield a partially written file', { timeout: 60000 }, async () => {
  const dir = sandbox();
  const target = join(dir, 'contended.json');
  const payloads = Array.from({ length: 6 }, (_, i) => JSON.stringify({ writer: i, filler: 'x'.repeat(20000) }));
  await Promise.all(payloads.map((p) => node(`
    import { writeFileAtomic } from ${JSON.stringify(ATOMIC_MODULE)};
    writeFileAtomic(${JSON.stringify(target)}, ${JSON.stringify(p)});
  `)));
  // Whoever won, the file must be exactly ONE writer's payload — never a splice of two.
  assert.ok(payloads.includes(readFileSync(target, 'utf8')), 'the file must equal one writer payload exactly');
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
});

// --------------------------------------------------------------------------------- the lock itself

test('withLock serialises a read-modify-write across processes', { timeout: 60000 }, async () => {
  const dir = sandbox();
  const counter = join(dir, 'counter.txt');
  const lock = join(dir, '.lock');
  writeFileSync(counter, '0', 'utf8');
  await Promise.all(Array.from({ length: 10 }, () => node(`
    import { withLock, writeFileAtomic } from ${JSON.stringify(ATOMIC_MODULE)};
    import { readFileSync } from 'node:fs';
    withLock(${JSON.stringify(lock)}, () => {
      const n = Number(readFileSync(${JSON.stringify(counter)}, 'utf8'));
      // Widen the window the lock has to cover; without mutual exclusion this loses increments.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
      writeFileAtomic(${JSON.stringify(counter)}, String(n + 1));
    });
  `)));
  assert.equal(readFileSync(counter, 'utf8'), '10', 'every increment must survive');
});

test('a held lock times out with an actionable error rather than corrupting state', () => {
  const dir = sandbox();
  const lock = join(dir, '.lock');
  closeSync(openSync(lock, 'wx'));
  assert.throws(
    () => withLock(lock, () => 'never runs', { timeoutMs: 60, staleMs: 600000 }),
    (e) => e instanceof LockTimeoutError && /held by another process/.test(e.message),
  );
});

test('a stale lock left by a killed process is reclaimed, not honoured forever', () => {
  const dir = sandbox();
  const lock = join(dir, '.lock');
  closeSync(openSync(lock, 'wx'));
  const old = new Date(Date.now() - 120000);
  utimesSync(lock, old, old);
  assert.equal(withLock(lock, () => 'ran', { timeoutMs: 200, staleMs: 1000 }), 'ran');
  assert.equal(existsSync(lock), false);
});

test('withLock releases the lock even when the critical section throws', () => {
  const dir = sandbox();
  const lock = join(dir, '.lock');
  assert.throws(() => withLock(lock, () => { throw new Error('boom'); }), /boom/);
  assert.equal(existsSync(lock), false);
  assert.equal(withLock(lock, () => 'reusable'), 'reusable');
});

// --------------------------------------------------------------------------------- honest reporting

test('an interrupted head write is reported as interrupted, not as truncation', () => {
  const dir = sandbox();
  appendEvent(dir, { type: 'note', detail: 'a', scope: { type: 'product', id: 'product' } });
  appendEvent(dir, { type: 'note', detail: 'b', scope: { type: 'product', id: 'product' } });
  const { events } = readEvents(dir);
  // Simulate a crash after the append but before the head update: head lags by one.
  writeFileAtomic(join(dir, LEDGER_HEAD_PATH), JSON.stringify({ schemaVersion: 1, count: 1, hash: events[0].hash }, null, 2) + '\n');
  const v = verifyChain(readEvents(dir).events, { root: dir });
  assert.equal(v.ok, false, 'it still fails closed');
  assert.match(v.problems.join(' '), /interrupted write/, 'and it says what actually happened');
  assert.doesNotMatch(v.problems.join(' '), /removed from the end/, 'never sends people hunting a tamper that did not occur');
});

test('a genuinely truncated ledger is still reported as truncation', () => {
  const dir = sandbox();
  for (const d of ['a', 'b', 'c']) appendEvent(dir, { type: 'note', detail: d, scope: { type: 'product', id: 'product' } });
  const lines = readFileSync(join(dir, LEDGER_PATH), 'utf8').trim().split('\n');
  writeFileSync(join(dir, LEDGER_PATH), lines.slice(0, 2).join('\n') + '\n', 'utf8');
  const v = verifyChain(readEvents(dir).events, { root: dir });
  assert.equal(v.ok, false);
  assert.match(v.problems.join(' '), /removed from the end/);
});
