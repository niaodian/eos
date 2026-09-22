// Incremental verification — run the gates a change can actually have affected.
//
// Every gate already declares its inputs; that declaration is how recorded evidence knows when it
// has gone stale. `eos verify` asks the same declaration a different question: given these changed
// files, which gates could possibly answer differently than last time?
//
// The property under test is NOT "it skips a lot". It is that skipping is only ever justified by
// evidence that is present AND fresh AND covers inputs that did not change. Everything else — no
// git, no evidence, stale evidence, a governance edit — must run. A governance tool that guesses
// "nothing changed" from silence is worse than one that is slow.
//
//   node --test .github/eos/incremental.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, commitAll, baselineFiles, story, APP_PROJECT } from './test-support.mjs';

after(cleanup);

/** A baseline product whose gates have all been run once, so evidence exists and is fresh. */
function verified() {
  const dir = project(baselineFiles(), { withHooks: true });
  run(dir, ['verify', '--full']);
  commitAll(dir, 'record evidence');
  return dir;
}

const planFor = (dir, args = []) => runJson(dir, ['verify', '--plan', ...args]).json;
const running = (plan) => plan.planned.filter((p) => p.run).map((p) => p.gate);

test('with fresh evidence and a clean tree, nothing needs re-verifying', () => {
  const plan = planFor(verified());
  assert.deepEqual(running(plan), [], JSON.stringify(plan.planned, null, 1));
});

test('changing one gate input selects that gate and leaves the others alone', () => {
  const dir = verified();
  write(dir, 'docs/discovery.md', '# Discovery\n\nrewritten after the gate ran.\n');
  const selected = running(planFor(dir));
  assert.ok(selected.includes('discovery-ready'), `expected discovery-ready, got ${selected.join(', ')}`);
  assert.ok(!selected.includes('activation'), 'an unrelated gate must not be dragged in');
});

test('changing a governance file invalidates every prior result by design', () => {
  const dir = verified();
  const workflow = JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'));
  // A real, schema-valid governance edit. The point is that the FILE changed, not what changed in
  // it: EOS invalidates prior results on any governance edit rather than trying to reason about
  // which edits could matter.
  workflow.version = '99.0.0';
  write(dir, '.eos/workflow.json', workflow);
  const plan = planFor(dir);
  assert.ok(plan, 'the edited governance file must still be valid, or this tests the wrong thing');
  const selected = running(plan);
  assert.ok(selected.length >= 2, `a governance edit must re-run broadly, got ${selected.join(', ')}`);
  assert.match(plan.planned.find((p) => p.run).reason, /governance changed/);
});

test('--full ignores the selection entirely', () => {
  const plan = planFor(verified(), ['--full']);
  assert.ok(running(plan).length >= 5, 'every applicable gate must be selected');
  for (const p of plan.planned.filter((x) => x.run)) assert.equal(p.reason, '--full');
});

test('with no git repository nothing may be skipped', () => {
  const dir = project(baselineFiles(), { withHooks: true, git: false });
  const plan = planFor(dir);
  assert.ok(running(plan).length > 0);
  assert.match(plan.planned.find((p) => p.run).reason, /change set is unknown/);
});

test('a gate with no recorded evidence is always run', () => {
  const plan = planFor(project(baselineFiles(), { withHooks: true }));
  assert.ok(running(plan).length > 0);
  assert.match(plan.planned.find((p) => p.run).reason, /no recorded evidence/);
});

test('a gate the change type declares not applicable is never run', () => {
  // A DOC_ONLY story switches every story gate off. "Not applicable" has to be a recorded decision
  // in the plan, not a gate that quietly never appears.
  const dir = project({
    ...baselineFiles(),
    'docs/stories/STORY-900.md': story({ id: 'STORY-900', changeType: 'DOC_ONLY', classificationReason: 'documentation only, no product behaviour changes' }),
  }, { withHooks: true });
  const plan = planFor(dir);
  const na = plan.planned.filter((p) => !p.run && /not applicable/.test(p.reason));
  assert.ok(na.length > 0, JSON.stringify(plan.planned, null, 1));
  assert.ok(na.some((p) => p.scopeId === 'STORY-900'), 'the DOC_ONLY story is the one that switches them off');
});

test('verify reports what it skipped, so a fast run is never a silent one', () => {
  const r = runJson(verified(), ['verify']);
  assert.equal(r.json.ran.length, 0);
  assert.ok(r.json.skipped.length > 0, 'the skipped set must be visible, not implied');
  for (const s of r.json.skipped) assert.match(s.reason, /FRESH|not applicable/);
});
