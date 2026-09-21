// EOS CLI contract tests — exit codes, the JSON contract consumers depend on, resume, explain,
// handoff packages, non-destructive init and the doctor. Zero deps (node:test):
//   node --test .github/eos/cli.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, REPO_ROOT, APP_PROJECT, PRD_2AC, story } from './test-support.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const schema = (name) => JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas', name), 'utf8'));

const READY_REPO = () => project({
  '.eos/project.json': APP_PROJECT,
  'docs/discovery.md': '# Discovery\n',
  'docs/requirements.md': '# Requirements\n',
  'docs/prd.md': PRD_2AC,
  'docs/EXPERIENCE.md': 'SKIP — no user-facing surface (internal API only).\n',
  'docs/architecture.md': '# Architecture\n',
  'docs/stories/STORY-012.md': story({
    id: 'STORY-012',
    rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', '—'], ['AC1.2', 'user can log out', '—', '—']],
  }),
});

// ---------------------------------------------------------------- JSON contract
test('next --json satisfies the published next-action schema', () => {
  const r = runJson(READY_REPO(), ['next']);
  const v = validate(schema('next-action.schema.json'), r.json);
  assert.equal(v.valid, true, v.errors.join('\n') + '\n' + r.out);
});

test('resume --json satisfies the same contract and names the last verified gate', () => {
  const dir = READY_REPO();
  const r = runJson(dir, ['resume']);
  assert.equal(validate(schema('next-action.schema.json'), r.json).valid, true, r.out);
  assert.equal(r.json.current.scopeId, 'STORY-012');
  const text = run(dir, ['resume']).out;
  assert.match(text, /Current/);
  assert.match(text, /STORY-012/);
});

test('resume restores the focus in a brand-new session without re-reading the docs', () => {
  const dir = READY_REPO();
  run(dir, ['resume']); // first session records the focus
  assert.ok(existsSync(join(dir, '.eos/local/active-work.json')));
  const saved = JSON.parse(readFileSync(join(dir, '.eos/local/active-work.json'), 'utf8'));
  assert.equal(saved.scopeId, 'STORY-012');
  assert.ok(!('status' in saved) && !('gateStatus' in saved), 'local focus must not carry authority');
  const second = runJson(dir, ['resume']);
  assert.equal(second.json.current.scopeId, 'STORY-012');
});

test('the human output is the six-block card and nothing else', () => {
  const out = run(READY_REPO(), ['next']).out;
  for (const block of ['Current', 'Blockers', 'Recommended next', 'Why', 'Start', 'Done when']) {
    assert.match(out, new RegExp(`^${block}`, 'm'), `missing block: ${block}`);
  }
  assert.doesNotMatch(out, /BMAD skills are installed/i);
  assert.ok(out.split('\n').length <= 40, 'default output must stay scannable');
});

// ---------------------------------------------------------------- exit codes
test('exit codes: check PASS=0, FAIL=1, PENDING/STALE=2, ERROR=3', () => {
  const ok = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC, 'docs/stories/STORY-001.md': story() });
  assert.equal(run(ok, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);

  const fail = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC, 'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'log in', '—', '—']] }) });
  assert.equal(run(fail, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 1);

  const missing = project({ '.eos/project.json': APP_PROJECT });
  // A story that does not exist is a MISSING PREREQUISITE (BLOCKED, exit 2), never a pass.
  const noScope = run(missing, ['check', '--gate', 'story-ready', '--scope', 'NOPE']);
  assert.equal(noScope.code, 2, noScope.out);
  assert.match(noScope.out, /BLOCKED/);

  const broken = project({ '.eos/project.json': '{ not json' });
  assert.equal(run(broken, ['check', '--gate', 'activation']).code, 3);
});

test('exit codes: an unknown gate id is rejected (1), and G-codes resolve like ids', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/prd.md': PRD_2AC });
  assert.equal(run(dir, ['check', '--gate', 'not-a-gate']).code, 1);
  assert.equal(run(dir, ['check', '--gate', 'G3']).code, 0);
});

test('exit codes: an unknown command exits 3 with usage, never 0', () => {
  const { code, out } = run(project({ '.eos/project.json': APP_PROJECT }), ['frobnicate']);
  assert.equal(code, 3);
  assert.match(out, /usage/i);
});

// ---------------------------------------------------------------- explain
test('explain prints one gate only, on demand', () => {
  const dir = READY_REPO();
  const g5 = run(dir, ['explain', 'story-ready']);
  assert.equal(g5.code, 0);
  assert.match(g5.out, /ac-test-intent/);
  assert.doesNotMatch(g5.out, /release-ready/);
  assert.equal(run(dir, ['explain', 'G5']).out.includes('ac-test-intent'), true);
  assert.equal(run(dir, ['explain', 'nope']).code, 1);
});

// ---------------------------------------------------------------- handoff
test('handoff writes a minimal, verifiable context package', () => {
  const dir = READY_REPO();
  const r = run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012']);
  assert.equal(r.code, 0, r.out);
  const pkg = JSON.parse(readFileSync(join(dir, '.eos/handoffs/STORY-012.json'), 'utf8'));
  assert.equal(validate(schema('handoff.schema.json'), pkg).valid, true, JSON.stringify(validate(schema('handoff.schema.json'), pkg).errors));
  assert.equal(pkg.scope.id, 'STORY-012');
  assert.ok(pkg.doneWhen.length >= 1);
  assert.match(pkg.returnCommand, /eos\.mjs/);
  assert.ok(pkg.files.every((f) => f.sha256 && !f.path.includes('\\')));
  assert.ok(pkg.blockers.length >= 1, 'the package must carry the blockers, not the whole repo');
  const serialized = JSON.stringify(pkg);
  assert.doesNotMatch(serialized, /PASSWORD|SECRET|API_KEY/i);
});

test('handoff --verify reports STALE after an input changes', () => {
  const dir = READY_REPO();
  run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012']);
  assert.equal(run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012', '--verify']).code, 0);
  write(dir, 'docs/stories/STORY-012.md', story({ id: 'STORY-012', rows: [['AC1.1', 'changed', 'tests/x.test.mjs::y', '—']] }));
  const v = run(dir, ['handoff', '--scope', 'story', '--id', 'STORY-012', '--verify']);
  assert.equal(v.code, 2, v.out);
  assert.match(v.out, /STALE/);
});

// ---------------------------------------------------------------- doctor / agent map
test('doctor reports a missing agent file instead of recommending an unusable agent', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    '.eos/agent-map.json': { schemaVersion: 1, actions: { 'frame-the-problem': { agent: 'ghost-agent', skills: ['bmad-nope'] } } },
  });
  const { code, out } = run(dir, ['doctor']);
  assert.equal(code, 2, out);
  assert.match(out, /ghost-agent/);
  assert.match(out, /BLOCKED/);
});

test('doctor passes on the shipped configuration', () => {
  const r = run(REPO_ROOT, ['doctor']);
  assert.equal(r.code, 0, r.out);
});

// ---------------------------------------------------------------- init (non-destructive)
test('init --write creates local integration files but never overwrites existing ones', () => {
  const dir = READY_REPO();
  write(dir, '.vscode/tasks.json', '{ "version": "2.0.0", "tasks": [] }\n');
  const before = readFileSync(join(dir, '.vscode/tasks.json'), 'utf8');
  const r = run(dir, ['init', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(dir, '.vscode/tasks.json'), 'utf8'), before, 'existing tasks.json must be preserved');
  assert.match(r.out, /kept|exists/i);
});

test('init without --write changes nothing', () => {
  const dir = READY_REPO();
  const r = run(dir, ['init']);
  assert.equal(existsSync(join(dir, '.vscode/tasks.json')), false);
  assert.match(r.out, /--write/);
});

test('init --write on a fresh repo produces tasks that call this CLI', () => {
  const dir = READY_REPO();
  assert.equal(run(dir, ['init', '--write']).code, 0);
  const tasks = JSON.parse(readFileSync(join(dir, '.vscode/tasks.json'), 'utf8'));
  const labels = tasks.tasks.map((t) => t.label);
  for (const l of ['EOS: Next', 'EOS: Resume', 'EOS: Verify Current Gate', 'EOS: Release Status']) {
    assert.ok(labels.includes(l), `missing task ${l}`);
  }
  assert.ok(tasks.tasks.every((t) => JSON.stringify(t).includes('eos.mjs')));
});

// ---------------------------------------------------------------- waive (drafts, never approves)
test('waive drafts an unapproved waiver and refuses to honor it', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/HOT-003.md': story({ id: 'HOT-003', changeType: 'HOTFIX', rows: [['AC1.1', 'restore checkout', '—', '—']] }),
  });
  const r = run(dir, ['waive', '--gate', 'story-ready', '--scope', 'HOT-003',
    '--reason', 'Checkout is down in production and the readiness review is deferred by 24 hours.',
    '--risk-owner', 'ops-lead', '--expires', '2999-01-01', '--control', 'staging smoke test']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /approver/i);
  const file = join(dir, '.eos/waivers/story-ready__story__HOT-003.json');
  assert.ok(existsSync(file));
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).approver, '');
  assert.notEqual(runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'HOT-003']).json.status, 'WAIVED');
});

test('waive refuses a non-waivable gate outright', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/stories/STORY-001.md': story() });
  const r = run(dir, ['waive', '--gate', 'verified', '--scope', 'STORY-001',
    '--reason', 'We would rather not run the tests for this one release.',
    '--risk-owner', 'ops-lead', '--expires', '2999-01-01', '--control', 'none']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not waivable/i);
});

// ---------------------------------------------------------------- status / release
test('status --changed only reports the scopes touched by the working tree', () => {
  const dir = READY_REPO();
  const r = run(dir, ['status', '--changed']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /changed|no tracked changes/i);
});

test('release-status names passed / failed / stale / waived counts and one next step', () => {
  const dir = READY_REPO();
  const r = runJson(dir, ['release-status']);
  assert.ok(r.json.summary, r.out);
  for (const k of ['PASS', 'FAIL', 'STALE', 'WAIVED']) assert.ok(k in r.json.summary);
  const text = run(dir, ['release-status']).out;
  assert.match(text, /Recommended next/);
});

test('verify-release refuses evidence that is not bound to the candidate commit', () => {
  const dir = READY_REPO();
  const r = run(dir, ['verify-release', '--release', 'v0.1.0']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /BLOCKED|FAIL/);
});

// ---------------------------------------------------------------- offline / no-git guarantees
test('the CLI runs with no git repository and no network', () => {
  const dir = READY_REPO();
  const r = run(dir, ['status'], { PATH: process.env.PATH, EOS_OFFLINE: '1' });
  assert.notEqual(r.code, 3, r.out);
  assert.match(r.out, /EOS/);
});

// ---------------------------------------------------------------- scope of a green verdict
// [audit: config-only false PASS] Every surface that can report "green" has to say what that green
// does NOT cover. A repository with no product code can satisfy every gate EOS has while nothing
// about a product was ever executed, and a reader cannot infer that from a state name.
test('status says NO PRODUCT CODE VERIFIED when the project declares config-only', () => {
  const dir = project({ '.eos/project.json': { projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] } });
  const r = runJson(dir, ['status']);
  assert.equal(r.json.projectType, 'config-only');
  assert.equal(r.json.productCodeVerified, false);
  assert.match(run(dir, ['status']).out, /NO PRODUCT CODE VERIFIED/);
});

test('status says NO PRODUCT CODE VERIFIED when there is no project declaration at all', () => {
  const dir = project({ 'README.md': '# nothing declared\n' });
  assert.match(run(dir, ['status']).out, /NO PRODUCT CODE VERIFIED/);
});

test('status makes no such claim once real product code is declared', () => {
  const r = runJson(READY_REPO(), ['status']);
  assert.equal(r.json.projectType, 'application');
  assert.equal(r.json.productCodeVerified, true);
  assert.doesNotMatch(r.out, /NO PRODUCT CODE VERIFIED/);
});

test('doctor qualifies its own PASS on a config-only repository', () => {
  const dir = project({ '.eos/project.json': { projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] } });
  const r = run(dir, ['doctor']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /NO PRODUCT CODE VERIFIED/);
  assert.match(r.out, /covers EOS configuration only/);
});

// ---------------------------------------------------------------- diagnostic contract
// A status and a sentence tell you something is wrong. They do not tell you which rule decided the
// gate applies, which files the verdict is about, or how to reproduce it — so every consumer
// re-derived those from prose. These fields make a gate result actionable by a machine.
test('a gate verdict carries its policy source, artifacts, rerun command and waiver eligibility', () => {
  const r = runJson(project({ '.eos/project.json': APP_PROJECT }), ['check', '--gate', 'discovery-ready']);
  const g = r.json;
  assert.equal(g.policySource.file, '.eos/workflow.json');
  assert.equal(g.policySource.value, g.policy, 'the recorded policy and its source must agree');
  assert.match(g.policySource.pointer, /^profiles\..+\.changeTypes\..+\.gates\.discovery-ready$/);
  assert.ok(g.affectedArtifacts.includes('docs/discovery.md'), JSON.stringify(g.affectedArtifacts));
  assert.equal(g.rerunCommand, 'node .github/eos/eos.mjs check --gate discovery-ready');
  assert.equal(typeof g.waiverEligible, 'boolean');
});

test('policySource points at a pointer that actually resolves in workflow.json', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const { policySource } = runJson(dir, ['check', '--gate', 'discovery-ready']).json;
  const workflow = JSON.parse(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'));
  const resolved = policySource.pointer.split('.').reduce((node, key) => node?.[key], { profiles: workflow.profiles });
  assert.equal(resolved, policySource.value, 'a pointer nobody can follow is not a source');
});

test('a story-scoped gate names its own scope in the rerun command', () => {
  const r = runJson(READY_REPO(), ['check', '--gate', 'story-ready', '--scope', 'STORY-012']);
  assert.equal(r.json.rerunCommand, 'node .github/eos/eos.mjs check --gate story-ready --scope STORY-012');
});

test('a failing check names the artifact it is about, not only a sentence', () => {
  const r = runJson(project({ '.eos/project.json': APP_PROJECT }), ['check', '--gate', 'discovery-ready']);
  const written = r.json.checks.find((c) => c.id === 'discovery-written');
  assert.equal(written.artifact, 'docs/discovery.md');
});

test('the human rendering explains why the gate applies and how to re-run it', () => {
  const out = run(project({ '.eos/project.json': APP_PROJECT }), ['check', '--gate', 'discovery-ready']).out;
  assert.match(out, /Why this gate applies/);
  assert.match(out, /\.eos\/workflow\.json → profiles\./);
  assert.match(out, /re-run: node \.github\/eos\/eos\.mjs check --gate discovery-ready/);
});

// ---------------------------------------------------------------- health [audit #14]
// `status` answers "what next" and shows one thing. `health` answers the other question — how much
// is blocked, how much of the green has gone stale, what exceptions are outstanding. Every number
// must be DERIVED from records that already exist; a dashboard that can disagree with the engine
// is worse than no dashboard.
test('health reports progress, blockers, stale evidence, waivers and trend', () => {
  const r = runJson(READY_REPO(), ['health']);
  assert.equal(r.code, 0, r.out);
  for (const key of ['progress', 'blockers', 'staleEvidence', 'waivers', 'remoteGovernance', 'releases', 'trend']) {
    assert.ok(key in r.json, `health must report ${key}`);
  }
  assert.equal(r.json.progress.total, r.json.progress.gates.length);
});

test('health never invents a state the engine does not have', () => {
  const dir = READY_REPO();
  const health = runJson(dir, ['health']).json;
  const status = runJson(dir, ['status']).json;
  assert.equal(health.profile, status.profile);
  assert.equal(health.productCodeVerified, status.productCodeVerified);
  assert.deepEqual(health.stories.map((s) => s.id), status.stories.map((s) => s.id));
});

test('health counts a real waiver as an outstanding exception', () => {
  // standard-product leaves exactly one escape hatch: story-ready on a HOTFIX. Waiving anything
  // else is refused, so this is the only shape a real waiver can take at this tier.
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/prd.md': PRD_2AC,
    'docs/stories/STORY-777.md': story({ id: 'STORY-777', changeType: 'HOTFIX', classificationReason: 'production incident: logins failing for all users' }),
  });
  const w = run(dir, ['waive', '--gate', 'story-ready', '--scope', 'STORY-777', '--reason', 'incident response: the fix ships before the story is fully specified',
    '--risk-owner', 'alice', '--expires', '2099-01-01', '--control', 'a follow-up story is filed before the incident is closed']);
  // EOS drafts waivers and never approves them, so this deliberately does NOT exit 0. The draft is
  // still an outstanding exception a lead needs to see — in fact it is the one moment worth
  // reviewing, before it starts lifting a gate.
  assert.match(w.out, /DRAFTED/, w.out);
  const h = runJson(dir, ['health']).json;
  assert.equal(h.waivers.length, 1, JSON.stringify(h.waivers));
  assert.equal(h.waivers[0].riskOwner, 'alice');
  assert.equal(h.waivers[0].expired, false);
  assert.equal(h.waivers[0].inEffect, false, 'an unapproved draft must never read as in force');
  assert.match(h.waivers[0].why, /approver/);
});

test('health reports, it does not gate — a blocked project still exits 0', () => {
  const r = run(project({ '.eos/project.json': APP_PROJECT }), ['health']);
  assert.equal(r.code, 0, 'safe in a prompt or a watch loop');
  assert.match(r.out, /Blockers \(\d+\)/);
});

test('health surfaces evidence that has gone stale', () => {
  const dir = READY_REPO();
  run(dir, ['check', '--gate', 'discovery-ready']);
  write(dir, 'docs/discovery.md', '# Discovery\n\nrewritten after the gate ran\n');
  const h = runJson(dir, ['health']).json;
  assert.ok(h.staleEvidence.some((s) => s.gate === 'discovery-ready'), JSON.stringify(h.staleEvidence));
});

// ---------------------------------------------------------------- generated docs [audit #10]
// The same rule used to live in gates.json, in docs/, in the prompts and in the agents, with
// nothing keeping them in step. Generation makes the policy the only authority; --check makes CI
// refuse the drift instead of leaving it to be discovered by someone acting on stale prose.
test('docs --write generates the gate reference, the workflow and the evidence graph', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['docs', '--write']).code, 0);
  for (const f of ['gates.md', 'workflow.md', 'evidence-graph.md']) {
    assert.ok(existsSync(join(dir, 'docs/eos/generated', f)), `${f} was not generated`);
  }
  const gatesDoc = readFileSync(join(dir, 'docs/eos/generated/gates.md'), 'utf8');
  const gates = JSON.parse(readFileSync(join(dir, '.eos/gates.json'), 'utf8'));
  for (const g of gates.gates) assert.match(gatesDoc, new RegExp(`\`${g.id}\``), `${g.id} is missing from the reference`);
});

test('the generated workflow carries a real mermaid state diagram', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  run(dir, ['docs', '--write']);
  const wf = readFileSync(join(dir, 'docs/eos/generated/workflow.md'), 'utf8');
  assert.match(wf, /```mermaid\nstateDiagram-v2/);
  assert.match(wf, /\[\*\] --> UNINITIALIZED/);
});

test('docs --check is clean straight after a write', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  run(dir, ['docs', '--write']);
  assert.equal(run(dir, ['docs', '--check']).code, 0);
});

test('docs --check fails when a generated file is hand-edited', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  run(dir, ['docs', '--write']);
  write(dir, 'docs/eos/generated/gates.md', '# I decided the rules are different now\n');
  const r = run(dir, ['docs', '--check']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no longer match the policy/);
});

test('docs --check fails when the POLICY moved and the prose did not', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  run(dir, ['docs', '--write']);
  const gates = JSON.parse(readFileSync(join(dir, '.eos/gates.json'), 'utf8'));
  gates.gates[0].checks[0].fix = 'a completely different instruction to the reader';
  write(dir, '.eos/gates.json', gates);
  const r = run(dir, ['docs', '--check']);
  assert.equal(r.code, 1, 'prose describing a rule the engine no longer applies must fail the build');
});

test('docs without a flag writes nothing', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const r = run(dir, ['docs']);
  assert.equal(r.code, 0);
  assert.equal(existsSync(join(dir, 'docs/eos/generated/gates.md')), false, 'a dry run must not write');
  assert.match(r.out, /Nothing was written/);
});

// ---------------------------------------------------------------- SBOM [audit #17]
// An SBOM nobody can tie to a build is a document, not evidence. The generated file binds the
// commit, the product-tree digest and the lockfile digests, so it is invalidated by the same rules
// that invalidate gate evidence: change what it describes and it stops describing it.
test('sbom --write binds the SBOM to the tree and commit it describes', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  assert.equal(run(dir, ['sbom', '--write']).code, 0);
  const sbom = JSON.parse(readFileSync(join(dir, '.eos/sbom.json'), 'utf8'));
  assert.equal(sbom.bomFormat, 'CycloneDX');
  const prop = (n) => sbom.metadata.properties.find((p) => p.name === n)?.value;
  assert.ok(prop('eos:productTreeDigest'), 'an unbound SBOM is just a list');
  assert.ok(prop('eos:commit'));
});

test('sbom enumerates real components from an npm lockfile', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'package-lock.json': {
      name: 'x', lockfileVersion: 3,
      packages: { '': { name: 'x' }, 'node_modules/left-pad': { version: '1.3.0', integrity: 'sha512-abc' } },
    },
  });
  const r = runJson(dir, ['sbom', '--write']);
  assert.equal(r.json.components, 1, r.out);
  const sbom = JSON.parse(readFileSync(join(dir, '.eos/sbom.json'), 'utf8'));
  assert.equal(sbom.components[0].name, 'left-pad');
  assert.equal(sbom.components[0].purl, 'pkg:npm/left-pad@1.3.0');
});

test('an unresolvable ecosystem is reported, never silently counted as clean', () => {
  const dir = project({ '.eos/project.json': { ...APP_PROJECT, stacks: ['python'] }, 'poetry.lock': '# lock\n' });
  const r = runJson(dir, ['sbom', '--write']);
  assert.equal(r.json.components, 0);
  assert.ok(r.json.notes.some((n) => /does not parse python lockfiles/.test(n)), JSON.stringify(r.json.notes));
  // …and a human reading the plain output must see it too: an unexplained empty component list
  // reads as "clean" when it means "unknown".
  assert.match(run(dir, ['sbom']).out, /Not resolved/);
});

test('sbom --check is clean after a write and fails when a lockfile moves', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'package-lock.json': { name: 'x', lockfileVersion: 3, packages: { '': { name: 'x' }, 'node_modules/a': { version: '1.0.0' } } },
  });
  run(dir, ['sbom', '--write']);
  assert.equal(run(dir, ['sbom', '--check']).code, 0);

  write(dir, 'package-lock.json', { name: 'x', lockfileVersion: 3, packages: { '': { name: 'x' }, 'node_modules/a': { version: '9.9.9' } } });
  const r = run(dir, ['sbom', '--check']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /lockfile changed|different component set/);
});

test('a missing SBOM is MISSING, not quietly fresh', () => {
  const r = run(project({ '.eos/project.json': APP_PROJECT }), ['sbom', '--check']);
  assert.equal(r.code, 1);
  assert.match(r.out, /does not exist/);
});

test('writing the SBOM does not invalidate the tree the SBOM describes', () => {
  // The self-reference the machine summaries already had to solve: if the SBOM counted towards the
  // product tree, writing it would change the digest it had just recorded, and it could never be
  // fresh even once.
  const dir = project({ '.eos/project.json': APP_PROJECT });
  run(dir, ['sbom', '--write']);
  assert.equal(run(dir, ['sbom', '--check']).code, 0, 'an SBOM must be able to be fresh immediately after being written');
});
