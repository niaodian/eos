// What EOS CI runs in a project, and what it runs only in EOS itself — checked statically, plus the
// plan the workflow asks for. The workflow is copied into every project that starts from the template:
// EOS's own test suites, coverage and the cross-platform matrix test EOS, so they run only while the
// declaration is the template's own; the governance checks run everywhere. (ADR-021)
//   node --test .github/eos/ci-workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, SPAWN_TIMEOUT_MS, ciJobs, ciSteps, gatedOnSelf, CI_WORKFLOW } from './test-support.mjs';
import { planCi } from './ci-plan.mjs';
import { packDeclaration, packIds } from './lib/packs.mjs';

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
  assert.doesNotMatch(J.verify, /^ {4}if:/m, 'verify must run on every event that runs CI');
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
