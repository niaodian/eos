// Bypass regression tests — one per defect found by the independent review of this iteration.
// Each test performs the reported exploit and asserts it no longer works.
//   node --test .github/eos/bypass.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, story } from './test-support.mjs';

after(cleanup);

const PRD = '# PRD\n\n- AC1.1 the user can log in\n- AC1.2 the user can log out\n';
const TRACE = '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.mjs | ✅ |\n';
const APP = { projectType: 'application', stacks: ['node'], productParadigms: ['deterministic'], commands: { test: 'node --version' } };
const WEAK = () => story({ id: 'S1', rows: [['AC1.1', 'the user can log in', '—', '—']], ops: false, deps: false });

// ── 1. relabelling a story with a NON-STORY change type ────────────────────────────────────────
for (const changeType of ['PRODUCT_BASELINE', 'RELEASE']) {
  test(`bypass: a story labelled ${changeType} cannot inherit that scope's gate exemptions`, () => {
    const dir = project({
      '.eos/project.json': APP,
      'docs/prd.md': PRD,
      'docs/stories/S1.md': WEAK().replace('changeType: FEATURE', `changeType: ${changeType}`),
    });
    const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']);
    assert.equal(t.code, 1, t.out);
    assert.match(t.out, /governs the (product|release) scope, not a story/);
    const r = runJson(dir, ['next']);
    assert.equal(r.code, 2, r.out);
    assert.equal(r.json.recommendedAction.id, 'justify-classification');
  });
}

test('bypass: a gate-disabling classification is caught even without the workflow flag', () => {
  // Same policy shape as DOC_ONLY, but with requiresClassificationReason deliberately removed.
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': WEAK().replace('changeType: FEATURE', 'changeType: SNEAKY') });
  const wf = JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'));
  wf.profiles['standard-product'].changeTypes.SNEAKY = {
    scope: 'story',
    description: 'Looks harmless.',
    gates: { activation: 'not_applicable', 'prd-ready': 'not_applicable', 'story-ready': 'not_applicable', verified: 'not_applicable', 'release-ready': 'not_applicable' },
  };
  writeFileSync(join(dir, '.eos/workflow.json'), JSON.stringify(wf, null, 2));
  const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']);
  assert.equal(t.code, 1, t.out);
  assert.match(t.out, /classificationReason/);
});

test('bypass: the gitignored local focus cannot supply a change type at all', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': WEAK() });
  const r = run(dir, ['focus', '--scope', 'story', '--id', 'S1', '--change-type', 'DOC_ONLY']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /change type selects the gate policy/);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'story', scopeId: 'S1', changeType: 'DOC_ONLY' });
  assert.equal(runJson(dir, ['next']).json.current.changeType, 'FEATURE');
});

// ── 2. a recorded WAIVED must not outlive its waiver ───────────────────────────────────────────
test('bypass: an expired or deleted waiver invalidates the recorded WAIVED', () => {
  const waiver = {
    schemaVersion: 1,
    gate: 'story-ready',
    scope: { type: 'story', id: 'S1' },
    reason: 'Production outage; the readiness review is deferred for 24 hours.',
    riskOwner: 'ops-lead',
    requestedBy: 'dev-a',
    approver: 'cto',
    expiresOn: '2999-01-01',
    compensatingControls: ['staging smoke test'],
  };
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/stories/S1.md': WEAK().replace('changeType: FEATURE', 'changeType: HOTFIX'),
    '.eos/waivers/w.json': waiver,
  });
  assert.equal(runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']).json.status, 'WAIVED');
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']).code, 0);

  // let it expire — the recorded WAIVED must stop granting the promotion
  write(dir, '.eos/waivers/w.json', { ...waiver, expiresOn: '2000-01-01' });
  const expired = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(expired.code, 1, expired.out);
  assert.match(expired.out, /STALE|expired/i);

  // deleting it outright is not a shortcut either
  write(dir, '.eos/waivers/w.json', { ...waiver, approver: 'dev-a' }); // self-approval
  const self = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(self.code, 1, self.out);
});

// ── 3. a tampered ledger must not be readable as state ─────────────────────────────────────────
test('bypass: rewriting a ledger line is an ERROR for every consumer, not just for `ledger --verify`', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']).code, 0);

  const p = join(dir, '.eos/ledger/events.jsonl');
  const lines = readFileSync(p, 'utf8').trim().split('\n');
  const e = JSON.parse(lines[0]);
  e.to = 'VERIFIED';
  writeFileSync(p, [JSON.stringify(e), ...lines.slice(1)].join('\n') + '\n');

  const status = run(dir, ['status']);
  assert.equal(status.code, 3, status.out);
  assert.doesNotMatch(status.out, /S1\s+VERIFIED/);
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']).code, 3);
  assert.equal(runJson(dir, ['next']).json.exitCode, 3);
});

// ── 4. hand-written evidence must not be believed ──────────────────────────────────────────────
test('bypass: a hand-written PASS evidence file does not grant a promotion', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': WEAK() });
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']).code, 0);
  write(dir, '.eos/evidence/story-ready__story__S1.json', {
    schemaVersion: 1, gate: 'story-ready', gateVersion: '1.0.0', evaluatorVersion: '1.0.0',
    scope: { type: 'story', id: 'S1' }, status: 'PASS', commit: null,
    inputs: [], checks: [{ id: 'story-present', status: 'PASS' }], generatedAt: new Date().toISOString(),
  });
  const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(t.code, 1, t.out);
  // The hash-chained ledger has no record of this gate ever running, and it wins over a file.
  assert.match(t.out, /no record of story-ready running|STALE|does not cover/);
});

test('bypass: editing the status of a GENUINE evidence file does not grant a promotion', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': WEAK() });
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']).code, 1); // really FAILs
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']).code, 0);
  const p = join(dir, '.eos/evidence/story-ready__story__S1.json');
  const ev = JSON.parse(readFileSync(p, 'utf8'));
  ev.status = 'PASS'; // one word, every input hash still valid
  writeFileSync(p, JSON.stringify(ev, null, 2));
  const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(t.code, 1, t.out);
  assert.match(t.out, /edited by hand|ledger recorded/);
  assert.equal(run(dir, ['doctor']).code, 2);
});

test('bypass: an unrecognised status in stored evidence is treated as the worst case', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']);
  const p = join(dir, '.eos/evidence/story-ready__story__S1.json');
  const ev = JSON.parse(readFileSync(p, 'utf8'));
  ev.status = 'passed'; // not one of the eight declared statuses
  writeFileSync(p, JSON.stringify(ev, null, 2));
  const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']);
  assert.equal(t.code, 0, t.out);
  const promote = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(promote.code, 1, promote.out);
  assert.match(promote.out, /unknown status|STALE|is passed/i);
});

// ── 5. release evidence must cover the set of stories it claims ────────────────────────────────
test('bypass: a story added after the release gate ran invalidates the release evidence', () => {
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/trace-matrix.md': TRACE,
    'docs/stories/S1.md': story({ id: 'S1' }),
    'ops/runbook.md': '# Runbook\n\n## Rollback\n\nDisable the flag.\n',
  }, { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']);
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST']) run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', to]);
  run(dir, ['check', '--gate', 'verified', '--scope', 'S1']);
  run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'VERIFIED']);
  run(dir, ['check', '--gate', 'release-ready', '--scope', 'v1']);
  run(dir, ['transition', '--scope', 'release', '--id', 'v1', '--to', 'CANDIDATE']);

  // whatever the release gate concluded, adding an unverified story must invalidate it
  write(dir, 'docs/stories/S2.md', story({ id: 'S2', rows: [['AC1.2', 'the user can log out', 'b.test.mjs::x', '—']] }));
  const t = run(dir, ['transition', '--scope', 'release', '--id', 'v1', '--to', 'VERIFIED']);
  assert.equal(t.code, 1, t.out);
  assert.match(t.out, /STALE|set of stories|FAIL|PENDING/);
});

// ── 6. truncating the ledger must be detectable ────────────────────────────────────────────────
test('bypass: deleting the tail of the ledger is detected', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']);
  run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'DRAFT']);
  assert.equal(run(dir, ['ledger', '--verify']).code, 0);
  assert.ok(existsSync(join(dir, '.eos/ledger/head.json')));

  const p = join(dir, '.eos/ledger/events.jsonl');
  const lines = readFileSync(p, 'utf8').trim().split('\n');
  writeFileSync(p, lines.slice(0, -1).join('\n') + '\n'); // forward-only chain still "valid"
  const v = run(dir, ['ledger', '--verify']);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /removed from the end|head\.json/);
  assert.equal(run(dir, ['status']).code, 3);
});

test('migration: a ledger written before the head record existed warns, it does not brick the repo', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']);
  // simulate a pre-head-record ledger
  rmSync(join(dir, '.eos/ledger/head.json'), { force: true });
  // Not PASS — EOS must never claim to have verified something it could not check.
  const v = run(dir, ['ledger', '--verify']);
  assert.equal(v.code, 2, v.out);
  assert.match(v.out, /UNVERIFIED/);
  assert.doesNotMatch(v.out, /PASS —/);
  // ...but the repository still works: the chain itself is intact, so state is still readable.
  const s = run(dir, ['status']);
  assert.equal(s.code, 0, s.out);
  assert.match(s.out, /IN_REVIEW/);
  // ...the unverifiable property is visible everywhere, not only in `ledger --verify`
  assert.match(s.out, /Unverified/);
  assert.equal(run(dir, ['doctor']).code, 2);
  // ...and the head record is restored by the next recorded event
  run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'DRAFT']);
  const after = run(dir, ['ledger', '--verify']);
  assert.equal(after.code, 0, after.out);
  assert.match(after.out, /PASS —/);
  assert.equal(run(dir, ['doctor']).code, 0);
});

test('bypass: regressing the artifact and recomputing one input hash is caught by the content binding', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']).code, 0); // a GENUINE pass
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'IN_REVIEW']).code, 0);

  // regress the story so it would now fail, then repair the single input hash in the evidence
  write(dir, 'docs/stories/S1.md', WEAK());
  const p = join(dir, '.eos/evidence/story-ready__story__S1.json');
  const ev = JSON.parse(readFileSync(p, 'utf8'));
  const target = ev.inputs.find((i) => i.path === 'docs/stories/S1.md');
  target.sha256 = createHash('sha256').update(readFileSync(join(dir, 'docs/stories/S1.md'))).digest('hex');
  writeFileSync(p, JSON.stringify(ev, null, 2));

  const t = run(dir, ['transition', '--scope', 'story', '--id', 'S1', '--to', 'READY_FOR_DEV']);
  assert.equal(t.code, 1, t.out);
  assert.match(t.out, /changed since the ledger recorded it/);
  assert.equal(run(dir, ['doctor']).code, 2);
});

test('doctor reports a malformed evidence file instead of crashing on it', () => {
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': PRD, 'docs/stories/S1.md': story({ id: 'S1' }) });
  write(dir, '.eos/evidence/zz__story__X.json', {});
  const d = run(dir, ['doctor']);
  assert.equal(d.code, 2, d.out);
  assert.match(d.out, /zz__story__X\.json/);
  assert.doesNotMatch(d.out, /Cannot read properties/);
});
