// EOS CLI contract tests — exit codes, the JSON contract consumers depend on, resume, explain,
// handoff packages, non-destructive init and the doctor. Zero deps (node:test):
//   node --test .github/eos/cli.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, REPO_ROOT, APP_PROJECT, PRD_2AC, story } from './test-support.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const schema = (name) => JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas', name), 'utf8'));

const READY_REPO = () => project({
  '.eos/project.json': APP_PROJECT,
  'docs/discovery.md': '# Discovery\n',
  'docs/requirements.md': '# Requirements\n',
  'docs/prd.md': PRD_2AC,
  'docs/EXPERIENCE.md': 'SKIP — no user-facing surface (internal API only).\n',
  'docs/architecture.md': '# Architecture\n',
  'docs/stories/STORY-012.md': story({
    id: 'STORY-012',
    rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', '—'], ['AC1.2', 'user can log out', '—', '—']],
  }),
});

// ---------------------------------------------------------------- JSON contract
test('next --json satisfies the published next-action schema', () => {
  const r = runJson(READY_REPO(), ['next']);
  const v = validate(schema('next-action.schema.json'), r.json);
  assert.equal(v.valid, true, v.errors.join('\n') + '\n' + r.out);
});

test('resume --json satisfies the same contract and names the last verified gate', () => {
  const dir = READY_REPO();
  const r = runJson(dir, ['resume']);
  assert.equal(validate(schema('next-action.schema.json'), r.json).valid, true, r.out);
  assert.equal(r.json.current.scopeId, 'STORY-012');
  const text = run(dir, ['resume']).out;
  assert.match(text, /Current/);
  assert.match(text, /STORY-012/);
});

test('resume restores the focus in a brand-new session without re-reading the docs', () => {
  const dir = READY_REPO();
  run(dir, ['resume']); // first session records the focus
  assert.ok(existsSync(join(dir, '.eos/local/active-work.json')));
  const saved = JSON.parse(readFileSync(join(dir, '.eos/local/active-work.json'), 'utf8'));
  assert.equal(saved.scopeId, 'STORY-012');
  assert.ok(!('status' in saved) && !('gateStatus' in saved), 'local focus must not carry authority');
  const second = runJson(dir, ['resume']);
  assert.equal(second.json.current.scopeId, 'STORY-012');
});

test('the human output is the six-block card and nothing else', () => {
  const out = run(READY_REPO(), ['next']).out;
  for (const block of ['Current', 'Blockers', 'Recommended next', 'Why', 'Start', 'Done when']) {
    assert.match(out, new RegExp(`^${block}`, 'm'), `missing block: ${block}`);
  }
  assert.doesNotMatch(out, /BMAD skills are installed/i);
  assert.ok(out.split('\n').length <= 40, 'default output must stay scannable');
});

// ---------------------------------------------------------------- exit codes
test('exit codes: check PASS=0, FAIL=1, PENDING/STALE=2, ERROR=3', () => {
  const ok = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC, 'docs/stories/STORY-001.md': story() });
  assert.equal(run(ok, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);

  const fail = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC, 'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }) });
  assert.equal(run(fail, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 1);

  const missing = project({ '.eos/project.json': APP_PROJECT });
  // A story that does not exist is a MISSING PREREQUISITE (BLOCKED, exit 2), never a pass.
  const noScope = run(missing, ['check', '--gate', 'story-ready', '--scope', 'NOPE']);
  assert.equal(noScope.code, 2, noScope.out);
  assert.match(noScope.out, /BLOCKED/);

  const broken = project({ '.eos/project.json': '{ not json' });
  assert.equal(run(broken, ['check', '--gate', 'activation']).code, 3);
});

test('exit codes: an unknown gate id is rejected (1), and G-codes resolve like ids', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC });
  assert.equal(run(dir, ['check', '--gate', 'not-a-gate']).code, 1);
  assert.equal(run(dir, ['check', '--gate', 'G3']).code, 0);
});

test('exit codes: an unknown command exits 3 with usage, never 0', () => {
  const { code, out } = run(project({ '.eos/project.json': APP_PROJECT }), ['frobnicate']);
  assert.equal(code, 3);
  assert.match(out, /usage/i);
});

// ---------------------------------------------------------------- explain
test('explain prints one gate only, on demand', () => {
  const dir = READY_REPO();
  const g5 = run(dir, ['explain', 'story-ready']);
  assert.equal(g5.code, 0);
  assert.match(g5.out, /ac-test-intent/);
  assert.doesNotMatch(g5.out, /release-ready/);
  assert.equal(run(dir, ['explain', 'G5']).out.includes('ac-test-intent'), true);
  assert.equal(run(dir, ['explain', 'nope']).code, 1);
});

// ---------------------------------------------------------------- handoff
test('handoff writes a minimal, verifiable context package', () => {
  const dir = READY_REPO();
  const r = run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012']);
  assert.equal(r.code, 0, r.out);
  const pkg = JSON.parse(readFileSync(join(dir, '.eos/handoffs/STORY-012.json'), 'utf8'));
  assert.equal(validate(schema('handoff.schema.json'), pkg).valid, true, JSON.stringify(validate(schema('handoff.schema.json'), pkg).errors));
  assert.equal(pkg.scope.id, 'STORY-012');
  assert.ok(pkg.doneWhen.length >= 1);
  assert.match(pkg.returnCommand, /eos\.mjs/);
  assert.ok(pkg.files.every((f) => f.sha256 && !f.path.includes('\\')));
  assert.ok(pkg.blockers.length >= 1, 'the package must carry the blockers, not the whole repo');
  const serialized = JSON.stringify(pkg);
  assert.doesNotMatch(serialized, /PASSWORD|SECRET|API_KEY/i);
});

test('handoff --verify reports STALE after an input changes', () => {
  const dir = READY_REPO();
  run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012']);
  assert.equal(run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012', '--verify']).code, 0);
  write(dir, 'docs/stories/STORY-012.md', story({ id: 'STORY-012', rows: [['AC1.1', 'changed', 'tests/x.test.mjs::y', '—']] }));
  const v = run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012', '--verify']);
  assert.equal(v.code, 2, v.out);
  assert.match(v.out, /STALE/);
});

// ---------------------------------------------------------------- doctor / agent map
test('doctor reports a missing agent file instead of recommending an unusable agent', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    '.eos/agent-map.json': { schemaVersion: 1, actions: { 'frame-the-problem': { agent: 'ghost-agent', skills: ['bmad-nope'] } } },
  });
  const { code, out } = run(dir, ['doctor']);
  assert.equal(code, 2, out);
  assert.match(out, /ghost-agent/);
  assert.match(out, /BLOCKED/);
});

test('doctor passes on the shipped configuration', () => {
  const r = run(REPO_ROOT, ['doctor']);
  assert.equal(r.code, 0, r.out);
});

// ---------------------------------------------------------------- init (non-destructive)
test('init --write creates local integration files but never overwrites existing ones', () => {
  const dir = READY_REPO();
  write(dir, '.vscode/tasks.json', '{ "version": "2.0.0", "tasks": [] }\n');
  const before = readFileSync(join(dir, '.vscode/tasks.json'), 'utf8');
  const r = run(dir, ['init', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(dir, '.vscode/tasks.json'), 'utf8'), before, 'existing tasks.json must be preserved');
  assert.match(r.out, /kept|exists/i);
});

test('init without --write changes nothing', () => {
  const dir = READY_REPO();
  const r = run(dir, ['init']);
  assert.equal(existsSync(join(dir, '.vscode/tasks.json')), false);
  assert.match(r.out, /--write/);
});

test('init --write on a fresh repo produces tasks that call this CLI', () => {
  const dir = READY_REPO();
  assert.equal(run(dir, ['init', '--write']).code, 0);
  const tasks = JSON.parse(readFileSync(join(dir, '.vscode/tasks.json'), 'utf8'));
  const labels = tasks.tasks.map((t) => t.label);
  for (const l of ['EOS: Next', 'EOS: Resume', 'EOS: Verify Current Gate', 'EOS: Release Status']) {
    assert.ok(labels.includes(l), `missing task ${l}`);
  }
  assert.ok(tasks.tasks.every((t) => JSON.stringify(t).includes('eos.mjs')));
});

// ---------------------------------------------------------------- waive (drafts, never approves)
test('waive drafts an unapproved waiver and refuses to honor it', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/HOT-003.md': story({ id: 'HOT-003', changeType: 'HOTFIX', rows: [['AC1.1', 'restore checkout', '—', '—']] }),
  });
  const r = run(dir, ['waive', '--gate', 'story-ready', '--scope', 'HOT-003',
    '--reason', 'Checkout is down in production and the readiness review is deferred by 24 hours.',
    '--risk-owner', 'ops-lead', '--expires', '2999-01-01', '--control', 'staging smoke test']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /approver/i);
  const file = join(dir, '.eos/waivers/story-ready__story__HOT-003.json');
  assert.ok(existsSync(file));
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).approver, '');
  assert.notEqual(runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'HOT-003']).json.status, 'WAIVED');
});

test('waive refuses a non-waivable gate outright', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  const r = run(dir, ['waive', '--gate', 'verified', '--scope', 'STORY-001',
    '--reason', 'We would rather not run the tests for this one release.',
    '--risk-owner', 'ops-lead', '--expires', '2999-01-01', '--control', 'none']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not waivable/i);
});

// ---------------------------------------------------------------- status / release
test('status --changed only reports the scopes touched by the working tree', () => {
  const dir = READY_REPO();
  const r = run(dir, ['status', '--changed']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /changed|no tracked changes/i);
});

test('release-status names passed / failed / stale / waived counts and one next step', () => {
  const dir = READY_REPO();
  const r = runJson(dir, ['release-status']);
  assert.ok(r.json.summary, r.out);
  for (const k of ['PASS', 'FAIL', 'STALE', 'WAIVED']) assert.ok(k in r.json.summary);
  const text = run(dir, ['release-status']).out;
  assert.match(text, /Recommended next/);
});

test('verify-release refuses evidence that is not bound to the candidate commit', () => {
  const dir = READY_REPO();
  const r = run(dir, ['verify-release', '--release', 'v0.1.0']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /BLOCKED|FAIL/);
});

// ---------------------------------------------------------------- offline / no-git guarantees
test('the CLI runs with no git repository and no network', () => {
  const dir = READY_REPO();
  const r = run(dir, ['status'], { PATH: process.env.PATH, EOS_OFFLINE: '1' });
  assert.notEqual(r.code, 3, r.out);
  assert.match(r.out, /EOS/);
});
