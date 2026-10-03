// A project that copied the template runs this repository's CI on its own code. Simulate it: copy the
// template the way degit does, follow the Day-1 sequence, and run every command `verify` runs on a
// project's path, as CI would — with an empty HOME, on the first push and on the first pull request.
// The workflow's own text is the list, so a step added there is a step this suite has to run. (ADR-021)
//   node --test .github/eos/adopter-ci.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, SPAWN_TIMEOUT_MS, CI_WORKFLOW, git, commitAll, run, projectPathCommands } from './test-support.mjs';
import { cleanEnv } from './test-spawn.mjs';

const CI = readFileSync(join(REPO_ROOT, CI_WORKFLOW), 'utf8');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/**
 * Everything `verify` runs in a project. `base` steps run when the change has something to compare
 * with (a pull request, a later push); `first-push` steps run when it has not.
 */
const PROJECT_PATH = [
  { cmd: 'node .github/eos/ci-plan.mjs', out: /^self=false$/m },
  { cmd: 'node .github/hooks/validate-config.mjs' },
  { cmd: 'node .github/hooks/check-doc-parity.mjs' },
  { cmd: 'node .github/eos/eos.mjs sbom --check', declaration: true },
  { cmd: 'node .github/eos/eos.mjs migrate' },
  { cmd: 'node .github/eos/eos.mjs docs --check' },
  { cmd: 'node .github/eos/eos.mjs agents sync --check' },
  { cmd: 'node .github/hooks/eos-doctor.mjs --deep' },
  { cmd: 'node .github/hooks/secret-scan.mjs' },
  { cmd: 'node .github/hooks/spec-align.mjs' },
  { cmd: 'node .github/eos/eos.mjs ledger --verify' },
  { cmd: 'node .github/eos/eos.mjs ledger --verify --against "$REF"', when: 'base' },
  { cmd: 'node .github/eos/eos.mjs policy check --against "$REF"', when: 'base', declaration: true },
  { cmd: 'node .github/eos/eos.mjs policy check', when: 'first-push', declaration: true },
  { cmd: 'node .github/eos/eos.mjs doctor', declaration: true },
  { cmd: 'node .github/hooks/project-gate.mjs', product: true },
];

/** A copy of the template as degit makes it: the files, no history. */
function templateCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'eos-adopter-'));
  made.push(dir);
  const r = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  assert.equal(r.status, 0, r.stderr);
  for (const rel of r.stdout.split('\0').filter(Boolean)) {
    const src = join(REPO_ROOT, rel);
    if (!existsSync(src) || !statSync(src).isFile()) continue; // deleted in the working tree
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(src, join(dir, rel));
  }
  return dir;
}

const home = mkdtempSync(join(tmpdir(), 'eos-adopter-home-'));
made.push(home);

/** Run one project-path command the way the CI step does: no BMAD, no developer HOME. */
function ci(dir, { cmd, out }, ref) {
  const args = cmd.split(' ').slice(1).map((a) => (a === '"$REF"' ? ref : a));
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, env: cleanEnv({ ...process.env, HOME: home, USERPROFILE: home }) });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) return `${cmd}${cmd.includes('"$REF"') ? `  (REF=${ref.slice(0, 8)})` : ''} → exit ${r.status}\n${text.trim().split('\n').slice(-6).join('\n')}`;
  if (out && !out.test(r.stdout || '')) return `${cmd} → unexpected output\n${text.trim()}`;
  return null;
}

function runPath(dir, { base = null, only = () => true } = {}) {
  return PROJECT_PATH
    .filter((c) => (c.when === 'base' ? !!base : c.when === 'first-push' ? !base : true))
    .filter(only)
    .map((c) => ci(dir, c, base))
    .filter(Boolean);
}

/** The documented Day-1 order: scaffold commit, then the declaration — and a pull request between them. */
let day1 = null;
function documentedDay1() {
  if (day1) return day1;
  const dir = templateCopy();
  git(dir, ['init', '-q', '-b', 'main']);
  commitAll(dir, 'chore: scaffold from eos');
  const scaffold = git(dir, ['rev-parse', 'HEAD']).out.trim();
  const r = run(dir, ['init', 'config-only', '--write']);
  assert.equal(r.code, 0, r.out);
  commitAll(dir, 'chore: declare the project');
  day1 = { dir, scaffold };
  return day1;
}

test('the project path in the workflow is exactly what this suite runs', () => {
  assert.deepEqual([...projectPathCommands(CI)].sort(), PROJECT_PATH.map((c) => c.cmd).sort());
});

test('a project that declared itself skips EOS\'s own tests, and its governance checks pass', () => {
  const { dir, scaffold } = documentedDay1();
  assert.deepEqual(runPath(dir, { base: scaffold, only: (c) => !c.declaration }), []);
});

test('the first declaration passes the policy, SBOM and doctor checks — scaffold first or declare first, first push or first pull request', { todo: 'the first declaration starts the project\'s policy (next change)' }, () => {
  // 1. The documented order. Its first pull request compares with the scaffold, whose declaration is
  //    still the template's own; its first push has nothing to compare with.
  const { dir, scaffold } = documentedDay1();
  const problems = [...runPath(dir, { base: scaffold, only: (c) => c.declaration }), ...runPath(dir, { only: (c) => c.declaration })];

  // 2. Declared before the first commit (the README's order): the first push has no base at all.
  const first = templateCopy();
  git(first, ['init', '-q', '-b', 'main']);
  assert.equal(run(first, ['init', 'config-only', '--write']).code, 0);
  commitAll(first, 'chore: start from eos');
  problems.push(...runPath(first, { only: (c) => c.declaration || c.cmd.includes('ledger') }));

  // 3. A pack with a stack. Its product commands are the project's to make runnable (project-gate has
  //    its own suite); everything EOS itself puts in the way of a first declaration must pass.
  const pack = templateCopy();
  git(pack, ['init', '-q', '-b', 'main']);
  commitAll(pack, 'chore: scaffold from eos');
  const packBase = git(pack, ['rev-parse', 'HEAD']).out.trim();
  assert.equal(run(pack, ['init', 'node-service', '--write']).code, 0);
  commitAll(pack, 'chore: declare the project');
  problems.push(...runPath(pack, { base: packBase, only: (c) => !c.product }));
  assert.deepEqual(problems, []);
});
