// Audit regression — adversarial review round 2.
//
// One executable regression per finding of the eos-1.12.0 audit. Each test first performs the
// reported bypass — the exact sequence the auditor walked — and then asserts that it no longer
// works. A test here failing means an audit finding has re-opened.
//
// Split out of the original single audit-regression file so the suites run in parallel; the shared
// preamble lives in ./audit-support.mjs.
//   node --test .github/eos/audit-review.test.mjs
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

// ===================================================================== adversarial review round 2
// Defects found by an adversarial review OF THIS REMEDIATION. Each one was a way to satisfy a new
// check without satisfying the property it exists to enforce.

test('review: a release refuses a story whose LATEST verification is a FAIL', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  writeManifest(dir, { releaseId: 'v1.0.0' });
  // Break a test, then re-verify: the story stays MERGED in the ledger, but its current evidence is FAIL.
  write(dir, 'tests/login.test.mjs', "import { test } from 'node:test';\ntest('valid password', () => { throw new Error('broken'); });\n");
  write(dir, 'docs/evidence/test-run.json', { ...testRun({ status: 'FAIL' }), productTree: { digest: null } });
  commitAll(dir, 'break the test');
  write(dir, 'docs/evidence/test-run.json', { ...testRun({ status: 'FAIL' }), productTree: { digest: treeDigest(dir) } });
  run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  const r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  const check = r.json.checks.find((c) => c.id === 'story-evidence-current');
  assert.equal(check.status, 'FAIL', JSON.stringify(check));
  assert.match(check.detail, /latest verification is FAIL|not PASS/);
});

test('review: the product-tree identity sees a mode change, a symlink retarget and a deletion', () => {
  const dir = project({ 'src/deploy.sh': '#!/bin/sh\necho deploy\n', 'src/real-a.txt': 'a\n', 'src/real-b.txt': 'b\n' });
  chmodSync(join(dir, 'src/deploy.sh'), 0o755);
  commitAll(dir, 'make it executable');
  clearProductTreeCache();
  const withExec = computeProductTree(dir).identity.digest;
  chmodSync(join(dir, 'src/deploy.sh'), 0o644);
  commitAll(dir, 'drop the executable bit');
  clearProductTreeCache();
  // The CONTENT is byte-for-byte identical; only the mode moved. A content-only digest is blind
  // to `chmod -x deploy.sh`, which is a real change to what the product does.
  assert.notEqual(computeProductTree(dir).identity.digest, withExec, 'an executable-bit change must be visible');

  // A symlink is its target, not the bytes it happens to resolve to today.
  symlinkSync('real-a.txt', join(dir, 'src/link.txt'));
  commitAll(dir, 'link');
  clearProductTreeCache();
  const linkedA = computeProductTree(dir).identity.digest;
  rmSync(join(dir, 'src/link.txt'));
  symlinkSync('real-b.txt', join(dir, 'src/link.txt'));
  clearProductTreeCache();
  assert.notEqual(computeProductTree(dir).identity.digest, linkedA, 'a symlink retarget must be visible');
});

test('review: an unreadable product file makes the identity UNAVAILABLE rather than "unchanged"', () => {
  const dir = project({ 'src/a.js': 'x\n' });
  clearProductTreeCache();
  assert.equal(computeProductTree(dir).available, true);
  // A path that git lists but cannot be read must not resolve to a stable marker.
  rmSync(join(dir, 'src/a.js'));
  mkdirSync(join(dir, 'src/a.js'));
  clearProductTreeCache();
  const r = computeProductTree(dir);
  assert.equal(r.available, false, JSON.stringify(r.identity));
  assert.match(r.reason, /could not be read/);
});

test('review: a machine summary must name the tree it describes', () => {
  const dir = project(storyFiles({ 'docs/evidence/test-run.json': testRun({ productTree: null }) }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'trace-complete')), /records no productTree\.digest/);
});

test('review: an evidence reference cannot point outside the repository', () => {
  const dir = project(storyFiles({
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | ../escape.test.mjs::valid password | PASS |\n',
    'docs/evidence/test-run.json': testRun({ testPath: '../escape.test.mjs' }),
  }), { withHooks: true });
  writeFileSync(join(dir, '..', 'escape.test.mjs'), "test('valid password', () => {});\n");
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'trace-complete')), /inside this repository/);
  rmSync(join(dir, '..', 'escape.test.mjs'), { force: true });
});

test('review: a deleted validation schema disables the gate — so it is an ERROR, not a pass', () => {
  const dir = project(storyFiles(), { withHooks: true });
  rmSync(join(dir, '.eos/schemas/test-run.schema.json'));
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'trace-complete')), /cannot be validated/);
});

test('review: an AC "defined" inside an HTML comment or a fenced block is not defined', () => {
  const dir = project({
    'docs/prd.md': [
      '# PRD', '',
      '## Login (FR1)', '',
      '- AC1.1 the user can log in with a valid password', '',
      '<!--', '- AC8.8 a commented-out criterion', '-->', '',
      '```md', '- AC7.7 an illustrative example, and a TBD marker', '```', '',
    ].join('\n'),
  });
  const prd = prdAcceptanceCriteria(dir);
  assert.deepEqual(prd.defined, ['AC1.1']);
  assert.ok(!prd.referenced.includes('AC8.8'), 'a commented-out id is not part of the specification');
  assert.ok(!prd.referenced.includes('AC7.7'), 'an id in a fenced example is not part of the specification');
  assert.deepEqual(prd.blockers, [], 'a TBD inside a fenced example is not an unresolved blocker');
});

test('review: an empty or unexplained activation ledger is not an attestation', () => {
  const dir = verifiedStory(releaseFiles({ 'docs/eos/activation.md': '# Activation\n\nNothing here.\n' }));
  let r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'activation-authority')), /tracks no activation item/);

  write(dir, 'docs/eos/activation.md', '# Activation\n\n- [~] Branch protection\n');
  r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'activation-authority')), /waived with no reason/);
});

test('review: G10 evidence for one release does not close another', () => {
  const dir = project(baselineFiles({
    'docs/telemetry-plan.md': TELEMETRY_MD,
    'docs/telemetry.json': TELEMETRY_RECORD,
  }));
  // The record names release R-1; it is written after the sandbox exists so its digest is real.
  write(dir, 'docs/iteration.json', bindDigests(dir, ITERATION_RECORD));
  const r = runJson(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-2']);
  assert.notEqual(r.code, 0, r.out);
  const detail = r.json.checks.find((c) => c.id === 'spec-write-back').detail;
  assert.match(detail, /records the write-back for release "R-1", not "R-2"/);
});

test('review: a ROLLED_BACK release can close its loop through the incident review, not by reshipping', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-9' });
  writeManifest(dir, { releaseId: 'R-9' });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'CANDIDATE']);
  run(dir, ['verify-release', '--release', 'R-9']);
  run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'VERIFIED']);
  run(dir, ['approve', '--scope', 'release', '--id', 'R-9'], { EOS_ACTOR: 'second-person' });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'APPROVED']);
  run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'RELEASED']);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'ROLLED_BACK']).code, 0);

  assert.equal(runJson(dir, ['next']).json.recommendedAction.id, 'review-incident');
  // Re-shipping is not a legal move out of ROLLED_BACK; the write-back is.
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'RELEASED']).code, 1);
  write(dir, 'docs/iteration.json', bindDigests(dir, { ...ITERATION_RECORD, release: 'R-9', decision: { outcome: 'CORRECT_COURSE', owner: '@platform' } }));
  assert.equal(run(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-9']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-9', '--to', 'ITERATED']).code, 0);
});

test('review: a Chinese-language specification is not mistaken for a placeholder', () => {
  const zh = [
    '# 发现', '',
    '用户在密码重置流程中大量流失，因为整个环节超过五分钟且没有任何反馈。我们认为把重置收敛为',
    '单页并提供即时校验可以消除这种流失。这一点是可度量的：登录完成率今天已经被埋点，因此变更',
    '发布到第一批用户之后，我们能够直接观察这个数字是否真的发生了变化，而不是依赖主观判断。', '',
  ].join('\n');
  const dir = project({ 'docs/discovery.md': zh, 'docs/discovery.json': DISCOVERY_RECORD });
  assert.equal(emptyDocReason(dir, 'docs/discovery.md', { minWords: 60 }), null,
    'CJK prose has no spaces, so whitespace word-counting would reject a perfectly good document');
});
