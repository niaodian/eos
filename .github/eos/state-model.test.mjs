// EOS state-model regression tests — schemas, transition table, evidence freshness, waivers,
// append-only ledger. Zero deps (node:test):
//   node --test .github/eos/state-model.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, APP_PROJECT, PRD_2AC, story, EOS_DIR,
  baselineFiles, storyFiles, testRun, commitAll, git, TEST_FILE, TRACE_MATRIX } from './test-support.mjs';
import { validate } from './lib/schema.mjs';
import { loadWorkflow, loadGates, loadAgentMap } from './lib/registry.mjs';
import { readSnapshot, gateCollections, parsePorcelain } from './lib/state.mjs';
import { testDurationTrend } from './lib/test-history.mjs';
import { legalTransitions, planTransition } from './lib/transitions.mjs';
import { readEvents, appendEvent, verifyChain, stateOf, hashEvent, reconcileEvents, HASH_SCHEME } from './lib/ledger.mjs';
import { evidenceFreshness } from './lib/evidence.mjs';
import { waiverStatus } from './lib/waivers.mjs';

after(cleanup);

// ---------------------------------------------------------------- schemas
test('schema: the shipped workflow / gates / agent-map files validate against their schemas', () => {
  const dir = project();
  const wf = loadWorkflow(dir);
  const gates = loadGates(dir);
  const map = loadAgentMap(dir);
  assert.deepEqual(wf.errors, [], wf.errors.join('\n'));
  assert.deepEqual(gates.errors, [], gates.errors.join('\n'));
  assert.deepEqual(map.errors, [], map.errors.join('\n'));
});

test('schema: the shipped .eos/project.json validates against project.schema.json', () => {
  // The loader (hooks/lib/project-config.mjs) is what enforces the contract at runtime; this keeps
  // the published schema — which editors and humans read — from silently drifting away from it.
  const root = join(EOS_DIR, '..', '..');
  const schema = JSON.parse(readFileSync(join(root, '.eos/schemas/project.schema.json'), 'utf8'));
  const data = JSON.parse(readFileSync(join(root, '.eos/project.json'), 'utf8'));
  const v = validate(schema, data, { label: '.eos/project.json' });
  assert.equal(v.valid, true, v.errors.join('\n'));
});

test('schema: an unknown key is rejected (additionalProperties=false)', () => {
  const schema = { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } };
  const bad = validate(schema, { a: 'x', b: 1 });
  assert.equal(bad.valid, false);
  assert.match(bad.errors.join(' '), /b/);
});

test('schema: enum, pattern, minItems and $ref are enforced', () => {
  const schema = {
    type: 'object',
    required: ['kind', 'ids'],
    properties: {
      kind: { enum: ['a', 'b'] },
      ids: { type: 'array', minItems: 1, items: { $ref: '#/$defs/id' } },
    },
    $defs: { id: { type: 'string', pattern: '^[A-Z]+-\\d+$' } },
  };
  assert.equal(validate(schema, { kind: 'a', ids: ['STORY-1'] }).valid, true);
  assert.equal(validate(schema, { kind: 'c', ids: ['STORY-1'] }).valid, false);
  assert.equal(validate(schema, { kind: 'a', ids: [] }).valid, false);
  assert.equal(validate(schema, { kind: 'a', ids: ['nope'] }).valid, false);
  assert.equal(validate(schema, { kind: 'a' }).valid, false);
});

test('schema: a corrupt .eos/workflow.json is an ERROR, never an empty pass', () => {
  const dir = project({ '.eos/workflow.json': '{ not json' });
  const wf = loadWorkflow(dir);
  assert.equal(wf.workflow, null);
  assert.ok(wf.errors.length);
  const { code, out } = run(dir, ['status']);
  assert.equal(code, 3, out);
  assert.match(out, /ERROR/);
});

// ---------------------------------------------------------------- transition table
test('transitions: every declared transition is reachable from the initial state', () => {
  const { workflow } = loadWorkflow(project());
  for (const [name, machine] of Object.entries(workflow.stateMachines)) {
    const seen = new Set([machine.initial]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of machine.transitions) {
        if (seen.has(t.from) && !seen.has(t.to)) { seen.add(t.to); grew = true; }
      }
    }
    for (const s of machine.states) assert.ok(seen.has(s), `${name}: ${s} unreachable`);
  }
});

test('transitions: legalTransitions only returns states declared in the machine', () => {
  const { workflow } = loadWorkflow(project());
  const next = legalTransitions(workflow, 'story', 'IN_REVIEW').map((t) => t.to);
  assert.deepEqual(next.sort(), ['DRAFT', 'READY_FOR_DEV']);
});

test('transitions: an illegal jump is rejected with the legal set named', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(),
  });
  const { code, out } = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(code, 1, out);
  assert.match(out, /illegal/i);
  assert.match(out, /IN_REVIEW/);
});

test('transitions: an unknown target state is rejected, not silently accepted', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  const { code, out } = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'SHIPPED']);
  assert.equal(code, 1, out);
  assert.match(out, /unknown state/i);
});

test('transitions: a story or release that does not exist is refused and nothing is recorded', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  const ghostStory = run(dir, ['transition', '--scope', 'story', '--id', 'GHOST-999', '--to', 'IN_REVIEW']);
  assert.equal(ghostStory.code, 1, ghostStory.out);
  assert.match(ghostStory.out, /no story "GHOST-999" exists/);
  const ghostRelease = run(dir, ['transition', '--scope', 'release', '--id', 'GHOST-REL', '--to', 'CANDIDATE']);
  assert.equal(ghostRelease.code, 1, ghostRelease.out);
  assert.match(ghostRelease.out, /no release "GHOST-REL" exists/);
  assert.deepEqual(readEvents(dir).events, [], 'a refused transition must leave no event in the append-only ledger');
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']).code, 0, 'a real story is unaffected');
});

test('transitions: a rollback edge is legal and recorded as a rollback', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']).code, 0);
  const back = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'DRAFT']);
  assert.equal(back.code, 0, back.out);
  const events = readEvents(dir).events;
  assert.equal(events.at(-1).to, 'DRAFT');
});

test('transitions: a gate-guarded transition is refused while the gate has never run', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC, 'docs/stories/STORY-001.md': story() });
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']);
  const { code, out } = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']);
  assert.equal(code, 1, out);
  assert.match(out, /story-ready/);
});

test('transitions: planTransition reports the guard that is missing without mutating anything', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const { workflow } = loadWorkflow(dir);
  const plan = planTransition({ workflow, root: dir }, { scopeType: 'story', from: 'IN_REVIEW', to: 'READY_FOR_DEV' });
  assert.equal(plan.legal, true);
  assert.equal(plan.transition.requiresGate, 'story-ready');
  assert.equal(existsSync(join(dir, '.eos/ledger/events.jsonl')), false);
});

// ---------------------------------------------------------------- ledger
test('ledger: the hash chain detects a rewritten earlier line', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'DRAFT']);
  assert.equal(run(dir, ['ledger', '--verify']).code, 0);

  const p = join(dir, '.eos/ledger/events.jsonl');
  const lines = readFileSync(p, 'utf8').trim().split('\n');
  const first = JSON.parse(lines[0]);
  first.to = 'MERGED'; // tamper
  lines[0] = JSON.stringify(first);
  writeFileSync(p, lines.join('\n') + '\n');

  const { code, out } = run(dir, ['ledger', '--verify']);
  assert.equal(code, 1, out);
  assert.match(out, /chain|tamper|hash/i);
});

test('ledger: a deleted line breaks the chain', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_REVIEW']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'DRAFT']);
  const p = join(dir, '.eos/ledger/events.jsonl');
  const lines = readFileSync(p, 'utf8').trim().split('\n');
  writeFileSync(p, lines.slice(1).join('\n') + '\n');
  assert.equal(run(dir, ['ledger', '--verify']).code, 1);
});

test('ledger: appended garbage is an error, not a silent skip', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  write(dir, '.eos/ledger/events.jsonl', '{"seq":1}\n');
  appendFileSync(join(dir, '.eos/ledger/events.jsonl'), 'not-json\n');
  assert.equal(run(dir, ['ledger', '--verify']).code, 1);
});

test('ledger: every field of an event is hashed — rewriting an approval\'s assurance or deferred list breaks the chain', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  appendEvent(dir, { type: 'approval', scope: { type: 'release', id: 'R-1' }, assurance: 'self', deferredDigest: 'a'.repeat(64), deferred: [{ id: 'NFR-1', owner: 'pat', trigger: 'launch', dueBy: '2026-12-01' }] });
  assert.equal(readEvents(dir).events[0].hv, HASH_SCHEME);
  const p = join(dir, '.eos/ledger/events.jsonl');
  const original = readFileSync(p, 'utf8');
  for (const rewrite of [(e) => { e.assurance = 'independent'; }, (e) => { e.deferred[0].owner = 'someone-else'; }, (e) => { delete e.deferredDigest; }, (e) => { e.hv = undefined; }]) {
    const e = JSON.parse(original);
    rewrite(e);
    writeFileSync(p, `${JSON.stringify(e)}\n`);
    const { events } = readEvents(dir);
    assert.equal(verifyChain(events).ok, false, JSON.stringify(e));
  }
});

test('ledger: an event hashed before eos-2.6.1 still verifies, but the chain may not step back to it', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const legacy = { seq: 1, ts: '2026-10-01T00:00:00.000Z', type: 'approval', scope: { type: 'release', id: 'R-1' }, actor: 'pat', assurance: 'independent', prevHash: null };
  legacy.hash = hashEvent(legacy);
  write(dir, '.eos/ledger/events.jsonl', `${JSON.stringify(legacy)}\n`);
  assert.equal(verifyChain(readEvents(dir).events).ok, true, 'an existing ledger must keep verifying');
  appendEvent(dir, { type: 'note', scope: { type: 'product', id: 'product' } });
  const events = readEvents(dir).events;
  assert.equal(verifyChain(events).ok, true);
  assert.equal(events[1].hv, HASH_SCHEME);

  const stepBack = { seq: 3, ts: '2026-10-02T00:00:00.000Z', type: 'note', scope: { type: 'product', id: 'product' }, actor: 'x', prevHash: events[1].hash };
  stepBack.hash = hashEvent(stepBack);
  const chain = verifyChain([...events, stepBack]);
  assert.equal(chain.ok, false);
  assert.match(chain.problems.join('\n'), /hash scheme went back/);
});

test('ledger: replaying a conflicted ledger keeps every field, including the ones scheme 1 never hashed', () => {
  const approval = { seq: 1, ts: '2026-10-01T00:00:00.000Z', type: 'approval', scope: { type: 'release', id: 'R-1' }, actor: 'pat', assurance: 'self', deferredDigest: 'b'.repeat(64), deferred: [{ id: 'NFR-1', owner: 'pat', trigger: 't', dueBy: '2026-12-01' }], prevHash: null };
  approval.hash = hashEvent(approval);
  const [replayed] = reconcileEvents([[approval]]);
  assert.equal(replayed.assurance, 'self');
  assert.deepEqual(replayed.deferred, approval.deferred);
  assert.equal(replayed.hv, HASH_SCHEME);
  assert.equal(verifyChain([replayed]).ok, true);
});

test('ledger: stateOf falls back to the machine initial state when there is no event', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const { workflow } = loadWorkflow(dir);
  assert.equal(stateOf(readEvents(dir).events, workflow, 'story', 'STORY-404'), 'DRAFT');
});

test('ledger: appendEvent is append-only — earlier lines are byte-identical afterwards', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  appendEvent(dir, { type: 'gate', scope: { type: 'story', id: 'S1' }, gate: 'story-ready', status: 'FAIL' });
  const before = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8');
  appendEvent(dir, { type: 'gate', scope: { type: 'story', id: 'S1' }, gate: 'story-ready', status: 'PASS' });
  const after = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8');
  assert.ok(after.startsWith(before), 'previous ledger bytes must be untouched');
  assert.equal(verifyChain(readEvents(dir).events).ok, true);
});

// ---------------------------------------------------------------- evidence freshness
test('evidence: a PASS becomes STALE when an input file changes', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(),
  });
  const first = run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.equal(first.code, 0, first.out);

  write(dir, 'docs/stories/STORY-001.md', story({ rows: [['AC1.1', 'changed statement', 'tests/login.test.mjs::x', '—']] }));
  const ev = JSON.parse(readFileSync(join(dir, '.eos/evidence/story-ready__story__STORY-001.json'), 'utf8'));
  assert.equal(evidenceFreshness(dir, ev).status, 'STALE');
});

// The 20-story backlog problem: binding the WHOLE PRD made every story's readiness stale whenever
// any criterion anywhere moved, so specifying a backlog up front cost a re-run per story. Both
// gates that read the PRD under a story scope only ask about that story's own ids, so staleness
// must follow the cited criteria — no wider, and no narrower.
test('evidence: story readiness tracks the criteria the story CITES, not the whole PRD', () => {
  const files = {
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(), // cites AC1.1 only
  };
  const freshnessAfter = (prd) => {
    const dir = project(files);
    assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);
    write(dir, 'docs/prd.md', prd);
    const snapshot = readSnapshot(dir, { withGit: false });
    const ev = JSON.parse(readFileSync(join(dir, '.eos/evidence/story-ready__story__STORY-001.json'), 'utf8'));
    return evidenceFreshness(dir, ev, {
      collections: gateCollections(snapshot, 'story-ready', 'story', 'STORY-001'),
    });
  };

  // An unrelated criterion is added: nothing this story claims has changed.
  assert.equal(freshnessAfter(`${PRD_2AC}- AC1.3 the user can reset a password from the sign-in page\n`).status, 'FRESH');

  // An unrelated criterion is REWRITTEN: still nothing this story claims.
  assert.equal(freshnessAfter(PRD_2AC.replace('the user can log out and the session is destroyed', 'the user can log out from every device at once')).status, 'FRESH');

  // The cited criterion is rewritten: the story was made ready against different words.
  const rewritten = freshnessAfter(PRD_2AC.replace('the user can log in with a valid password', 'the user can log in with a passkey only'));
  assert.equal(rewritten.status, 'STALE');
  assert.match(rewritten.reasons.join(' '), /referencedAcs/);

  // The cited criterion is DELETED: absence has to count as a change, or a story could stay "ready"
  // against a criterion the PRD no longer makes.
  const deleted = freshnessAfter(PRD_2AC.replace('- AC1.1 the user can log in with a valid password\n', ''));
  assert.equal(deleted.status, 'STALE');
});

test('evidence: a PASS becomes STALE when the gate definition version changes (governance change)', () => {  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(),
  });
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);
  const gates = JSON.parse(readFileSync(join(dir, '.eos/gates.json'), 'utf8'));
  for (const g of gates.gates) if (g.id === 'story-ready') g.version = '2.0.0';
  writeFileSync(join(dir, '.eos/gates.json'), JSON.stringify(gates, null, 2));
  const ev = JSON.parse(readFileSync(join(dir, '.eos/evidence/story-ready__story__STORY-001.json'), 'utf8'));
  const f = evidenceFreshness(dir, ev);
  assert.equal(f.status, 'STALE');
  assert.match(f.reasons.join(' '), /gates\.json|definition/i);
});

test('evidence: a story cannot be MERGED on stale evidence', () => {
  const dir = project(storyFiles(), { withHooks: true });
  for (const to of ['IN_REVIEW']) run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', to]);
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_DEV']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'IN_DEVELOPMENT']);
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'READY_FOR_TEST']);
  const verified = run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.equal(verified.code, 0, verified.out);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'VERIFIED']).code, 0);
  // now change an input so the evidence goes stale, then try to merge
  write(dir, 'docs/prd.md', PRD_2AC + '\n- AC1.3 the user can reset a password\n');
  const merge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(merge.code, 1, merge.out);
  assert.match(merge.out, /STALE/);
});

// ---------------------------------------------------------------- waivers
test('waiver: expired is not honored', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const w = {
    schemaVersion: 1,
    gate: 'story-ready',
    scope: { type: 'story', id: 'STORY-001' },
    reason: 'Production outage; readiness review deferred by 24h.',
    riskOwner: 'ops-lead',
    requestedBy: 'dev-a',
    approver: 'cto',
    expiresOn: '2000-01-01',
    compensatingControls: ['manual smoke test'],
  };
  const s = waiverStatus(w, { gateId: 'story-ready', scopeType: 'story', scopeId: 'STORY-001', now: new Date() });
  assert.equal(s.honored, false);
  assert.match(s.reason, /expired/i);
});

test('waiver: self-approval is not honored', () => {
  const w = {
    schemaVersion: 1,
    gate: 'story-ready',
    scope: { type: 'story', id: 'STORY-001' },
    reason: 'Production outage; readiness review deferred by 24h.',
    riskOwner: 'dev-a',
    requestedBy: 'dev-a',
    approver: 'dev-a',
    expiresOn: '2999-01-01',
    compensatingControls: ['manual smoke test'],
  };
  const s = waiverStatus(w, { gateId: 'story-ready', scopeType: 'story', scopeId: 'STORY-001', now: new Date() });
  assert.equal(s.honored, false);
  assert.match(s.reason, /approver/i);
});

test('waiver: a "<name> (self)" approver is honored in a solo project, labelled, and only there (eos-2.6.0)', () => {
  const w = {
    schemaVersion: 1,
    gate: 'story-ready',
    scope: { type: 'story', id: 'STORY-001' },
    reason: 'Production outage; readiness review deferred by 24h.',
    riskOwner: 'dev-a',
    requestedBy: 'dev-a',
    approver: 'dev-a (self)',
    assurance: 'self',
    expiresOn: '2999-01-01',
    compensatingControls: ['manual smoke test'],
  };
  const at = { gateId: 'story-ready', scopeType: 'story', scopeId: 'STORY-001', now: new Date() };
  const independent = waiverStatus(w, at);
  assert.equal(independent.honored, false);
  assert.match(independent.reason, /needs approvalMode "solo"/);
  const solo = waiverStatus(w, { ...at, solo: true });
  assert.equal(solo.honored, true);
  assert.equal(solo.assurance, 'self');
  assert.match(solo.reason, /self-approval/);
  assert.equal(waiverStatus({ ...w, approver: 'dev-a' }, { ...at, solo: true }).honored, false, 'unlabelled is still the requester approving');
});

test('waiver: a valid waiver turns a FAIL into WAIVED for a waivable gate only', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story({ changeType: 'HOTFIX', rows: [['AC1.1', 'user can log in', '—', '—']] }),
    '.eos/waivers/hotfix-story-ready.json': {
      schemaVersion: 1,
      gate: 'story-ready',
      scope: { type: 'story', id: 'STORY-001' },
      reason: 'Production outage; the readiness review is deferred for 24 hours.',
      riskOwner: 'ops-lead',
      requestedBy: 'dev-a',
      approver: 'cto',
      expiresOn: '2999-01-01',
      compensatingControls: ['manual smoke test on staging', 'post-incident story within 3 days'],
    },
  });
  const r = runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.equal(r.json.status, 'WAIVED', r.out);
  assert.equal(r.code, 0);
});

test('waiver: a non-waivable gate stays FAIL even with a perfect waiver', () => {
  const dir = project({
    '.eos/project.json': { ...APP_PROJECT, projectType: 'config-only', stacks: [], commands: undefined },
    'docs/stories/STORY-001.md': story(),
    '.eos/waivers/verified.json': {
      schemaVersion: 1,
      gate: 'verified',
      scope: { type: 'story', id: 'STORY-001' },
      reason: 'We would very much like to ship without running any tests at all.',
      riskOwner: 'ops-lead',
      requestedBy: 'dev-a',
      approver: 'cto',
      expiresOn: '2999-01-01',
      compensatingControls: ['hope'],
    },
  }, { withHooks: true });
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.json.status, 'WAIVED', r.out);
  assert.notEqual(r.code, 0);
});

// ---------------------------------------------------------------- cross-platform paths
test('paths: evidence and story lookup work with backslash-style relative input', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(),
  });
  const r = runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.equal(r.code, 0, r.out);
  for (const input of r.json.evidence.inputs) {
    assert.ok(!input.path.includes('\\'), `evidence paths must be POSIX-normalized: ${input.path}`);
  }
});

// ---------------------------------------------------------------- changed-file detection
// `git status --porcelain` puts TWO status columns before the path, and either may be a space:
// a plain modified file is " M path". The reader used to trim the whole output first, which ate
// that leading space on the FIRST line only — so slice(3) cut one character too many and
// ".eos/workflow.json" was reported as "eos/workflow.json". Silent, and wrong in exactly the most
// common case: every consumer (stale-evidence detection, `status --changed`, `verify`) then
// failed to match the file against anything.
test('parsePorcelain keeps a leading dot on the first modified file', () => {
  assert.deepEqual(parsePorcelain(' M .eos/workflow.json\n'), ['.eos/workflow.json']);
});

test('parsePorcelain handles every status column combination', () => {
  const raw = [' M docs/prd.md', 'M  src/a.ts', 'A  src/b.ts', '?? untracked.md', 'MM both.ts', ' D gone.ts'].join('\n');
  assert.deepEqual(parsePorcelain(raw), ['docs/prd.md', 'src/a.ts', 'src/b.ts', 'untracked.md', 'both.ts', 'gone.ts']);
});

test('parsePorcelain reports the destination of a rename, which is the file that exists now', () => {
  assert.deepEqual(parsePorcelain('R  docs/old.md -> docs/new.md'), ['docs/new.md']);
});

test('parsePorcelain unquotes a path git chose to quote', () => {
  assert.deepEqual(parsePorcelain(' M "docs/a b.md"'), ['docs/a b.md']);
});

test('parsePorcelain distinguishes "no git" from "nothing changed"', () => {
  assert.equal(parsePorcelain(null), null, 'null means EOS cannot see the change set and must skip nothing');
  assert.deepEqual(parsePorcelain(''), [], 'empty means a clean tree');
});

test('a real modified governance file is detected end to end', () => {
  const dir = project(baselineFiles());
  commitAll(dir, 'baseline');
  write(dir, '.eos/workflow.json', JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8')));
  writeFileSync(join(dir, 'docs/prd.md'), PRD_2AC + '\nedited\n', 'utf8');
  const snap = readSnapshot(dir);
  assert.ok(snap.changedFiles.includes('docs/prd.md'), JSON.stringify(snap.changedFiles));
});

// ---------------------------------------------------------------- local test-duration trend (#14)
test('the test-duration trend compares medians of the last five runs with the five before', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { git: false });
  const lines = [];
  for (let i = 0; i < 10; i += 1) lines.push(JSON.stringify({ ts: `2026-01-0${i}`, layers: { unit: i < 5 ? 1000 : 1500 } }));
  write(dir, '.eos/local/test-history.jsonl', `${lines.join('\n')}\n`);
  const t = testDurationTrend(dir);
  assert.equal(t.runs, 10);
  assert.equal(t.layers.unit.previousMedianMs, 1000);
  assert.equal(t.layers.unit.recentMedianMs, 1500);
  assert.equal(t.layers.unit.changePct, 50);
});

test('with too little history the trend says so instead of inventing a change', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { git: false });
  write(dir, '.eos/local/test-history.jsonl', `${JSON.stringify({ layers: { unit: 900 } })}\nnot json\n`);
  const t = testDurationTrend(dir);
  assert.equal(t.layers.unit.changePct, null, 'one run is not a trend');
  assert.equal(t.runs, 1, 'a torn line is skipped, never fatal');
});
