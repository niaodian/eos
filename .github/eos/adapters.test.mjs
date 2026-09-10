// Provider adapters — the contract, exercised entirely offline.
//
// The whole point of the mock provider is that these cases are reproducible on a plane. An adapter
// whose failure modes can only be seen with a network is an adapter whose failure modes are never
// tested, and this suite is what stops "we added an integration" from quietly meaning "we added an
// untested way to be wrong".
//   node --test .github/eos/adapters.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, story, commitAll, releaseFiles, storyFiles,
  writeManifest, APP_PROJECT, REPO_ROOT } from './test-support.mjs';
import { resolve, result, consult, loadProviders, PROVIDER_STATUSES } from './adapters/contract.mjs';

after(cleanup);

const SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/providers.schema.json'), 'utf8'));

/** A sandbox with a mock provider configured for one subject. */
function withProvider(files, { subject = 'enforcement-authority', options = {}, adapter = 'mock' } = {}) {
  const dir = project({
    ...files,
    '.eos/schemas/providers.schema.json': SCHEMA,
    '.eos/providers.json': { schemaVersion: 1, providers: [{ adapter, subjects: [subject], options }] },
  }, { withHooks: true });
  return dir;
}

// ---------------------------------------------------------------- D4: monotonic by construction

test('D4: a provider raises a verdict it can prove, and only that', () => {
  const floor = { status: 'BLOCKED', detail: 'EOS cannot see server-side settings' };
  const pass = result({ provider: 'mock', subject: 'enforcement-authority', status: 'PASS', detail: 'protection is enforced' });
  const raised = resolve(floor, pass);
  assert.equal(raised.status, 'PASS');
  assert.match(raised.detail, /verified by mock/, 'a raised verdict must name who raised it and when');
});

test('D4: an absent, broken, unauthorised or slow provider never lowers the verdict', () => {
  const floor = { status: 'BLOCKED', detail: 'EOS cannot see server-side settings' };
  assert.equal(resolve(floor, null).status, 'BLOCKED', 'no provider configured');
  for (const status of ['ERROR', 'FAIL', 'UNVERIFIED', 'DEFERRED', 'BLOCKED']) {
    const applied = resolve(floor, result({ provider: 'mock', subject: 's', status, detail: 'could not answer' }));
    assert.equal(applied.status, 'BLOCKED', `a ${status} verdict must not change the floor`);
    assert.match(applied.detail, /mock/, 'the provider objection must still be reported, not swallowed');
  }
});

test('D4: a provider cannot pull a passing verdict down', () => {
  // The floor is the verdict EOS reached on its own. A provider adds authority it has; it does not
  // get to veto a conclusion EOS could already justify.
  const green = { status: 'PASS', detail: 'every activation item is closed' };
  const applied = resolve(green, result({ provider: 'mock', subject: 's', status: 'UNVERIFIED', detail: 'GitHub unreachable' }));
  assert.equal(applied.status, 'PASS');
  assert.match(applied.detail, /UNVERIFIED — GitHub unreachable/, 'and the disagreement is still visible');
});

test('D4: an adapter that crashes is an ERROR verdict, not a crashed EOS', async () => {
  const dir = withProvider({}, { options: { throw: 'boom' } });
  const v = await consult(dir, 'enforcement-authority');
  assert.equal(v.status, 'ERROR');
  assert.match(v.detail, /the adapter failed: boom/);
  // ...and under D4 that leaves the floor untouched.
  assert.equal(resolve({ status: 'BLOCKED', detail: 'floor' }, v).status, 'BLOCKED');
});

test('D4: an unknown adapter is reported, never guessed', async () => {
  const dir = project({ '.eos/schemas/providers.schema.json': SCHEMA });
  const v = await consult(dir, 'enforcement-authority', { providers: [{ adapter: 'not-a-real-adapter', subjects: ['enforcement-authority'] }] });
  assert.equal(v.status, 'ERROR');
  assert.match(v.detail, /unknown adapter/);
});

// ---------------------------------------------------------------- the gate it was built for

test('activation-authority: BLOCKED offline, PASS when an authority confirms it', () => {
  const files = {
    ...releaseFiles(),
    '.eos/project.json': APP_PROJECT,
    'docs/eos/activation.md': '# Activation\n\n- [ ] Branch protection on the default branch\n',
  };
  // Offline, with an open item: exactly today's honest answer.
  const plain = project(files, { withHooks: true });
  let r = runJson(plain, ['release-status', '--release', 'R-1']);
  let check = r.json.checks.find((c) => c.id === 'activation-authority');
  assert.equal(check.status, 'BLOCKED', JSON.stringify(check));

  // With an authority that confirms the server enforces it, the same open item can now PASS —
  // because the thing the item was standing in for has actually been verified.
  const withAuth = withProvider(files, { options: { status: 'PASS', detail: 'main requires verify + Code Owner review' } });
  const verified = run(withAuth, ['check', '--gate', 'release-ready', '--scope', 'R-1']);
  assert.match(verified.out, /activation-authority/);
  assert.match(verified.out, /main requires verify/, verified.out.slice(0, 400));
});

test('a provider that says NO is a verified negative, and it is reported', () => {
  const dir = withProvider({
    ...releaseFiles(),
    '.eos/project.json': APP_PROJECT,
    'docs/eos/activation.md': '# Activation\n\n- [ ] Branch protection\n',
  }, { options: { status: 'FAIL', detail: 'main has no branch-protection rule' } });
  const r = run(dir, ['check', '--gate', 'release-ready', '--scope', 'R-1']);
  assert.match(r.out, /no branch-protection rule/, r.out.slice(0, 400));
});

// ---------------------------------------------------------------- attestation

test('evidencePolicy "attested" is not satisfied by a claim alone', () => {
  const attested = {
    ...storyFiles(),
    '.eos/project.json': { ...APP_PROJECT, evidencePolicy: 'attested', commands: { test: 'node --version', audit: 'node --version' } },
  };
  // The summary CLAIMS provenance; with no provider configured, nobody has checked it.
  const dir = project(attested, { withHooks: true });
  const runFile = JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));
  write(dir, 'docs/evidence/test-run.json', { ...runFile, attestation: { type: 'slsa', reference: 'sha256:deadbeef' } });
  commitAll(dir, 'claim provenance');
  writeManifest(dir, { releaseId: 'R-1' });
  const r = runJson(dir, ['release-status', '--release', 'R-1']);
  const check = r.json.checks.find((c) => c.id === 'evidence-trust');
  assert.equal(check.status, 'BLOCKED', JSON.stringify(check));
  assert.match(check.detail, /no provider is configured to verify it/);
});

test('evidencePolicy "attested" passes once an authority verifies the claim', () => {
  const dir = withProvider({
    ...storyFiles(),
    '.eos/project.json': { ...APP_PROJECT, evidencePolicy: 'attested', commands: { test: 'node --version', audit: 'node --version' } },
  }, { subject: 'evidence-provenance', options: { status: 'PASS', detail: 'provenance verified for dist/app.tgz' } });
  const runFile = JSON.parse(readFileSync(join(dir, 'docs/evidence/test-run.json'), 'utf8'));
  write(dir, 'docs/evidence/test-run.json', { ...runFile, attestation: { type: 'github', reference: 'sha256:deadbeef' } });
  commitAll(dir, 'claim provenance');
  writeManifest(dir, { releaseId: 'R-1' });
  const r = run(dir, ['check', '--gate', 'release-ready', '--scope', 'R-1']);
  assert.match(r.out, /ATTESTED \(mock\)|provenance verified/, r.out.slice(0, 500));
});

// ---------------------------------------------------------------- configuration & boundaries

test('no provider configuration is the default posture, and it is silent', () => {
  const dir = project({});
  const { present, providers, errors } = loadProviders(dir);
  assert.equal(present, false);
  assert.deepEqual(providers, []);
  assert.deepEqual(errors, [], 'having no integrations is not a problem to report');
  assert.match(run(dir, ['providers']).out, /none configured/);
});

test('an invalid provider configuration is an error, not a silently ignored file', () => {
  const dir = project({ '.eos/schemas/providers.schema.json': SCHEMA, '.eos/providers.json': { schemaVersion: 1, providers: [{ adapter: 'mock' }] } });
  assert.ok(loadProviders(dir).errors.length, 'a provider with no subjects must be reported');

  // The template ships the schema, so removing it is how the "unvalidatable" case is constructed.
  const noSchema = project({ '.eos/providers.json': { schemaVersion: 1, providers: [] } });
  rmSync(join(noSchema, '.eos/schemas/providers.schema.json'), { force: true });
  assert.match(loadProviders(noSchema).errors.join(' '), /cannot be validated/,
    'a missing schema must not disable validation');
});

test('D3: no adapter reads a credential — they delegate to an already-authenticated CLI', () => {
  for (const name of ['contract.mjs', 'github-governance.mjs', 'github-attestation.mjs', 'mock.mjs']) {
    const text = readFileSync(join(REPO_ROOT, '.github/eos/adapters', name), 'utf8');
    const active = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(active, /process\.env\.[A-Z_]*(TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL)/i,
      `${name} reads a credential; adapters must delegate authentication instead`);
    assert.doesNotMatch(active, /--token|Authorization:/i, `${name} passes a credential`);
  }
});

test('D5: no adapter writes to an external system', () => {
  for (const name of ['github-governance.mjs', 'github-attestation.mjs']) {
    const text = readFileSync(join(REPO_ROOT, '.github/eos/adapters', name), 'utf8');
    const active = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(active, /-X\s*(PUT|POST|PATCH|DELETE)/i, `${name} makes a mutating call`);
    assert.doesNotMatch(active, /\b(create|edit|delete|merge)\b\s*['"]/, `${name} looks like it mutates`);
  }
});

test('every provider status is one EOS already knows how to reason about', () => {
  // A provider cannot invent a verdict shape the engine has no policy for.
  assert.deepEqual([...PROVIDER_STATUSES].sort(), ['BLOCKED', 'DEFERRED', 'ERROR', 'FAIL', 'PASS', 'UNVERIFIED']);
  const bogus = result({ provider: 'mock', subject: 's', status: 'DEFINITELY_FINE', detail: 'x' });
  assert.equal(bogus.status, 'ERROR', 'an unknown status must degrade to ERROR, never to PASS');
});
