// Audit regression — EOS-AUD-007…011 + migration — release, compliance and supply chain.
//
// One executable regression per finding of the eos-1.12.0 audit. Each test first performs the
// reported bypass — the exact sequence the auditor walked — and then asserts that it no longer
// works. A test here failing means an audit finding has re-opened.
//
// Split out of the original single audit-regression file so the suites run in parallel; the shared
// preamble lives in ./audit-support.mjs.
//   node --test .github/eos/audit-release.test.mjs
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

// ===================================================================== EOS-AUD-007 (P1)
// "the release prompt asks for more than the machine gate checks".

test('EOS-AUD-007: every item the release prompt asks for has a machine check', () => {
  const gates = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/gates.json'), 'utf8'));
  const release = gates.gates.find((g) => g.id === 'release-ready');
  const ids = release.checks.map((c) => c.id);
  for (const required of [
    'candidate-identity', 'candidate-quality', 'stories-verified', 'story-evidence-current',
    'spec-alignment', 'secret-scan', 'dependency-audit', 'nfr-evidence', 'compliance-boundary',
    'no-expired-waivers', 'ops-artifacts', 'deployment-topology', 'activation-authority',
  ]) {
    assert.ok(ids.includes(required), `the release gate has no machine check for "${required}"`);
  }
});

test('EOS-AUD-007: a runbook without canary or health/readiness does not pass the release gate', () => {
  const dir = verifiedStory(releaseFiles({ 'ops/runbook.md': '# Runbook\n\n## Rollback\n\nRoll the deployment back.\n' }));
  const r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  const check = r.json.checks.find((c) => c.id === 'ops-artifacts');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /canary/);
  assert.match(check.detail, /health/);
});

test('EOS-AUD-007: an undeclared dependency audit is a failure, and offline is DEFERRED — never PASS', () => {
  const dir = verifiedStory(releaseFiles({ '.eos/project.json': APP_PROJECT }));
  let r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  let check = r.json.checks.find((c) => c.id === 'dependency-audit');
  assert.ok(['FAIL', 'PENDING'].includes(check.status), JSON.stringify(check));

  // A declared audit whose tool is not installed is DEFERRED with a named reason, not a pass.
  write(dir, '.eos/project.json', { ...APP_PROJECT, commands: { test: 'node --version', audit: 'definitely-not-a-real-binary audit' } });
  r = runJson(dir, ['verify-release', '--release', 'v1.0.0']);
  check = r.json.result.checks.find((c) => c.id === 'dependency-audit');
  assert.equal(check.status, 'DEFERRED', JSON.stringify(check));
  assert.notEqual(r.code, 0, 'DEFERRED must never make the release gate green');
});

test('EOS-AUD-007: a REGULATED product may not defer the dependency audit — it BLOCKS', () => {
  const dir = verifiedStory(releaseFiles({
    '.eos/project.json': { ...APP_PROJECT, complianceProfile: 'regulated', evidencePolicy: 'local', evidencePolicyReason: 'Air-gapped fixture; no external attestation authority is reachable.', commands: { test: 'node --version', audit: 'definitely-not-a-real-binary audit' } },
  }));
  const r = runJson(dir, ['verify-release', '--release', 'v1.0.0']);
  const check = r.json.result.checks.find((c) => c.id === 'dependency-audit');
  assert.equal(check.status, 'BLOCKED', JSON.stringify(check));
  assert.match(check.detail, /regulated/);
});

test('EOS-AUD-007: NFR targets need measurements; a deferral needs an owner and a trigger', () => {
  const dir = verifiedStory(releaseFiles({ 'docs/evidence/nfr-summary.json': undefined }));
  rmSync(join(dir, 'docs/evidence/nfr-summary.json'), { force: true });
  let r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'nfr-evidence')), /does not exist/);

  const nfrDigest = treeDigest(dir);
  const nfr = (targets) => ({ schemaVersion: 1, generatedAt: '2026-01-01T00:00:00.000Z', productTree: { digest: nfrDigest }, targets });

  write(dir, 'docs/evidence/nfr-summary.json', nfr([{ id: 'NFR1', decision: 'DEFER' }]));
  r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'nfr-evidence')), /owner and a trigger/);

  // A target that REPORTS PASS while its numbers miss the threshold is a failure: the verdict is
  // recomputed from the measurement, not read from the summary's own conclusion.
  write(dir, 'docs/evidence/nfr-summary.json', nfr([{ id: 'NFR1', decision: 'ADOPT', metric: 'p95 latency', comparator: '<=', threshold: 800, observed: 2400, unit: 'ms', status: 'PASS' }]));
  r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'nfr-evidence')), /the numbers say otherwise/);

  // An NFR declared in the requirements record cannot be dropped by omitting it from the summary.
  write(dir, 'docs/evidence/nfr-summary.json', nfr([{ id: 'NFR9', decision: 'SKIP', reason: 'this target belongs to a different service entirely' }]));
  r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'nfr-evidence')), /no result for NFR\(s\) declared/);

  write(dir, 'docs/evidence/nfr-summary.json', nfr([{ id: 'NFR1', decision: 'DEFER', owner: '@platform', trigger: 'before the first paying customer' }]));
  r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  assert.equal(r.json.checks.find((c) => c.id === 'nfr-evidence').status, 'DEFERRED');
});

test('EOS-AUD-007: unverifiable enforcement authority is BLOCKED, never a self-issued PASS', () => {
  const dir = verifiedStory(releaseFiles({
    'docs/eos/activation.md': '# Activation\n\n- [ ] Branch protection on the default branch\n',
  }));
  const r = runJson(dir, ['release-status', '--release', 'v1.0.0']);
  const check = r.json.checks.find((c) => c.id === 'activation-authority');
  assert.equal(check.status, 'BLOCKED', JSON.stringify(check));
  assert.match(check.detail, /UNVERIFIED is not PASS/);
});

// ===================================================================== EOS-AUD-008 (P1)
// "the documentation claimed isTemplate:true; the GitHub API says false".

test('EOS-AUD-008: a claim about the template setting always ships with the way to check it', () => {
  // The finding was NOT "never say the template is enabled" — it was that the docs asserted an
  // owner-level GitHub setting as settled fact, and the API disagreed. The setting can flip at any
  // time without a single byte of this repository changing, so the durable rule is: wherever a
  // document mentions it, the reader is handed the one-line command that answers it for real.
  const docs = ['docs/eos/user-manual.md', 'docs/zh/user-manual.md', 'docs/eos/blueprint.md', 'docs/zh/blueprint.md', 'README.md', 'README.zh.md'];
  for (const rel of docs) {
    const full = join(REPO_ROOT, rel);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    const mentions = text.includes('isTemplate') || /--template\s+niaodian\/eos/.test(text);
    if (!mentions) continue;
    assert.match(text, /gh repo view niaodian\/eos --json isTemplate/,
      `${rel} discusses the template setting but never shows how to verify it`);
    // ...and it must not be presented as a permanent property of the project.
    assert.doesNotMatch(text, /(?:already|已)\s*(?:set|设)[^\n]{0,20}isTemplate/i,
      `${rel} asserts the template flag as an established fact`);
  }
});

test('EOS-AUD-008: every degit example pins a release tag instead of drifting with the default branch', () => {
  for (const rel of ['docs/eos/user-manual.md', 'docs/zh/user-manual.md', 'docs/eos/quickstart.md', 'docs/zh/quickstart.md', 'README.md', 'README.zh.md']) {
    const full = join(REPO_ROOT, rel);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      if (!/degit\s+niaodian\/eos/.test(line)) continue;
      assert.match(line, /niaodian\/eos#eos-\d+\.\d+\.\d+/, `${rel}: degit example must pin a release tag — ${line.trim()}`);
    }
  }
});

// ===================================================================== EOS-AUD-009 (P2)
// "GitHub Actions supply chain".

test('EOS-AUD-009: every action is pinned to an immutable SHA, with least privilege and a timeout', () => {
  const wf = readFileSync(join(REPO_ROOT, '.github/workflows/eos-ci.yml'), 'utf8');
  const uses = [...wf.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length, 'the workflow must use at least one action');
  for (const u of uses) {
    assert.match(u, /@[0-9a-f]{40}$/, `action "${u}" is not pinned to a 40-character commit SHA`);
  }
  assert.match(wf, /^permissions:\n\s+contents: read/m, 'the workflow needs a least-privilege default token');
  assert.match(wf, /^concurrency:/m);
  const timeouts = [...wf.matchAll(/timeout-minutes:\s*\d+/g)];
  const jobsBlock = wf.slice(wf.indexOf('\njobs:'));
  const jobs = [...jobsBlock.matchAll(/^ {2}[a-z][a-z0-9-]*:\n/gm)];
  assert.ok(jobs.length >= 2, 'expected the verify and release-candidate jobs');
  assert.equal(timeouts.length, jobs.length, 'every job needs a timeout');
  // Comments may DISCUSS it; the workflow must not USE it — it grants a writable token to fork code.
  const active = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(active, /pull_request_target/);
  assert.match(wf, /persist-credentials:\s*false/);
});

// ===================================================================== EOS-AUD-010 (P2)
// "RELEASED is a dead end": the router proposed preparing another release.

test('EOS-AUD-010: a RELEASED release routes to telemetry, then to the iteration write-back', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-1' });
  writeManifest(dir, { releaseId: 'R-1' });

  // Reach RELEASED through the machine: candidate → verified → approved (2nd person) → released.
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'CANDIDATE']).code, 0);
  const verify = run(dir, ['verify-release', '--release', 'R-1']);
  assert.equal(verify.code, 0, verify.out);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'VERIFIED']).code, 0);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1'], { EOS_ACTOR: 'second-person' }).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'APPROVED']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'RELEASED']).code, 0);

  // G9: the loop continues into observability, it does not restart at "prepare the release".
  let r = runJson(dir, ['next']);
  assert.notEqual(r.json.recommendedAction.id, 'prepare-release', 'RELEASED must not route back to preparing a release');
  assert.ok(['land-telemetry', 'repair-telemetry'].includes(r.json.recommendedAction.id), JSON.stringify(r.json.recommendedAction));

  write(dir, 'docs/telemetry-plan.md', TELEMETRY_MD);
  write(dir, 'docs/telemetry.json', TELEMETRY_RECORD);
  assert.equal(run(dir, ['check', '--gate', 'telemetry-ready', '--scope', 'R-1']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'OBSERVED']).code, 0);

  // G10: what production taught must land in the specs before the loop closes.
  r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'close-the-loop', JSON.stringify(r.json.recommendedAction));
  write(dir, 'docs/iteration.json', bindDigests(dir, ITERATION_RECORD));
  assert.equal(run(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'ITERATED']).code, 0);
  assert.equal(runJson(dir, ['next']).json.recommendedAction.id, 'start-next-change');
});

test('EOS-AUD-010: a ROLLED_BACK release routes to an incident review, not to another release', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-2' });
  writeManifest(dir, { releaseId: 'R-2' });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-2', '--to', 'CANDIDATE']);
  run(dir, ['verify-release', '--release', 'R-2']);
  run(dir, ['transition', '--scope', 'release', '--id', 'R-2', '--to', 'VERIFIED']);
  run(dir, ['approve', '--scope', 'release', '--id', 'R-2'], { EOS_ACTOR: 'second-person' });
  run(dir, ['transition', '--scope', 'release', '--id', 'R-2', '--to', 'APPROVED']);
  run(dir, ['transition', '--scope', 'release', '--id', 'R-2', '--to', 'RELEASED']);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-2', '--to', 'ROLLED_BACK']).code, 0);

  const r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'review-incident', JSON.stringify(r.json.recommendedAction));
  assert.equal(r.code, 2);
});

test('EOS-AUD-010: an agentic product must feed production back into the eval dataset at G10', () => {
  const dir = project(baselineFiles({
    '.eos/project.json': { ...APP_PROJECT, productParadigms: ['deterministic', 'agentic'], commands: { test: 'node --version', eval: 'node --version' } },
    'docs/telemetry-plan.md': TELEMETRY_MD,
    'docs/telemetry.json': TELEMETRY_RECORD,
    'docs/iteration.json': ITERATION_RECORD, // has no evalDatasetUpdate
  }));
  const r = runJson(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'agentic-feedback')), /eval dataset/);
});

// ===================================================================== EOS-AUD-011 (P2)
test('EOS-AUD-011: the regulated-agentic preset exists, validates, and is honest about its limits', () => {
  const rel = 'docs/eos/examples/regulated-agentic/project.json';
  const preset = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
  assert.equal(preset.projectType, 'application');
  assert.deepEqual(preset.productParadigms, ['deterministic', 'agentic']);
  assert.equal(preset.complianceProfile, 'regulated');
  assert.ok(preset.commands.test && preset.commands.eval, 'a regulated agentic product needs both a test and an eval command');

  const readme = readFileSync(join(REPO_ROOT, 'docs/eos/examples/regulated-agentic/README.md'), 'utf8');
  assert.match(readme, /does not (make you |)compliant|not.*automatic(ally)? compliant/i,
    'the preset must state that it does not confer compliance');
  for (const topic of [/prompt injection/i, /PII/i, /groundedness/i, /human/i, /rollback/i, /audit/i]) {
    assert.match(readme, topic, `the preset must cover ${topic}`);
  }
  // The preset is a real declaration: EOS must accept it.
  const dir = project({ '.eos/project.json': preset });
  const r = runJson(dir, ['status']);
  assert.deepEqual(r.json.errors || [], []);
});

// ===================================================================== migration
test('migration: evidence written by the previous evaluator is STALE, not an unreadable ERROR', () => {
  // Exactly what a repository upgraded from eos-1.12.0 has on disk: schemaVersion 1, the old
  // evaluator version, and no product-tree binding. It must still PARSE (so it can be explained)
  // and it must not be usable (so nothing is promoted on it).
  const dir = verifiedStory();
  const rel = '.eos/evidence/verified__story__STORY-001.json';
  const legacy = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  delete legacy.productTree;
  legacy.schemaVersion = 1;
  legacy.evaluatorVersion = '1.0.0';

  const read = readEvidence(dir, 'verified', 'story', 'STORY-001');
  assert.equal(read.error, null);
  writeFileSync(join(dir, rel), JSON.stringify(legacy, null, 2) + '\n');
  const reread = readEvidence(dir, 'verified', 'story', 'STORY-001');
  assert.equal(reread.error, null, 'legacy evidence must remain readable so it can be reported, not crash the reader');

  const gates = JSON.parse(readFileSync(join(dir, '.eos/gates.json'), 'utf8'));
  const def = gates.gates.find((g) => g.id === 'verified');
  clearProductTreeCache();
  const f = evidenceFreshness(dir, reread.evidence, { gateDefinition: def });
  assert.equal(f.status, 'STALE');
  assert.match(f.reasons.join(' | '), /evaluator version changed \(1\.0\.0 → /);
  assert.match(f.reasons.join(' | '), /predates tested-product-tree binding/);

  // …and the CLI refuses the promotion rather than reporting a parse failure.
  const r = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /invalid JSON|not valid gate evidence/);
});
