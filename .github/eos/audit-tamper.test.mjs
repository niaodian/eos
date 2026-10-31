// Audit regressions — "EOS Gate tamper-resistance" (docs/research, 2026-10-31; ADR-025).
//
// One executable case per attack path the audit demonstrated against eos-2.7.0. A path closed in
// eos-2.8.0 asserts the fix. A path that iteration 2 closes is a `todo`: it runs, it is reported, and
// it does not fail the build — so the open gaps are visible in every run instead of in a document.
//
// What none of these can show is the authority itself: whether the repository's server-side rules
// hold. That is `node .github/eos/harden-github.mjs --check` (harden-github.test.mjs), run against
// GitHub.
//
//   node --test .github/eos/audit-tamper.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  project, write, run, runJson, cleanup, story, commitAll, releaseFiles, storyFiles, writeManifest, APP_PROJECT, verifiedStory,
} from './audit-support.mjs';
import { appendEvent, readEvents } from './lib/ledger.mjs';
import { evidenceFile } from './lib/evidence.mjs';
import { generateSigningKey } from './lib/signing.mjs';
import { evaluateToolCall } from '../hooks/lib/secret-rules.mjs';

after(cleanup);

const ITERATION_2 = 'iteration 2 of the remediation plan (platform-authenticated approvals, CI re-proof of claimed states)';
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const APP = { projectType: 'application', stacks: ['node'], productParadigms: ['deterministic'], commands: { test: 'node --version' } };

// ------------------------------------------------------------------ closed in eos-2.8.0

test('P5: replacing the release-signing key is a weakening that needs a second person', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['release', 'keygen', '--out', join(dir, '..', `${Date.now()}-p5.pem`), '--write']).code, 0);
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'declare the release key');
  write(dir, 'keys/agent.pub', generateSigningKey().publicPem);
  const declared = JSON.parse(readFileSync(join(dir, '.eos/project.json'), 'utf8'));
  write(dir, '.eos/project.json', { ...declared, release: { signing: { publicKey: 'keys/agent.pub' } } });
  const r = run(dir, ['policy', 'check', '--against', 'HEAD']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /WEAKENING project:trust-anchor-changed:release-signing/);
});

test('P6: the guardrail refuses the calls that rewrote the records and the identity', () => {
  const call = (tool, input) => evaluateToolCall(JSON.stringify({ tool_name: tool, tool_input: input })).decision;
  const LEDGER = '.eos/' + 'ledger/events.jsonl';
  assert.equal(call('Edit', { path: LEDGER, old_str: 'FAIL', new_str: 'PASS' }), 'deny');
  assert.equal(call('Edit', { path: '.eos/waivers/w.json', old_str: '""', new_str: '"cto"' }), 'deny');
  assert.equal(call('Bash', { command: 'EOS_ACTOR=alice node .github/eos/eos.mjs approve --scope release --id R-1' }), 'deny');
  assert.equal(call('Bash', { command: 'gh api -X DELETE repos/OWNER/REPO/branches/main/protection' }), 'deny');
});

test('F12: configuring the mock provider is a weakening, not a silent PASS for activation', () => {
  const dir = project({ '.eos/project.json': APP });
  assert.equal(run(dir, ['policy', 'lock', '--write']).code, 0);
  commitAll(dir, 'pin the policy');
  write(dir, '.eos/providers.json', { schemaVersion: 1, providers: [{ adapter: 'mock', subjects: ['enforcement-authority', 'evidence-provenance'] }] });
  const r = run(dir, ['policy', 'check', '--against', 'HEAD']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /WEAKENING providers:mock:enforcement-authority\+evidence-provenance/);
});

// ------------------------------------------------------------------ open until iteration 2

test('P1: an approval recorded under a name the agent typed is not accepted as independent', { todo: ITERATION_2 }, () => {
  const dir = verifiedStory(releaseFiles());
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-1' });
  writeManifest(dir, { releaseId: 'R-1' });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'CANDIDATE']);
  run(dir, ['verify-release', '--release', 'R-1']);
  run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'VERIFIED']);
  run(dir, ['approve', '--scope', 'release', '--id', 'R-1'], { EOS_ACTOR: 'alice-reviewer' });
  assert.notEqual(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'APPROVED']).code, 0,
    'only a platform-authenticated approval (a GitHub review or environment approval) may move a release to APPROVED');
});

test('P2: a gate result rewritten in the evidence and the ledger does not survive a re-proof', { todo: ITERATION_2 }, () => {
  const twoAcs = story({ rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', '—'], ['AC1.2', 'user can log out', 'tests/logout.test.mjs::logout', '—']] });
  const dir = project(storyFiles({ 'docs/stories/STORY-001.md': twoAcs }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST']) run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', to]);
  run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  const path = join(dir, evidenceFile('verified', 'story', 'STORY-001'));
  const forged = JSON.parse(readFileSync(path, 'utf8'));
  forged.checks = forged.checks.map((c) => (c.status === 'NOT_APPLICABLE' ? c : { ...c, status: 'PASS' }));
  forged.status = 'PASS';
  writeFileSync(path, `${JSON.stringify(forged, null, 2)}\n`);
  const { seq, ts, hash, prevHash, hv, actor, ...fields } = readEvents(dir).events.filter((e) => e.type === 'gate' && e.gate === 'verified').at(-1);
  appendEvent(dir, { ...fields, status: 'PASS', evidenceSha256: sha(path) });
  run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'VERIFIED']);
  const reproof = run(dir, ['verify', '--full', '--claims']);
  // Not just "some gate failed": the re-proof names the claimed state the evidence cannot carry, so a
  // story still in development with a failing gate is not mistaken for a forged one.
  assert.equal(reproof.code, 1);
  assert.match(reproof.out, /STORY-001[^\n]*claims VERIFIED/, 'CI refuses a claimed state the re-run gates cannot carry');
});

test('P3: a waiver approved by a name the agent typed is not honored', { todo: ITERATION_2 }, () => {
  const weak = story({ id: 'S1', changeType: 'HOTFIX', rows: [['AC1.1', 'the user can log in', '—', '—']], ops: false, deps: false });
  const dir = project({ '.eos/project.json': APP, 'docs/prd.md': '# PRD\n\n- AC1.1 the user can log in\n', 'docs/stories/S1.md': weak });
  run(dir, ['waive', '--gate', 'story-ready', '--scope', 'S1', '--reason', 'Production outage; readiness review deferred 24h.', '--risk-owner', 'ops-lead', '--expires', '2999-01-01', '--control', 'staging smoke test']);
  const file = join(dir, '.eos/waivers', readdirSync(join(dir, '.eos/waivers')).find((n) => n.endsWith('.json')));
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), approver: 'cto' }));
  assert.notEqual(runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'S1']).json?.status, 'WAIVED');
});

test('P4: a weakening acknowledged by a name the agent typed is not accepted', { todo: ITERATION_2 }, () => {
  const dir = project({ '.eos/project.json': APP });
  run(dir, ['policy', 'lock', '--write']);
  commitAll(dir, 'pin the policy');
  const gates = JSON.parse(readFileSync(join(dir, '.eos/gates.json'), 'utf8'));
  gates.gates.find((g) => g.id === 'verified').waivable = true;
  write(dir, '.eos/gates.json', gates);
  run(dir, ['policy', 'lock', '--write', '--reason', 'Temporary: allow waiving G7 during the migration sprint.']);
  const lock = JSON.parse(readFileSync(join(dir, '.eos/policy.lock.json'), 'utf8'));
  for (const a of lock.acknowledged) a.approver = 'bob-security-lead';
  write(dir, '.eos/policy.lock.json', lock);
  assert.notEqual(run(dir, ['policy', 'check', '--against', 'HEAD']).code, 0);
});
