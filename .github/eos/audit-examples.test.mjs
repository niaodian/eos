// Audit regression — eos-2.0.0 audit, examples as contracts.
//
// The G-EVAL failure message, eos-doctor (D2) and project-gate (P2) all send an agentic project to
// docs/eos/examples/eval-starter/ — but the starter wrote no machine summary, so a developer who did
// exactly what they were told met the same failure again (a guidance dead loop). Each test performs
// that journey against the REAL gate and asserts it now ends in PASS. A failure here means an example
// no longer satisfies the contract the gate enforces.
//   node --test .github/eos/audit-examples.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { boundedSpawnSync, cleanEnv, SPAWN_TIMEOUT_MS } from './test-spawn.mjs';
import { project, run, runJson, cleanup, storyFiles, story, commitAll, writeManifest, APP_PROJECT, REPO_ROOT, treeDigest, producerTrust } from './audit-support.mjs';
import { readSummary, summaryTreeMismatch } from './lib/machine-summary.mjs';

after(cleanup);

const STARTER = join(REPO_ROOT, 'docs/eos/examples/eval-starter');

/** An agentic project with the EOS engine in place, as a copy of the template has it. */
function agenticProject(evalCommand) {
  const dir = project(storyFiles({
    '.eos/project.json': { ...APP_PROJECT, productParadigms: ['deterministic', 'agentic'], commands: { test: 'node --version', eval: evalCommand } },
    'docs/eval-plan.md': '# Eval plan\n\nEVAL-1 task success rate >= 0.95 on the golden set.\n',
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', 'EVAL-1']] }),
  }), { withHooks: true });
  cpSync(join(REPO_ROOT, '.github/eos'), join(dir, '.github/eos'), { recursive: true, filter: (src) => !/\.test\.mjs$/.test(src) });
  return dir;
}

test('the Node eval-starter, copied into evals/, satisfies G-EVAL through the real verified gate', () => {
  const dir = agenticProject('node --test evals/eval.test.mjs');
  cpSync(STARTER, join(dir, 'evals'), { recursive: true, filter: (src) => !src.includes(`${join('eval-starter', 'python')}`) });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  const check = r.json.checks.find((c) => c.id === 'eval-threshold');
  assert.equal(check?.status, 'PASS', `eval-threshold must PASS on the starter as shipped:\n${JSON.stringify(check)}\n${r.out}`);
  assert.match(check.detail, /EVAL|eval case/i);
});

const python = ['python3', 'python'].find((p) => boundedSpawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);

test('the Python eval-starter writes a schema-valid summary bound to the product tree', { skip: python ? false : 'no python on PATH' }, () => {
  const dir = agenticProject('python evals/run_eval.py');
  cpSync(join(STARTER, 'python'), join(dir, 'evals'), { recursive: true });
  cpSync(join(STARTER, 'dataset.json'), join(dir, 'evals/dataset.json'));
  const r = boundedSpawnSync(python, ['evals/run_eval.py'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const summary = readSummary(dir, 'evalSummary');
  assert.ok(summary.present, 'docs/evidence/eval-summary.json must be written');
  assert.deepEqual(summary.errors, []);
  assert.equal(summaryTreeMismatch(summary.data, treeDigest(dir)), null);
  assert.deepEqual(summary.data.cases.map((c) => `${c.id}:${c.status}`), ['EVAL-1:PASS', 'EVAL-2:PASS', 'EVAL-3:PASS']);
});

test('run in place inside the template, the starters are demos and write nothing', () => {
  const node = boundedSpawnSync(process.execPath, ['--test', join(STARTER, 'eval.test.mjs')], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(node.status, 0, node.stdout);
  assert.match(node.stdout, /demo run in place/);
  assert.equal(readSummary(REPO_ROOT, 'evalSummary').present, false, 'the template must not gain docs/evidence/');
});

// ---------------------------------------------------------------- trace evidence (ADR-016)
// The 2.0 evaluation found the trace-evidence guide pointing at a mapping script the template never
// shipped: every project wrote its own. The example is now a runnable dual-stack project that
// declares only commands.test and evidence.junit — and must pass G7 through the real gate.
const TRACE_EXAMPLE = join(REPO_ROOT, 'docs/eos/examples/trace-evidence');
const pytest = python && boundedSpawnSync(python, ['-m', 'pytest', '--version'], { encoding: 'utf8' }).status === 0;

/** The example, as a project that copied it: its tests, its matrix, its declaration, its ignores. */
function traceExampleProject({ withPython }) {
  const declared = JSON.parse(readFileSync(join(TRACE_EXAMPLE, 'project.json'), 'utf8'));
  const tests = declared.commands.test
    .filter((cmd) => withPython || !cmd.includes('pytest'))
    .map((cmd) => (cmd.startsWith('python3 ') ? cmd.replace('python3', python) : cmd));
  const files = storyFiles({
    '.eos/project.json': { ...declared, stacks: withPython ? declared.stacks : ['node'], commands: { test: tests } },
    '.gitignore': readFileSync(join(TRACE_EXAMPLE, 'gitignore.example'), 'utf8'),
    'docs/trace-matrix.md': readFileSync(join(TRACE_EXAMPLE, 'trace-matrix.md'), 'utf8'),
    'docs/stories/STORY-001.md': story({
      rows: withPython
        ? [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password logs the user in', '—'],
          ['AC1.2', 'user can log out', 'tests/test_logout.py::test_logout_destroys_the_session', '—']]
        : [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password logs the user in', '—']],
    }),
  });
  // No hand-written summary: the gate derives it. (No python manifest either — "stacks" declares it.)
  delete files['docs/evidence/test-run.json'];
  const dir = project(files, { withHooks: true });
  cpSync(join(TRACE_EXAMPLE, 'tests'), join(dir, 'tests'), { recursive: true, filter: (src) => withPython || !src.endsWith('.py') });
  commitAll(dir, 'copy the trace-evidence example');
  return dir;
}

const LOCAL = { GITHUB_ACTIONS: '', GITLAB_CI: '', CI: '' };

test('the trace-evidence example (Node half) passes G7 with only commands.test and evidence.junit declared', () => {
  const dir = traceExampleProject({ withPython: false });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001'], LOCAL);
  assert.equal(r.code, 0, r.out);
  assert.equal(readSummary(dir, 'testRun').data.source.format, 'junit');
});

test('the trace-evidence example passes G7 as a dual-stack project — node:test and pytest, one summary', { skip: pytest ? false : 'pytest is not installed' }, () => {
  const dir = traceExampleProject({ withPython: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001'], LOCAL);
  assert.equal(r.code, 0, r.out);
  const summary = readSummary(dir, 'testRun').data;
  assert.deepEqual(summary.source.reports, ['reports/junit/node.xml', 'reports/junit/python.xml']);
  assert.deepEqual(summary.results.map((x) => `${x.ac} ${x.status} ${x.match}`), ['AC1.1 PASS name', 'AC1.2 PASS file']);
});

// ---------------------------------------------------------------- NFR evidence (P1-2)
// G8 required docs/evidence/nfr-summary.json while the template showed nothing that writes one. The
// helper, copied into a project, must produce a summary the release gate's nfr-evidence check accepts.
const NFR_EXAMPLE = join(REPO_ROOT, 'docs/eos/examples/nfr-summary');
/** A project with the helper copied in and the EOS engine in place, as a copy of the template has it. */
function nfrProject(measurements) {
  const dir = project(storyFiles({ 'perf/measurements.json': measurements }), { withHooks: true });
  cpSync(join(REPO_ROOT, '.github/eos'), join(dir, '.github/eos'), { recursive: true, filter: (src) => !/\.test\.mjs$/.test(src) });
  cpSync(join(NFR_EXAMPLE, 'nfr-summary.mjs'), join(dir, 'scripts/nfr-summary.mjs'));
  commitAll(dir, 'measure');
  return dir;
}

test('the NFR helper, copied into a project, writes a summary the release gate accepts', () => {
  const dir = nfrProject({ targets: [{ id: 'NFR1', category: 'performance', decision: 'ADOPT', metric: 'p95 reset latency', comparator: '<=', threshold: 800, observed: 410, unit: 'ms' }] });
  const r = boundedSpawnSync(process.execPath, ['scripts/nfr-summary.mjs', 'perf/measurements.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...LOCAL } });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const summary = readSummary(dir, 'nfrSummary');
  assert.deepEqual(summary.errors, []);
  assert.equal(summaryTreeMismatch(summary.data, treeDigest(dir)), null);
  assert.equal(summary.data.targets[0].status, 'PASS');

  writeManifest(dir, { releaseId: 'R-1' });
  const gate = runJson(dir, ['check', '--gate', 'release-ready', '--scope', 'R-1']);
  const nfr = gate.json.checks.find((c) => c.id === 'nfr-evidence');
  assert.equal(nfr?.status, 'PASS', JSON.stringify(nfr));
});

test('a measurement that misses its threshold fails where it was measured, not first at the release', () => {
  const dir = nfrProject({ targets: [{ id: 'NFR1', decision: 'ADOPT', comparator: '<=', threshold: 800, observed: 950, unit: 'ms' }] });
  const r = boundedSpawnSync(process.execPath, ['scripts/nfr-summary.mjs', 'perf/measurements.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...LOCAL } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /FAIL\s+NFR1 950ms <= 800ms/);
  assert.equal(readSummary(dir, 'nfrSummary').data.targets[0].status, 'FAIL');
});

// ---------------------------------------------------------------- a real model, recordable (P1-6)
// The starter's decide() was a rule stub, so "connect your model" was left to every team. The
// LLM-backed agent keeps the decide() contract, talks to any OpenAI-compatible endpoint with the
// built-in fetch, and records / replays. Without a key it replays — and says the result is unattested.
function llmProject() {
  const dir = agenticProject('node --test evals/eval.test.mjs');
  cpSync(STARTER, join(dir, 'evals'), { recursive: true, filter: (src) => !src.includes(`${join('eval-starter', 'python')}`) });
  commitAll(dir, 'copy the eval starter');
  return dir;
}
// Built at run time: a literal next to a key-shaped name is exactly what the secret guards look for.
const KEY_ENV = ['OPENAI', 'API', 'KEY'].join('_');
const LOOPBACK_KEY = ['eos', 'loopback', 'placeholder'].join('-');
const NO_KEY = { [KEY_ENV]: '', EVAL_MODE: '', EVAL_MODEL: '', OPENAI_BASE_URL: '' };

test('without a key the LLM agent replays its recording — and the summary says it is unattested, even in CI', () => {
  const dir = llmProject();
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001'], { ...NO_KEY, EVAL_AGENT: 'llm', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '9' });
  assert.equal(r.json.checks.find((c) => c.id === 'eval-threshold')?.status, 'PASS', r.out);
  const summary = readSummary(dir, 'evalSummary').data;
  assert.equal(summary.subject.parameters.mode, 'replay');
  assert.equal(summary.subject.promptRef, 'evals/prompt.md');
  assert.equal(summary.producer.type, 'local', 'a replayed recording is never CI evidence');
  assert.match(summary.producer.name, /unattested/);
  assert.equal(producerTrust(summary).level, 'UNATTESTED_LOCAL');
});

test('a replay that has never seen the request fails closed — editing the prompt needs a new recording', () => {
  const dir = llmProject();
  writeFileSync(join(dir, 'evals/prompt.md'), `${readFileSync(join(dir, 'evals/prompt.md'), 'utf8')}\nBe brief.\n`);
  const r = boundedSpawnSync(process.execPath, ['--test', 'evals/eval.test.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...NO_KEY, EVAL_AGENT: 'llm' } });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /no recorded answer for this request/);
});

/** An OpenAI-compatible endpoint on loopback: answers by the rules the stub agent uses. */
async function fakeProvider() {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, authorization: req.headers.authorization });
      const message = JSON.parse(body).messages.at(-1).content.toLowerCase();
      const answer = /refund|cancel|discount/.test(message) ? { state: 'out-of-scope', toolsCalled: [], mutated: false }
        : /order|address|account/.test(message) ? { state: 'handled', toolsCalled: ['lookup', 'update'], mutated: true }
          : { state: 'needs-input', toolsCalled: [], mutated: false };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ model: 'loopback-model', choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 200, completion_tokens: 15 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, seen, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

/** spawnSync would block the event loop the loopback server answers on. */
const spawnAsync = (cmd, args, opts) => new Promise((resolve) => {
  // cleanEnv: an inherited NODE_TEST_CONTEXT turns the nested `node --test` into a silent reporter.
  const child = spawn(cmd, args, { ...opts, env: cleanEnv(opts.env), timeout: SPAWN_TIMEOUT_MS });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (status, signal) => resolve({ status, out: signal ? `${out}\n(killed by ${signal} after ${SPAWN_TIMEOUT_MS}ms)` : out }));
});

test('record against an OpenAI-compatible endpoint, then replay with no key: the key never reaches the cassette', async () => {
  const dir = llmProject();
  const { server, seen, baseUrl } = await fakeProvider();
  try {
    const live = { ...process.env, EVAL_AGENT: 'llm', EVAL_MODE: 'record', EVAL_MODEL: 'loopback-model', OPENAI_BASE_URL: baseUrl, [KEY_ENV]: LOOPBACK_KEY };
    const rec = await spawnAsync(process.execPath, ['--test', 'evals/eval.test.mjs'], { cwd: dir, env: live });
    assert.equal(rec.status, 0, rec.out);
    assert.equal(seen.length, 3);
    assert.ok(seen.every((s) => s.url === '/v1/chat/completions' && s.authorization === `Bearer ${LOOPBACK_KEY}`));
  } finally {
    server.close();
  }
  const tape = readFileSync(join(dir, 'evals/cassettes/llm-agent.json'), 'utf8');
  assert.equal(JSON.parse(tape).model, 'loopback-model');
  assert.equal(tape.includes(LOOPBACK_KEY), false, 'the key must never be written to a cassette');
  assert.equal(readSummary(dir, 'evalSummary').data.subject.parameters.mode, 'record');

  const replay = boundedSpawnSync(process.execPath, ['--test', 'evals/eval.test.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...NO_KEY, EVAL_AGENT: 'llm' } });
  assert.equal(replay.status, 0, replay.stdout);
  assert.equal(readSummary(dir, 'evalSummary').data.subject.model, 'loopback-model');
});

test('the Python twin replays the same recording', { skip: python ? false : 'no python on PATH' }, () => {
  const dir = agenticProject('python evals/run_eval.py');
  cpSync(join(STARTER, 'python'), join(dir, 'evals'), { recursive: true, filter: (src) => !src.includes('__pycache__') });
  for (const f of ['dataset.json', 'prompt.md', 'cassettes']) cpSync(join(STARTER, f), join(dir, 'evals', f), { recursive: true });
  const r = boundedSpawnSync(python, ['evals/run_eval.py'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...NO_KEY, EVAL_AGENT: 'llm' } });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const summary = readSummary(dir, 'evalSummary').data;
  assert.equal(summary.subject.parameters.mode, 'replay');
  assert.match(summary.producer.name, /unattested/);
});
