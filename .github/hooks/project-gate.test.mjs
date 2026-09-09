// EOS product-quality gate regression tests — prove that a FAILING test in ANY declared stack fails
// the gate, and that "no product tests" is only possible as an explicit, checked declaration.
//   node --test .github/hooks/project-gate.test.mjs
// [audit EOS-002: CI only ran product tests when a root package.json existed, so a failing pytest
//  (or go test / cargo test / dotnet test) could never turn EOS CI red.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCommand, commandList, detectStacks, loadProjectConfig } from './lib/project-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'project-gate.mjs');
const sandboxes = [];

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-project-gate-'));
  sandboxes.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8');
  }
  return dir;
}
const run = (dir, args = []) => {
  const r = spawnSync(process.execPath, [HOOK, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

// A stack-agnostic stand-in for "the project's test command": node is guaranteed present.
const passingCmd = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
const failingCmd = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;

test.after(() => { for (const d of sandboxes) rmSync(d, { recursive: true, force: true }); });

test('clean EOS template passes explicitly as config-only', () => {
  const { code, out } = run(project({ '.eos/project.json': { projectType: 'config-only', stacks: [] } }));
  assert.equal(code, 0, out);
  assert.match(out, /config-only/);
});

test('config-only cannot hide real product code (manifest present ⇒ fail closed)', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'config-only', stacks: [] },
    'pyproject.toml': '[project]\nname = "x"\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /config-only/);
  assert.match(out, /python/);
});

test('config-only cannot declare commands (they would never run)', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'config-only', stacks: [], commands: { test: passingCmd } },
  }));
  assert.equal(code, 1);
  assert.match(out, /must not declare commands/);
  assert.match(out, /"other"/);
});

test('a stack with no manifest file is still gated via stacks:["other"]', () => {
  const ok = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['other'], commands: { test: passingCmd } },
    'main.tf': 'resource "null_resource" "x" {}\n',
  }));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /test: PASS/);

  const bad = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['other'], commands: { test: failingCmd } },
    'main.tf': 'resource "null_resource" "x" {}\n',
  }));
  assert.equal(bad.code, 1);
});

test('EOS-002: a non-node project with a FAILING test fails the gate', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], commands: { test: failingCmd } },
    'pyproject.toml': '[project]\nname = "x"\n',
    'tests/test_fail.py': 'def test_should_fail():\n    assert False\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /test FAIL/);
});

test('a non-node project with passing tests passes the gate', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['go'], commands: { test: passingCmd } },
    'go.mod': 'module x\n\ngo 1.22\n',
  }));
  assert.equal(code, 0, out);
  assert.match(out, /test: PASS/);
});

test('EOS-002: a non-node project with NO declaration fails closed (was: silently skipped)', () => {
  for (const [manifest, body] of [
    ['pyproject.toml', '[project]\nname = "x"\n'],
    ['go.mod', 'module x\n'],
    ['Cargo.toml', '[package]\nname = "x"\n'],
    ['pom.xml', '<project/>\n'],
    ['App.csproj', '<Project/>\n'],
  ]) {
    const { code, out } = run(project({ [manifest]: body }));
    assert.equal(code, 1, `${manifest} should fail closed:\n${out}`);
    assert.match(out, /\.eos\/project\.json/);
  }
});

test('application declared without a test command fails closed', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['rust'], commands: { lint: passingCmd } },
    'Cargo.toml': '[package]\nname = "x"\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /requires commands\.test/);
});

test('a missing toolchain is BLOCKED, never a silent pass', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['java'], commands: { test: 'eos-definitely-not-installed test' } },
    'pom.xml': '<project/>\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /BLOCKED/);
  assert.match(out, /not installed|not on PATH/);
});

test('unknown enum values and typo\'d keys fail closed', () => {
  const bad = [
    { projectType: 'app', stacks: ['node'], commands: { test: passingCmd } },   // unknown projectType
    { projectType: 'application', stacks: ['nodejs'], commands: { test: passingCmd } }, // unknown stack
    { projectType: 'application', stacks: ['node'], command: { test: passingCmd } },    // typo'd key
    { projectType: 'application', stacks: ['node'], commands: { tests: passingCmd } },  // typo'd step
  ];
  for (const cfg of bad) {
    const { code, out } = run(project({ '.eos/project.json': cfg, 'package.json': { name: 'x', scripts: { test: 'true' } } }));
    assert.equal(code, 1, `should reject ${JSON.stringify(cfg)}:\n${out}`);
    assert.match(out, /invalid project declaration/);
  }
});

test('declared commands never reach a shell (injection is rejected at load time)', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['node'], commands: { test: 'npm test | tee /tmp/x' } },
    'package.json': { name: 'x', scripts: { test: 'true' } },
  }));
  assert.equal(code, 1);
  assert.match(out, /shell metacharacter/);
});

test('legacy compat: an undeclared node repo still runs its npm scripts', () => {
  const dir = project({ 'package.json': { name: 'x', scripts: { test: 'node -e "process.exit(0)"' } } });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
  assert.match(out, /legacy Node defaults/);
  assert.match(out, /test: PASS/);
});

test('legacy compat: an undeclared node repo with a FAILING npm test fails', () => {
  const { code } = run(project({ 'package.json': { name: 'x', scripts: { test: 'node -e "process.exit(1)"' } } }));
  assert.equal(code, 1);
});

test('legacy compat: an undeclared node repo with no test script fails closed', () => {
  const { code, out } = run(project({ 'package.json': { name: 'x', scripts: {} } }));
  assert.equal(code, 1);
  assert.match(out, /no "test" script/);
});

test('agentic declaration without an eval command fails closed', () => {
  const { code, out } = run(project({
    '.eos/project.json': {
      projectType: 'application', stacks: ['python'], productParadigms: ['agentic'],
      commands: { test: passingCmd },
    },
    'pyproject.toml': '[project]\nname = "x"\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /commands\.eval/);
});

test('a chain of commands runs in order and stops at the first failure', () => {
  const { code, out } = run(project({
    '.eos/project.json': {
      projectType: 'application', stacks: ['python'],
      commands: { test: [passingCmd, failingCmd, passingCmd] },
    },
    'pyproject.toml': '[project]\nname = "x"\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /test FAIL/);
});

// ---------- unit-level: tokenizer / detection / schema ----------

test('parseCommand tokenizes quotes and rejects shell metacharacters', () => {
  assert.deepEqual(parseCommand('pytest -q tests/').argv, ['pytest', '-q', 'tests/']);
  assert.deepEqual(parseCommand('cargo clippy -- -D warnings').argv, ['cargo', 'clippy', '--', '-D', 'warnings']);
  assert.deepEqual(parseCommand('dotnet test "My Project.sln"').argv, ['dotnet', 'test', 'My Project.sln']);
  assert.deepEqual(parseCommand(['go', 'test', './...']).argv, ['go', 'test', './...']);
  for (const bad of ['a && b', 'a; b', 'a | b', 'a > f', 'a `b`', 'a $(b)']) {
    assert.equal(parseCommand(bad).argv, null, `should reject: ${bad}`);
  }
  assert.equal(parseCommand('').argv, null);
  assert.equal(parseCommand('a "unterminated').argv, null);
  // A literal quote inside an argv token is rejected so POSIX and the Windows .cmd path agree.
  assert.equal(parseCommand(['dotnet', 'test', '"x"']).argv, null);
});

test('commandList distinguishes an argv array from a chain of command strings', () => {
  assert.deepEqual(commandList(['npm', 'test']).commands, [['npm', 'test']]);
  assert.deepEqual(commandList(['ruff check .', 'pytest -q']).commands, [['ruff', 'check', '.'], ['pytest', '-q']]);
  assert.deepEqual(commandList('pytest -q').commands, [['pytest', '-q']]);
  // Stray leading/trailing whitespace must not silently reclassify an argv array as a chain.
  assert.deepEqual(commandList(['pytest ', '-q']).commands, [['pytest', '-q']]);
  assert.deepEqual(commandList([' npm ', 'test']).commands, [['npm', 'test']]);
  // A mix of the two forms is ambiguous — rejected rather than silently guessed at.
  const mixed = commandList(['npm', 'test --silent']);
  assert.equal(mixed.commands, null);
  assert.match(mixed.error, /ambiguous/);
});

test('detectStacks finds manifests in sub-packages but ignores vendored trees', () => {
  const dir = project({
    'apps/api/pyproject.toml': '[project]\nname = "api"\n',
    'apps/web/package.json': { name: 'web' },
    'node_modules/pkg/package.json': { name: 'ignored' },
    'vendor/lib/go.mod': 'module ignored\n',
  });
  assert.deepEqual(detectStacks(dir), ['node', 'python']);
});

test('loadProjectConfig reports a missing file without erroring', () => {
  const { present, errors } = loadProjectConfig(project({ 'README.md': '# x\n' }));
  assert.equal(present, false);
  assert.deepEqual(errors, []);
});

test('validate-config S12 mirrors project-gate: node-only WARNs, other stacks ERROR', () => {
  const VALIDATOR = join(HERE, 'validate-config.mjs');
  const base = {
    '.github/copilot-instructions.md': '# rules\n',
    '.github/instructions/00-workspace.instructions.md': '---\napplyTo: "**"\n---\n# x\n',
    '.github/prompts/.gitkeep': '',
    '.github/agents/.gitkeep': '',
    '.github/hooks/.gitkeep': '',
    'docs/eos/agent-map.md': '# map\n',
    'docs/eos/activation.md': '# ledger\n',
  };
  const runValidator = (files) => {
    const r = spawnSync(process.execPath, [VALIDATOR], { cwd: project({ ...base, ...files }), encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };

  const legacyNode = runValidator({ 'package.json': { name: 'x', scripts: { test: 'node --test' } } });
  assert.equal(legacyNode.code, 0, legacyNode.out);
  assert.match(legacyNode.out, /WARN {2}S12/);

  const python = runValidator({ 'pyproject.toml': '[project]\nname = "x"\n' });
  assert.equal(python.code, 1);
  assert.match(python.out, /ERROR S12/);
});

test('loadProjectConfig rejects an evalWaiver without a real reason or an owner', () => {
  const base = { projectType: 'application', stacks: ['node'], commands: { test: 'npm test' }, productParadigms: ['deterministic'] };
  const noReason = loadProjectConfig(project({ '.eos/project.json': { ...base, evalWaiver: { reason: 'nope', approvedBy: 'a@b.c' } } }));
  assert.ok(noReason.errors.some((e) => /reason/.test(e)));
  const noOwner = loadProjectConfig(project({ '.eos/project.json': { ...base, evalWaiver: { reason: 'no model calls in this service' } } }));
  assert.ok(noOwner.errors.some((e) => /approvedBy/.test(e)));
});
