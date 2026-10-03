// `eos mcp`: stopping a call stops everything it started (ADR-018).
//
// `eos_check` on `verified` runs project-gate, which runs the project's tests. Killing only the CLI
// left those running, reparented, for as long as they liked — and after a time limit, a hung test
// suite would never end. The test command below announces that it started, and would leave a mark
// if it lived long enough to finish; it must not.
//   node --test .github/eos/mcp-stop.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { project, cleanup, storyFiles, APP_PROJECT } from './test-support.mjs';
import { serve } from './lib/mcp.mjs';

after(cleanup);

const FINISH_AFTER_MS = 2500;
const SLOW_TEST = [
  "const { writeFileSync } = require('node:fs');",
  "writeFileSync('started', String(process.pid));",
  `setTimeout(() => writeFileSync('finished', 'outlived the call that started it'), ${FINISH_AFTER_MS});`,
  '',
].join('\n');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(check, ms = 30000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) if (check()) return true;
  return false;
}

/** Start eos_check verified against a project whose test is slow; resolve once the call is over. */
async function scenario({ timeoutMs, stopWhenStarted }) {
  const dir = project(storyFiles({ '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node slow-test.cjs' } }, 'slow-test.cjs': SLOW_TEST }), { withHooks: true });
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (d) => { written += d; });
  const stop = new AbortController();
  const served = serve({ input, output, cwd: dir, timeoutMs, signal: stop.signal });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'eos_check', arguments: { gate: 'verified', scope: 'STORY-001' } } })}\n`);
  assert.ok(await waitFor(() => existsSync(join(dir, 'started'))), 'the project\'s test never started');
  const startedAt = Date.now();
  if (stopWhenStarted) stop.abort();
  else input.end(); // no more questions: the call runs until its time limit stops it
  await served;
  // Past the moment the test would have finished, had it survived.
  await sleep(Math.max(0, startedAt + FINISH_AFTER_MS + 700 - Date.now()));
  return { dir, written };
}

test('stopping the server, or a call running past its time limit, stops the project\'s tests too — nothing is orphaned',
  { skip: process.platform === 'win32' && 'POSIX process groups here; Windows stops the tree with taskkill /T' }, async () => {
    const [stopped, timedOut] = await Promise.all([
      scenario({ timeoutMs: 120000, stopWhenStarted: true }),
      scenario({ timeoutMs: 1500, stopWhenStarted: false }),
    ]);
    assert.equal(existsSync(join(stopped.dir, 'finished')), false, 'stopping the server left the test running');
    assert.equal(stopped.written, '', 'a stopped call is not answered');

    assert.equal(existsSync(join(timedOut.dir, 'finished')), false, 'the time limit left the test running');
    const answer = JSON.parse(timedOut.written.trim());
    assert.equal(answer.result.isError, true);
    assert.equal(answer.result.structuredContent.verdict, 'ERROR');
    assert.match(answer.result.structuredContent.output, /was stopped after 2 s, its time limit, with everything it started/);
  });
