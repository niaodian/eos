// EOS next-best-action routing matrix — table-driven fixtures, executed through the CLI so the
// JSON contract that eos-guide / the prompts / the VS Code tasks consume is what gets asserted.
//   node --test .github/eos/router.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, EOS_DIR, APP_PROJECT, PRD_2AC, story } from './test-support.mjs';

after(cleanup);

const matrix = JSON.parse(readFileSync(join(EOS_DIR, 'fixtures/routing-matrix.json'), 'utf8'));

/** Resolve the fixture DSL: "@APP"/"@PRD" constants, { _story } builders, raw strings and JSON. */
function materialize(spec) {
  if (spec === '@APP') return APP_PROJECT;
  if (spec === '@PRD') return PRD_2AC;
  if (spec && typeof spec === 'object' && spec._story) return story(spec._story);
  return spec;
}

function build(c) {
  const files = {};
  for (const [rel, spec] of Object.entries(c.files || {})) {
    files[rel === '@project' ? '.eos/project.json' : rel] = materialize(spec);
  }
  const dir = project(files, { withGovernance: c.governance !== false, withHooks: !!c.hooks });
  for (const [gate, scope] of c.checks || []) run(dir, ['check', '--gate', gate, '--scope', scope]);
  for (const [scopeType, id, to] of c.transitions || []) {
    const r = run(dir, ['transition', '--scope', scopeType, '--id', id, '--to', to]);
    assert.equal(r.code, 0, `fixture setup transition ${id} → ${to} failed:\n${r.out}`);
  }
  return dir;
}

for (const c of matrix.cases) {
  test(`route: ${c.name}`, () => {
    const dir = build(c);
    const r = runJson(dir, ['next']);
    assert.ok(r.json, `expected JSON on stdout, got:\n${r.out}`);
    const a = r.json.recommendedAction;
    assert.ok(a, `expected a recommendedAction:\n${r.out}`);
    assert.equal(a.id, c.expectedAction, `wrong action for "${c.name}":\n${JSON.stringify(r.json, null, 2)}`);
    assert.equal(r.code, c.expectedExitCode, `wrong exit code for "${c.name}":\n${r.out}`);
    if (c.expectedAgent) assert.equal(a.copilotAgent, c.expectedAgent);
    if (c.expectedPrompt) assert.equal(a.copilotPrompt, c.expectedPrompt);
    if (c.expectedSkill) assert.ok(a.skills.includes(c.expectedSkill), `skills: ${a.skills.join(',')}`);
    if (c.expectBlocker) {
      const hay = r.json.blockers.map((b) => `${b.gate}/${b.check} ${b.detail}`).join(' | ');
      assert.match(hay, new RegExp(c.expectBlocker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    // Contract invariants that hold for EVERY routing decision.
    assert.equal(r.json.schemaVersion, 1);
    assert.ok(a.doneWhen.length >= 1, 'every action must say when it is done');
    assert.ok(a.command.length > 0, 'every action must offer a runnable command');
    assert.equal(r.json.exitCode, r.code, 'the JSON exitCode must equal the process exit code');
  });
}

test('routing is deterministic — the same repository state routes identically twice', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }),
  });
  const a = runJson(dir, ['next']).json;
  const b = runJson(dir, ['next']).json;
  delete a.generatedAt; delete b.generatedAt;
  assert.deepEqual(a, b);
});

test('default output shows exactly one recommendation; --all reveals the alternatives', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }),
  });
  const plain = run(dir, ['next']);
  assert.doesNotMatch(plain.out, /Alternatives/i);
  const all = run(dir, ['next', '--all']);
  assert.match(all.out, /Alternatives/i);
  assert.ok(runJson(dir, ['next', '--all']).json.alternatives.length >= 1);
});

test('--why explains the rule without printing the manual', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const why = run(dir, ['next', '--why']);
  assert.match(why.out, /Why/);
  assert.ok(why.out.split('\n').length < 60, 'progressive disclosure: --why stays short');
});

test('the active scope from .eos/local/active-work.json wins over story order', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story({ id: 'STORY-001' }),
    'docs/stories/STORY-002.md': story({ id: 'STORY-002', rows: [['AC1.2', 'log out', '—', '—']] }),
    '.eos/local/active-work.json': { schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-002', changeType: 'FEATURE' },
  });
  const r = runJson(dir, ['next']);
  assert.equal(r.json.current.scopeId, 'STORY-002');
  assert.equal(r.json.recommendedAction.id, 'design-acceptance-tests');
});

test('local active work never carries authority: a gate status in it is ignored', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }),
    '.eos/local/active-work.json': { schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-001', changeType: 'FEATURE', gateStatus: 'PASS' },
  });
  const r = runJson(dir, ['next']);
  assert.equal(r.code, 2, r.out);
  assert.equal(r.json.recommendedAction.id, 'design-acceptance-tests');
});

test('local active work cannot reclassify a story into a gate-free change type', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    // no changeType in the story front matter — the strictest default must apply
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }).replace('changeType: FEATURE\n', ''),
    '.eos/local/active-work.json': { schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-001', changeType: 'DOC_ONLY' },
  });
  const r = runJson(dir, ['next']);
  assert.equal(r.json.current.changeType, 'FEATURE', 'an untracked local file must not classify a story');
  assert.equal(r.json.recommendedAction.id, 'design-acceptance-tests');
  assert.equal(r.code, 2, r.out);
});

test('a story that is MERGED hands the focus back to the next change', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-001.md': story(),
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | login.test.mjs | ✅ |\n',
  }, { withHooks: true });
  const steps = ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST', 'VERIFIED', 'MERGED'];
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  for (const to of steps) {
    if (to === 'VERIFIED') run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
    const r = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', to]);
    assert.equal(r.code, 0, `${to}: ${r.out}`);
  }
  const r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'start-next-change');
  assert.equal(r.code, 0);
});
