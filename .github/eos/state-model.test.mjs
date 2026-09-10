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
import { legalTransitions, planTransition } from './lib/transitions.mjs';
import { readEvents, appendEvent, verifyChain, stateOf } from './lib/ledger.mjs';
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

test('evidence: a PASS becomes STALE when the gate definition version changes (governance change)', () => {
  const dir = project({
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
