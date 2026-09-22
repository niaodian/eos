// Audit regression — round A — robustness.
//
// One executable regression per finding of the eos-1.12.0 audit. Each test first performs the
// reported bypass — the exact sequence the auditor walked — and then asserts that it no longer
// works. A test here failing means an audit finding has re-opened.
//
// Split out of the original single audit-regression file so the suites run in parallel; the shared
// preamble lives in ./audit-support.mjs.
//   node --test .github/eos/audit-robustness.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, symlinkSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  project, write, run, runJson, cleanup, git, commitAll, story, releaseFiles,
  APP_PROJECT, PRD_2AC, baselineFiles, storyFiles, testRun, treeDigest, DISCOVERY_RECORD,
  writeManifest, bindDigests, ARCHITECTURE_RECORD, REQUIREMENTS_RECORD,
  TELEMETRY_MD, TELEMETRY_RECORD, ITERATION_RECORD, REPO_ROOT,
  computeProductTree, compareProductTree, clearProductTreeCache, isSelfReference,
  emptyDocReason, readEvidence, evidenceFreshness,
  bmadReadiness, deprecatedMappings, skillRoots,
  resolveProjectRoot, foreignProjectReferences, RESOLUTION_ORDER,
  producerTrust, parseTraceMatrix,
  prdAcceptanceCriteria, parseOpsDecision, opsDecisionProblem,
  verifiedStory, mergeRefused,
} from './audit-support.mjs';

after(cleanup);

// ===================================================================== round A: robustness
// Each case fails on eos-1.13.1 and passes here.

test('round-A: a release ships what its manifest says, not every story that ever existed', () => {
  // Two releases, two trains. The old engine reasoned about "every story under docs/stories/", so
  // R-A was blocked by work that belongs to R-B and vice versa — parallel trains were impossible.
  const dir = verifiedStory(releaseFiles({
    'docs/stories/STORY-002.md': story({ id: 'STORY-002', rows: [['AC1.2', 'user can log out', 'tests/logout.test.mjs::clears the session', '—']] }),
  }));
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);

  // STORY-002 is deliberately unfinished. R-A ships only STORY-001 and says so.
  writeManifest(dir, { releaseId: 'R-A', includedStories: ['STORY-001'], extra: { excludedStories: [{ id: 'STORY-002', reason: 'still in development; ships in the next train' }] } });
  const a = runJson(dir, ['release-status', '--release', 'R-A']);
  const byId = Object.fromEntries(a.json.checks.map((c) => [c.id, c]));
  assert.equal(byId['release-manifest'].status, 'PASS', JSON.stringify(byId['release-manifest']));
  assert.equal(byId['stories-verified'].status, 'PASS', 'an unfinished story that is NOT in this release must not block it');

  // The other train includes it, and is correctly blocked by it.
  writeManifest(dir, { releaseId: 'R-B', includedStories: ['STORY-001', 'STORY-002'] });
  const b = runJson(dir, ['release-status', '--release', 'R-B']);
  const bById = Object.fromEntries(b.json.checks.map((c) => [c.id, c]));
  assert.equal(bById['stories-verified'].status, 'FAIL', JSON.stringify(bById['stories-verified']));
  assert.match(bById['stories-verified'].detail, /STORY-002/);
});

test('round-A: a manifest cannot include a story that does not exist, ships twice, or never ships', () => {
  const dir = verifiedStory(releaseFiles({
    'docs/stories/SPIKE-1.md': story({ id: 'SPIKE-1', changeType: 'SPIKE', rows: [], classificationReason: 'Time-boxed investigation of the queue option.' }),
  }));
  const check = (extra, pattern) => {
    write(dir, '.eos/releases/R-X.json', { schemaVersion: 1, releaseId: 'R-X', includedStories: ['STORY-001'], ...extra });
    const r = runJson(dir, ['release-status', '--release', 'R-X']);
    assert.match(r.json.checks.find((c) => c.id === 'release-manifest').detail, pattern);
  };
  check({ includedStories: ['STORY-001', 'GHOST-9'] }, /do not exist/);
  check({ includedStories: ['STORY-001'], excludedStories: [{ id: 'STORY-001', reason: 'contradicts the inclusion above' }] }, /BOTH included and excluded/);
  check({ includedStories: ['STORY-001', 'SPIKE-1'] }, /never ships/);
  // Silence about a story is the gap the manifest exists to close.
  write(dir, 'docs/stories/STORY-777.md', story({ id: 'STORY-777', rows: [['AC1.2', 'log out', 'tests/logout.test.mjs::clears the session', '—']] }));
  check({ includedStories: ['STORY-001'] }, /neither included nor excluded/);
});

test('round-A: an approval does not survive a change to what the release ships', () => {
  const dir = verifiedStory(releaseFiles({
    'docs/stories/STORY-002.md': story({ id: 'STORY-002', rows: [['AC1.2', 'user can log out', 'tests/logout.test.mjs::clears the session', '—']] }),
  }));
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  writeManifest(dir, { releaseId: 'R-1', includedStories: ['STORY-001'], extra: { excludedStories: [{ id: 'STORY-002', reason: 'not ready for this train' }] } });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'CANDIDATE']);
  assert.equal(run(dir, ['verify-release', '--release', 'R-1']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'VERIFIED']).code, 0);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1'], { EOS_ACTOR: 'second-person' }).code, 0);

  // Now quietly widen the release AFTER it was approved.
  writeManifest(dir, { releaseId: 'R-1', includedStories: ['STORY-001', 'STORY-002'] });
  const r = run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'APPROVED']);
  assert.equal(r.code, 1, `an approval for one set of changes must not authorise another:\n${r.out}`);
  assert.match(r.out, /changed after it was approved/);
});

test('round-A: an approval cannot be recorded before the release says what it ships', () => {
  const dir = verifiedStory(releaseFiles());
  const r = run(dir, ['approve', '--scope', 'release', '--id', 'R-NEW'], { EOS_ACTOR: 'second-person' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /does not exist/);
});

test('round-A: `release init` proposes, it does not decide', () => {
  const dir = verifiedStory(releaseFiles());
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  write(dir, 'docs/stories/STORY-003.md', story({ id: 'STORY-003', rows: [['AC1.2', 'log out', 'tests/logout.test.mjs::clears the session', '—']] }));
  const r = runJson(dir, ['release', 'init', '--release', 'R-P']);
  assert.equal(r.code, 0, r.out);
  // Only VERIFIED/MERGED work is proposed for inclusion; everything else is an explicit exclusion
  // carrying a TODO the author must answer.
  assert.deepEqual(r.json.manifest.includedStories, ['STORY-001']);
  assert.deepEqual(r.json.manifest.excludedStories.map((e) => e.id), ['STORY-003']);
  assert.match(r.json.manifest.excludedStories[0].reason, /TODO/);
  // The human output says plainly that this is not a decision yet.
  assert.match(run(dir, ['release', 'init', '--release', 'R-Q']).out, /PROPOSAL/);
  // ...and it never silently overwrites a manifest someone already decided on.
  assert.equal(run(dir, ['release', 'init', '--release', 'R-P']).code, 1, 'init must not silently overwrite a manifest');
});

test('round-A: the project root is resolved deterministically and explicitly', () => {
  const dir = project({ 'src/a.js': 'x\n' });
  const explicit = resolveProjectRoot({ cliRoot: dir, env: {}, cwd: '/' });
  assert.equal(explicit.source, 'cli:--project-root');
  assert.equal(realpathSync(explicit.root), realpathSync(dir));

  const viaEnv = resolveProjectRoot({ cliRoot: null, env: { EOS_PROJECT_ROOT: dir }, cwd: '/' });
  assert.equal(viaEnv.source, 'env:EOS_PROJECT_ROOT');

  // Explicit beats discovery, and discovery beats the shell's idea of "here".
  const both = resolveProjectRoot({ cliRoot: dir, env: { EOS_PROJECT_ROOT: '/nonexistent-xyz' }, cwd: '/' });
  assert.equal(both.source, 'cli:--project-root');
  assert.equal(RESOLUTION_ORDER[0], 'cli:--project-root');
  assert.ok(RESOLUTION_ORDER.indexOf('git:toplevel') < RESOLUTION_ORDER.indexOf('cwd'));

  // A root that was named but does not exist is REPORTED, not silently skipped.
  const bad = resolveProjectRoot({ cliRoot: null, env: { EOS_PROJECT_ROOT: '/nonexistent-xyz' }, cwd: dir });
  assert.match(bad.problems.join(' '), /does not exist/);
});

test('round-A: a project-level skill is not shadowed by a user-level one of the same name', () => {
  const dir = project({});
  const projectSkills = join(dir, '.github/skills');
  const homeSkills = join(dir, 'home-skills');
  for (const d of [join(projectSkills, 'bmad-prd'), join(homeSkills, 'bmad-prd')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(projectSkills, 'bmad-prd/SKILL.md'), '---\nname: bmad-prd\n---\n# project copy\n');
  writeFileSync(join(homeSkills, 'bmad-prd/SKILL.md'), '---\nname: bmad-prd\n---\n# user copy\n');
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));
  writeFileSync(join(dir, '.eos/schemas/bmad-lock.schema.json'), readFileSync(join(REPO_ROOT, '.eos/schemas/bmad-lock.schema.json')));

  const r = bmadReadiness(dir, { deep: false, roots: skillRoots(dir).concat(homeSkills) });
  const prd = r.skills.find((s) => s.name === 'bmad-prd');
  assert.ok(prd.resolvedFrom.startsWith(projectSkills),
    `the copy that travels with the repository must win, got ${prd.resolvedFrom}`);
});

test('round-A: a runtime config naming another project is reported, not silently obeyed', () => {
  const dir = project({ '_bmad/bmm/config.yaml': 'projectName: some-other-product\noutput_folder: /tmp/some-other-product/docs\n' });
  const foreign = foreignProjectReferences(dir, ['_bmad/bmm/config.yaml']);
  assert.ok(foreign.length >= 2, JSON.stringify(foreign));
  assert.match(foreign.map((f) => f.reason).join(' '), /names project "some-other-product"/);
  assert.match(foreign.map((f) => f.reason).join(' '), /outside this project/);
  // A config that belongs here produces no accusation.
  const own = project({ '_bmad/bmm/config.yaml': 'output_folder: docs\n' });
  assert.deepEqual(foreignProjectReferences(own, ['_bmad/bmm/config.yaml']), []);
});

test('round-A: a write-back that was later reverted no longer counts as closed', () => {
  const dir = project(baselineFiles({ 'docs/telemetry-plan.md': TELEMETRY_MD, 'docs/telemetry.json': TELEMETRY_RECORD }));
  write(dir, 'docs/iteration.json', bindDigests(dir, ITERATION_RECORD));
  assert.equal(run(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']).code, 0);

  // Revert the spec the learning was written into. The record still claims it landed.
  const req = JSON.parse(readFileSync(join(dir, 'docs/requirements.json'), 'utf8'));
  req.functional.push({ id: 'FR2', statement: 'A later edit that undoes what the learning recorded' });
  write(dir, 'docs/requirements.json', req);
  const r = runJson(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.json.checks.find((c) => c.id === 'spec-write-back').detail, /different version of/);
});

test('round-A: evidence says how it was produced, and a regulated release will not rest on a local claim', () => {
  const local = testRun();
  assert.equal(producerTrust(local).level, 'UNATTESTED_LOCAL');
  assert.equal(producerTrust({ ...local, producer: { type: 'ci', name: 'gh', runRef: 'r/1' } }).level, 'SELF_REPORTED_CI');
  assert.equal(producerTrust({ ...local, attestation: { type: 'slsa', reference: 'x' } }).level, 'ATTESTED');
  // No producer at all is indistinguishable from a hand-written file, and says so.
  assert.match(producerTrust({}).detail, /cannot be distinguished from a hand-written file/);

  // Local evidence is fine for development…
  const dir = verifiedStory(releaseFiles());
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  writeManifest(dir, { releaseId: 'R-1' });
  let r = runJson(dir, ['release-status', '--release', 'R-1']);
  assert.equal(r.json.checks.find((c) => c.id === 'evidence-trust').status, 'PASS',
    'a local-first tool whose release gate can never be green locally has failed its own premise');

  // …and a project that declares it needs more says so, and is held to it.
  write(dir, '.eos/project.json', { ...APP_PROJECT, evidencePolicy: 'ci', commands: { test: 'node --version', audit: 'node --version' } });
  commitAll(dir, 'require CI-produced evidence');
  writeManifest(dir, { releaseId: 'R-1' });
  r = runJson(dir, ['release-status', '--release', 'R-1']);
  const trust = r.json.checks.find((c) => c.id === 'evidence-trust');
  assert.equal(trust.status, 'FAIL', JSON.stringify(trust));
  assert.match(trust.detail, /evidencePolicy "ci"/);
});

test('ADR-005 D2: a regulated project must STATE its evidence policy — and air-gapped is a valid answer', () => {
  // eos-1.14.0 blocked a regulated release on local evidence. That excluded air-gapped users, who
  // are often the MOST regulated — defence, parts of healthcare — and who cannot reach an
  // attestation authority at all. EOS forces the decision instead of making it.
  const dir = project({});
  const declare = (extra) => {
    write(dir, '.eos/project.json', { ...APP_PROJECT, complianceProfile: 'regulated', ...extra });
    return runJson(dir, ['status']);
  };
  // A blank is refused: "nobody decided" is not a policy.
  let r = declare({});
  assert.match((r.json.errors || []).join(" "), /must declare "evidencePolicy"/);

  // Choosing `local` is legitimate — but it must be justified.
  r = declare({ evidencePolicy: 'local' });
  assert.match((r.json.errors || []).join(" "), /evidencePolicyReason/);

  r = declare({ evidencePolicy: 'local', evidencePolicyReason: 'Air-gapped network; no external attestation authority is reachable.' });
  assert.deepEqual(r.json.errors || [], [], 'an air-gapped regulated project must remain able to ship');

  // And a stricter policy is equally available.
  r = declare({ evidencePolicy: 'attested' });
  assert.deepEqual(r.json.errors || [], []);
});

test('ADR-005 D4: an adapter is monotonic — its absence never creates a NEW blocker', () => {
  // The invariant every future provider adapter must satisfy: with no adapter present, each check
  // that WOULD consult one must already have an honest verdict, and that verdict is the floor.
  const dir = verifiedStory(releaseFiles());
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  writeManifest(dir, { releaseId: 'R-1' });
  const r = runJson(dir, ['release-status', '--release', 'R-1']);
  const authority = r.json.checks.find((c) => c.id === 'activation-authority');
  // Today, with no adapter, this is a decided verdict rather than a crash or a silent pass.
  assert.ok(['PASS', 'BLOCKED'].includes(authority.status), JSON.stringify(authority));

  // And the development loop never consults an external authority at all: every gate before the
  // release gate reaches a verdict with nothing but this repository.
  const gates = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/gates.json'), 'utf8'));
  const preRelease = gates.gates.filter((g) => g.scope !== 'release');
  assert.ok(preRelease.length >= 7);
  for (const g of preRelease) {
    for (const c of g.checks) {
      assert.doesNotMatch(c.evaluator, /provider|attest|github/i,
        `${g.id}/${c.id} would consult an external authority in the development loop`);
    }
  }
});

test('round-A: writing the release plan does not invalidate the evidence the release depends on', () => {
  // The same self-reference trap as evidence and the ledger: `.eos/releases/` is EOS bookkeeping
  // about a release, so it must not be part of the tree the release is verified against.
  const dir = verifiedStory(releaseFiles());
  clearProductTreeCache();
  const before = computeProductTree(dir).identity.digest;
  writeManifest(dir, { releaseId: 'R-1' });
  clearProductTreeCache();
  assert.equal(computeProductTree(dir).identity.digest, before,
    'writing a release manifest changed the product tree, which would expire the very evidence the release needs');
  assert.ok(isSelfReference('.eos/releases/R-1.json'));
});

test('round-A: the bundled validator enforces uniqueItems instead of ignoring it', () => {
  // It used to refuse the keyword outright (fail-closed, but unusable). Silently ignoring it would
  // have been worse: a story listed twice would be counted twice and verified once.
  const dir = verifiedStory(releaseFiles());
  write(dir, '.eos/releases/R-D.json', { schemaVersion: 1, releaseId: 'R-D', includedStories: ['STORY-001', 'STORY-001'] });
  const r = runJson(dir, ['release-status', '--release', 'R-D']);
  assert.match(r.json.checks.find((c) => c.id === 'release-manifest').detail, /duplicate entry/);
});
