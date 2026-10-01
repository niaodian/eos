// First run and track selection (eos-2.0.0). What a developer meets in the first five minutes:
// the template's own declaration is not theirs, `eos init` is where a project is declared and its
// governance track chosen, the track and what a release will require are visible everywhere, and a
// weakened policy is pointed out where they work, not first in CI.
//   node --test .github/eos/first-run.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, commitAll, REPO_ROOT, APP_PROJECT } from './test-support.mjs';
import { validate } from './lib/schema.mjs';
import { TOP_LEVEL_KEYS } from '../hooks/lib/project-config.mjs';

after(cleanup);

const SHIPPED = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/project.json'), 'utf8'));
const NEXT_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/next-action.schema.json'), 'utf8'));
const declaration = (dir) => JSON.parse(readFileSync(join(dir, '.eos/project.json'), 'utf8'));

// ---------------------------------------------------------------- the template's declaration
test('the template ships its declaration marked as the template\'s own', () => {
  // EOS's .eos/project.json describes EOS (its test command is EOS's own suite). A copy of the
  // template inherits it, so it has to say that it is not the adopter's declaration.
  assert.equal(SHIPPED.templateDefault, true);
});

test('a fresh copy of the template is told to declare its project before anything else', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  const r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'declare-project', r.out);
  assert.match(r.json.recommendedAction.command, /eos\.mjs init$/);
  assert.ok(r.json.blockers.some((b) => b.check === 'project-declaration'), JSON.stringify(r.json.blockers));
  assert.match(run(dir, ['next']).out, /EOS template's own declaration/);
});

test('the keys a declaration may use are the same in the loader and the schema', () => {
  // Two lists of the same thing: one decides what loads, the other what validates.
  const schemaKeys = Object.keys(JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/project.schema.json'), 'utf8')).properties);
  assert.deepEqual([...TOP_LEVEL_KEYS].sort(), schemaKeys.sort());
});

// ---------------------------------------------------------------- eos init: declare + choose a track
test('eos init lists the tracks and the packs, and writes nothing without --write', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  const r = run(dir, ['init']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Standard/);
  assert.match(r.out, /Regulated/);
  assert.match(r.out, /node-service/);
  assert.equal(declaration(dir).templateDefault, true, 'a dry run must not touch the declaration');
});

test('eos init <pack> --write replaces the template\'s declaration — on the Standard track by default', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  const r = run(dir, ['init', 'node-service', '--write']);
  assert.equal(r.code, 0, r.out);
  const d = declaration(dir);
  assert.equal(d.templateDefault, undefined);
  assert.equal(d.workflowProfile, 'standard-product');
  assert.equal(d.complianceProfile, undefined);
  assert.match(r.out, /Standard track/);
  commitAll(dir, 'declare');
  assert.notEqual(runJson(dir, ['next']).json.recommendedAction.id, 'declare-project');
});

test('eos init <pack> --track regulated --write puts the project on the Regulated track', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  assert.equal(run(dir, ['init', 'node-service', '--track', 'regulated', '--write']).code, 0);
  const d = declaration(dir);
  assert.equal(d.workflowProfile, 'regulated');
  assert.equal(d.complianceProfile, 'regulated');
  assert.equal(d.evidencePolicy, 'ci');
  commitAll(dir, 'declare');
  const status = run(dir, ['status']);
  assert.match(status.out, /Regulated track/);
  assert.match(status.out, /signed/i, 'what a release will require must be stated up front');
  assert.equal(runJson(dir, ['status']).json.track.name, 'regulated');
});

test('eos init refuses to overwrite a declaration the project made, unless --force', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const refused = run(dir, ['init', 'python-service', '--write']);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /refused/);
  assert.deepEqual(declaration(dir).stacks, ['node']);
  assert.equal(run(dir, ['init', 'python-service', '--write', '--force']).code, 0);
  assert.deepEqual(declaration(dir).stacks, ['python']);
});

test('an unknown track is refused, not guessed', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  const r = run(dir, ['init', 'node-service', '--track', 'enterprise', '--write']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /standard \| regulated/);
});

test('eos new <pack> still works, as the pack half of eos init', () => {
  const dir = project({ '.eos/project.json': SHIPPED });
  assert.equal(run(dir, ['new', 'go-service', '--write']).code, 0);
  assert.deepEqual(declaration(dir).stacks, ['go']);
});

// ---------------------------------------------------------------- the track is visible everywhere
test('status and next name the track; next --json carries it within the published schema', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.match(run(dir, ['status']).out, /Standard track/);
  assert.match(run(dir, ['next']).out, /^EOS · .* · Standard track$/m);
  const r = runJson(dir, ['next']);
  assert.equal(r.json.track.name, 'standard');
  assert.ok(r.json.track.releaseRequires.length > 0);
  assert.deepEqual(validate(NEXT_SCHEMA, r.json).errors, []);
});

// ---------------------------------------------------------------- a weakened policy, where you work
test('a weakening the lock does not cover is shown by next and status, with the exact command', () => {
  const regulated = { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci' };
  const dir = project({ '.eos/project.json': regulated });
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'lock the regulated policy');

  // The downgrade a developer might make in a hurry.
  write(dir, '.eos/project.json', { ...APP_PROJECT, workflowProfile: 'standard-product' });
  const next = run(dir, ['next']);
  assert.match(next.out, /Policy changed since \.eos\/policy\.lock\.json/);
  assert.match(next.out, /eos\.mjs policy lock --write --reason "<why>"/);
  assert.match(next.out, /complianceProfile:regulated->none/);
  assert.match(next.out, /approver/);
  const json = runJson(dir, ['next']).json;
  assert.ok(json.policyDrift.weakenings.some((w) => /complianceProfile/.test(w)), JSON.stringify(json.policyDrift));
  assert.deepEqual(validate(NEXT_SCHEMA, json).errors, []);
  assert.match(run(dir, ['status']).out, /Policy changed since/);
});

test('no lock, or a lock that matches, says nothing', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.doesNotMatch(run(dir, ['next']).out, /Policy changed/);
  assert.equal(runJson(dir, ['next']).json.policyDrift, undefined);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  assert.doesNotMatch(run(dir, ['status']).out, /Policy changed/);
});
