// Policy integrity — no gate gets weaker without a reason and a second person (#9).
//
// THE BYPASS THESE TESTS CLOSE: one edit to .eos/workflow.json switching `verified` from
// "required" to "not_applicable" for FEATURE work. Recorded evidence went STALE (governance edits
// invalidate it by design), re-running under the weaker rule PASSED, and nothing objected. The same
// went for .eos/project.json: "config-only" stops the product tests from running at all.
//
// Two layers of assertion: the classifier (every weakening is caught, prose is ignored, a
// strengthening is never demanded sign-off), and the real git flow a pull request goes through.
//
//   node --test .github/eos/policy.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, git, commitAll, cleanup, APP_PROJECT, REPO_ROOT } from './test-support.mjs';
import { policySnapshot, diffPolicy, policyDigest } from './lib/policy.mjs';
import { schemaTightenings } from './lib/schema-diff.mjs';

after(cleanup);

const shipped = () => ({
  gates: JSON.parse(readFileSync(join(REPO_ROOT, '.eos/gates.json'), 'utf8')),
  workflow: JSON.parse(readFileSync(join(REPO_ROOT, '.eos/workflow.json'), 'utf8')),
  project: { ...APP_PROJECT },
});
const clone = (x) => JSON.parse(JSON.stringify(x));
/** Diff the shipped policy against a mutated copy; return the changes needing acknowledgement. */
const flagged = (mutate) => {
  const before = shipped();
  const after = clone(before);
  mutate(after);
  return diffPolicy(policySnapshot(before), policySnapshot(after)).filter((c) => c.requiresAck);
};

// -------------------------------------------------------------------------- the classifier
test('switching a required gate off for a change type is a weakening', () => {
  const c = flagged((p) => { p.workflow.profiles['standard-product'].changeTypes.FEATURE.gates.verified = 'not_applicable'; });
  assert.equal(c.length, 1, JSON.stringify(c));
  assert.equal(c[0].kind, 'WEAKENING');
  assert.match(c[0].id, /FEATURE\/verified:required->not_applicable/);
});

test('deleting the gate key is the same weakening — a missing key means not_applicable', () => {
  const c = flagged((p) => { delete p.workflow.profiles['standard-product'].changeTypes.FEATURE.gates.verified; });
  assert.equal(c[0]?.kind, 'WEAKENING');
});

test('tightening a gate never demands sign-off', () => {
  assert.deepEqual(flagged((p) => { p.workflow.profiles['standard-product'].changeTypes.HOTFIX.gates['story-ready'] = 'required'; }), []);
});

test('rewording prose is not a policy change at all', () => {
  const before = shipped();
  const after = clone(before);
  after.gates.gates[0].title = 'a completely different title';
  after.gates.gates[0].summary = 'and summary';
  after.gates.gates[0].checks[0].fix = 'and fix text';
  after.workflow.profiles['standard-product'].description = 'reworded';
  assert.equal(policyDigest(policySnapshot(before)), policyDigest(policySnapshot(after)), 'a rewording must not demand a re-lock');
});

test('gate definition weakenings are caught', () => {
  const ids = (m) => flagged(m).map((c) => `${c.kind} ${c.id}`);
  assert.match(ids((p) => { p.gates.gates = p.gates.gates.filter((g) => g.id !== 'verified'); }).join(), /WEAKENING gate-removed:verified/);
  assert.match(ids((p) => { const g = p.gates.gates.find((x) => x.id === 'verified'); g.checks = g.checks.slice(1); }).join(), /WEAKENING check-removed:verified\//);
  assert.match(ids((p) => { p.gates.gates.find((x) => x.id === 'verified').waivable = true; }).join(), /WEAKENING gate-waivable:verified/);
  assert.match(ids((p) => { delete p.gates.gates.find((x) => x.id === 'verified').bindsProductTree; }).join(), /WEAKENING unbound-from-product-tree:verified/);
  assert.match(ids((p) => { p.gates.gates.find((x) => x.id === 'verified').checks[0].evaluator = 'somethingElse'; }).join(), /REVIEW evaluator-changed:verified\//);
});

test('state machine weakenings are caught', () => {
  const story = (p) => p.workflow.stateMachines.story.transitions;
  const ids = (m) => flagged(m).map((c) => `${c.kind} ${c.id}`).join();
  assert.match(ids((p) => { delete story(p).find((t) => t.requiresGate === 'verified').requiresGate; }), /WEAKENING transition-ungated:story:/);
  assert.match(ids((p) => { story(p).push({ from: 'IN_DEVELOPMENT', to: 'MERGED' }); }), /REVIEW transition-added:story:IN_DEVELOPMENT->MERGED/);
  assert.match(ids((p) => { delete p.workflow.stateMachines.release.transitions.find((t) => t.requiresSeparateApprover).requiresSeparateApprover; }),
    /WEAKENING transition-self-approval:release:/);
});

test('a new change type that skips what the default requires is an escape hatch', () => {
  const c = flagged((p) => {
    p.workflow.profiles['standard-product'].changeTypes.QUICKFIX = { scope: 'story', description: 'fast', gates: { activation: 'required' } };
  });
  assert.match(c.map((x) => x.id).join(), /change-type-added:QUICKFIX/);
  assert.match(c.find((x) => /QUICKFIX/.test(x.id)).detail, /escapes/);
});

test('making a non-mergeable spike mergeable, or dropping a classification reason, is a weakening', () => {
  const ids = flagged((p) => {
    const spike = p.workflow.profiles['standard-product'].changeTypes.SPIKE;
    spike.mergeable = true;
    spike.requiresClassificationReason = false;
  }).map((c) => c.id).join();
  assert.match(ids, /SPIKE\/mergeable/);
  assert.match(ids, /SPIKE\/classification-reason/);
});

test('project declaration weakenings are caught', () => {
  const ids = (m) => flagged(m).map((c) => `${c.kind} ${c.id}`).join();
  assert.match(ids((p) => { p.project = { projectType: 'config-only', stacks: [] }; }), /WEAKENING project:projectType:application->config-only/);
  assert.match(ids((p) => { p.project.workflowProfile = 'prototype'; }), /WEAKENING project:workflowProfile:standard-product->prototype/);
  assert.match(ids((p) => { delete p.project.commands.test; }), /WEAKENING project:command-removed:test/);
  assert.match(ids((p) => { p.project.commands.test = 'true'; }), /REVIEW project:command-changed:test/);
});

test('compliance, evidence and eval downgrades are caught', () => {
  const before = { ...shipped(), project: { ...APP_PROJECT, productParadigms: ['agentic'], complianceProfile: 'regulated', evidencePolicy: 'attested' } };
  const after = clone(before);
  after.project.productParadigms = ['deterministic'];
  after.project.complianceProfile = 'none';
  after.project.evidencePolicy = 'local';
  after.project.evalWaiver = { reason: 'later', owner: 'x' };
  const ids = diffPolicy(policySnapshot(before), policySnapshot(after)).filter((c) => c.kind === 'WEAKENING').map((c) => c.id).join();
  for (const expected of ['complianceProfile', 'evidencePolicy:attested->local', 'paradigm-agentic-removed', 'evalRequired:true->false', 'evalWaiver-added']) {
    assert.match(ids, new RegExp(expected.replace(/[>]/g, '\\>')), `missing ${expected} in ${ids}`);
  }
});

test('moving UP a tier is not flagged — only weaker ones are', () => {
  assert.deepEqual(flagged((p) => { p.project.workflowProfile = 'regulated'; }), []);
});

// -------------------------------------------------------------------------- schema tightening
test('schema tightenings are found; loosenings are not', () => {
  const base = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string', enum: ['x', 'y'] }, n: { type: 'integer', maximum: 10 } } };
  const t = (mutate) => { const b = clone(base); mutate(b); return schemaTightenings(base, b); };
  assert.match(t((b) => { b.required.push('n'); }).join(), /"n" is now required/);
  assert.match(t((b) => { b.properties.a.enum = ['x']; }).join(), /no longer accepts "y"/);
  assert.match(t((b) => { b.properties.n.maximum = 5; }).join(), /maximum lowered to 5/);
  assert.match(t((b) => { delete b.properties.n; }).join(), /"n" is no longer allowed/);
  assert.deepEqual(t((b) => { b.properties.extra = { type: 'string' }; }), [], 'a new optional property under additionalProperties:false is a loosening');
  assert.deepEqual(t((b) => { b.properties.a.enum.push('z'); b.properties.n.maximum = 20; }), [], 'widening is never flagged');
  assert.deepEqual(t((b) => { b.properties.n.type = 'number'; }), [], 'integer -> number accepts everything it accepted before');
});

// -------------------------------------------------------------------------- the real flow
/** A repository with a lock on main and a feature branch ready for a change. */
function lockedRepo() {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'pin the policy');
  git(dir, ['checkout', '-q', '-b', 'feature']);
  return dir;
}
const weaken = (dir) => {
  const wf = JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'));
  wf.profiles['standard-product'].changeTypes.FEATURE.gates.verified = 'not_applicable';
  write(dir, '.eos/workflow.json', wf);
};
const approve = (dir, approver) => {
  const lock = JSON.parse(readFileSync(join(dir, '.eos/policy.lock.json'), 'utf8'));
  for (const a of lock.acknowledged) a.approver = approver;
  write(dir, '.eos/policy.lock.json', lock);
};

test('an unchanged policy passes the check', () => {
  assert.equal(run(lockedRepo(), ['policy', 'check', '--against', 'main']).code, 0);
});

test('a weakening without a re-lock fails, and says the lock is stale', () => {
  const dir = lockedRepo();
  weaken(dir);
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /policy changed since/);
  assert.match(r.out, /WEAKENING .*FEATURE\/verified:required->not_applicable/);
});

test('re-locking without a reason is refused', () => {
  const dir = lockedRepo();
  weaken(dir);
  const r = run(dir, ['policy', 'lock', '--write']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /REFUSED/);
});

test('a drafted acknowledgement is not an approval', () => {
  const dir = lockedRepo();
  weaken(dir);
  assert.equal(run(dir, ['policy', 'lock', '--write', '--reason', 'feature work is verified by the release gate instead']).code, 0);
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /awaiting an approver/);
});

test('the requester cannot approve their own weakening', () => {
  const dir = lockedRepo();
  weaken(dir);
  run(dir, ['policy', 'lock', '--write', '--reason', 'feature work is verified by the release gate instead']);
  approve(dir, 'tester');
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /approver is the requester/);
});

test('a reasoned weakening approved by a second person passes', () => {
  const dir = lockedRepo();
  weaken(dir);
  run(dir, ['policy', 'lock', '--write', '--reason', 'feature work is verified by the release gate instead']);
  approve(dir, 'alice');
  const r = runJson(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.ok, true);
});

test('an approval covers exactly the change it named, not the next one', () => {
  const dir = lockedRepo();
  weaken(dir);
  run(dir, ['policy', 'lock', '--write', '--reason', 'feature work is verified by the release gate instead']);
  approve(dir, 'alice');
  // A second, different weakening rides in afterwards.
  const wf = JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'));
  wf.profiles['standard-product'].changeTypes.BUGFIX.gates.verified = 'not_applicable';
  write(dir, '.eos/workflow.json', wf);
  run(dir, ['policy', 'lock', '--write', '--reason', 'bugfixes also rely on the release gate here']);
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /BUGFIX\/verified/);
  assert.doesNotMatch(r.out, /FEATURE\/verified.*awaiting/, 'the first approval still stands');
});

test('a schema made stricter without a migration needs acknowledgement', () => {
  const dir = lockedRepo();
  const s = JSON.parse(readFileSync(join(dir, '.eos/schemas/waiver.schema.json'), 'utf8'));
  s.required = [...(s.required || []), 'ticket'];
  s.properties = { ...(s.properties || {}), ticket: { type: 'string' } };
  write(dir, '.eos/schemas/waiver.schema.json', s);
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /BREAKING schema-tightened:waiver\.schema\.json/);
  assert.match(r.out, /"ticket" is now required/);
});

test('with no lock, a repository that weakens nothing still passes', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const r = run(dir, ['policy', 'check']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no \.eos\/policy\.lock\.json yet/);
});

test('with no lock, a weakening fails instead of slipping through', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  git(dir, ['checkout', '-q', '-b', 'feature']);
  weaken(dir);
  const r = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /need acknowledgement but there is no/);
});

// ---------------------------------------------------------------- #12 regulated needs the boundary
test('dropping a profile\'s compliance requirement is a weakening', () => {
  const c = flagged((p) => { delete p.workflow.profiles.regulated.requiresCompliance; });
  assert.equal(c.length, 1, JSON.stringify(c));
  assert.equal(c[0].kind, 'WEAKENING');
  assert.match(c[0].id, /profile:regulated:requires-compliance-dropped/);
});

test('every EOS command fails closed on a regulated profile without the boundary', () => {
  const dir = project({ '.eos/project.json': { ...APP_PROJECT, workflowProfile: 'regulated' } });
  const r = run(dir, ['check', '--gate', 'discovery-ready']);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /requires "complianceProfile": "regulated"/);
});

test('a regulated profile with the boundary declared works normally', () => {
  const dir = project({ '.eos/project.json': { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci' } });
  assert.notEqual(run(dir, ['status']).code, 3);
});
