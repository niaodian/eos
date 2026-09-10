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
import { project, write, run, runJson, cleanup, story, commitAll, treeDigest,
  baselineFiles, storyFiles, testRun, TEST_FILE, TRACE_MATRIX } from './test-support.mjs';

after(cleanup);

const PRD = '# PRD\n\n## Login (FR1)\n\n- AC1.1 the user can log in with a valid password\n- AC1.2 the user can log out and the session is destroyed\n';
const TRACE = ['| AC | Test | Result |', '| --- | --- | --- |',
  '| AC1.1 | tests/login.test.mjs::valid password | PASS |',
  '| AC1.2 | tests/logout.test.mjs::clears the session | PASS |', ''].join('\n');
const RUN = testRun({
  acs: [], testPath: 'tests/login.test.mjs',
});
const TWO_AC_RUN = {
  ...RUN,
  results: [
    { ac: 'AC1.1', testPath: 'tests/login.test.mjs', selector: 'valid password', status: 'PASS' },
    { ac: 'AC1.2', testPath: 'tests/logout.test.mjs', selector: 'clears the session', status: 'PASS' },
  ],
};
const LOGOUT_TEST = "import { test } from 'node:test';\ntest('clears the session', () => {});\n";
const APP = {
  projectType: 'application', stacks: ['node'], productParadigms: ['deterministic'],
  workflowProfile: 'standard-product', commands: { test: 'node --version' },
};
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
  assert.equal(r.json.recommendedAction.id, 'complete-local-activation');
  assert.equal(r.code, 2);
  assert.match(JSON.stringify(r.json.blockers), /config-only/);
});

test('journey: the full loop from a blocked story to a merged story and a release verdict', () => {
  const dir = project(baselineFiles({
    '.eos/project.json': APP,
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

  write(dir, 'docs/trace-matrix.md', TRACE);
  write(dir, 'docs/evidence/test-run.json', { ...TWO_AC_RUN, productTree: { digest: treeDigest(dir) } });
  const verified = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-012']);
  assert.equal(verified.code, 0, verified.out);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'VERIFIED']).code, 0);

  // 7. an input moves: the recorded PASS becomes STALE and the merge is refused
  write(dir, 'docs/prd.md', PRD + '- AC1.3 the user can reset a password from the sign-in page\n');
  const blockedMerge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED']);
  assert.equal(blockedMerge.code, 1);
  assert.match(blockedMerge.out, /STALE/);

  // 8. the recovery path is spelled out, not left to the developer to guess
  const stale = runJson(dir, ['next']);
  assert.equal(stale.json.recommendedAction.id, 'refresh-stale-evidence');
  assert.match(stale.json.recommendedAction.command, /check --gate story-ready --scope STORY-012/);
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-012']).code, 0);

  // ...but re-running the GATE is not enough on its own: the recorded test results still describe
  // the tree as it was, and EOS says so rather than re-blessing them.
  const notYet = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-012']);
  assert.notEqual(notYet.code, 0, notYet.out);
  assert.match(JSON.stringify(notYet.json.checks.find((c) => c.id === 'trace-complete')), /does not describe this code/);

  // The tests have to run again — which is what a real runner does when it rewrites the summary.
  write(dir, 'docs/evidence/test-run.json', { ...TWO_AC_RUN, productTree: { digest: treeDigest(dir) } });
  assert.equal(run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-012']).code, 0);
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
