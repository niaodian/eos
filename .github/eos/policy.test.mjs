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

// ---------------------------------------------------------- the first declaration (ADR-022)
// The template ships EOS's own declaration and a lock that describes EOS's policy. A project's first
// declaration has no earlier project policy to be weaker than; a project's later ones always do.
const TEMPLATE_DECLARATION = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/project.json'), 'utf8'));
const CONFIG_ONLY = { projectType: 'config-only', stacks: [], productParadigms: ['deterministic'], workflowProfile: 'standard-product' };
const changesBetween = (before, after) => diffPolicy(policySnapshot({ ...shipped(), project: before }), policySnapshot({ ...shipped(), project: after }));

test('replacing the template\'s declaration is the first declaration: nothing in it weakens a project policy', () => {
  assert.equal(TEMPLATE_DECLARATION.templateDefault, true);
  const changes = changesBetween(TEMPLATE_DECLARATION, CONFIG_ONLY);
  assert.deepEqual(changes.filter((c) => c.requiresAck), [], 'application → config-only and the removed test command are not weakenings of THIS project');
  assert.deepEqual(changes.map((c) => `${c.kind} ${c.id}`), ['INFO project:first-declaration:config-only']);
});

test('the first declaration still compares the gates and the workflow with the template\'s', () => {
  const before = { ...shipped(), project: TEMPLATE_DECLARATION };
  const after = clone({ ...shipped(), project: CONFIG_ONLY });
  after.workflow.profiles['standard-product'].changeTypes.FEATURE.gates.verified = 'not_applicable';
  const ids = diffPolicy(policySnapshot(before), policySnapshot(after)).filter((c) => c.requiresAck).map((c) => c.id);
  assert.deepEqual(ids, ['profile:standard-product:FEATURE/verified:required->not_applicable']);
});

test('a declaration that stays the template\'s own is compared like any other — EOS keeps its own floor', () => {
  const { test: _dropped, ...commands } = TEMPLATE_DECLARATION.commands;
  const ids = changesBetween(TEMPLATE_DECLARATION, { ...TEMPLATE_DECLARATION, commands }).filter((c) => c.requiresAck).map((c) => c.id);
  assert.deepEqual(ids, ['project:command-removed:test']);
});

test('marking a project\'s declaration as the template\'s own again is a weakening', () => {
  const ids = changesBetween(APP_PROJECT, { ...APP_PROJECT, templateDefault: true }).filter((c) => c.requiresAck).map((c) => `${c.kind} ${c.id}`);
  assert.deepEqual(ids, ['WEAKENING project:templateDefault:declared->template']);
});

test('the template marker is part of the digest only where it is set', () => {
  const digest = (project) => policyDigest(policySnapshot({ ...shipped(), project }));
  assert.equal(digest(APP_PROJECT), digest({ ...APP_PROJECT, templateDefault: false }), 'every declared project keeps the digest it was locked with');
  assert.notEqual(digest(APP_PROJECT), digest({ ...APP_PROJECT, templateDefault: true }));
});

/** A template copy: the template's declaration and a lock of the template's policy, committed on main. */
function templateRepo() {
  const dir = project({ '.eos/project.json': TEMPLATE_DECLARATION });
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'chore: scaffold from eos');
  git(dir, ['checkout', '-q', '-b', 'declare']);
  return dir;
}
const lockOf = (dir) => readFileSync(join(dir, '.eos/policy.lock.json'), 'utf8');

test('eos init on a template copy starts this project\'s lock — the first pull request and the first push pass', () => {
  const dir = templateRepo();
  const template = lockOf(dir);
  const r = runJson(dir, ['init', 'config-only', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.derivedFiles.map((f) => `${f.action} ${f.path}`), ['written .eos/policy.lock.json', 'written .eos/sbom.json']);
  assert.deepEqual(r.json.policyNotes, []);
  const lock = JSON.parse(lockOf(dir));
  assert.notEqual(lockOf(dir), template);
  assert.deepEqual(lock.acknowledged, [], 'the baseline approves nothing');
  commitAll(dir, 'chore: declare the project');
  for (const args of [['policy', 'check', '--against', 'main'], ['policy', 'check'], ['sbom', '--check'], ['doctor']]) {
    const c = run(dir, args);
    assert.equal(c.code, 0, `${args.join(' ')}\n${c.out}`);
  }
});

test('the first declaration\'s lock approves nothing: a gate weakened before init still needs a second person', () => {
  const dir = templateRepo();
  weaken(dir);
  const r = runJson(dir, ['init', 'config-only', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.json.policyNotes.join(), /1 policy change\(s\) against merge-base with main still need a reason and a second person/);
  const c = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /WEAKENING profile:standard-product:FEATURE\/verified:required->not_applicable .*not acknowledged/);
  assert.doesNotMatch(c.out, /project:projectType|command-removed/, 'the declaration itself is not what is held');
});

test('without --write, init on a template copy only says what it would record', () => {
  const dir = templateRepo();
  const before = lockOf(dir);
  const r = run(dir, ['init', 'config-only']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /would write {2}\.eos\/policy\.lock\.json/);
  assert.equal(lockOf(dir), before);
  assert.equal(git(dir, ['status', '--porcelain']).out.trim(), '');
});

test('a declared project cannot reset its lock through init — --force keeps it, and the weakening needs a second person', () => {
  const dir = lockedRepo();
  const before = lockOf(dir);
  const r = run(dir, ['init', 'config-only', '--write', '--force']);
  assert.equal(r.code, 0, r.out);
  assert.equal(lockOf(dir), before, 'a declared project\'s lock is never rewritten by init');
  assert.doesNotMatch(r.out, /policy\.lock\.json {2}\(/);
  assert.match(r.out, /re-declaring never resets the lock/);
  const c = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /WEAKENING project:projectType:application->config-only/);
  // Recording it drafts the acknowledgement; only a second person makes it pass.
  run(dir, ['policy', 'lock', '--write', '--reason', 'the product moved to another repository for good']);
  assert.match(run(dir, ['policy', 'check', '--against', 'main']).out, /awaiting an approver/);
});

test('the two-step route is closed: marking the declaration as the template\'s needs a second person first', () => {
  const dir = lockedRepo();
  write(dir, '.eos/project.json', { ...APP_PROJECT, templateDefault: true });
  const step1 = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(step1.code, 1, step1.out);
  assert.match(step1.out, /WEAKENING project:templateDefault:declared->template/);
  // In the same change, init now sees a "template" and starts a fresh lock — and the base still holds.
  assert.equal(run(dir, ['init', 'config-only', '--write']).code, 0);
  const step2 = run(dir, ['policy', 'check', '--against', 'main']);
  assert.equal(step2.code, 1, step2.out);
  assert.match(step2.out, /WEAKENING project:projectType:application->config-only/);
});
