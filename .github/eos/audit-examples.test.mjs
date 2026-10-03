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
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { boundedSpawnSync } from './test-spawn.mjs';
import { project, run, runJson, cleanup, storyFiles, story, APP_PROJECT, REPO_ROOT, treeDigest } from './audit-support.mjs';
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
