// Starter packs — a correct project DECLARATION, not an application skeleton.
//
// The declaration is what a newcomer gets wrong, and wrongly SILENTLY: an `application` with no
// commands.test fails closed with a confusing message, and a `config-only` that should not be one
// reports NOT_APPLICABLE forever while nobody notices no code is being verified. So the property
// under test is that every shipped pack produces a declaration the validator and the gate accept.
//
//   node --test .github/eos/packs.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, run, runJson, cleanup, APP_PROJECT, REPO_ROOT } from './test-support.mjs';
import { PACKS, packDeclaration, packIds } from './lib/packs.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const projectSchema = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/project.schema.json'), 'utf8'));

test('every pack produces a declaration that satisfies the project schema', () => {
  for (const id of packIds()) {
    const v = validate(projectSchema, packDeclaration(id), { label: id });
    assert.ok(v.valid, `${id}: ${v.errors.join('; ')}`);
  }
});

test('no pack declares an application without a test command', () => {
  for (const id of packIds()) {
    const d = packDeclaration(id);
    if (d.projectType === 'config-only') continue;
    assert.ok(d.commands?.test, `${id} would fail closed with no commands.test`);
  }
});

test('every pack names a workflow profile that exists', () => {
  const wf = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/workflow.json'), 'utf8'));
  for (const id of packIds()) {
    assert.ok(wf.profiles[packDeclaration(id).workflowProfile], `${id} points at a profile that does not exist`);
  }
});

test('an agentic pack declares an eval command, because G-EVAL turns on for it', () => {
  for (const id of packIds()) {
    const d = packDeclaration(id);
    if (!(d.productParadigms || []).includes('agentic')) continue;
    assert.ok(d.commands.eval, `${id} enables G-EVAL but declares no way to satisfy it`);
  }
});

test('the regulated pack actually selects the strict policy', () => {
  const d = packDeclaration('regulated-app');
  assert.equal(d.workflowProfile, 'regulated');
  assert.equal(d.complianceProfile, 'regulated');
});

test('new --write scaffolds a declaration the config validator accepts', () => {
  const dir = project({ 'README.md': '# fresh\n' });
  assert.equal(run(dir, ['new', 'python-service', '--write']).code, 0);
  const written = JSON.parse(readFileSync(join(dir, '.eos/project.json'), 'utf8'));
  assert.equal(written.stacks[0], 'python');
  assert.match(written.rationale, /REPLACE THE COMMANDS/);
  const r = run(dir, ['status']);
  assert.notEqual(r.code, 3, `a scaffolded project must not be broken:\n${r.out}`);
});

test('new never overwrites a declaration the project already made', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const before = readFileSync(join(dir, '.eos/project.json'), 'utf8');
  const r = run(dir, ['new', 'go-service', '--write']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /already exists/);
  assert.equal(readFileSync(join(dir, '.eos/project.json'), 'utf8'), before);
});

test('new without --write writes nothing', () => {
  const dir = project({ 'README.md': '# fresh\n' });
  assert.equal(run(dir, ['new', 'node-service']).code, 0);
  assert.equal(existsSync(join(dir, '.eos/project.json')), false);
});

test('an unknown pack is refused with the list, never guessed at', () => {
  const r = run(project({ 'README.md': '# fresh\n' }), ['new', 'not-a-pack', '--write']);
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown pack/);
});

test('listing packs is machine readable', () => {
  const r = runJson(project({ 'README.md': '# fresh\n' }), ['new']);
  assert.equal(r.json.packs.length, packIds().length);
  for (const p of r.json.packs) assert.ok(PACKS[p.id].title === p.title);
});
