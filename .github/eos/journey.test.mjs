// The complete local user journey, as an executable regression:
//   initialize → start a feature → story-ready FAILS → recommended action → repair →
//   story-ready PASSES → promote → resume in a new session → verify → an input moves (STALE) →
//   recover → merge → release status names the remaining gate.
// Everything runs offline through the real CLI.
//   node --test .github/eos/journey.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, story, baselineFiles, TEST_FILE, releaseFiles, writeManifest, treeDigest, APP_PROJECT } from './test-support.mjs';
import { verifiedStory } from './audit-support.mjs';

after(cleanup);

const PRD = '# PRD\n\n## Login (FR1)\n\n- AC1.1 the user can log in with a valid password\n- AC1.2 the user can log out and the session is destroyed\n';
// The Result column is prose: the gate reads the run, never this cell.
const TRACE = ['| AC | Test | Result |', '| --- | --- | --- |',
  '| AC1.1 | tests/login.test.mjs::valid password | from the run |',
  '| AC1.2 | tests/logout.test.mjs::clears the session | from the run |', ''].join('\n');
const LOGOUT_TEST = "import { test } from 'node:test';\ntest('clears the session', () => {});\n";
const APP = {
  projectType: 'application', stacks: ['node'], productParadigms: ['deterministic'],
  workflowProfile: 'standard-product', commands: { test: 'node --version' },
};
// The full loop runs the real path (ADR-016): a real node:test run writes JUnit XML, and the
// verified gate derives docs/evidence/test-run.json from it. Nothing in the loop is hand-written.
const LOOP_APP = {
  ...APP,
  commands: { test: 'node --test --test-reporter=junit --test-reporter-destination=reports/junit/node.xml tests/login.test.mjs tests/logout.test.mjs' },
  evidence: { junit: ['reports/junit/*.xml'] },
};
const LOCAL = { GITHUB_ACTIONS: '', GITLAB_CI: '', CI: '' };
const halfDone = () => story({
  id: 'STORY-012',
  rows: [['AC1.1', 'the user can log in', 'tests/login.test.mjs::valid password', '—'], ['AC1.2', 'the user can log out', '—', '—']],
});
const done = () => story({
  id: 'STORY-012',
  rows: [['AC1.1', 'the user can log in', 'tests/login.test.mjs::valid password', '—'], ['AC1.2', 'the user can log out', 'tests/logout.test.mjs::clears the session', '—']],
});

test('journey: an untouched template with product code is routed to activation, not to a document', () => {
  const dir = project({
    '.eos/project.json': { projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] },
    'package.json': '{ "name": "demo", "scripts": { "test": "node --version" } }\n',
  });
  const r = runJson(dir, ['next']);
  // 2.0: the activation step that fixes this is declaring the stack — `eos init` names the packs that match.
  assert.equal(r.json.recommendedAction.id, 'declare-project');
  assert.match(r.json.recommendedAction.command, /eos\.mjs init$/);
  assert.equal(r.code, 2);
  assert.match(JSON.stringify(r.json.blockers), /config-only/);
});

test('journey: the full loop from a blocked story to a merged story and a release verdict', () => {
  const dir = project(baselineFiles({
    '.eos/project.json': LOOP_APP,
    '.gitignore': '/reports/junit/\n',
    'docs/prd.md': PRD,
    'docs/stories/STORY-012.md': halfDone(),
    'tests/login.test.mjs': TEST_FILE,
    'tests/logout.test.mjs': LOGOUT_TEST,
  }), { withHooks: true });

  // 1. the gate-failure experience: one concrete blocker, one action, one runnable command
  let r = runJson(dir, ['next']);
  assert.equal(r.json.current.scopeId, 'STORY-012');
  assert.equal(r.json.recommendedAction.id, 'design-acceptance-tests');
  assert.equal(r.json.recommendedAction.copilotAgent, 'eos-plan');
  assert.match(r.json.blockers[0].detail, /AC1\.2/);
  assert.match(r.json.recommendedAction.command, /check --gate story-ready --scope STORY-012/);
  assert.equal(r.code, 2);

  // 2. an illegal promotion is refused with the legal set named
  const illegal = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'READY_FOR_DEV']);
  assert.equal(illegal.code, 1);
  assert.match(illegal.out, /illegal transition DRAFT → READY_FOR_DEV/);

  // 3. do the one recommended thing, then the gate goes RED → GREEN
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-012']).code, 1);
  write(dir, 'docs/stories/STORY-012.md', done());
  const green = runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-012']);
  assert.equal(green.code, 0, green.out);
  assert.equal(green.json.status, 'PASS');
  assert.ok(existsSync(join(dir, '.eos/evidence/story-ready__story__STORY-012.json')));

  // 4. promote through the machine
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT']) {
    const t = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', to]);
    assert.equal(t.code, 0, `${to}: ${t.out}`);
  }

  // 5. a brand-new session recovers the focus without reading any document
  const resumed = runJson(dir, ['resume']);
  assert.equal(resumed.json.current.scopeId, 'STORY-012');
  assert.equal(resumed.json.current.state, 'IN_DEVELOPMENT');
  assert.equal(resumed.json.recommendedAction.id, 'verify-story');
  assert.match(run(dir, ['resume']).out, /Last verified gate\n\s+story-ready — PASS/);

  // 6. verification is blocked until the trace matrix exists, and says exactly that
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'READY_FOR_TEST']);
  r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'build-trace-matrix');
  assert.match(JSON.stringify(r.json.blockers), /trace-matrix\.md does not exist/);

  // The trace matrix is the only thing written by hand. The gate runs the tests and derives the
  // machine result from the JUnit report that run wrote.
  write(dir, 'docs/trace-matrix.md', TRACE);
  const verified = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-012'], LOCAL);
  assert.equal(verified.code, 0, verified.out);
  const derived = JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));
  assert.deepEqual(derived.source.reports, ['reports/junit/node.xml']);
  assert.deepEqual(derived.results.map((r) => `${r.ac}:${r.status}`), ['AC1.1:PASS', 'AC1.2:PASS']);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'VERIFIED']).code, 0);

  // 7. an input moves: the recorded PASS becomes STALE and the merge is refused
  write(dir, 'docs/prd.md', PRD + '- AC1.3 the user can reset a password from the sign-in page\n');
  const blockedMerge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED']);
  assert.equal(blockedMerge.code, 1);
  assert.match(blockedMerge.out, /STALE/);

  // ...but only what actually moved goes stale. AC1.3 is a criterion this story never cites, so its
  // READINESS still holds: a 20-story backlog must not have to re-run story-ready 20 times because
  // one unrelated criterion was added to the PRD. Verification is a different claim — it is bound to
  // the product tree, and the tree did move.
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-012']).code, 0);

  // 8. the recovery path is spelled out, not left to the developer to guess
  const stale = runJson(dir, ['next']);
  assert.equal(stale.json.recommendedAction.id, 'refresh-stale-evidence');
  assert.match(stale.json.recommendedAction.command, /check --gate verified --scope STORY-012/);

  // The recorded results describe the tree as it was. Re-running the gate re-runs the tests, so the
  // summary is derived again for THIS tree — the recovery is the one command `eos next` printed.
  const before = JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));
  const again = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-012'], LOCAL);
  assert.equal(again.code, 0, again.out);
  const after = JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));
  assert.notEqual(after.productTree.digest, before.productTree.digest, 'the summary now describes the edited tree');
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED']).code, 0);

  // 9. with the story merged, the router hands the focus to the next change
  assert.equal(runJson(dir, ['next']).json.recommendedAction.id, 'start-next-change');

  // 10. release readiness names what is still missing instead of a generic failure
  const rel = runJson(dir, ['release-status', '--release', 'v0.2.0']);
  assert.notEqual(rel.code, 0);
  const failing = rel.json.checks.filter((c) => !['PASS', 'NOT_APPLICABLE', 'WAIVED'].includes(c.status));
  assert.ok(failing.length, 'a release with no runbook must not be reported as ready');
  assert.match(JSON.stringify(failing), /runbook|spec-align|secret|compliance/i);

  // 11. every state change is in the append-only ledger and the chain still verifies
  assert.equal(run(dir, ['ledger', '--verify']).code, 0);
  const events = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const merged = events.filter((e) => e.type === 'transition' && e.to === 'MERGED');
  assert.equal(merged.length, 1);
  assert.ok(events.filter((e) => e.type === 'gate').length >= 4, 'every gate run is recorded');
});

test('journey: a DOC_ONLY change is not dragged through the product gates', () => {
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/stories/DOC-001.md': story({ id: 'DOC-001', changeType: 'DOC_ONLY', rows: [], classificationReason: 'Only prose in docs/ changes; no product code is touched.' }),
  });
  const r = runJson(dir, ['next']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.recommendedAction.id, 'start-next-change');
  // The N/A decision is recorded rather than silently skipped.
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'DOC-001', '--to', 'IN_REVIEW']).code, 0);
  const event = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  assert.deepEqual(event.notApplicableGates.sort(), [
    'activation', 'architecture-ready', 'discovery-ready', 'iteration-ready', 'prd-ready',
    'release-ready', 'requirements-ready', 'story-ready', 'telemetry-ready', 'ux-ready', 'verified',
  ]);
});

test('journey: a SPIKE may explore freely but can never reach MERGED', () => {
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/stories/SPIKE-007.md': story({
      id: 'SPIKE-007', changeType: 'SPIKE', rows: [],
      classificationReason: 'Two-day investigation of the queue option; nothing ships from it.',
    }),
  });
  // exploration is unguarded up to the last step
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST', 'VERIFIED']) {
    const r = run(dir, ['transition', '--scope', 'story', '--id', 'SPIKE-007', '--to', to]);
    assert.equal(r.code, 0, `${to}: ${r.out}`);
  }
  // ...and then promotion is refused, so relabelling work as a SPIKE is not a bypass
  const merge = run(dir, ['transition', '--scope', 'story', '--id', 'SPIKE-007', '--to', 'MERGED']);
  assert.equal(merge.code, 1, merge.out);
  assert.match(merge.out, /may never reach MERGED/);
  assert.match(merge.out, /FEATURE or BUGFIX/);
});

test('journey: switching every gate off requires a recorded justification', () => {
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/stories/DOC-002.md': story({ id: 'DOC-002', changeType: 'DOC_ONLY', rows: [] }),
  });
  const r = runJson(dir, ['next']);
  assert.equal(r.code, 2, r.out);
  assert.equal(r.json.recommendedAction.id, 'justify-classification');
  assert.match(JSON.stringify(r.json.blockers), /classificationReason/);
  const blocked = run(dir, ['transition', '--scope', 'story', '--id', 'DOC-002', '--to', 'IN_REVIEW']);
  assert.equal(blocked.code, 1, blocked.out);

  write(dir, 'docs/stories/DOC-002.md', story({
    id: 'DOC-002', changeType: 'DOC_ONLY', rows: [],
    classificationReason: 'Only prose in docs/ changes; no product behaviour is affected.',
  }));
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'DOC-002', '--to', 'IN_REVIEW']).code, 0);
});

test('journey: an undeclared change type is refused rather than defaulted into freedom', () => {
  const dir = project({
    '.eos/project.json': APP,
    'docs/prd.md': PRD,
    'docs/stories/X-1.md': story({ id: 'X-1', changeType: 'WHATEVER', rows: [] }),
  });
  const r = run(dir, ['transition', '--scope', 'story', '--id', 'X-1', '--to', 'IN_REVIEW']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not defined in workflow profile/);
});

// ---------------------------------------------------------------------------------------------
// eos-2.6.0 (D1 + D2, ADR-023): the path a one-person project takes to ship a release whose monthly
// availability target cannot be measured before shipping — and the three ways it must NOT work.
// ---------------------------------------------------------------------------------------------
const SOLO = { EOS_ACTOR: 'solo-dev' };
const deferralSummary = (dir, dueBy) => ({
  schemaVersion: 1, generatedAt: '2026-01-01T00:00:00.000Z', productTree: { digest: treeDigest(dir) },
  targets: [{ id: 'NFR1', category: 'availability', decision: 'DEFER', owner: '@platform', trigger: 'the first full month in production', dueBy }],
});
/** A merged story, a release candidate whose only NFR is deferred, ready for `verify-release`. */
function candidate(projectExtra, dueBy) {
  const dir = verifiedStory(releaseFiles({ '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node --version', audit: 'node --version' }, ...projectExtra } }));
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED'], SOLO).code, 0);
  write(dir, 'docs/evidence/nfr-summary.json', deferralSummary(dir, dueBy));
  writeManifest(dir, { releaseId: 'R-1' });
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'CANDIDATE'], SOLO).code, 0);
  run(dir, ['verify-release', '--release', 'R-1'], SOLO);
  return dir;
}
const toState = (dir, to) => run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', to], SOLO);

test('journey: a solo project ships with a bounded DEFERRED — labelled, bound to its list, and never PASS', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2999-01-31');
  const gate = runJson(dir, ['release-status', '--release', 'R-1'], SOLO);
  assert.equal(gate.json.checks.find((c) => c.id === 'nfr-evidence').status, 'DEFERRED');
  assert.notEqual(gate.code, 0, 'DEFERRED is never a green gate');

  assert.equal(toState(dir, 'VERIFIED').code, 0, 'the one deferral is bounded, so the candidate may be promoted');

  // The person who prepared the candidate cannot approve it, and cannot self-approve without saying why.
  const plain = run(dir, ['approve', '--scope', 'release', '--id', 'R-1'], SOLO);
  assert.equal(plain.code, 1);
  assert.match(plain.out, /record it yourself with --self --reason/);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self'], SOLO).code, 1, '--self needs a reason');

  const approved = run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO);
  assert.equal(approved.code, 0, approved.out);
  assert.match(approved.out, /NFR1 {2}owner @platform {2}due by 2999-01-31/, 'the full deferred list is printed before the approval is recorded');
  assert.match(approved.out, /SELF-APPROVAL/);
  const event = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.type === 'approval').at(-1);
  assert.equal(event.assurance, 'self');
  assert.deepEqual(event.deferred, [{ id: 'NFR1', owner: '@platform', trigger: 'the first full month in production', dueBy: '2999-01-31' }]);
  assert.match(event.deferredDigest, /^[0-9a-f]{64}$/);

  assert.equal(toState(dir, 'APPROVED').code, 0);
  assert.equal(toState(dir, 'RELEASED').code, 0);

  // After the release the deferral is on record: status keeps saying DEFERRED, next says when it is due.
  const health = run(dir, ['health'], SOLO).out;
  assert.match(health, /DEFERRED {2}NFR1 → @platform, due by 2999-01-31 \(accepted by solo-dev, a self-approval\)/);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-1' });
  const next = runJson(dir, ['next'], SOLO).json.recommendedAction.doneWhen.join('\n');
  assert.match(next, /measure the deferred NFR target NFR1 \(owner @platform, due by 2999-01-31\)/);
  assert.equal(run(dir, ['ledger', '--verify']).code, 0);
});

test('journey: a deferral whose dueBy has passed is a FAIL, and cannot be promoted', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2020-01-31');
  const nfr = runJson(dir, ['release-status', '--release', 'R-1'], SOLO).json.checks.find((c) => c.id === 'nfr-evidence');
  assert.equal(nfr.status, 'FAIL');
  assert.match(nfr.detail, /overdue/);
  const refused = toState(dir, 'VERIFIED');
  assert.equal(refused.code, 1);
  assert.match(refused.out, /release-ready/);
});

test('journey: a controlled (or regulated) release is never promoted with a deferral', () => {
  const dir = candidate({ workflowProfile: 'controlled' }, '2999-01-31');
  const refused = toState(dir, 'VERIFIED');
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /never promoted with a deferred check/);
});

test('journey: an approval is bound to the deferred list — change the list and it must be given again', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2999-01-31');
  assert.equal(toState(dir, 'VERIFIED').code, 0);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO).code, 0);
  write(dir, 'docs/evidence/nfr-summary.json', deferralSummary(dir, '2999-06-30'));
  const refused = toState(dir, 'APPROVED');
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /list of deferred NFR targets changed after it was approved/);
});

test('journey: --self is refused unless the project declared the solo path', () => {
  const dir = candidate({}, '2999-01-31');
  assert.equal(toState(dir, 'VERIFIED').code, 0);
  const r = run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO);
  assert.equal(r.code, 1);
  assert.match(r.out, /--self needs approvalMode "solo"/);
});
