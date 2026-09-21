// Audit regression — EOS-AUD-001 — evidence must describe the tree it verified.
//
// One executable regression per finding of the eos-1.12.0 audit. Each test first performs the
// reported bypass — the exact sequence the auditor walked — and then asserts that it no longer
// works. A test here failing means an audit finding has re-opened.
//
// Split out of the original single audit-regression file so the suites run in parallel; the shared
// preamble lives in ./audit-support.mjs.
//   node --test .github/eos/audit-evidence.test.mjs
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

// ===================================================================== EOS-AUD-001 (P0)
// "verified evidence is not bound to the product tree": story VERIFIED → rewrite src/app.js →
// story still reached MERGED and release-ready still passed.

test('EOS-AUD-001: rewriting the source after VERIFIED blocks the merge', () => {
  const dir = verifiedStory({ 'src/app.js': 'export const login = () => true;\n' });
  write(dir, 'src/app.js', 'export const login = () => false; // rewritten after verification\n');
  commitAll(dir, 'rewrite the implementation');
  const out = mergeRefused(dir, 'the source was rewritten');
  assert.match(out, /src\/app\.js/, 'the refusal must name what changed');
});

test('EOS-AUD-001: rewriting a TEST after VERIFIED blocks the merge', () => {
  const dir = verifiedStory();
  write(dir, 'tests/login.test.mjs', "import { test } from 'node:test';\ntest('valid password', () => { throw new Error('now failing'); });\n");
  commitAll(dir, 'weaken the test');
  mergeRefused(dir, 'a test was rewritten');
});

test('EOS-AUD-001: an UNCOMMITTED source change is enough to block the merge', () => {
  const dir = verifiedStory({ 'src/app.js': 'export const login = () => true;\n' });
  write(dir, 'src/app.js', 'export const login = () => false;\n');
  // deliberately NOT committed — a working-tree edit is still a different product
  mergeRefused(dir, 'an uncommitted source change');
});

test('EOS-AUD-001: DELETING a product file after VERIFIED blocks the merge', () => {
  const dir = verifiedStory({ 'src/app.js': 'export const login = () => true;\n' });
  rmSync(join(dir, 'src/app.js'));
  commitAll(dir, 'delete the implementation');
  mergeRefused(dir, 'a product file was deleted');
});

test('EOS-AUD-001: a lockfile / manifest change makes the verification stale', () => {
  const dir = verifiedStory({ 'package-lock.json': '{ "lockfileVersion": 3, "packages": {} }\n' });
  write(dir, 'package-lock.json', '{ "lockfileVersion": 3, "packages": { "node_modules/x": { "version": "9.9.9" } } }\n');
  commitAll(dir, 'bump a dependency');
  mergeRefused(dir, 'the lockfile changed');
});

test('EOS-AUD-001: for an agentic product a prompt, dataset or model-config edit makes it stale', () => {
  const agentic = {
    '.eos/project.json': { ...APP_PROJECT, productParadigms: ['deterministic', 'agentic'], commands: { test: 'node --version', eval: 'node --version' } },
    'docs/eval-plan.md': '# Eval plan\n\nEVAL-1 grounds the answer in the retrieved document.\n',
    'prompts/answer.md': 'You are a helpful assistant. Ground every claim in the retrieved document.\n',
    'evals/dataset.jsonl': '{"q":"what is the refund window?","a":"30 days"}\n',
    'evals/model.json': '{ "model": "vendor-model-a", "temperature": 0 }\n',
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', 'EVAL-1']] }),
    'docs/evidence/eval-summary.json': {
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      productTree: '@tree',
      subject: { promptRef: 'prompts/answer.md', model: 'vendor-model-a', datasetRef: 'evals/dataset.jsonl', graderRef: 'evals/grader.mjs' },
      cases: [{ id: 'EVAL-1', ac: 'AC1.1', metric: 'groundedness', comparator: '>=', threshold: 0.9, observed: 0.94, status: 'PASS' }],
    },
  };
  for (const [label, edit] of [
    ['prompt', ['prompts/answer.md', 'You are a helpful assistant. Answer freely.\n']],
    ['eval dataset', ['evals/dataset.jsonl', '{"q":"what is the refund window?","a":"14 days"}\n']],
    ['model config', ['evals/model.json', '{ "model": "vendor-model-b", "temperature": 1 }\n']],
  ]) {
    const dir = verifiedStory(agentic);
    write(dir, edit[0], edit[1]);
    commitAll(dir, `change the ${label}`);
    mergeRefused(dir, `the ${label} changed`);
  }
});

test('EOS-AUD-001: EOS writing its OWN evidence and ledger never invalidates the evidence', () => {
  // The self-reference trap: if the recorded identity covered .eos/evidence and .eos/ledger, every
  // gate would expire the instant it finished writing its result, and the guard would be noise.
  const dir = verifiedStory();
  const merge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(merge.code, 0, `EOS's own bookkeeping invalidated the evidence it just wrote:\n${merge.out}`);
  for (const p of ['.eos/evidence/verified__story__STORY-001.json', '.eos/ledger/events.jsonl', '.eos/ledger/head.json', '.eos/handoffs/x.json', '.eos/local/active-work.json']) {
    assert.ok(isSelfReference(p), `${p} must be excluded from the product-tree identity`);
  }
  assert.equal(isSelfReference('src/app.js'), false);
  assert.equal(isSelfReference('.eos/project.json'), false, 'the project declaration IS product configuration');
});

test('EOS-AUD-001: with no git repository the identity is UNAVAILABLE, and that is BLOCKED — never PASS', () => {
  const dir = project(storyFiles(), { withHooks: true, git: false });
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  const bound = r.json.checks.find((c) => c.id === 'product-tree-bound');
  assert.equal(bound.status, 'BLOCKED', JSON.stringify(bound));
  assert.match(bound.detail, /not a git repository/);
});

test('EOS-AUD-001: the product-tree identity is path-based, so it is stable across platforms', () => {
  const dir = project({ 'src/a/b.js': 'x\n', 'src/a/c.js': 'y\n' });
  clearProductTreeCache();
  const first = computeProductTree(dir);
  assert.ok(first.available);
  // Every recorded path is posix, whatever the host separator is.
  assert.ok(first.identity.segments.every((s) => !s.path.includes('\\')));
  clearProductTreeCache();
  assert.equal(computeProductTree(dir).identity.digest, first.identity.digest, 'the digest must be reproducible');
  // A recorded identity from another scheme version is never silently accepted.
  const cmp = compareProductTree(dir, { ...first.identity, version: '0.9.0' });
  assert.equal(cmp.status, 'CHANGED');
  assert.match(cmp.reasons[0], /identity scheme changed/);
  assert.equal(compareProductTree(dir, null).status, 'UNBOUND');
});

test('EOS-AUD-001: release-ready re-runs the quality commands on the CANDIDATE, not on story state', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  writeManifest(dir, { releaseId: 'v1.0.0' });
  // Break the product AFTER every story reached MERGED. Story state still says "verified".
  write(dir, '.eos/project.json', { ...APP_PROJECT, commands: { test: 'node --eval process.exit(1)' } });
  commitAll(dir, 'break the tests');
  const rel = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  const byId = Object.fromEntries(rel.json.checks.map((c) => [c.id, c]));
  assert.equal(byId['stories-verified'].status, 'PASS', 'story state alone still looks fine — that is the point');
  const r = runJson(dir, ['verify-release', '--release', 'v1.0.0']);
  assert.notEqual(r.code, 0, r.out);
  const checks = Object.fromEntries(r.json.result.checks.map((c) => [c.id, c]));
  assert.equal(checks['candidate-quality'].status, 'FAIL', JSON.stringify(checks['candidate-quality']));
});

test('EOS-AUD-001: a release whose stories were verified against an older tree is refused', () => {
  const dir = verifiedStory(releaseFiles({ 'src/app.js': 'export const login = () => true;\n' }));
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  writeManifest(dir, { releaseId: 'v1.0.0' });
  write(dir, 'src/app.js', 'export const login = () => false;\n');
  commitAll(dir, 'change the product after the story merged');
  const r = runJson(dir, ['verify-release', '--release', 'v1.0.0']);
  const checks = Object.fromEntries(r.json.result.checks.map((c) => [c.id, c]));
  assert.equal(checks['story-evidence-current'].status, 'FAIL', JSON.stringify(checks['story-evidence-current']));
  assert.notEqual(r.code, 0);
});

test('EOS-AUD-001: a release candidate with uncommitted product changes is refused', () => {
  const dir = verifiedStory(releaseFiles());
  write(dir, 'src/new.js', 'export const x = 1;\n');
  const r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  const checks = Object.fromEntries(r.json.checks.map((c) => [c.id, c]));
  assert.equal(checks['candidate-identity'].status, 'FAIL', JSON.stringify(checks['candidate-identity']));
  assert.match(checks['candidate-identity'].detail, /uncommitted/);
});
