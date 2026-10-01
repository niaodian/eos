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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, openSync, closeSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { appendEvent, readEvents, verifyChain, readLedgerSnapshot, LEDGER_PATH, LEDGER_HEAD_PATH, LEDGER_LOCK_PATH } from './lib/ledger.mjs';
import { writeFileAtomic, withLock, LockTimeoutError, renameWithRetry, lockBusyOnWindows } from './lib/atomic.mjs';
import { SPAWN_TIMEOUT_MS } from './test-spawn.mjs';

const EOS_DIR = dirname(fileURLToPath(import.meta.url));
// These are ESM SPECIFIERS embedded in snippets run by a child `node`, not filesystem paths. On
// Windows an absolute path is not a valid specifier — `import … from 'D:\\…'` fails with
// ERR_UNSUPPORTED_ESM_URL_SCHEME ("Received protocol 'd:'") — so they have to be file:// URLs.
// POSIX tolerated the raw path, which is exactly why this only showed up once the suite ran on
// Windows. Anything passed to `fs` below stays a plain path.
const LEDGER_MODULE = pathToFileURL(join(EOS_DIR, 'lib/ledger.mjs')).href;
const ATOMIC_MODULE = pathToFileURL(join(EOS_DIR, 'lib/atomic.mjs')).href;

const dirs = [];
const sandbox = () => { const d = mkdtempSync(join(tmpdir(), 'eos-atomic-')); dirs.push(d); return d; };
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// Scaled from the harness's spawn guard, so a slow runner (EOS_TEST_SPAWN_TIMEOUT_MS) moves every limit
// together and a process's own guard always fires before its test's limit. Defaults: 30s / 60s / 120s.
const WRITER_LIMIT = SPAWN_TIMEOUT_MS / 2;
const TEST_LIMIT = SPAWN_TIMEOUT_MS;
const LONG_TEST_LIMIT = 2 * SPAWN_TIMEOUT_MS;

/** Run a snippet in its own process so the OS, not the event loop, schedules the contention. */
const node = (code) => new Promise((resolve) => {
  execFile(process.execPath, ['--input-type=module', '-e', code], { timeout: WRITER_LIMIT }, (err, stdout, stderr) => {
    // A killed process has no exit code, and on Windows it reports 1 — say it was killed, or a slow
    // runner reads as "the writer failed".
    const killed = err?.killed ? `killed after ${WRITER_LIMIT}ms — the runner is slow (raise EOS_TEST_SPAWN_TIMEOUT_MS) or it hung\n` : '';
    resolve({ code: err ? (err.code ?? 1) : 0, out: `${killed}${stdout}${stderr}` });
  });
});

// --------------------------------------------------------------------------------- the real race

test('concurrent appends from separate processes produce one unforked chain', { timeout: TEST_LIMIT }, async () => {
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

test('the head record still points at the last event after concurrent appends', { timeout: TEST_LIMIT }, async () => {
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

test('the lock is released, not leaked, once the writers finish', { timeout: TEST_LIMIT }, async () => {
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

test('concurrent atomic writers never yield a partially written file', { timeout: TEST_LIMIT }, async () => {
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

test('withLock serialises a read-modify-write across processes', { timeout: TEST_LIMIT }, async () => {
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

// --------------------------------------------------------------------------------- readers
// Readers take no lock: every command reads the ledger, and serialising reads behind writers would
// make a busy repository crawl. A reader can therefore read the ledger before an append and the
// head record after it — and that pair used to read as "line(s) were removed from the end".
// CI caught it under coverage. readLedgerSnapshot re-reads a disagreement before believing it.
test('a reader racing a writer never mistakes a write in progress for truncation', { timeout: LONG_TEST_LIMIT }, async () => {
  const dir = sandbox();
  appendEvent(dir, { type: 'note', detail: 'seed', scope: { type: 'product', id: 'product' } });
  const writer = node(`
    import { appendEvent } from ${JSON.stringify(LEDGER_MODULE)};
    for (let i = 0; i < 300; i += 1) appendEvent(${JSON.stringify(dir)}, { type: 'note', detail: 'w' + i, scope: { type: 'product', id: 'product' } });
  `);
  let done = false;
  let writerResult = null;
  writer.then((r) => { writerResult = r; done = true; });
  let reads = 0;
  const false_alarms = [];
  while (!done) {
    const { chain, errors } = readLedgerSnapshot(dir);
    reads += 1;
    if (chain.problems.length || errors.length) false_alarms.push([...errors, ...chain.problems].join(' | '));
    await new Promise((r) => setImmediate(r));
  }
  // The writer has to SUCCEED. On Windows a reader holding head.json open once made the writer's
  // rename fail mid-write — a crash after the append and before the commit — and a dead writer
  // would otherwise look like a quiet, successful run.
  assert.equal(writerResult.code, 0, `the writer failed while being read:\n${writerResult.out}`);
  assert.ok(reads > 10, `the reader must actually overlap the writer (read ${reads} times)`);
  assert.deepEqual(false_alarms, [], 'an honest concurrent write must never read as tampering');
  assert.equal(readLedgerSnapshot(dir).events.length, 301);
});

test('real truncation is still reported, after the re-reads', () => {
  const dir = sandbox();
  for (const d of ['a', 'b', 'c']) appendEvent(dir, { type: 'note', detail: d, scope: { type: 'product', id: 'product' } });
  const lines = readFileSync(join(dir, LEDGER_PATH), 'utf8').trim().split('\n');
  writeFileSync(join(dir, LEDGER_PATH), `${lines.slice(0, 2).join('\n')}\n`, 'utf8');
  const { chain } = readLedgerSnapshot(dir, { attempts: 3, pauseMs: 1 });
  assert.match(chain.problems.join(' '), /removed from the end/, 'patience must never become blindness');
});

// The states a reader can meet mid-write, built directly so they do not depend on a platform's
// timing. On Windows the gap between append and head update is most of every write (fsync is
// slow), so a reader lands in it constantly — waiting it out is not an answer; the commit point is.
/** A ledger with three committed events, then a fourth appended but not yet committed by head.json. */
function midWrite(dir, { torn = false } = {}) {
  for (const d of ['a', 'b', 'c']) appendEvent(dir, { type: 'note', detail: d, scope: { type: 'product', id: 'product' } });
  const head = readFileSync(join(dir, LEDGER_HEAD_PATH), 'utf8');
  appendEvent(dir, { type: 'note', detail: 'd', scope: { type: 'product', id: 'product' } });
  writeFileSync(join(dir, LEDGER_HEAD_PATH), head, 'utf8'); // head back at 3: the 4th is in flight
  if (torn) {
    const text = readFileSync(join(dir, LEDGER_PATH), 'utf8');
    writeFileSync(join(dir, LEDGER_PATH), text.slice(0, text.length - 20), 'utf8'); // half-written line
  }
}

test('while a writer holds the lock, a reader sees the last committed state at once', () => {
  const dir = sandbox();
  midWrite(dir);
  closeSync(openSync(join(dir, LEDGER_LOCK_PATH), 'wx')); // a writer is mid-way
  const started = Date.now();
  const s = readLedgerSnapshot(dir);
  assert.deepEqual([...s.errors, ...s.chain.problems], [], 'an in-flight append is not damage');
  assert.equal(s.events.length, 3, 'the snapshot is the committed history');
  assert.ok(Date.now() - started < 500, 'and it needs no waiting');
});

test('a half-written final line during a write is not corruption', () => {
  const dir = sandbox();
  midWrite(dir, { torn: true });
  closeSync(openSync(join(dir, LEDGER_LOCK_PATH), 'wx'));
  const s = readLedgerSnapshot(dir);
  assert.deepEqual([...s.errors, ...s.chain.problems], []);
  assert.equal(s.events.length, 3);
});

test('the same state with NO writer is reported — an interrupted write is still visible', () => {
  const dir = sandbox();
  midWrite(dir);
  const s = readLedgerSnapshot(dir, { attempts: 3, pauseMs: 1 });
  assert.match(s.chain.problems.join(' '), /interrupted write/);
});

test('a rename refused transiently is retried, and succeeds', () => {
  // The Windows case: the target is open in another process for a moment. Simulated, because no
  // portable call produces a transient EPERM.
  let calls = 0;
  const rename = () => { calls += 1; if (calls < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' }); };
  renameWithRetry('a', 'b', { rename, pauseMs: 1 });
  assert.equal(calls, 3, 'two refusals, then the rename goes through');
});

test('a rename that stays refused is thrown, not retried forever', () => {
  const rename = () => { throw Object.assign(new Error('busy'), { code: 'EACCES' }); };
  assert.throws(() => renameWithRetry('a', 'b', { rename, attempts: 5, pauseMs: 1 }), /busy/);
});

test('an error that is not transient is thrown at once', () => {
  let calls = 0;
  const rename = () => { calls += 1; throw Object.assign(new Error('gone'), { code: 'ENOENT' }); };
  assert.throws(() => renameWithRetry('a', 'b', { rename, pauseMs: 1 }), /gone/);
  assert.equal(calls, 1, 'only EPERM/EACCES/EBUSY are worth waiting for');
});

test('on Windows a delete-pending lock reads as busy; elsewhere EPERM is still an error', () => {
  const eperm = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  const eacces = Object.assign(new Error('access denied'), { code: 'EACCES' });
  assert.equal(lockBusyOnWindows(eperm, 'win32'), true, 'a lock still disappearing is someone else\'s lock');
  assert.equal(lockBusyOnWindows(eacces, 'win32'), true);
  assert.equal(lockBusyOnWindows(eperm, 'linux'), false, 'on POSIX it is a real permission problem — never waited on');
  assert.equal(lockBusyOnWindows(eperm, 'darwin'), false);
  assert.equal(lockBusyOnWindows(Object.assign(new Error('x'), { code: 'ENOENT' }), 'win32'), false);
});

test('a reader never misreads a SLOW writer (Windows-sized gaps, on any platform)', { timeout: LONG_TEST_LIMIT }, async () => {
  // A load test of the protocol appendEvent follows — lock, append, commit the head, release — with
  // a random pause between append and commit. Honest limit: on a fast machine this does NOT reproduce
  // the Windows failure (the previous reader also passes here); scheduler-granularity phase-locking
  // is what caused that, and the deterministic straddle test below is its regression test. This one
  // stays because it keeps the whole protocol under concurrent load on every platform CI runs.
  const dir = sandbox();
  appendEvent(dir, { type: 'note', detail: 'seed', scope: { type: 'product', id: 'product' } });
  const writer = node(`
    import { withLock, writeFileAtomic, sleep } from ${JSON.stringify(ATOMIC_MODULE)};
    import { hashEvent, readEvents, LEDGER_PATH, LEDGER_HEAD_PATH, LEDGER_LOCK_PATH } from ${JSON.stringify(LEDGER_MODULE)};
    import { appendFileSync } from 'node:fs';
    import { join } from 'node:path';
    const dir = ${JSON.stringify(dir)};
    for (let i = 0; i < 150; i += 1) {
      withLock(join(dir, LEDGER_LOCK_PATH), () => {
        const { events } = readEvents(dir);
        const prev = events.at(-1) || null;
        const body = { seq: events.length + 1, ts: new Date().toISOString(), actor: 'w', type: 'note', detail: 'w' + i, scope: { type: 'product', id: 'product' }, prevHash: prev ? prev.hash : null };
        body.hash = hashEvent(body);
        appendFileSync(join(dir, LEDGER_PATH), JSON.stringify(body) + '\\n');
        sleep(Math.floor(Math.random() * 4));
        writeFileAtomic(join(dir, LEDGER_HEAD_PATH), JSON.stringify({ schemaVersion: 1, count: events.length + 1, hash: body.hash }, null, 2) + '\\n');
      });
      sleep(Math.floor(Math.random() * 2));
    }
  `);
  let done = false;
  let writerResult = null;
  writer.then((r) => { writerResult = r; done = true; });
  let reads = 0;
  const alarms = [];
  while (!done) {
    const { chain, errors } = readLedgerSnapshot(dir);
    reads += 1;
    if (chain.problems.length || errors.length) alarms.push([...errors, ...chain.problems].join(' | '));
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(writerResult.code, 0, writerResult.out);
  assert.ok(reads > 10, `the reader must overlap the writer (read ${reads} times)`);
  assert.deepEqual(alarms, [], 'a slow, honest writer must never read as damage');
  assert.equal(readLedgerSnapshot(dir).events.length, 151);
});

test('a commit landing inside a read, attempt after attempt, is never reported as damage', () => {
  // The Windows failure, made deterministic. A writer whose cycle lines up with the reader's re-read
  // pause lands a whole write — append, commit, release — between the reader's reads on every
  // attempt. Waiting cannot fix phase-locking; noticing that the head moved during the read does.
  const dir = sandbox();
  appendEvent(dir, { type: 'note', detail: 'seed', scope: { type: 'product', id: 'product' } });
  let writes = 0;
  const onRead = (stage) => {
    if (stage === 'after-head' && writes < 5) {
      appendEvent(dir, { type: 'note', detail: `straddle ${writes}`, scope: { type: 'product', id: 'product' } });
      writes += 1;
    }
  };
  const s = readLedgerSnapshot(dir, { pauseMs: 1, onRead });
  assert.equal(writes, 5, 'the first five attempts were each straddled by a complete write');
  assert.deepEqual([...s.errors, ...s.chain.problems], [], 'and none of them read as an interrupted write');
  assert.equal(s.events.length, 6);
});
