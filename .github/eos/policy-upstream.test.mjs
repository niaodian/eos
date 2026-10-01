// Central policy distribution with local enforcement (eos-2.0.0, ADR-013).
//
// An organization publishes a policy BASELINE (gates + profiles); a project declares it as
// `policyUpstream`. `eos policy sync` is the ONE command that may reach the network: it fetches the
// baseline, verifies its signature, vendors it and pins its digest. `eos policy check` stays offline
// and fails when the project is weaker than the baseline it pinned.
//   node --test .github/eos/policy-upstream.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { project, write, run, runJson, cleanup, commitAll, APP_PROJECT, REPO_ROOT } from './test-support.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const BASELINE_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/policy-baseline.schema.json'), 'utf8'));
const tmp = () => { const d = join(tmpdir(), `eos-up-${process.pid}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The organization's reference repository exports its policy as a baseline. */
function orgBaseline({ sign = false } = {}) {
  const org = project({ '.eos/project.json': APP_PROJECT });
  const out = join(tmp(), 'baseline.json');
  const args = ['policy', 'export', '--name', 'acme-engineering', '--version', '2026.10', '--out', out];
  let key = null;
  if (sign) {
    const keys = tmp();
    key = join(keys, 'org.pem');
    assert.equal(run(org, ['release', 'keygen', '--out', key, '--public', '.eos/keys/org-policy.pub', '--write']).code, 0);
    args.push('--sign', '--key', key);
  }
  const r = run(org, args);
  assert.equal(r.code, 0, r.out);
  return { org, file: out, key, publicKey: sign ? readFileSync(join(org, '.eos/keys/org-policy.pub'), 'utf8') : null };
}

/** A project that follows the baseline. */
function follower(source, { publicKey = null } = {}) {
  const files = { '.eos/project.json': { ...APP_PROJECT, policyUpstream: { source, ...(publicKey ? { publicKey: '.eos/keys/org-policy.pub' } : {}) } } };
  if (publicKey) files['.eos/keys/org-policy.pub'] = publicKey;
  return project(files);
}

function weaken(dir) {
  // The project quietly lets FEATURE work skip `verified` — a gate the organization requires.
  const wf = readJson(join(dir, '.eos/workflow.json'));
  wf.profiles['standard-product'].changeTypes.FEATURE.gates.verified = 'not_applicable';
  write(dir, '.eos/workflow.json', wf);
}

// ---------------------------------------------------------------- export
test('policy export writes a baseline of gates and profiles — never a project\'s own declaration', () => {
  const { file } = orgBaseline();
  const b = readJson(file);
  assert.deepEqual(validate(BASELINE_SCHEMA, b).errors, []);
  assert.equal(b.kind, 'eos-policy-baseline');
  assert.equal(b.name, 'acme-engineering');
  assert.ok(b.snapshot.gates.verified, 'gates travel');
  assert.ok(b.snapshot.workflow.profiles['standard-product'], 'profiles travel');
  assert.equal(b.snapshot.project, null, 'what one project is says nothing about another');
});

// ---------------------------------------------------------------- sync (file) + offline check
test('policy sync vendors the baseline and pins it; policy check then enforces it offline', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  const s = run(dir, ['policy', 'sync']);
  assert.equal(s.code, 0, s.out);
  assert.deepEqual(readJson(join(dir, '.eos/policy.upstream.json')).snapshot, readJson(file).snapshot);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  const lock = readJson(join(dir, '.eos/policy.lock.json'));
  assert.equal(lock.upstream.name, 'acme-engineering');
  assert.match(lock.upstream.digest, /^[0-9a-f]{64}$/);
  commitAll(dir, 'follow the org baseline');
  assert.equal(run(dir, ['policy', 'check']).code, 0);
});

test('a project weaker than its baseline fails policy check — until a second person acknowledges it', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  assert.equal(run(dir, ['policy', 'sync']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'baseline');
  weaken(dir);
  commitAll(dir, 'weaken');
  const c = run(dir, ['policy', 'check', '--against', 'HEAD']);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /weaker than the organization baseline acme-engineering@2026\.10/);
  assert.match(c.out, /upstream:/);

  assert.equal(run(dir, ['policy', 'lock', '--write', '--reason', 'Pilot team ships docs-only FEATURE work this quarter.'], { EOS_ACTOR: 'dev-a' }).code, 0);
  const lock = readJson(join(dir, '.eos/policy.lock.json'));
  const ack = lock.acknowledged.find((a) => a.change.startsWith('upstream:'));
  assert.ok(ack, JSON.stringify(lock.acknowledged));
  assert.equal(run(dir, ['policy', 'check', '--against', 'HEAD']).code, 1, 'drafted, but no approver yet');
  ack.approver = 'lead-b';
  write(dir, '.eos/policy.lock.json', lock);
  const ok = run(dir, ['policy', 'check', '--against', 'HEAD']);
  assert.equal(ok.code, 0, ok.out);
});

test('the vendored baseline cannot be edited to make a weaker project pass', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  assert.equal(run(dir, ['policy', 'sync']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  const vendored = readJson(join(dir, '.eos/policy.upstream.json'));
  vendored.snapshot.workflow.profiles['standard-product'].changeTypes.FEATURE.gates.verified = 'not_applicable';
  write(dir, '.eos/policy.upstream.json', vendored);
  const c = run(dir, ['policy', 'check']);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /policy\.upstream\.json does not match the baseline pinned/);
});

test('a signed baseline is verified at sync; a different key is refused', () => {
  const signed = orgBaseline({ sign: true });
  assert.equal(readJson(signed.file).signature.alg, 'ed25519');
  const dir = follower(`file:${signed.file}`, { publicKey: signed.publicKey });
  const s = run(dir, ['policy', 'sync']);
  assert.equal(s.code, 0, s.out);
  assert.match(s.out, /signature verified/);

  const other = orgBaseline({ sign: true });
  const wrong = follower(`file:${other.file}`, { publicKey: signed.publicKey });
  const r = run(wrong, ['policy', 'sync']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not by the declared key/);
});

test('policy sync --check notices an upstream that moved; policy check never looks', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  assert.equal(run(dir, ['policy', 'sync']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'synced');
  const moved = readJson(file);
  moved.version = '2026.11';
  writeFileSync(file, JSON.stringify(moved, null, 2));
  const check = run(dir, ['policy', 'sync', '--check']);
  assert.equal(check.code, 1, check.out);
  assert.match(check.out, /2026\.10 → 2026\.11/);
  assert.match(check.out, /eos\.mjs policy sync/);
  assert.equal(run(dir, ['policy', 'check']).code, 0, 'the offline check enforces what was pinned, not what is upstream now');
});

// ---------------------------------------------------------------- the network boundary
async function serve(body) {
  const child = spawn(process.execPath, ['-e', "const s=require('http').createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(process.env.BODY)});s.listen(0,'127.0.0.1',()=>console.log(s.address().port))"],
    { env: { ...process.env, BODY: body }, timeout: 60000 });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once('data', (d) => resolve(Number(String(d).trim())));
    child.once('error', reject);
  });
  return { url: `http://127.0.0.1:${port}/baseline.json`, stop: () => child.kill() };
}

test('policy sync fetches over the network — plain http only on loopback', async () => {
  const { file } = orgBaseline();
  const server = await serve(readFileSync(file, 'utf8'));
  try {
    const dir = follower(server.url);
    const s = run(dir, ['policy', 'sync']);
    assert.equal(s.code, 0, s.out);
    assert.equal(readJson(join(dir, '.eos/policy.upstream.json')).name, 'acme-engineering');
  } finally { server.stop(); }
  const insecure = follower('http://policy.example.com/baseline.json');
  const r = run(insecure, ['policy', 'sync']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /https/);
});

test('an unreachable upstream is BLOCKED and writes nothing; policy check stays offline', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  assert.equal(run(dir, ['policy', 'sync']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  const before = readFileSync(join(dir, '.eos/policy.upstream.json'), 'utf8');
  // Point the declaration at a port nothing listens on: sync is blocked, check never notices.
  const declared = readJson(join(dir, '.eos/project.json'));
  declared.policyUpstream.source = 'https://127.0.0.1:9/baseline.json';
  write(dir, '.eos/project.json', declared);
  const s = run(dir, ['policy', 'sync']);
  assert.equal(s.code, 2, s.out);
  assert.equal(readFileSync(join(dir, '.eos/policy.upstream.json'), 'utf8'), before);
  // policy check enforces the vendored copy and never fetches: an unreachable source cannot make it
  // fail, and no network error can appear in its verdict.
  const c = runJson(dir, ['policy', 'check']);
  assert.ok(c.json, c.out);
  assert.equal(c.json.ok, true, c.out);
  assert.doesNotMatch(c.out, /could not reach|BLOCKED|ECONNREFUSED/);
});

test('policy lock --write keeps the pinned baseline', () => {
  const { file } = orgBaseline();
  const dir = follower(`file:${file}`);
  assert.equal(run(dir, ['policy', 'sync']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  const pinned = readJson(join(dir, '.eos/policy.lock.json')).upstream;
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  assert.deepEqual(readJson(join(dir, '.eos/policy.lock.json')).upstream, pinned);
});
