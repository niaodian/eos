// What EOS CI runs in a project, and what it runs only in EOS itself — checked statically, plus the
// plan the workflow asks for. The workflow is copied into every project that starts from the template:
// EOS's own test suites, coverage and the cross-platform matrix test EOS, so they run only while the
// declaration is the template's own; the governance checks run everywhere. (ADR-021)
//   node --test .github/eos/ci-workflow.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, SPAWN_TIMEOUT_MS, ciJobs, ciSteps, gatedOnSelf, CI_WORKFLOW, project, git, write, commitAll, cleanup } from './test-support.mjs';
import { planCi, LEAN_MATRIX, FULL_MATRIX, isDocumentation } from './ci-plan.mjs';
import { packDeclaration, packIds } from './lib/packs.mjs';
import { cleanEnv } from './test-spawn.mjs';

after(cleanup);

const CI = readFileSync(join(REPO_ROOT, CI_WORKFLOW), 'utf8');
const SHIPPED = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/project.json'), 'utf8'));
const J = ciJobs(CI);

test('the plan says "EOS itself" only for the template\'s own declaration', () => {
  assert.equal(SHIPPED.templateDefault, true, 'the template ships its declaration marked as its own');
  assert.equal(planCi({ declaration: SHIPPED }).self, 'true');
  for (const id of packIds()) assert.equal(planCi({ declaration: packDeclaration(id) }).self, 'false', `${id} is a project's declaration`);
  assert.equal(planCi({ declaration: { ...SHIPPED, templateDefault: false } }).self, 'false');
  assert.equal(planCi({ declaration: null }).self, 'false', 'no declaration is not EOS\'s — EOS always ships one');
});

test('the plan script prints GitHub Actions outputs for this repository', () => {
  const r = spawnSync(process.execPath, [join(REPO_ROOT, '.github/eos/ci-plan.mjs')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^self=true$/m);
  assert.match(r.stderr, /EOS's own test suites run/);
});

test('verify asks the plan in its own step — a failing plan job can never skip the required check green', () => {
  // GitHub reports a job skipped because a job it needs failed as a PASSING required check.
  assert.doesNotMatch(J.verify, /^ {4}needs:/m, 'verify must not depend on another job');
  assert.equal((J.verify.match(/^ {4}if: (.+)$/m) || [])[1], "github.event_name != 'schedule'", 'verify runs on every change; only the weekly schedule skips it');
  const steps = ciSteps(J.verify);
  const scope = steps.findIndex((s) => s.id === 'scope');
  assert.ok(scope >= 0, 'verify has a step with id "scope"');
  assert.match(steps[scope].run, /^node \.github\/eos\/ci-plan\.mjs >> "\$GITHUB_OUTPUT"$/);
  const firstTest = steps.findIndex((s) => /run-tests\.mjs/.test(s.run || ''));
  assert.ok(firstTest > scope, 'the scope is known before the first test layer');
});

test('EOS\'s own test layers run only in EOS itself; every governance check runs in every project', () => {
  const steps = ciSteps(J.verify);
  const layers = steps.filter((s) => /^EOS tests · /.test(s.name || ''));
  assert.deepEqual(layers.map((s) => s.run.match(/run-tests\.mjs (\S+)/)[1]), ['unit', 'contract', 'integration', 'journey', 'audit-regression']);
  for (const s of layers) assert.equal(s.if, "steps.scope.outputs.self == 'true'", `${s.name} must be gated on the plan`);
  const ungated = steps.filter((s) => !gatedOnSelf(s));
  assert.ok(ungated.every((s) => !/run-tests\.mjs/.test(s.run || '')), 'no EOS test layer runs in a project');
  for (const gate of ['validate-config.mjs', 'check-doc-parity.mjs', 'sbom --check', 'migrate', 'docs --check', 'agents sync --check',
    'eos-doctor.mjs --deep', 'secret-scan.mjs', 'ledger --verify', 'policy check', 'eos.mjs doctor', 'project-gate.mjs']) {
    assert.ok(ungated.some((s) => (s.run || '').includes(gate)), `${gate} must run in every project`);
  }
});

test('coverage and the cross-platform matrix are skipped as whole jobs in a project — no runner starts', () => {
  assert.match(J.plan, /^ {6}self: \$\{\{ steps\.plan\.outputs\.self \}\}$/m);
  assert.match(J.plan, /run: node \.github\/eos\/ci-plan\.mjs >> "\$GITHUB_OUTPUT"/);
  for (const name of ['coverage', 'cross-platform']) {
    assert.match(J[name], /^ {4}needs: plan$/m, `${name} needs the plan`);
    const cond = (J[name].match(/^ {4}if: (.+)$/m) || [])[1] || '';
    assert.match(cond, /needs\.plan\.outputs\.self == 'true'/, `${name} runs only in EOS itself`);
  }
  // Nothing else in the workflow runs EOS's suites.
  for (const [name, block] of Object.entries(J)) {
    if (['coverage', 'cross-platform'].includes(name)) continue;
    for (const s of ciSteps(block)) {
      if (/run-tests\.mjs/.test(s.run || '')) assert.ok(gatedOnSelf(s), `${name} › ${s.name} runs EOS's tests without asking the plan`);
    }
  }
});

// ------------------------------------------------------------------------- what EOS's own CI costs
const cells = (plan) => JSON.parse(plan.matrix).include.map((c) => `${c.os}/${c.node}`).sort();
const SHIPPED_PLAN = (event, changedFiles = null) => planCi({ declaration: SHIPPED, event, changedFiles });

test('a pull request runs each platform once on Node 24; every other event takes the full matrix', () => {
  assert.deepEqual(cells(SHIPPED_PLAN('pull_request')), ['macos-latest/24', 'ubuntu-latest/24', 'windows-latest/24']);
  assert.deepEqual(LEAN_MATRIX.map((c) => c.os).sort(), ['macos-latest', 'ubuntu-latest', 'windows-latest']);
  for (const event of ['push', 'schedule', 'workflow_dispatch', '']) {
    assert.deepEqual(cells(SHIPPED_PLAN(event)), ['macos-latest/20', 'macos-latest/22', 'macos-latest/24', 'ubuntu-latest/24', 'windows-latest/20', 'windows-latest/22', 'windows-latest/24'], event);
  }
  assert.equal(FULL_MATRIX.length, 7);
});

test('with verify on Node 20 and coverage on 22, every runtime runs on every platform on the default branch', () => {
  const nodeOf = (job) => (job.match(/node-version: '(\d+)'/) || [])[1];
  assert.equal(nodeOf(J.verify), '20', 'verify proves the declared floor');
  assert.equal(nodeOf(J.coverage), '22', 'coverage needs 22+ to enforce its thresholds');
  const engines = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).engines.node;
  assert.match(engines, /^>=20\./, 'the floor the full matrix keeps');
  const covered = new Set([...cells(SHIPPED_PLAN('push')), 'ubuntu-latest/20', 'ubuntu-latest/22']);
  for (const os of ['ubuntu-latest', 'windows-latest', 'macos-latest']) for (const node of ['20', '22', '24']) assert.ok(covered.has(`${os}/${node}`), `${os}/${node}`);
  // A pull request still runs every runtime somewhere, and every platform once.
  const pr = new Set([...cells(SHIPPED_PLAN('pull_request')), 'ubuntu-latest/20', 'ubuntu-latest/22']);
  assert.deepEqual([...new Set([...pr].map((c) => c.split('/')[1]))].sort(), ['20', '22', '24']);
});

test('a pull request that only changes documentation skips the matrix; code under docs/ does not', () => {
  const docs = ['docs/eos/user-manual.md', 'docs/zh/user-manual.md', 'README.md', '.github/agents/eos-guide.agent.md', 'docs/eos/VERSION', 'docs/adr/021-eos-tests-run-only-in-eos.md'];
  assert.equal(SHIPPED_PLAN('pull_request', docs).cross_platform, 'false');
  for (const code of ['docs/eos/examples/eval-starter/summary.mjs', 'docs/eos/examples/eval-starter/cassettes/x.json', 'docs/eos/tools/check-anchors.mjs', '.github/eos/lib/policy.mjs', '.eos/workflow.json', 'package.json']) {
    assert.equal(isDocumentation(code), false, code);
    assert.equal(SHIPPED_PLAN('pull_request', [...docs, code]).cross_platform, 'true', code);
  }
  assert.equal(SHIPPED_PLAN('pull_request', []).cross_platform, 'true', 'an empty list is not "documentation only"');
  assert.equal(SHIPPED_PLAN('pull_request', null).cross_platform, 'true', 'a list that could not be read runs the matrix');
  assert.equal(SHIPPED_PLAN('push', docs).cross_platform, 'true', 'only a pull request is ever skipped');
  assert.equal(planCi({ declaration: packDeclaration('config-only'), event: 'push' }).cross_platform, 'false', 'never in a project');
});

test('the plan lists a pull request\'s files from its merge commit, as checkout gives it', () => {
  const dir = project({ '.eos/project.json': SHIPPED, 'docs/guide.md': '# Guide\n', 'src/app.mjs': 'export {};\n' });
  const prPlan = (branch, rel, body) => {
    git(dir, ['checkout', '-q', '-b', branch, 'main']);
    write(dir, rel, body);
    commitAll(dir, branch);
    git(dir, ['checkout', '-q', '--detach', 'main']);
    assert.equal(git(dir, ['merge', '-q', '--no-ff', '--no-edit', branch]).code, 0);
    const r = spawnSync(process.execPath, [join(REPO_ROOT, '.github/eos/ci-plan.mjs')], { cwd: dir, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, env: cleanEnv({ ...process.env, EOS_EVENT: 'pull_request' }) });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  const docs = prPlan('docs-change', 'docs/guide.md', '# Guide\n\nMore.\n');
  assert.match(docs.stdout, /^cross_platform=false$/m);
  assert.match(docs.stderr, /skipped — the pull request changes documentation only \(1 file\(s\)\)/);
  assert.match(prPlan('code-change', 'src/app.mjs', 'export const x = 1;\n').stdout, /^cross_platform=true$/m);
});

test('push builds only the default branch and tags; a pull request supersedes its own earlier run', () => {
  const on = CI.slice(CI.indexOf('\non:\n'), CI.indexOf('\npermissions:'));
  assert.match(on, /^ {2}push:\n {4}branches: \[main, master\]\n {4}tags: \['\*\*'\]$/m);
  assert.match(on, /^ {2}pull_request:$/m);
  assert.match(on, /^ {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \d'$/m, 'weekly');
  assert.match(on, /^ {2}workflow_dispatch:$/m);
  assert.match(CI, /^ {2}group: eos-ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}$/m);
  assert.match(CI, /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
  assert.match(J.plan, /fetch-depth: 2/);
  assert.match(J.plan, /EOS_EVENT: \$\{\{ github\.event_name \}\}/);
  assert.match(J['cross-platform'], /matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.matrix\) \}\}/);
  assert.match(J['cross-platform'], /needs\.plan\.outputs\.cross_platform == 'true'/);
});
