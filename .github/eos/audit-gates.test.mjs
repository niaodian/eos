// Audit regression — EOS-AUD-002…006 — gates must verify substance, not existence.
//
// One executable regression per finding of the eos-1.12.0 audit. Each test first performs the
// reported bypass — the exact sequence the auditor walked — and then asserts that it no longer
// works. A test here failing means an audit finding has re-opened.
//
// Split out of the original single audit-regression file so the suites run in parallel; the shared
// preamble lives in ./audit-support.mjs.
//   node --test .github/eos/audit-gates.test.mjs
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

// ===================================================================== EOS-AUD-002 (P0)
// "BMAD runtime is not closed": skill directories exist, doctor PASSes, activation fails.

test('EOS-AUD-002: an installed skill whose runtime is absent is DEGRADED — reported, not hidden, not faked', () => {
  const dir = project({});
  const skills = join(dir, 'skills');
  mkdirSync(join(skills, 'bmad-prd'), { recursive: true });
  writeFileSync(join(skills, 'bmad-prd/SKILL.md'), '---\nname: bmad-prd\n---\n# BMad PRD\n');
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));

  const shallow = bmadReadiness(dir, { deep: false, roots: [skills] });
  assert.equal(shallow.status, 'PASS', 'the cheap layers alone cannot see the runtime situation');

  // Every mapped skill documents a fallback to its own customize.toml, so an absent runtime costs
  // project-level CUSTOMIZATION, not function. Reporting it as BLOCKED would be a false red — the
  // mirror image of the false green this check was written to remove.
  const deep = bmadReadiness(dir, { deep: true, roots: [skills] });
  assert.equal(deep.status, 'DEGRADED', JSON.stringify(deep, null, 2));
  assert.equal(deep.problems.length, 0, 'a working-but-uncustomized setup is not a blocker');
  assert.match(deep.degraded.join(' '), /_bmad\/scripts\/resolve_customization\.py/);
  assert.match(deep.degraded.join(' '), /still activate/);
  assert.match(deep.degraded.join(' '), /PROJECT-LEVEL customization is unavailable/);
});

test('EOS-AUD-002: DEGRADED warns but does not fail; only a skill that cannot activate is an error', () => {
  const base = {
    '.eos/project.json': { projectType: 'config-only', stacks: [] },
    '.eos/bmad.lock.json': JSON.parse(readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json'), 'utf8')),
    '.eos/schemas/bmad-lock.schema.json': JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/bmad-lock.schema.json'), 'utf8')),
    'docs/eos/activation.md': '# Activation\n\n- [x] done\n',
  };
  // $HOME is isolated so this measures the CODE, not whether the developer running the suite
  // happens to have skills installed — the coupling that turned a green tree red in CI once already.
  const doctor = (dir) => {
    const home = mkdtempSync(join(tmpdir(), 'eos-nohome-'));
    const r = spawnSync(process.execPath, [join(REPO_ROOT, '.github/hooks/eos-doctor.mjs'), '--deep'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    rmSync(home, { recursive: true, force: true });
    return r;
  };

  // Installed + no runtime  -> warning, exit 0.
  const ok = project({ ...base, '.github/skills/bmad-prd/SKILL.md': '---\nname: bmad-prd\n---\n# BMad PRD\n' });
  const okRun = doctor(ok);
  assert.equal(okRun.status, 0, okRun.stdout);
  assert.match(okRun.stdout, /DEGRADED, not a failure/);

  // A directory that is not a skill at all -> error, exit 1.
  const bad = project(base);
  mkdirSync(join(bad, '.github/skills/bmad-prd'), { recursive: true });
  const badRun = doctor(bad);
  assert.equal(badRun.status, 1, badRun.stdout);
  assert.match(badRun.stdout, /D6 BMAD \(BLOCKED\)/);
});

test('EOS-AUD-002: a skill directory with no SKILL.md is BLOCKED — a directory name is not a skill', () => {
  const dir = project({});
  const skills = join(dir, 'skills');
  mkdirSync(join(skills, 'bmad-prd'), { recursive: true }); // directory only — the old check's blind spot
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));
  const r = bmadReadiness(dir, { deep: false, roots: [skills] });
  assert.equal(r.status, 'BLOCKED');
  assert.match(r.problems.join(' '), /no SKILL\.md/);
});

test('EOS-AUD-002: a DEPRECATED skill is detected and refused', () => {
  const dir = project({});
  const skills = join(dir, 'skills');
  mkdirSync(join(skills, 'bmad-prd'), { recursive: true });
  writeFileSync(join(skills, 'bmad-prd/SKILL.md'), "---\nname: bmad-prd\ndescription: 'DEPRECATED — consolidated into bmad-x'\n---\n# DEPRECATED\n");
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));
  const r = bmadReadiness(dir, { deep: false, roots: [skills] });
  assert.equal(r.status, 'BLOCKED');
  assert.match(r.problems.join(' '), /DEPRECATED/);
});

test('EOS-AUD-002: the shipped agent map maps no deprecated skill', () => {
  const agentMap = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/agent-map.json'), 'utf8'));
  const dead = deprecatedMappings(REPO_ROOT, agentMap);
  assert.deepEqual(dead, [], `dead skill mapping(s): ${JSON.stringify(dead)}`);
  const mapped = new Set(Object.values(agentMap.actions).flatMap((a) => a.skills || []));
  assert.ok(mapped.has('bmad-prd'), 'the PRD action must use the supported bmad-prd intent skill');
  assert.ok(!mapped.has('bmad-create-prd') && !mapped.has('bmad-validate-prd'), 'the deprecated PRD shims must be unmapped');
});

test('EOS-AUD-002: with no BMAD installed at all, EOS still routes — absence is a note, not a block', () => {
  const dir = project({});
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));
  const empty = join(dir, 'no-skills');
  mkdirSync(empty, { recursive: true });
  const r = bmadReadiness(dir, { deep: true, roots: [empty] });
  assert.equal(r.status, 'PASS');
  assert.equal(r.problems.length, 0);
  assert.equal(r.degraded.length, 0, 'nothing is degraded when nothing is installed to degrade');
  assert.ok(r.notes.length, 'a missing skill must still be reported as a fact');
});

// ===================================================================== EOS-AUD-003 (P1)
// "G1/G2/G-UX/G4 are existence checks": empty documents carried the product to ARCHITECTURE.

test('EOS-AUD-003: empty stage documents do not promote the product baseline', () => {
  const dir = project({
    '.eos/project.json': APP_PROJECT,
    'docs/discovery.md': '# Discovery\n',
    'docs/requirements.md': '# Requirements\n',
    'docs/EXPERIENCE.md': '# Experience\n',
    'docs/architecture.md': '# Architecture\n',
    'docs/prd.md': PRD_2AC,
  });
  const status = runJson(dir, ['status']);
  assert.equal(status.json.product.state, 'UNINITIALIZED', 'four empty files must not equal a baselined product');
  const r = runJson(dir, ['next']);
  assert.equal(r.json.recommendedAction.id, 'frame-the-problem');
  assert.equal(r.code, 2);
  for (const gate of ['discovery-ready', 'requirements-ready', 'architecture-ready']) {
    assert.notEqual(run(dir, ['check', '--gate', gate]).code, 0, `${gate} passed on an empty document`);
  }
});

test('EOS-AUD-003: a user-facing product without docs/DESIGN.md cannot reach the architecture stage', () => {
  const dir = project({
    ...baselineFiles(),
    'docs/design.json': {
      schemaVersion: 1,
      userInterface: true,
      coverage: {
        flows: { status: 'COVERED', ref: 'docs/EXPERIENCE.md#flows' },
        states: { status: 'COVERED', ref: 'docs/EXPERIENCE.md#states' },
        accessibility: { status: 'COVERED', ref: 'docs/EXPERIENCE.md#a11y' },
        designTokens: { status: 'COVERED', ref: 'docs/EXPERIENCE.md#tokens' },
        responsive: { status: 'COVERED', ref: 'docs/EXPERIENCE.md#responsive' },
      },
    },
    'docs/EXPERIENCE.md': '# Experience\n\n' + 'The reset flow is one page with inline validation, and every failure reports a reason the user can act on instead of a generic error that leaves them guessing what to change before trying again. '.repeat(2),
  });
  const r = runJson(dir, ['check', '--gate', 'ux-ready']);
  assert.notEqual(r.code, 0, r.out);
  const check = r.json.checks.find((c) => c.id === 'ux-documents');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /docs\/DESIGN\.md does not exist/);
});

test('EOS-AUD-003: a non-UI product must SAY so — silence is not a skip', () => {
  const dir = project(baselineFiles({ 'docs/design.json': undefined }));
  rmSync(join(dir, 'docs/design.json'), { force: true });
  const r = runJson(dir, ['check', '--gate', 'ux-ready']);
  assert.notEqual(r.code, 0);
  assert.match(JSON.stringify(r.json.checks), /docs\/design\.json does not exist/);

  write(dir, 'docs/design.json', { schemaVersion: 1, userInterface: false, skipReason: 'Machine API only; no human interacts with this service directly.' });
  assert.equal(run(dir, ['check', '--gate', 'ux-ready']).code, 0);
});

test('EOS-AUD-003: an architecture with an undecided tech stack or topology does not promote', () => {
  const noAdr = { ...ARCHITECTURE_RECORD, decisions: { ...ARCHITECTURE_RECORD.decisions, techStack: { status: 'DECIDED', summary: 'Node 20' } } };
  const dir = project(baselineFiles({ 'docs/architecture.json': noAdr }));
  const r = runJson(dir, ['check', '--gate', 'architecture-ready']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /irreversible decision needs an ADR/);
});

test('EOS-AUD-003: an NFR with no landing point in the architecture does not promote', () => {
  const dir = project(baselineFiles({ 'docs/architecture.json': { ...ARCHITECTURE_RECORD, nfrLandingPoints: [{ nfr: 'NFR9', component: 'reporting worker', mechanism: 'batched writes on a schedule' }] } }));
  const r = runJson(dir, ['check', '--gate', 'architecture-ready']);
  assert.notEqual(r.code, 0);
  assert.match(JSON.stringify(r.json.checks), /NFR1/);
});

// Locking the stack in an ADR is only half the decision. Every later agent reads the always-on
// workspace rule, never the ADR, so a surviving placeholder keeps telling them to run `npm ci` on a
// Python project — the ADR is then a document nobody's tooling obeys.
test('EOS-AUD-003: a locked tech stack that never reached the always-on workspace rule does not promote', () => {
  const RULE = '.github/instructions/00-workspace.instructions.md';
  const provisional = '---\napplyTo: "**"\n---\n# Workspace Conventions\n\n## Local commands  ⛳ PROVISIONAL — stack is locked at Phase 4 (Architecture) via ADR\n- Install: `npm ci` · Test: `npm test`.\n';

  const stale = project(baselineFiles({ [RULE]: provisional }));
  const r = runJson(stale, ['check', '--gate', 'architecture-ready']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /PROVISIONAL placeholder/);

  // Replacing the block clears it — the check is about the contradiction, not about ceremony.
  const landed = project(baselineFiles({ [RULE]: provisional.replace(/ {2}⛳ PROVISIONAL[^\n]*/, '') }));
  const ok = runJson(landed, ['check', '--gate', 'architecture-ready']);
  assert.equal(ok.code, 0, ok.out);
});

test('EOS-AUD-003: the machine states say BASELINED, because no human approval was recorded', () => {
  const workflow = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/workflow.json'), 'utf8'));
  const states = workflow.stateMachines.product.states;
  assert.ok(states.includes('PRD_BASELINED') && states.includes('ARCHITECTURE_BASELINED'));
  assert.ok(!states.includes('PRD_APPROVED') && !states.includes('ARCHITECTURE_APPROVED'),
    'a machine-derived state must not claim a human approved it');
  // The one state that DOES mean "a person approved this" still demands a second person.
  const approval = workflow.stateMachines.release.transitions.find((t) => t.to === 'APPROVED');
  assert.equal(approval.requiresSeparateApprover, true);
});

// ===================================================================== EOS-AUD-004 (P1)
// "fake AC": a PRD that merely MENTIONS AC9.9 satisfied a story claiming to implement it.

test('EOS-AUD-004: an acceptance criterion that is only referenced is not defined', () => {
  const dir = project(baselineFiles({
    'docs/prd.md': '# PRD\n\n## Login (FR1)\n\n- AC1.1 the user can log in with a valid password\n\nThis prose merely mentions AC9.9 later.\n',
  }));
  const r = runJson(dir, ['check', '--gate', 'prd-ready']);
  assert.notEqual(r.code, 0, r.out);
  const check = r.json.checks.find((c) => c.id === 'ac-parseable');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /AC9\.9/);
  assert.match(check.detail, /referenced but never defined/);
});

test('EOS-AUD-004: a story cannot resolve against a merely-mentioned criterion', () => {
  const prd = prdAcceptanceCriteria(project({ 'docs/prd.md': '# PRD\n\n- AC1.1 the user can log in with a valid password\n\nSee AC9.9 for details.\n' }));
  assert.deepEqual(prd.defined, ['AC1.1']);
  assert.deepEqual(prd.referencedOnly, ['AC9.9']);
  assert.deepEqual(prd.ids, ['AC1.1'], 'the id set a story resolves against must be the DEFINED set');
});

test('EOS-AUD-004: an acceptance criterion id with no statement is a placeholder, not a criterion', () => {
  const prd = prdAcceptanceCriteria(project({ 'docs/prd.md': '# PRD\n\n- AC1.1\n- AC1.2 the user can log out and the session is destroyed\n' }));
  assert.deepEqual(prd.defined, ['AC1.2']);
  assert.deepEqual(prd.unstated, ['AC1.1']);
});

test('EOS-AUD-004: a requirement with no acceptance criterion fails the PRD gate', () => {
  const dir = project(baselineFiles({
    'docs/requirements.json': { ...REQUIREMENTS_RECORD, functional: [...REQUIREMENTS_RECORD.functional, { id: 'FR2', statement: 'A user can delete their account permanently' }] },
  }));
  const r = runJson(dir, ['check', '--gate', 'prd-ready']);
  assert.notEqual(r.code, 0, r.out);
  const check = r.json.checks.find((c) => c.id === 'ac-covers-requirements');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /FR2/);
});

// ===================================================================== EOS-AUD-005 (P1)
// "reasonless SKIP": `- Telemetry: SKIP` counted as a concrete operational task.

test('EOS-AUD-005: a bare SKIP on an operational task fails story readiness', () => {
  const bare = story().replace(
    '- Telemetry: ADOPT — emit auth.login.result with outcome; owner: @platform; verify: tests/login.test.mjs',
    '- Telemetry: SKIP',
  ).replace(
    '- Authorization: ADOPT — session required for /account; owner: @platform; verify: tests/login.test.mjs',
    '- Authorization: SKIP',
  ).replace(
    '- Rollback: ADOPT — feature flag login_v2 disables the path; owner: @platform; verify: ops/runbook.md',
    '- Rollback: SKIP',
  );
  const dir = project(storyFiles({ 'docs/stories/STORY-001.md': bare }));
  const r = runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  const check = r.json.checks.find((c) => c.id === 'ops-tasks');
  assert.equal(check.status, 'FAIL');
  for (const label of ['Telemetry', 'Authorization', 'Rollback']) assert.match(check.detail, new RegExp(label));
  assert.match(check.detail, /SKIP \/ N\/A without a reason|with no reason/);
});

test('EOS-AUD-005: SKIP with a reason, and DEFER with an owner and a trigger, are accepted', () => {
  assert.equal(opsDecisionProblem('Telemetry', parseOpsDecision('SKIP')).includes('no reason'), true);
  assert.equal(opsDecisionProblem('Telemetry', parseOpsDecision('SKIP — this batch job emits nothing a human reads')), null);
  assert.match(opsDecisionProblem('Rollback', parseOpsDecision('DEFER — owner: @bob')), /trigger/);
  assert.equal(opsDecisionProblem('Rollback', parseOpsDecision('DEFER — owner: @bob; trigger: before the first production deploy')), null);
  // A plain sentence is read as ADOPT, and an adopted task still needs an owner and a proof.
  assert.match(opsDecisionProblem('Telemetry', parseOpsDecision('emit auth.login.result with outcome')), /owner/);
  assert.equal(opsDecisionProblem('Telemetry', parseOpsDecision('ADOPT — emit auth.login.result; owner: @a; verify: tests/t.mjs')), null);
});

test('EOS-AUD-005: an EMPTY "## Dependencies" heading is not an answer', () => {
  const empty = story().replace('- none — the auth service already exists and nothing else blocks this story', '');
  const dir = project(storyFiles({ 'docs/stories/STORY-001.md': empty }));
  const r = runJson(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /Dependencies: the section is empty/);
});

// ===================================================================== EOS-AUD-006 (P1)
// "hand-written trace PASS": any row whose last cell said PASS counted as a passing test.

test('EOS-AUD-006: a hand-written PASS with no machine result does not verify a story', () => {
  const dir = project(storyFiles({ 'docs/evidence/test-run.json': undefined }), { withHooks: true });
  rmSync(join(dir, 'docs/evidence/test-run.json'), { force: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  const check = r.json.checks.find((c) => c.id === 'trace-complete');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /is a claim, not a result/);
});

test('EOS-AUD-006: a trace row pointing at a test file that does not exist fails verification', () => {
  const dir = project(storyFiles({
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | tests/imaginary.test.mjs::valid password | PASS |\n',
    'docs/evidence/test-run.json': testRun({ testPath: 'tests/imaginary.test.mjs' }),
  }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /does not exist/);
});

test('EOS-AUD-006: a selector that does not appear in the test file fails verification', () => {
  const dir = project(storyFiles({ 'docs/evidence/test-run.json': testRun({ selector: 'a test that was never written' }) }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /does not appear in/);
});

test('EOS-AUD-006: a FAILING machine result cannot be overridden by a passing Markdown row', () => {
  const dir = project(storyFiles({ 'docs/evidence/test-run.json': testRun({ status: 'FAIL' }) }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /FAIL/);
});

test('EOS-AUD-006: results produced against a DIFFERENT product tree do not certify this one', () => {
  const dir = project(storyFiles({
    'docs/evidence/test-run.json': testRun({ productTree: { digest: 'f'.repeat(64) } }),
  }), { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  const r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks), /does not describe this code/);
});

test('EOS-AUD-006: the trace parser is framework-neutral — it reads paths, not Jest or pytest', () => {
  const rows = parseTraceMatrix([
    '| AC | Test | Result |', '| --- | --- | --- |',
    '| AC1.1 | `tests/login.test.mjs::valid password` | PASS |',
    '| AC1.2 | src/auth/login_test.go::TestLogin | PASS |',
    '| AC1.3 | tests/test_login.py::test_valid | PASS |',
    '| AC1.4 | Tests/LoginTests.cs::ValidPassword | PASS |',
  ].join('\n'));
  assert.deepEqual(rows.get('AC1.1').testRefs, ['tests/login.test.mjs::valid password']);
  assert.deepEqual(rows.get('AC1.2').testRefs, ['src/auth/login_test.go::TestLogin']);
  assert.deepEqual(rows.get('AC1.3').testRefs, ['tests/test_login.py::test_valid']);
  assert.deepEqual(rows.get('AC1.4').testRefs, ['Tests/LoginTests.cs::ValidPassword']);
});

test('EOS-AUD-006: an agentic product needs eval NUMBERS, not just an eval command that exited 0', () => {
  const files = storyFiles({
    '.eos/project.json': { ...APP_PROJECT, productParadigms: ['deterministic', 'agentic'], commands: { test: 'node --version', eval: 'node --version' } },
    'docs/eval-plan.md': '# Eval plan\n\nEVAL-1 grounds the answer in the retrieved document.\n',
    'docs/stories/STORY-001.md': story({ rows: [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', 'EVAL-1']] }),
  });
  const dir = project(files, { withHooks: true });
  run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']);
  let r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'eval-threshold')), /exit code 0 is not a met threshold/);

  // A summary that omits the case the story declares cannot stand in for it either.
  const digest = treeDigest(dir);
  write(dir, 'docs/evidence/eval-summary.json', {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    productTree: { digest },
    subject: { promptRef: 'prompts/answer.md', model: 'vendor-model-a', datasetRef: 'evals/dataset.jsonl', graderRef: 'evals/grader.mjs' },
    cases: [{ id: 'EVAL-7', metric: 'groundedness', comparator: '>=', threshold: 0.9, observed: 0.99, status: 'PASS' }],
  });
  r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'eval-threshold')), /EVAL-1/);

  // A case BELOW its threshold fails, whatever the exit code said.
  write(dir, 'docs/evidence/eval-summary.json', {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    productTree: { digest },
    subject: { promptRef: 'prompts/answer.md', model: 'vendor-model-a', datasetRef: 'evals/dataset.jsonl', graderRef: 'evals/grader.mjs' },
    cases: [{ id: 'EVAL-1', ac: 'AC1.1', metric: 'groundedness', comparator: '>=', threshold: 0.9, observed: 0.41, status: 'FAIL' }],
  });

  // …and a case whose NUMBERS miss the threshold is a failure even when it reports PASS.
  write(dir, 'docs/evidence/eval-summary.json', {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    productTree: { digest },
    subject: { promptRef: 'prompts/answer.md', model: 'vendor-model-a', datasetRef: 'evals/dataset.jsonl', graderRef: 'evals/grader.mjs' },
    cases: [{ id: 'EVAL-1', ac: 'AC1.1', metric: 'groundedness', comparator: '>=', threshold: 0.9, observed: 0.41, status: 'PASS' }],
  });
  r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'eval-threshold')), /the numbers say otherwise/);
  r = runJson(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.match(JSON.stringify(r.json.checks.find((c) => c.id === 'eval-threshold')), /below threshold/);
});
