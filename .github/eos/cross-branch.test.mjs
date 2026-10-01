// "Someone else is moving this story too" — raised before the merge, not discovered at it (#4).
//
// `ledger --resolve` settles two branches that moved the same story, but only after the fact, and
// only by resetting the story to the state both sides last shared. These tests assert the warning
// that comes first: status, next and verify say so while there is still time to coordinate.
//
//   node --test .github/eos/cross-branch.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, run, runJson, git, commitAll, cleanup, storyFiles, story, write, REPO_ROOT } from './test-support.mjs';
import { validate } from './lib/schema.mjs';
import { loadActiveWork } from './lib/registry.mjs';

after(cleanup);

/** main and a feature branch; main then moves STORY-001 after the branch left it. */
function movedOnBase() {
  const dir = project({ ...storyFiles() }, { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']).code, 0);
  commitAll(dir, 'story in review');
  git(dir, ['checkout', '-q', '-b', 'feature']);
  git(dir, ['checkout', '-q', 'main']);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']).code, 0);
  commitAll(dir, 'main moves the story');
  git(dir, ['checkout', '-q', 'feature']);
  return dir;
}

test('status warns when the base branch moved a story this branch also moved', () => {
  const dir = movedOnBase();
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']).code, 0);
  const r = runJson(dir, ['status']);
  assert.equal(r.json.crossBranch.checked, true);
  assert.equal(r.json.crossBranch.base, 'main');
  assert.deepEqual(r.json.crossBranch.overlaps.map((o) => o.scope.id), ['STORY-001']);
  assert.match(run(dir, ['status']).out, /Also changing on main/);
});

test('the story you are focused on is covered before you record anything for it', () => {
  const dir = movedOnBase();
  run(dir, ['focus', '--scope', 'story', '--id', 'STORY-001']);
  const out = run(dir, ['status']).out;
  assert.match(out, /STORY-001 .* since you branched — latest: transition IN_REVIEW → READY_FOR_DEV/);
});

test('next carries the warning, and its JSON still satisfies the published schema', () => {
  const dir = movedOnBase();
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']);
  const r = runJson(dir, ['next']);
  assert.ok(r.json.crossBranch, r.out);
  const schema = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/next-action.schema.json'), 'utf8'));
  const v = validate(schema, r.json, { label: 'next' });
  assert.ok(v.valid, v.errors.join('; '));
  assert.match(run(dir, ['next']).out, /Merging will conflict on the ledger/);
});

test('verify reports it too', () => {
  const dir = movedOnBase();
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']);
  const r = runJson(dir, ['verify', '--plan']);
  assert.equal(r.code, 0);
  const full = runJson(dir, ['verify']);
  assert.deepEqual(full.json.crossBranch.overlaps.map((o) => o.scope.id), ['STORY-001']);
});

test('a story moved only on the base branch, while you work on another, is not a warning', () => {
  // With no explicit focus the router picks the story in progress as current — that one IS worth a
  // warning (see above). Focused elsewhere, and having recorded nothing for it, there is nothing to
  // coordinate.
  const dir = project({ ...storyFiles(), 'docs/stories/STORY-002.md': story({ id: 'STORY-002' }) }, { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  commitAll(dir, 'baseline');
  git(dir, ['checkout', '-q', '-b', 'feature']);
  git(dir, ['checkout', '-q', 'main']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']);
  commitAll(dir, 'main moves STORY-001');
  git(dir, ['checkout', '-q', 'feature']);
  run(dir, ['focus', '--scope', 'story', '--id', 'STORY-002']);
  assert.deepEqual(runJson(dir, ['status']).json.crossBranch.overlaps, []);
});

test('a different story moved on the base is not this branch\'s problem', () => {
  const dir = project({ ...storyFiles(), 'docs/stories/STORY-002.md': story({ id: 'STORY-002' }) }, { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  commitAll(dir, 'baseline');
  git(dir, ['checkout', '-q', '-b', 'feature']);
  git(dir, ['checkout', '-q', 'main']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-002', '--to', 'IN_REVIEW']);
  commitAll(dir, 'main moves another story');
  git(dir, ['checkout', '-q', 'feature']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']);
  assert.deepEqual(runJson(dir, ['status']).json.crossBranch.overlaps, []);
});

test('on the base branch itself with no other base, nothing is claimed', () => {
  const dir = project({ ...storyFiles() }, { withHooks: true });
  const r = runJson(dir, ['status']);
  assert.equal(r.json.crossBranch.checked, false, 'comparing main with itself would always say "clean" — that is not a check');
  assert.doesNotMatch(run(dir, ['status']).out, /Also changing on/);
});

test('EOS_BASE_REF chooses the base explicitly', () => {
  const dir = movedOnBase();
  git(dir, ['branch', 'release-line', 'main']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']);
  const r = runJson(dir, ['status'], { EOS_BASE_REF: 'release-line' });
  assert.equal(r.json.crossBranch.base, 'release-line');
  assert.equal(r.json.crossBranch.overlaps.length, 1);
  void write;
});

// ------------------------------------------------------------------ local focus is per branch (#4)
test('focus is kept per branch, so switching branches never hands back another branch\'s work', () => {
  const dir = project({ ...storyFiles(), 'docs/stories/STORY-002.md': story({ id: 'STORY-002' }) }, { withHooks: true });
  run(dir, ['focus', '--scope', 'story', '--id', 'STORY-002']);
  git(dir, ['checkout', '-q', '-b', 'other-work']);
  run(dir, ['focus', '--scope', 'story', '--id', 'STORY-001']);
  git(dir, ['checkout', '-q', 'main']);
  assert.equal(loadActiveWork(dir).activeWork?.scopeId, 'STORY-002', 'main keeps its own focus');
  git(dir, ['checkout', '-q', 'other-work']);
  assert.equal(loadActiveWork(dir).activeWork?.scopeId, 'STORY-001');
});

test('a focus recorded before branch tracking is honoured, but never one from another branch', () => {
  const dir = project({ ...storyFiles() }, { withHooks: true });
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-001' });
  assert.equal(loadActiveWork(dir).activeWork?.scopeId, 'STORY-001', 'a pre-1.20 focus with no branch still works');
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-001', branch: 'somebody-elses-branch' });
  assert.equal(loadActiveWork(dir).activeWork, null, 'a focus recorded on another branch is never borrowed');
});
