// The release supply chain's own guarantees (ADR-012), checked statically: least privilege per job,
// every action pinned to a commit SHA with one documented exception, no OIDC token anywhere near the
// ordinary CI, and nothing published before the track's requirements have passed. Plus the plan the
// workflow runs, which reads the track from the engine.
//   node --test .github/eos/release-workflow.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, cleanup, commitAll, run, REPO_ROOT, APP_PROJECT } from './test-support.mjs';
import { planRelease } from './release-plan.mjs';

after(cleanup);

const RELEASE = readFileSync(join(REPO_ROOT, '.github/workflows/eos-release.yml'), 'utf8');
const CI = readFileSync(join(REPO_ROOT, '.github/workflows/eos-ci.yml'), 'utf8');

/** Each job's block of text, by name. Enough structure for these assertions, without a YAML parser. */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:'));
  const out = {};
  const re = /^ {2}([a-z][a-z0-9-]*):\n/gm;
  const starts = [...body.matchAll(re)];
  starts.forEach((m, i) => { out[m[1]] = body.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined); });
  return out;
}
const permissions = (job) => {
  const block = job.match(/^ {4}permissions:\n((?: {6}[a-z-]+: [a-z]+\n)+)/m);
  return block ? Object.fromEntries([...block[1].matchAll(/^ {6}([a-z-]+): ([a-z]+)$/gm)].map((m) => [m[1], m[2]])) : null;
};
const J = jobs(RELEASE);

test('the release workflow\'s default token is read-only', () => {
  assert.match(RELEASE, /^permissions:\n {2}contents: read\n/m);
});

test('only the attestation jobs can mint an OIDC token, and only publishing jobs can write', () => {
  const minting = Object.entries(J).filter(([, b]) => permissions(b)?.['id-token'] === 'write').map(([n]) => n).sort();
  assert.deepEqual(minting, ['attest', 'slsa']);
  const writing = Object.entries(J).filter(([, b]) => permissions(b)?.contents === 'write').map(([n]) => n).sort();
  assert.deepEqual(writing, ['publish', 'slsa']);
  for (const [name, block] of Object.entries(J)) assert.ok(permissions(block), `${name} must declare its own permissions`);
  assert.equal(permissions(J.attest).attestations, 'write');
});

test('the ordinary CI never holds an OIDC token or a writable token', () => {
  assert.doesNotMatch(CI, /id-token/);
  assert.doesNotMatch(CI.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /contents:\s*write/);
});

test('every action is pinned to a commit SHA — the SLSA generator is the one tag-pinned exception', () => {
  const uses = [...RELEASE.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 5);
  const unpinned = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u));
  assert.deepEqual(unpinned, ['slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0'],
    'the SLSA generator refuses a SHA (it verifies it was called by a release tag); nothing else may be tag-pinned');
  assert.match(RELEASE, /ONE documented exception/);
});

test('every job that runs steps has a timeout', () => {
  for (const [name, block] of Object.entries(J)) {
    if (/^ {4}uses:/m.test(block)) continue; // a reusable workflow carries its own
    assert.match(block, /^ {4}timeout-minutes: \d+$/m, `${name} has no timeout`);
  }
});

test('nothing is published before what the track requires has passed', () => {
  assert.match(J.slsa, /upload-assets: false/, 'the generator must not publish ahead of verification');
  const cond = J.publish.slice(J.publish.indexOf('if:'), J.publish.indexOf('runs-on:'));
  assert.match(cond, /needs\.plan\.outputs\.publish == 'true'/);
  assert.match(cond, /needs\.attest\.result == 'success'/);
  assert.match(cond, /needs\.plan\.outputs\.manifest != 'true' \|\| needs\.manifest\.result == 'success'/);
  assert.match(cond, /needs\.slsa\.result == 'success' && needs\.manifest\.result == 'success'/);
  assert.match(J.manifest, /release verify --release/);
  assert.match(J.manifest, /Regulated track: set the EOS_RELEASE_SIGNING_KEY secret/);
});

test('the signing key never touches the environment of EOS itself: a file, then gone', () => {
  assert.match(J.manifest, /--key "\$RUNNER_TEMP\/release\.pem"/);
  assert.match(J.manifest, /unlinkSync/);
  assert.doesNotMatch(J.manifest, /EOS_RELEASE_SIGNING_KEY=/);
});

test('the plan reads the track from the project, and a dispatch or a pull request publishes nothing', () => {
  const standard = project({ '.eos/project.json': APP_PROJECT });
  const tag = planRelease({ root: standard, event: 'push', refType: 'tag', refName: 'v1.0.0', repo: 'acme/app' });
  assert.deepEqual(tag, { track: 'standard', release: 'v1.0.0', manifest: 'false', attest: 'true', publish: 'true', name: 'app-v1.0.0' });

  const regulated = project({ '.eos/project.json': { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci' } });
  assert.equal(planRelease({ root: regulated, event: 'push', refType: 'tag', refName: 'v2', repo: 'acme/app' }).track, 'regulated');

  const dispatch = planRelease({ root: standard, event: 'workflow_dispatch', refType: 'branch', refName: 'main', requested: 'regulated', repo: 'acme/app' });
  assert.equal(dispatch.track, 'regulated');
  assert.equal(dispatch.publish, 'false');
  assert.equal(dispatch.release, 'dry-run');

  const fork = planRelease({ root: standard, event: 'pull_request', refType: 'branch', refName: '1/merge', headRepo: 'someone/app', repo: 'acme/app' });
  assert.equal(fork.attest, 'false', 'a fork gets no OIDC token, so it must not try to attest');
  assert.throws(() => planRelease({ root: standard, event: 'push', requested: 'enterprise' }), /unknown track/);
});

test('a tag with a manifest is planned for binding', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['release', 'init', '--release', 'v3.0.0']).code, 0);
  commitAll(dir, 'manifest');
  assert.equal(planRelease({ root: dir, event: 'push', refType: 'tag', refName: 'v3.0.0', repo: 'acme/app' }).manifest, 'true');
});
