// Signed release manifests and dual-track release verification (eos-2.0.0, ADR-012).
//   node --test .github/eos/release-signing.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { project, write, run, runJson, cleanup, commitAll, git, APP_PROJECT, REPO_ROOT, storyFiles } from './test-support.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const MANIFEST_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/release-manifest.schema.json'), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const keyDir = () => {
  const d = join(tmpdir(), `eos-keys-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const manifestOf = (dir, id = 'v1.0.0') => JSON.parse(readFileSync(join(dir, `.eos/releases/${id}.json`), 'utf8'));
const REGULATED = { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci' };

/** A project with a built artifact, a release key, and a bound release. */
function releaseRepo(declaration = APP_PROJECT) {
  const dir = project({
    '.eos/project.json': { ...declaration, release: { artifacts: ['dist/*.tgz'] } },
    'dist/app-1.0.0.tgz': 'pretend this is a build output\n',
  });
  const keys = keyDir();
  const keygen = run(dir, ['release', 'keygen', '--out', join(keys, 'release.pem'), '--write']);
  assert.equal(keygen.code, 0, keygen.out);
  commitAll(dir, 'release key');
  // A real release is cut from a history in which gates have run; binding records its head.
  run(dir, ['check', '--gate', 'activation']);
  commitAll(dir, 'activation evidence');
  assert.equal(run(dir, ['release', 'init', '--release', 'v1.0.0']).code, 0);
  const bind = run(dir, ['release', 'bind', '--release', 'v1.0.0']);
  assert.equal(bind.code, 0, bind.out);
  return { dir, key: join(keys, 'release.pem') };
}

// ---------------------------------------------------------------- keys
test('keygen writes the public key into the repository and the private key outside it', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const keys = keyDir();
  const r = run(dir, ['release', 'keygen', '--out', join(keys, 'release.pem'), '--write']);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, '.eos/keys/release.pub'), 'utf8'), /BEGIN PUBLIC KEY/);
  assert.match(readFileSync(join(keys, 'release.pem'), 'utf8'), /BEGIN PRIVATE KEY/);
  assert.equal(JSON.parse(readFileSync(join(dir, '.eos/project.json'), 'utf8')).release.signing.publicKey, '.eos/keys/release.pub');
  assert.match(r.out, /keyId\s+[0-9a-f]{64}/);
});

test('keygen refuses to put a private key inside the repository', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const r = run(dir, ['release', 'keygen', '--out', join(dir, '.eos/local/release.pem'), '--write']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /inside the repository/);
  assert.equal(existsSync(join(dir, '.eos/local/release.pem')), false);
});

test('a private-key path that reaches the repository through a symlink is still refused', (t) => {
  // On macOS /var is /private/var and git reports the real path: a string comparison let a path
  // inside the repository look like it was outside.
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const link = join(tmpdir(), `eos-link-${process.pid}-${Date.now()}`);
  try { symlinkSync(dir, link, 'junction'); } catch { t.skip('symlinks are unavailable here'); return; }
  const r = run(dir, ['release', 'keygen', '--out', join(link, 'release.pem'), '--write']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /inside the repository/);
  assert.equal(existsSync(join(dir, 'release.pem')), false);
});

// ---------------------------------------------------------------- bind records what ships
test('bind records the artifacts, the SBOM and the ledger head the release was cut from — and appends nothing', () => {
  const { dir } = releaseRepo();
  const m = manifestOf(dir);
  const events = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(JSON.parse(events.at(-1)).hash, m.ledger.hash, 'the manifest points at the committed head');
  assert.equal(run(dir, ['release', 'bind', '--release', 'v1.0.0']).code, 0);
  assert.equal(readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n').length, events.length, 'binding must not write to the ledger');
  assert.deepEqual(validate(MANIFEST_SCHEMA, m).errors, []);
  assert.deepEqual(m.artifacts.map((a) => a.path), ['dist/app-1.0.0.tgz']);
  assert.equal(m.artifacts[0].sha256, sha256(readFileSync(join(dir, 'dist/app-1.0.0.tgz'))));
  assert.match(m.ledger.hash, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------- sign / verify
test('a signed manifest verifies, and any edit to it is caught', () => {
  const { dir, key } = releaseRepo();
  const s = run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', key]);
  assert.equal(s.code, 0, s.out);
  assert.equal(manifestOf(dir).signature.alg, 'ed25519');
  assert.equal(run(dir, ['release', 'verify', '--release', 'v1.0.0']).code, 0);

  const m = manifestOf(dir);
  m.includedStories = ['STORY-SNUCK-IN'];
  write(dir, '.eos/releases/v1.0.0.json', m);
  const v = run(dir, ['release', 'verify', '--release', 'v1.0.0']);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /signature does not match/);
});

test('a signature survives a CRLF checkout — it covers the content, not the bytes', () => {
  const { dir, key } = releaseRepo();
  assert.equal(run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', key]).code, 0);
  const file = join(dir, '.eos/releases/v1.0.0.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const v = run(dir, ['release', 'verify', '--release', 'v1.0.0']);
  assert.equal(v.code, 0, v.out);
});

test('a key that is not the project\'s release key cannot sign for it', () => {
  const { dir } = releaseRepo();
  const other = project({ '.eos/project.json': APP_PROJECT });
  const otherKeys = keyDir();
  assert.equal(run(other, ['release', 'keygen', '--out', join(otherKeys, 'k.pem'), '--write']).code, 0);
  const r = run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', join(otherKeys, 'k.pem')]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not the project's release key/);
});

test('an artifact rebuilt after binding no longer matches its manifest', () => {
  const { dir } = releaseRepo();
  write(dir, 'dist/app-1.0.0.tgz', 'a different build\n');
  const v = run(dir, ['release', 'verify', '--release', 'v1.0.0']);
  assert.equal(v.code, 1, v.out);
  assert.match(v.out, /dist\/app-1\.0\.0\.tgz.*does not match/);
});

test('provenance must name every shipped artifact by digest', () => {
  const { dir } = releaseRepo();
  const digest = manifestOf(dir).artifacts[0].sha256;
  const statement = { _type: 'https://in-toto.io/Statement/v1', subject: [{ name: 'app-1.0.0.tgz', digest: { sha256: digest } }], predicateType: 'https://slsa.dev/provenance/v1', predicate: {} };
  const envelope = { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(statement)).toString('base64'), signatures: [] };
  write(dir, 'dist/app.intoto.jsonl', `${JSON.stringify(envelope)}\n`);
  const ok = run(dir, ['release', 'verify', '--release', 'v1.0.0', '--provenance', 'dist/app.intoto.jsonl']);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /covers 1\/1 artifact/);

  const wrong = { ...statement, subject: [{ name: 'app-1.0.0.tgz', digest: { sha256: 'f'.repeat(64) } }] };
  write(dir, 'dist/wrong.intoto.jsonl', `${JSON.stringify({ ...envelope, payload: Buffer.from(JSON.stringify(wrong)).toString('base64') })}\n`);
  const bad = run(dir, ['release', 'verify', '--release', 'v1.0.0', '--provenance', 'dist/wrong.intoto.jsonl']);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /no provenance names dist\/app-1\.0\.0\.tgz/);
});

// ---------------------------------------------------------------- dual-track release gate
function gateCheck(dir, id) {
  const r = runJson(dir, ['check', '--gate', 'release-ready', '--scope', 'v1.0.0']);
  assert.ok(r.json, r.out);
  return r.json.checks.find((c) => c.id === id);
}

test('Standard track: an unsigned release is not blocked — the gate says signing is optional', () => {
  const { dir } = releaseRepo();
  const c = gateCheck(dir, 'manifest-signature');
  assert.equal(c.status, 'NOT_APPLICABLE', JSON.stringify(c));
  assert.match(c.detail, /Standard track/);
});

test('Regulated track: an unsigned release FAILS the release gate, with the command that fixes it', () => {
  const { dir } = releaseRepo(REGULATED);
  const c = gateCheck(dir, 'manifest-signature');
  assert.equal(c.status, 'FAIL', JSON.stringify(c));
  assert.match(c.detail, /eos\.mjs release sign/);
});

test('Regulated track: a signed manifest passes the signature check', () => {
  const { dir, key } = releaseRepo(REGULATED);
  assert.equal(run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', key]).code, 0);
  commitAll(dir, 'sign');
  assert.equal(gateCheck(dir, 'manifest-signature').status, 'PASS');
});

test('Both tracks: a signature that is present but wrong FAILS — tampering is never optional', () => {
  const { dir, key } = releaseRepo();
  assert.equal(run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', key]).code, 0);
  const m = manifestOf(dir);
  m.targetEnvironments = ['production', 'somewhere-else'];
  write(dir, '.eos/releases/v1.0.0.json', m);
  commitAll(dir, 'tamper');
  assert.equal(gateCheck(dir, 'manifest-signature').status, 'FAIL');
});

test('Regulated track: a release that lists no artifact or provenance FAILS release integrity', () => {
  const dir = project({ '.eos/project.json': REGULATED });
  assert.equal(run(dir, ['release', 'init', '--release', 'v1.0.0']).code, 0);
  commitAll(dir, 'manifest');
  const c = gateCheck(dir, 'release-integrity');
  assert.equal(c.status, 'FAIL', JSON.stringify(c));
  assert.match(c.detail, /artifact/);
});

test('Standard track: no artifacts listed is NOT_APPLICABLE, not FAIL', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['release', 'init', '--release', 'v1.0.0']).code, 0);
  commitAll(dir, 'manifest');
  assert.equal(gateCheck(dir, 'release-integrity').status, 'NOT_APPLICABLE');
});

test('signing does not change the manifest digest that approvals are bound to', () => {
  const { dir, key } = releaseRepo();
  const before = runJson(dir, ['release', 'list']).json.releases[0].digest;
  assert.equal(run(dir, ['release', 'sign', '--release', 'v1.0.0', '--key', key]).code, 0);
  assert.equal(runJson(dir, ['release', 'list']).json.releases[0].digest, before);
});

test('an existing manifest without the new fields keeps its digest — approvals survive the upgrade', () => {
  const dir = project(storyFiles());
  git(dir, ['rev-parse', 'HEAD']);
  assert.equal(run(dir, ['release', 'init', '--release', 'v1.0.0']).code, 0);
  const listed = runJson(dir, ['release', 'list']).json.releases[0].digest;
  const m = manifestOf(dir);
  const legacy = {
    releaseId: String(m.releaseId), candidateCommit: m.candidateCommit ?? null, productTreeDigest: m.productTreeDigest ?? null,
    includedStories: [...m.includedStories].sort(), excludedStories: [...(m.excludedStories || [])].map((e) => ({ id: e.id, reason: e.reason })).sort((a, b) => a.id.localeCompare(b.id)),
    targetEnvironments: [...m.targetEnvironments].sort(), artifactRefs: [], requiredEvidence: [], requiredApprovals: m.requiredApprovals?.count ?? 1,
  };
  assert.equal(listed, sha256(JSON.stringify(legacy)), 'the 1.x digest formula must still hold for a 1.x manifest');
});
