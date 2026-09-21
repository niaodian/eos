// Workspace-rule generation — the one command that WRITES the always-on rule instead of only
// reporting that it is wrong. G4 and S14 are the checkers; this is the fix they point at, so the
// contract that matters is: whatever it writes must satisfy both of them.
//   node --test .github/eos/workspace-rule.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { project, baselineFiles, cleanup } from './test-support.mjs';
import { renderCommandsLine, WORKSPACE_RULE } from './lib/workspace-rule.mjs';
import { loadProjectConfig, stacksInProse } from '../hooks/lib/project-config.mjs';

after(cleanup);

const CLI = join(process.cwd(), '.github/eos/eos.mjs');
const SHIPPED_RULE = join(process.cwd(), WORKSPACE_RULE);
const run = (dir, args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

/** A sandbox carrying the REAL shipped rule file, because that is what a user's repo contains. */
function repo(projectJson) {
  const dir = project(baselineFiles());
  mkdirSync(join(dir, '.github/instructions'), { recursive: true });
  cpSync(SHIPPED_RULE, join(dir, WORKSPACE_RULE));
  writeFileSync(join(dir, '.eos/project.json'), JSON.stringify(projectJson, null, 2), 'utf8');
  return dir;
}
const ruleText = (dir) => readFileSync(join(dir, WORKSPACE_RULE), 'utf8');
const commandsLine = (dir) => ruleText(dir).match(/^- Install:.*$/m)?.[0] || '';

test('stack sync: renders the stack preset once the architecture picked a stack, before code exists', () => {
  // The normal window between "G4 locked the stack" and "the first scaffold story landed".
  const dir = repo({ projectType: 'config-only', stacks: ['python'], productParadigms: ['deterministic'] });
  const { code, out } = run(dir, ['stack', 'sync', '--write']);
  assert.equal(code, 0, out);
  assert.match(out, /stack presets/);
  assert.match(commandsLine(dir), /pytest/);
  assert.doesNotMatch(ruleText(dir), /⛳ PROVISIONAL/);
});

test('stack sync: declared commands win over presets, rendered as the argv CI runs', () => {
  const dir = repo({
    projectType: 'application',
    stacks: ['python'],
    commands: { install: 'uv sync', test: ['ruff check .', 'pytest -q'] },
    productParadigms: ['deterministic'],
  });
  assert.equal(run(dir, ['stack', 'sync', '--write']).code, 0);
  const line = commandsLine(dir);
  assert.match(line, /Install: `uv sync`/);
  // A multi-step command reads as the chain a human would type to reproduce it.
  assert.match(line, /Test: `ruff check \. && pytest -q`/);
});

test('stack sync: what it writes satisfies the checks that complain about this file', () => {
  // The whole point. If the generator and the validators disagreed, `stack sync` would produce a
  // file that immediately fails CI — so this asserts the loop actually closes.
  const dir = repo({
    projectType: 'application',
    stacks: ['python'],
    commands: { test: 'pytest -q' },
    productParadigms: ['deterministic'],
  });
  run(dir, ['stack', 'sync', '--write']);

  const declared = loadProjectConfig(dir).config.stacks;
  for (const stack of stacksInProse(ruleText(dir)).keys()) {
    assert.ok(declared.includes(stack), `S14 would reject a rendered ${stack} command`);
  }
  const validator = spawnSync(process.execPath, [join(process.cwd(), '.github/hooks/validate-config.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.doesNotMatch((validator.stdout || '') + (validator.stderr || ''), /S14/);
});

test('stack sync: dry run is the default and writes nothing', () => {
  const dir = repo({ projectType: 'config-only', stacks: ['go'], productParadigms: ['deterministic'] });
  const before = ruleText(dir);
  const { code, out } = run(dir, ['stack', 'sync']);
  assert.equal(code, 0, out);
  assert.match(out, /would update/);
  assert.equal(ruleText(dir), before, 'a dry run must not touch the file');
});

test('stack sync: with nothing declared it blocks instead of guessing a stack', () => {
  // The clean template is exactly this state. Inventing Node here is how the placeholder became
  // wrong in the first place.
  const dir = repo({ projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] });
  const before = ruleText(dir);
  const { code, out } = run(dir, ['stack', 'sync', '--write']);
  assert.equal(code, 2, out);
  assert.match(out, /does not guess/);
  // The property that matters is that a refusal WRITES NOTHING. Asserting on the provisional
  // marker instead used to work only because the shipped rule happened to still carry one; once
  // EOS locked its own stack that became a statement about EOS rather than about this behaviour.
  assert.equal(ruleText(dir), before, 'a refusal must leave the rule byte-for-byte untouched');
});

test('stack sync: re-running is a no-op, so it is safe in a loop or a hook', () => {
  const dir = repo({ projectType: 'application', stacks: ['go'], commands: { test: 'go test ./...' }, productParadigms: ['deterministic'] });
  run(dir, ['stack', 'sync', '--write']);
  const once = ruleText(dir);
  const second = run(dir, ['stack', 'sync', '--write']);
  assert.equal(second.code, 0);
  assert.match(second.out, /already states this/);
  assert.equal(ruleText(dir), once);
});

test('renderCommandsLine: a multi-stack project keeps every declared stack visible', () => {
  const r = renderCommandsLine({ stacks: ['node', 'python'], commands: {} });
  assert.equal(r.source, 'stack-presets');
  assert.match(r.line, /npm ci/);
});

test('renderCommandsLine: "other" has no preset to render, and says so', () => {
  const r = renderCommandsLine({ stacks: ['other'], commands: {} });
  assert.equal(r.line, null);
  assert.match(r.reason, /no stacks and no commands|no preset/);
});

// The anchor used to be /^- Install:.*$/m, which assumed every project declares an install step.
// A project that declares only `commands.test` renders "- Test: …", and the anchor could then
// never match its own output again: `stack sync` silently became a one-shot that could no longer
// update the line it had just written. Idempotence has to hold for EVERY shape of commands block.
test('stack sync can rewrite a line it wrote itself when there is no install step', () => {
  const dir = repo({ projectType: 'application', stacks: ['other'], commands: { test: 'make check' }, productParadigms: ['deterministic'] });
  assert.equal(run(dir, ['stack', 'sync', '--write']).code, 0);
  assert.match(ruleText(dir), /^- Test: `make check`\.$/m);

  // Now change the declared command: the second sync must still find and replace the first one.
  writeFileSync(join(dir, '.eos/project.json'), JSON.stringify({
    projectType: 'application', stacks: ['other'], commands: { test: 'make verify' }, productParadigms: ['deterministic'],
  }, null, 2), 'utf8');
  assert.equal(run(dir, ['stack', 'sync', '--write']).code, 0);
  assert.match(ruleText(dir), /^- Test: `make verify`\.$/m);
  assert.doesNotMatch(ruleText(dir), /make check/, 'the stale line must be gone, not duplicated');
});

test('stack sync restores a commands line that was deleted entirely', () => {
  const dir = repo({ projectType: 'application', stacks: ['go'], commands: { test: 'go test ./...' }, productParadigms: ['deterministic'] });
  const stripped = ruleText(dir).replace(/^- (?:Install|Lint|Test|Typecheck|Eval|Audit|Build): .*$/m, '');
  writeFileSync(join(dir, WORKSPACE_RULE), stripped, 'utf8');
  assert.equal(run(dir, ['stack', 'sync', '--write']).code, 0);
  assert.match(ruleText(dir), /^- Test: `go test \.\/\.\.\.`\.$/m, 'a silent rule is worse than a wrong one');
});
