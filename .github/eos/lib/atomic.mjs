// Crash-safe and concurrency-safe writes for the files EOS treats as authoritative.
//
// THE PROBLEM THIS SOLVES
// `.eos/ledger/events.jsonl` is the authority for every story and release state, and it was being
// produced by a read-modify-write with no mutual exclusion: read every event, derive `seq` and
// `prevHash` from the last one, append, then write the head record in a SECOND call. Two processes
// doing that concurrently — two agents, a hook racing a terminal, CI racing a local run — both read
// `N` events, both emit `seq = N + 1` with the same `prevHash`, and the chain forks. `verifyChain`
// then reports tamper evidence for something nobody tampered with.
//
// A plain `writeFileSync` has the same shape of problem in miniature: it truncates first and writes
// after, so an interruption leaves a file that exists, parses as nothing, and is authoritative.
//
// THE TWO PRIMITIVES
//   withLock()        serialises a whole read-modify-write across processes via O_EXCL.
//   writeFileAtomic() makes a file's content change all-or-nothing via write-temp-then-rename.
//
// Both are deliberately synchronous and dependency-free: EOS Core is synchronous, offline and
// zero-dependency, and `.github/eos/offline-boundary.test.mjs` enforces that.
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

/** Synchronous sleep with no dependency and no busy-wait. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Replace a file's contents atomically.
 *
 * A reader either sees the whole previous version or the whole new one, never a half-written file.
 * `rename(2)` is atomic within a filesystem, and the temp file is created beside the target so the
 * rename never crosses a device boundary.
 */
export function writeFileAtomic(full, data) {
  mkdirSync(dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  let fd = null;
  try {
    fd = openSync(tmp, 'wx');
    writeSync(fd, data);
    // Rename is atomic with respect to other processes, but a crash can still leave the RENAME
    // durable and the CONTENT not. fsync before the rename is what makes the pair survive together.
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmp, full);
  } catch (e) {
    if (fd !== null) { try { closeSync(fd); } catch { /* already closed */ } }
    try { unlinkSync(tmp); } catch { /* never created, or already gone */ }
    throw e;
  }
}

export class LockTimeoutError extends Error {
  constructor(message) { super(message); this.name = 'LockTimeoutError'; }
}

/**
 * Run `fn` with an exclusive, cross-process lock held on `lockPath`.
 *
 * `open(…, 'wx')` is O_CREAT|O_EXCL: the kernel guarantees exactly one caller creates the file, so
 * this works between unrelated processes, which is the case that matters here. An advisory
 * in-process mutex would not — the racing writers are separate `node` invocations.
 *
 * A lock left behind by a killed process would otherwise wedge the repository forever, so a lock
 * older than `staleMs` is reclaimed. `staleMs` is generous relative to any real critical section
 * here (all of them are a few file reads and two writes).
 *
 * @param {string} lockPath  file used as the lock; removed on release
 * @param {() => T} fn       critical section
 * @returns {T}
 * @template T
 */
export function withLock(lockPath, fn, { timeoutMs = 10000, staleMs = 60000, now = Date.now } = {}) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = now() + timeoutMs;
  let fd = null;
  let waited = 0;
  for (;;) {
    try {
      fd = openSync(lockPath, 'wx');
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = null;
      try { age = now() - statSync(lockPath).mtimeMs; } catch { /* released between open and stat */ }
      if (age !== null && age > staleMs) {
        // Reclaim. If another waiter reclaims it first, our unlink fails and we simply retry.
        try { unlinkSync(lockPath); } catch { /* lost the race; retry */ }
        continue;
      }
      if (now() >= deadline) {
        throw new LockTimeoutError(
          `${lockPath} is held by another process (waited ${waited}ms). Another EOS command is writing to this repository; ` +
          're-run when it finishes. If nothing is running, the lock is stale and will be reclaimed automatically ' +
          `after ${Math.round(staleMs / 1000)}s.`,
        );
      }
      // Backoff: short at first so an uncontended-but-just-missed lock is cheap, then longer so a
      // genuinely busy lock is not polled hot.
      const pause = waited < 100 ? 5 : 25;
      sleep(pause);
      waited += pause;
    }
  }
  try {
    try { writeSync(fd, `${JSON.stringify({ pid: process.pid, ts: new Date().toISOString() })}\n`); } catch { /* the lock is the file's existence, not its contents */ }
    return fn();
  } finally {
    try { closeSync(fd); } catch { /* already closed */ }
    try { unlinkSync(lockPath); } catch { /* reclaimed as stale by someone else */ }
  }
}
