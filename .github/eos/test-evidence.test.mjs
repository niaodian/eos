// Test evidence from JUnit reports, through the real verified gate and CLI (ADR-016).
//
// The gate runs commands.test and, in the same execution, reads only the reports that run wrote.
// These tests use a real node:test run with its built-in JUnit reporter — no hand-written summary —
// and then try the ways evidence could be stale, forged or unreadable.
//   node --test .github/eos/test-evidence.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { project, run, runJson, write, cleanup, storyFiles, story, APP_PROJECT, TRACE_MATRIX, commitAll } from './test-support.mjs';

after(cleanup);

// Local, whatever CI this suite itself runs in: the producer is asserted below.
const LOCAL = { GITHUB_ACTIONS: '', GITLAB_CI: '', CI: '' };
const REPORT = 'reports/junit/node.xml';
const NODE_TEST = (file = 'tests/login.test.mjs') => `node --test --test-reporter=junit --test-reporter-destination=${REPORT} ${file}`;
const junitProject = ({ test: testCommand = NODE_TEST(), files = {}, gitignore = '/reports/junit/\n' } = {}) => {
  const fixture = storyFiles({
    '.eos/project.json': { ...APP_PROJECT, commands: { test: testCommand }, evidence: { junit: ['reports/junit/*.xml'] } },
    ...(gitignore ? { '.gitignore': gitignore } : {}),
    ...files,
  });
  // No hand-written summary: the gate is the only thing that writes it.
  delete fixture['docs/evidence/test-run.json'];
  return project(fixture, { withHooks: true });
};
const verify = (dir) => runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001'], LOCAL);
const check = (r, id) => r.json?.checks.find((c) => c.id === id) || { status: 'MISSING', detail: r.out };
const testRun = (dir) => JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));

test('the verified gate answers the trace matrix from the JUnit report its own run wrote', () => {
  const dir = junitProject();
  const r = verify(dir);
  assert.equal(check(r, 'tests-executed').status, 'PASS', r.out);
  const trace = check(r, 'trace-complete');
  assert.equal(trace.status, 'PASS', trace.detail);
  assert.match(trace.detail, /derived from 1 JUnit report/);
  const summary = testRun(dir);
  assert.deepEqual(summary.source, { format: 'junit', reports: [REPORT] });
  assert.deepEqual(summary.producer, { type: 'local', name: 'eos verified gate' });
  assert.equal(summary.commandDigest.length, 64);
  assert.deepEqual(summary.results.map((x) => `${x.ac} ${x.status} ${x.match}`), ['AC1.1 PASS name']);
  // Bound to the tree it ran on: product-tree --json reports the same digest.
  assert.equal(summary.productTree.digest, JSON.parse(run(dir, ['product-tree', '--json']).stdout).productTree.digest);
});

test('a report left over from an earlier run is never read', () => {
  // An old PASS sits where the reports go, and the test command writes nothing.
  const dir = junitProject({
    test: 'node --version',
    files: { [REPORT]: '<testsuites><testcase name="valid password" classname="test"/></testsuites>\n' },
  });
  const r = verify(dir);
  const trace = check(r, 'trace-complete');
  assert.equal(trace.status, 'FAIL', trace.detail);
  assert.match(trace.detail, /wrote no JUnit report matching reports\/junit\/\*\.xml \(1 matching report\(s\) predate this run and were ignored\)/);
  assert.equal(existsSync(join(dir, 'docs/evidence/test-run.json')), false, 'nothing may be derived from a report this run did not write');
});

test('one failing instance of the named test fails the row, and a skipped one is not a PASS', () => {
  const twins = [
    "import { describe, test } from 'node:test';",
    "describe('fast path', () => { test('valid password', () => {}); });",
    "describe('slow path', () => { test('valid password', () => { throw new Error('boom'); }); });",
    '',
  ].join('\n');
  const dir = junitProject({ files: { 'tests/login.test.mjs': twins } });
  const failing = check(verify(dir), 'trace-complete');
  assert.equal(failing.status, 'FAIL');
  assert.match(failing.detail, /AC1\.1: tests\/login\.test\.mjs::valid password FAIL \(2 testcase\(s\) named "valid password".*1 FAIL/);

  write(dir, 'tests/login.test.mjs', "import { test } from 'node:test';\ntest('valid password', { skip: 'not yet' }, () => {});\n");
  commitAll(dir, 'skip it');
  const skipped = check(verify(dir), 'trace-complete');
  assert.equal(skipped.status, 'FAIL');
  assert.match(skipped.detail, /valid password SKIP/);
});

test('a report EOS cannot read is an ERROR — a DOCTYPE is refused, and nothing is written', () => {
  const writer = [
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    "mkdirSync('reports/junit', { recursive: true });",
    `writeFileSync('${REPORT}', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "a">]><testsuites><testcase name="valid password"/></testsuites>');`,
    '',
  ].join('\n');
  const dir = junitProject({ test: 'node write-report.mjs', files: { 'write-report.mjs': writer } });
  const trace = check(verify(dir), 'trace-complete');
  assert.equal(trace.status, 'ERROR', trace.detail);
  assert.match(trace.detail, /DOCTYPE and ENTITY declarations are refused/);
  assert.equal(existsSync(join(dir, 'docs/evidence/test-run.json')), false);
});

test('a report inside the product tree is refused — it would change the tree it describes', () => {
  const dir = junitProject({ gitignore: null });
  const trace = check(verify(dir), 'trace-complete');
  assert.equal(trace.status, 'FAIL', trace.detail);
  assert.match(trace.detail, /reports\/junit\/node\.xml is part of the product tree.*add the report directory to \.gitignore/);
});

test('eos evidence junit refuses a report older than the product tree and imports a fresh one', () => {
  const dir = junitProject();
  assert.equal(run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001'], LOCAL).code !== 3, true);
  const report = join(dir, REPORT);
  assert.ok(existsSync(report), 'the gate run wrote the report');

  // The report predates an edit to the product: it no longer describes this tree.
  const past = new Date(Date.now() - 60_000);
  utimesSync(report, past, past);
  write(dir, 'tests/login.test.mjs', "import { test } from 'node:test';\ntest('valid password', () => {});\n// edited\n");
  const before = readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8');
  const stale = runJson(dir, ['evidence', 'junit', REPORT, '--write'], LOCAL);
  assert.equal(stale.code, 2, stale.out);
  assert.equal(stale.json.status, 'STALE');
  assert.match(stale.json.detail, /older than tests\/login\.test\.mjs/);
  assert.equal(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'), before, 'a refused import writes nothing');

  // Newer than every product file: imported. Without --write it is a dry run.
  const now = new Date(Date.now() + 1000);
  utimesSync(report, now, now);
  const dry = runJson(dir, ['evidence', 'junit'], LOCAL);
  assert.equal(dry.code, 0, dry.out);
  assert.equal(dry.json.written, false);
  assert.equal(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'), before);
  const imported = runJson(dir, ['evidence', 'junit', REPORT, '--write'], { ...LOCAL, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app', GITHUB_RUN_ID: '7' });
  assert.equal(imported.code, 0, imported.out);
  const summary = testRun(dir);
  assert.deepEqual(summary.producer, { type: 'ci', name: 'github-actions', runRef: 'https://github.com/acme/app/actions/runs/7' });
  assert.equal(summary.runId, 'github-7-1');
});

test('evidence.junit is part of the policy: changing it is a REVIEW change', () => {
  const dir = project(storyFiles({ '.eos/project.json': APP_PROJECT }), { withHooks: true });
  write(dir, '.eos/project.json', { ...APP_PROJECT, evidence: { junit: ['reports/junit/*.xml'] } });
  const diff = runJson(dir, ['policy', 'diff']);
  const change = diff.json.changes.find((c) => c.id === 'project:evidence-changed');
  assert.ok(change, diff.out);
  assert.equal(change.kind, 'REVIEW');
  assert.equal(change.requiresAck, true);
});

test('a declaration that points evidence.junit into EOS\'s own directories is refused', () => {
  for (const junit of [['docs/evidence/x.xml'], ['../outside.xml'], ['reports/x.json'], []]) {
    const dir = project({ '.eos/project.json': { ...APP_PROJECT, evidence: { junit } } }, { git: false });
    const r = run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
    assert.equal(r.code, 3, `${JSON.stringify(junit)}: ${r.out}`);
    assert.match(r.out, /evidence\.junit/);
  }
  const dir = project({ '.eos/project.json': { ...APP_PROJECT, projectType: 'config-only', stacks: [], commands: undefined, evidence: { junit: ['reports/junit/*.xml'] } } }, { git: false });
  assert.match(run(dir, ['doctor']).out, /config-only" must not declare "evidence"/);
});

test('without evidence.junit nothing changes — a summary the project writes is read as before', () => {
  const dir = project(storyFiles({ '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node --version' } } }), { withHooks: true });
  const trace = check(verify(dir), 'trace-complete');
  assert.equal(trace.status, 'PASS', trace.detail);
  assert.doesNotMatch(trace.detail, /JUnit/);
  assert.equal(existsSync(join(dir, 'reports')), false, 'no report directory is created for a project that declares none');
});

test('a name-only match belongs to the file the matrix names: not a longer name there, not a comment, not a twin elsewhere', () => {
  const dir = junitProject({
    test: NODE_TEST('tests/login.test.mjs tests/reset.test.mjs'),
    files: {
      'tests/login.test.mjs': "import { test } from 'node:test';\ntest('invalid password', () => {});\n// test('valid password', () => {});\n",
      'tests/reset.test.mjs': "import { test } from 'node:test';\ntest('valid password', () => {});\n",
    },
  });
  // The only "valid password" that ran is reset's: login has a longer name and a comment.
  const borrowed = check(verify(dir), 'trace-complete');
  assert.equal(borrowed.status, 'FAIL', borrowed.detail);
  assert.match(borrowed.detail, /tests\/login\.test\.mjs does not declare a test of that name/);
  assert.equal(testRun(dir).results[0].status, 'ERROR');

  // Declared in both files, and the report cannot say which one passed.
  write(dir, 'tests/login.test.mjs', "import { test } from 'node:test';\ntest('valid password', () => {});\n");
  commitAll(dir, 'declare it');
  const twin = check(verify(dir), 'trace-complete');
  assert.equal(twin.status, 'FAIL', twin.detail);
  assert.match(twin.detail, /declared in tests\/login\.test\.mjs and also in tests\/reset\.test\.mjs/);

  // Qualified by its suite, the row names exactly one test.
  write(dir, 'tests/login.test.mjs', "import { describe, test } from 'node:test';\ndescribe('login', () => { test('valid password', () => {}); });\n");
  write(dir, 'docs/trace-matrix.md', TRACE_MATRIX.replace('tests/login.test.mjs::valid password', 'tests/login.test.mjs::login > valid password'));
  commitAll(dir, 'qualify it');
  const qualified = check(verify(dir), 'trace-complete');
  assert.equal(qualified.status, 'PASS', qualified.detail);
});

test('verifying one story leaves another story\'s evidence fresh: an identical result is kept, not rewritten', () => {
  const dir = junitProject({
    files: {
      'tests/login.test.mjs': "import { test } from 'node:test';\ntest('valid password', () => {});\ntest('logs out', () => {});\n",
      'docs/stories/STORY-002.md': story({ id: 'STORY-002', title: 'Logout', rows: [['AC1.2', 'user can log out', 'tests/login.test.mjs::logs out', '—']] }),
      'docs/trace-matrix.md': TRACE_MATRIX.replace('| AC1.1 | tests/login.test.mjs::valid password | PASS |', '| AC1.1 | tests/login.test.mjs::valid password | PASS |\n| AC1.2 | tests/login.test.mjs::logs out | PASS |'),
    },
  });
  assert.equal(check(verify(dir), 'trace-complete').status, 'PASS');
  const recorded = readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8');
  const second = check(runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-002'], LOCAL), 'trace-complete');
  assert.equal(second.status, 'PASS', second.detail);
  assert.match(second.detail, /this run reproduced it exactly/);
  assert.equal(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'), recorded, 'only the timings moved, so the file every story binds is kept');
  const stale = runJson(dir, ['health'], LOCAL).json.staleEvidence.filter((s) => s.gate === 'verified');
  assert.deepEqual(stale, [], 'STORY-001 is still verified after STORY-002 was');
});
