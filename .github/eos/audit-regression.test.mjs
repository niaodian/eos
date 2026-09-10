// One executable regression per finding of the eos-1.12.0 audit.
//
// Each test first performs the reported bypass — the exact sequence the auditor walked — and then
// asserts that it no longer works. A test here failing means an audit finding has re-opened.
//   node --test .github/eos/audit-regression.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, git, commitAll, story, releaseFiles,
  APP_PROJECT, PRD_2AC, baselineFiles, storyFiles, testRun, treeDigest, DISCOVERY_RECORD,
  ARCHITECTURE_RECORD, REQUIREMENTS_RECORD,
  TELEMETRY_MD, TELEMETRY_RECORD, ITERATION_RECORD, REPO_ROOT } from './test-support.mjs';
import { computeProductTree, compareProductTree, clearProductTreeCache, isSelfReference } from './lib/product-tree.mjs';
import { emptyDocReason } from './lib/stage-record.mjs';
import { readEvidence, evidenceFreshness } from './lib/evidence.mjs';
import { bmadReadiness, deprecatedMappings } from '../hooks/lib/bmad-runtime.mjs';
import { parseTraceMatrix } from './lib/gates.mjs';
import { prdAcceptanceCriteria, parseOpsDecision, opsDecisionProblem } from './lib/story.mjs';

after(cleanup);

/** Drive a story all the way to VERIFIED through the real CLI. */
function verifiedStory(extra = {}) {
  const dir = project(storyFiles(extra), { withHooks: true });
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST']) {
    assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', to]).code, 0);
  }
  const v = run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.equal(v.code, 0, v.out);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'VERIFIED']).code, 0);
  return dir;
}

const mergeRefused = (dir, what) => {
  const merge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(merge.code, 1, `MERGED was allowed after ${what}:\n${merge.out}`);
  assert.match(merge.out, /STALE|product tree/i, merge.out);
  return merge.out;
};

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

// ===================================================================== EOS-AUD-002 (P0)
// "BMAD runtime is not closed": skill directories exist, doctor PASSes, activation fails.

test('EOS-AUD-002: an installed skill whose runtime is absent is BLOCKED, not PASS', () => {
  const dir = project({});
  const skills = join(dir, 'skills');
  mkdirSync(join(skills, 'bmad-prd'), { recursive: true });
  writeFileSync(join(skills, 'bmad-prd/SKILL.md'), '---\nname: bmad-prd\n---\n# BMad PRD\n');
  writeFileSync(join(dir, '.eos/bmad.lock.json'), readFileSync(join(REPO_ROOT, '.eos/bmad.lock.json')));

  const shallow = bmadReadiness(dir, { deep: false, roots: [skills] });
  assert.equal(shallow.status, 'PASS', 'the cheap layers alone cannot see the runtime problem');

  const deep = bmadReadiness(dir, { deep: true, roots: [skills] });
  assert.equal(deep.status, 'BLOCKED', JSON.stringify(deep, null, 2));
  assert.match(deep.problems.join(' '), /_bmad\/scripts\/resolve_customization\.py/);
  assert.match(deep.problems.join(' '), /will fail at step 1/);
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
    '.eos/project.json': { ...APP_PROJECT, complianceProfile: 'regulated', commands: { test: 'node --version', audit: 'definitely-not-a-real-binary audit' } },
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

test('EOS-AUD-008: no document claims the repository is already a GitHub template', () => {
  const docs = ['docs/eos/user-manual.md', 'docs/zh/user-manual.md', 'docs/eos/blueprint.md', 'docs/zh/blueprint.md', 'README.md', 'README.zh.md'];
  for (const rel of docs) {
    const full = join(REPO_ROOT, rel);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    assert.doesNotMatch(text, /isTemplate\s*[:=]\s*true/i, `${rel} still asserts an unverified isTemplate:true`);
    assert.doesNotMatch(text, /已设\s*`?isTemplate/i, `${rel} still asserts the template flag is already set`);
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
  write(dir, 'docs/iteration.json', ITERATION_RECORD);
  assert.equal(run(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']).code, 0);
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'ITERATED']).code, 0);
  assert.equal(runJson(dir, ['next']).json.recommendedAction.id, 'start-next-change');
});

test('EOS-AUD-010: a ROLLED_BACK release routes to an incident review, not to another release', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-2' });
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

// ===================================================================== adversarial review round 2
// Defects found by an adversarial review OF THIS REMEDIATION. Each one was a way to satisfy a new
// check without satisfying the property it exists to enforce.

test('review: a release refuses a story whose LATEST verification is a FAIL', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
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
    'docs/iteration.json': ITERATION_RECORD, // records release "R-1"
  }));
  const r = runJson(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-2']);
  assert.notEqual(r.code, 0, r.out);
  const detail = r.json.checks.find((c) => c.id === 'spec-write-back').detail;
  assert.match(detail, /records the write-back for release "R-1", not "R-2"/);
});

test('review: a ROLLED_BACK release can close its loop through the incident review, not by reshipping', () => {
  const dir = verifiedStory(releaseFiles());
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']).code, 0);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-9' });
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
  write(dir, 'docs/iteration.json', { ...ITERATION_RECORD, release: 'R-9', decision: { outcome: 'CORRECT_COURSE', owner: '@platform' } });
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
