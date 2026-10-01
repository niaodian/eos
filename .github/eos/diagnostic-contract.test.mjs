// The diagnostic contract (ADR-010). Every verdict an EOS tool reports with --json is ONE JSON
// document on stdout that conforms to .eos/schemas/diagnostic.schema.json, with the process exit
// code unchanged, and a problem item has the same shape whether it comes from a hook or a gate.
//   node --test .github/eos/diagnostic-contract.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, runJson, cleanup, REPO_ROOT, APP_PROJECT, storyFiles } from './test-support.mjs';
import { boundedSpawnSync } from './test-spawn.mjs';
import { validate } from './lib/schema.mjs';
import { SEVERITY } from './lib/gate-primitives.mjs';
import { REPORT_SEVERITY, worstStatus, splitCode } from '../hooks/lib/diagnostics.mjs';

after(cleanup);

const SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/diagnostic.schema.json'), 'utf8'));
// One problem item, validated on its own: the item schema plus the $defs its $refs point into.
const PROBLEM_SCHEMA = { $defs: SCHEMA.$defs, ...SCHEMA.$defs.problem };
const HOOKS = join(REPO_ROOT, '.github/hooks');
const NODE = JSON.stringify(process.execPath);

function hook(name, dir, args) {
  const r = boundedSpawnSync(process.execPath, [join(HOOKS, name), ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 32 << 20 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Run a hook with --json and hold it to the whole contract before any test looks at the verdict. */
function report(name, dir, args = []) {
  const r = hook(name, dir, [...args, '--json']);
  let json = null;
  let why = '';
  try { json = JSON.parse(r.stdout); } catch (e) { why = e.message; }
  assert.ok(json, `${name} --json must write exactly one JSON document to stdout (${why})\n--- stdout\n${r.stdout.slice(0, 1500)}\n--- stderr\n${r.stderr.slice(-1500)}`);
  assert.deepEqual(validate(SCHEMA, json, { label: name }).errors, [], `${name} --json does not conform to the diagnostic schema`);
  assert.equal(json.exitCode, r.code, 'the report must state the exit code the process actually returned');
  return { ...r, json };
}

const plain = (files) => project(files, { withGovernance: false, git: false });
const errorsOf = (json) => json.problems.filter((p) => p.level === 'error');

// ---------------------------------------------------------------- the vocabulary itself
test('the report severity is the gate engine\'s severity — ERROR > BLOCKED > FAIL', () => {
  // hooks/lib cannot import the engine (hooks are copied into projects on their own), so the two
  // orders are kept equal here instead of by sharing one constant.
  const order = (sev) => ['ERROR', 'BLOCKED', 'FAIL'].sort((a, b) => sev[b] - sev[a]).join(' > ');
  assert.equal(order(REPORT_SEVERITY), order(SEVERITY));
  assert.equal(worstStatus(['FAIL', 'BLOCKED'], 'PASS'), 'BLOCKED');
  assert.equal(worstStatus(['FAIL', 'ERROR', 'BLOCKED'], 'PASS'), 'ERROR');
  assert.equal(worstStatus([], 'PASS'), 'PASS');
  assert.deepEqual(splitCode('D5 Compliance: no boundary'), { code: 'D5', message: 'Compliance: no boundary' });
  assert.deepEqual(splitCode('no code here'), { code: null, message: 'no code here' });
});

test('the problem item admits a gate\'s check and a validator\'s finding alike', () => {
  const gateProblem = { level: 'error', code: 'tests-executed', status: 'FAIL', message: 'x', gate: 'verified', scope: { type: 'story', id: 'STORY-001' }, artifact: null, fix: 'y', rerunCommand: 'node .github/eos/eos.mjs check --gate verified --scope STORY-001' };
  const hookProblem = { level: 'warning', code: 'P1', message: 'x' };
  assert.deepEqual(validate(PROBLEM_SCHEMA, gateProblem).errors, []);
  assert.deepEqual(validate(PROBLEM_SCHEMA, hookProblem).errors, []);
  assert.match(validate(PROBLEM_SCHEMA, { level: 'fatal', code: 'P1', message: 'x' }).errors.join('\n'), /is not one of/);
  assert.match(validate(PROBLEM_SCHEMA, { level: 'error', code: 'P1' }).errors.join('\n'), /missing required property "message"/);
});

// ---------------------------------------------------------------- project-gate --json
const app = (test, extra = {}) => plain({
  '.eos/project.json': { projectType: 'application', stacks: ['other'], commands: { test } },
  // A product that writes to stdout: with --json that output must never reach the parser.
  'scripts/ok.mjs': 'console.log("PRODUCT-STDOUT-MARKER");\n',
  // A FAILING test that prints the word BLOCKED, which is what text scraping got wrong.
  'scripts/fail.mjs': 'console.log("the BLOCKED-account test failed");\nprocess.exit(1);\n',
  ...extra,
});

test('project-gate --json: PASS, with the product\'s own output kept off stdout', () => {
  const { json, stdout, stderr, code } = report('project-gate.mjs', app(`${NODE} scripts/ok.mjs`));
  assert.equal(code, 0);
  assert.equal(json.status, 'PASS');
  assert.equal(json.tool, 'project-gate');
  assert.deepEqual(errorsOf(json), []);
  assert.doesNotMatch(stdout, /PRODUCT-STDOUT-MARKER/, 'the product\'s output would corrupt the JSON document');
  assert.match(stderr, /PRODUCT-STDOUT-MARKER/, 'the product\'s output still reaches the log, on stderr');
  assert.match(stderr, /EOS product-quality gate/, 'the human report moves to stderr, it does not disappear');
  assert.deepEqual(json.scope, { type: 'product', id: 'product' });
  assert.match(json.rerunCommand, /project-gate\.mjs/);
  assert.ok(json.details.steps.some((s) => s.step === 'test' && s.status === 'pass'), JSON.stringify(json.details));
});

test('project-gate --json: a failing test is FAIL even when its output says BLOCKED', () => {
  const { json, code } = report('project-gate.mjs', app(`${NODE} scripts/fail.mjs`));
  assert.equal(code, 1);
  assert.equal(json.status, 'FAIL');
  const [problem] = errorsOf(json);
  assert.equal(problem.code, 'P3');
  assert.equal(problem.status, 'FAIL');
  assert.match(problem.message, /test FAIL/);
});

test('project-gate --json: a missing toolchain is BLOCKED, not FAIL', () => {
  const { json, code } = report('project-gate.mjs', app('definitely-not-an-installed-eos-tool --run'));
  assert.equal(code, 1);
  assert.equal(json.status, 'BLOCKED');
  const [problem] = errorsOf(json);
  assert.equal(problem.code, 'P4');
  assert.equal(problem.status, 'BLOCKED');
  assert.match(problem.message, /not installed/);
});

test('project-gate --json: an invalid declaration is ERROR — the gate cannot be evaluated', () => {
  const { json, code } = report('project-gate.mjs', plain({ '.eos/project.json': { projectType: 'banana', stacks: [] } }));
  assert.equal(code, 1);
  assert.equal(json.status, 'ERROR');
  assert.ok(errorsOf(json).length >= 1);
  assert.ok(errorsOf(json).every((p) => p.code === 'P0' && p.status === 'ERROR'), JSON.stringify(json.problems));
});

test('project-gate --json: config-only is NOT_APPLICABLE, never PASS', () => {
  const { json, code } = report('project-gate.mjs', plain({ '.eos/project.json': { projectType: 'config-only', stacks: [] } }));
  assert.equal(code, 0);
  assert.equal(json.status, 'NOT_APPLICABLE');
  assert.equal(json.details.executedSteps, 0);
});

test('project-gate --json: a product that prints megabytes still yields one parseable document', () => {
  const dir = app(`${NODE} scripts/loud.mjs`, { 'scripts/loud.mjs': 'process.stdout.write("x".repeat(2 * 1024 * 1024) + "\\n");\n' });
  const { json } = report('project-gate.mjs', dir);
  assert.equal(json.status, 'PASS');
});

// ---------------------------------------------------------------- eos-doctor --json
const LOCK = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json'), 'utf8'));
const LOCK_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/bmad-lock.schema.json'), 'utf8'));
const CONFIG_ONLY = { projectType: 'config-only', stacks: [] };

test('eos-doctor --json: PASS on a clean project', () => {
  const { json, code } = report('eos-doctor.mjs', plain({ '.eos/project.json': CONFIG_ONLY }));
  assert.equal(code, 0, JSON.stringify(json.problems));
  assert.equal(json.status, 'PASS');
  assert.equal(json.tool, 'eos-doctor');
  assert.deepEqual(errorsOf(json), []);
});

test('eos-doctor --json: a missing eval plan is FAIL, coded D1', () => {
  const { json, code } = report('eos-doctor.mjs', plain({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q', eval: 'pytest evals/ -q' } },
    'evals/quality.test.mjs': 'import { test } from "node:test";\ntest("x", () => {});\n',
  }));
  assert.equal(code, 1);
  assert.equal(json.status, 'FAIL');
  assert.ok(errorsOf(json).some((p) => p.code === 'D1' && p.status === 'FAIL' && /G-EVAL/.test(p.message)), JSON.stringify(json.problems));
});

test('eos-doctor --json: a skill that cannot activate is BLOCKED, coded D6', () => {
  const skill = LOCK.requiredSkills[0].name;
  const { json, code } = report('eos-doctor.mjs', plain({
    '.eos/project.json': CONFIG_ONLY,
    '.eos/bmad.lock.json': LOCK,
    '.eos/schemas/bmad-lock.schema.json': LOCK_SCHEMA,
    [`.github/skills/${skill}/README.md`]: 'a directory without SKILL.md cannot activate\n',
  }));
  assert.equal(code, 1);
  assert.equal(json.status, 'BLOCKED');
  assert.ok(errorsOf(json).some((p) => p.code === 'D6' && p.status === 'BLOCKED' && p.message.includes(skill)), JSON.stringify(json.problems));
});

test('eos-doctor --json: an invalid project declaration is ERROR, coded D0', () => {
  const { json, code } = report('eos-doctor.mjs', plain({ '.eos/project.json': { projectType: 'banana', stacks: [] } }));
  assert.equal(code, 1);
  assert.equal(json.status, 'ERROR');
  assert.ok(errorsOf(json).some((p) => p.code === 'D0' && p.status === 'ERROR'), JSON.stringify(json.problems));
});

// ---------------------------------------------------------------- gates speak the same language
test('a gate reads project-gate\'s verdict, not its prose: a failing test that prints BLOCKED is FAIL', () => {
  const dir = project(storyFiles({
    '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node scripts/fail.mjs' } },
    'scripts/fail.mjs': 'console.log("the BLOCKED-account test failed");\nprocess.exit(1);\n',
  }), { withHooks: true });
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.ok(r.json, r.out);
  const check = r.json.checks.find((c) => c.id === 'tests-executed');
  assert.equal(check.status, 'FAIL', `a FAILING test was reported as ${check.status}: ${check.detail}`);

  // ...and the gate's failing checks come back in the same problem shape the hooks use.
  assert.ok(Array.isArray(r.json.problems), 'eos check --json must list its problems');
  const problem = r.json.problems.find((p) => p.code === 'tests-executed');
  assert.ok(problem, JSON.stringify(r.json.problems));
  for (const p of r.json.problems) assert.deepEqual(validate(PROBLEM_SCHEMA, p, { label: p.code }).errors, []);
  assert.equal(problem.gate, 'verified');
  assert.deepEqual(problem.scope, { type: 'story', id: 'STORY-001' });
  assert.equal(problem.status, 'FAIL');
  assert.equal(problem.rerunCommand, r.json.rerunCommand);
  assert.ok(!r.json.problems.some((p) => ['PASS', 'NOT_APPLICABLE'].includes(p.status)), 'a passing check is not a problem');
});

test('a product whose tests print more than a pipe buffer still gets a verdict, not ERROR', () => {
  // Node's spawnSync buffers 1 MB per stream by default and kills the child beyond it (ENOBUFS),
  // which the gate reported as "could not be executed" — a verbose test suite turned its own PASS
  // into ERROR.
  const dir = project(storyFiles({
    '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node scripts/loud.mjs' } },
    'scripts/loud.mjs': 'process.stdout.write("x".repeat(2 * 1024 * 1024) + "\\n");\n',
  }), { withHooks: true });
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.ok(r.json, r.out.slice(-2000));
  const check = r.json.checks.find((c) => c.id === 'tests-executed');
  assert.equal(check.status, 'PASS', check.detail);
});
