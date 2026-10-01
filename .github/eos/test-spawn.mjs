// Bounded subprocesses for every EOS test — the one place a test is allowed to start a process.
//
// WHY THIS IS ITS OWN MODULE: the engine suites already bounded their subprocesses through
// test-support.mjs, but the hook suites under .github/hooks/ each carried a private `spawnSync`
// with no timeout at all. A hung validator there turned a failing test into a CI job that sat
// silent until the runner killed it twenty minutes later, with nothing in the log saying what hung.
// Both families now share this file, and test-hygiene.test.mjs fails the build if any test starts a
// process without a visible timeout — so the gap cannot quietly reopen.
//
// EOS_TEST_SPAWN_TIMEOUT_MS overrides the per-process budget (a slow runner, a debugger attached).
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

export const SPAWN_TIMEOUT_MS = Number(process.env.EOS_TEST_SPAWN_TIMEOUT_MS || 60000);

/**
 * Turn a timed-out subprocess into a diagnosis instead of an opaque failure: what was running, in
 * which test file, where (the directory is left on disk), and how to tell a slow runner from a hang.
 */
export function assertNotTimedOut(r, { what, cwd, timeoutMs = SPAWN_TIMEOUT_MS }) {
  if (!r.error) return r;
  if (r.error.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') {
    const testFile = process.argv[1] ? basename(process.argv[1]) : '(unknown test file)';
    throw new Error(
      `EOS test harness: \`${what}\` exceeded ${timeoutMs}ms and was killed.\n`
      + `  test file : ${testFile}\n`
      + `  directory : ${cwd || process.cwd()}   (kept on disk for inspection)\n`
      + '  raise the budget with EOS_TEST_SPAWN_TIMEOUT_MS if the runner is simply slow;\n'
      + '  otherwise this is a real hang — run the command above in that directory to reproduce it.',
    );
  }
  return r;
}

/**
 * The environment a test's child process should see: the caller's, minus the outer test runner's
 * private marker.
 *
 * `node --test` sets NODE_TEST_CONTEXT on the processes it starts. A nested `node --test` that
 * inherits it behaves as the outer runner's reporting child and EXITS 0 WHETHER OR NOT ITS TESTS
 * PASSED. Sandbox projects declare `node --test` as their product test command, so inside the suite
 * every such command passed vacuously — the exact "green without proof" EOS exists to refuse. A
 * process a test starts must behave as it would for a real user.
 */
export function cleanEnv(env = process.env) {
  const out = { ...env };
  delete out.NODE_TEST_CONTEXT;
  return out;
}

/**
 * `spawnSync` with a mandatory timeout and a readable failure. Same arguments, same result object;
 * the only behavioural difference is that it cannot hang forever.
 */
export function boundedSpawnSync(command, args = [], options = {}) {
  const timeoutMs = options.timeout ?? SPAWN_TIMEOUT_MS;
  const r = spawnSync(command, args, { encoding: 'utf8', ...options, env: cleanEnv(options.env), timeout: timeoutMs });
  return assertNotTimedOut(r, {
    what: [basename(String(command)), ...args.map((a) => String(a))].join(' ').slice(0, 300),
    cwd: options.cwd,
    timeoutMs,
  });
}
