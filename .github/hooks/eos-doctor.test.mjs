// EOS SDLC gate doctor regression tests — lock the G-EVAL detection contract.
//   node --test .github/hooks/eos-doctor.test.mjs
// [audit EOS-003: `llmPresent` was inferred from a short SDK regex + the dir names ai/llm/rag, so an
//  agentic product using litellm (or a self-wrapped model gateway) from src/virtual_employee/ passed
//  the eval gate with no eval plan and no harness at all.]
// [audit EOS-004: D5 accepted any occurrence of "redact"/"BAA"/"self-host" in prose, so the sentence
//  "no redaction is implemented" READ AS a recorded data-boundary decision.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bmadReadiness } from './lib/bmad-runtime.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'eos-doctor.mjs');
const sandboxes = [];

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-doctor-'));
  sandboxes.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8');
  }
  return dir;
}
const run = (dir, args = []) => {
  const r = spawnSync(process.execPath, [HOOK, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const EVAL_RUNNER = { 'evals/quality.test.mjs': 'import { test } from "node:test";\ntest("x", () => {});\n' };
const EVAL_PLAN = { 'docs/eval-plan.md': '# Eval plan\n\nDataset, graders, thresholds.\n' };

test.after(() => { for (const d of sandboxes) rmSync(d, { recursive: true, force: true }); });

// ---------- explicit declaration is authoritative ----------

test('declared agentic + no eval plan: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q', eval: 'pytest evals/ -q' } },
    ...EVAL_RUNNER,
  }));
  assert.equal(code, 1);
  assert.match(out, /D1 G-EVAL/);
  assert.match(out, /declared/i);
});

test('declared agentic + plan but no runnable harness: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q' } },
    ...EVAL_PLAN,
  }));
  assert.equal(code, 1);
  assert.match(out, /D2 G-EVAL/);
});

test('declared agentic + plan + harness: exit 0', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q', eval: 'pytest evals/ -q' } },
    ...EVAL_PLAN, ...EVAL_RUNNER,
  }));
  assert.equal(code, 0, out);
});

test('declared agentic + plan + a declared eval command counts as the harness: exit 0', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q', eval: 'pytest evals/ -q' } },
    ...EVAL_PLAN,
    'evals/test_quality.py': 'def test_quality():\n    assert True\n',
  }));
  assert.equal(code, 0, out);
});

test('a self-wrapped model gateway (no SDK name anywhere) is still gated by the declaration', () => {
  const { code, out } = run(project({
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['agentic'], commands: { test: 'pytest -q' } },
    'requirements.txt': 'httpx==0.27.0\n',
    'src/platform/model_gateway.py': 'import httpx\n\ndef complete(p):\n    return httpx.post("https://internal-gw/v1/complete", json={"p": p})\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /G-EVAL/);
});

// ---------- auto-discovery (supplementary) ----------

test('EOS-003: litellm in a non-conventional dir is detected: exit 1', () => {
  const { code, out } = run(project({
    'requirements.txt': 'litellm==1.0.0\n',
    'src/virtual_employee/runtime.py': 'import litellm\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /G-EVAL/);
});

test('more provider SDKs are detected (langgraph / crewai / dashscope / bedrock / semantic-kernel)', () => {
  const manifests = [
    ['requirements.txt', 'langgraph==0.2.0\n'],
    ['requirements.txt', 'crewai==0.51.0\n'],
    ['requirements.txt', 'dashscope==1.20.0\n'],
    ['pyproject.toml', '[project]\ndependencies = ["boto3-bedrock-runtime"]\n'],
    ['package.json', JSON.stringify({ name: 'x', dependencies: { '@ai-sdk/openai-compatible': '^1.0.0' } })],
    ['package.json', JSON.stringify({ name: 'x', dependencies: { 'semantic-kernel': '^1.0.0' } })],
  ];
  for (const [file, body] of manifests) {
    const { code, out } = run(project({ [file]: body }));
    assert.equal(code, 1, `${file}=${body} should trip G-EVAL:\n${out}`);
  }
});

test('a traditional SaaS src/agents/ dir (insurance agents, no LLM dep) does NOT false-trip', () => {
  const { code, out } = run(project({
    'package.json': { name: 'crm', dependencies: { express: '^4.19.0' } },
    'src/agents/agent-repository.ts': 'export const listAgents = () => [];\n',
  }));
  assert.equal(code, 0, out);
});

test('declared deterministic while an LLM SDK is present: exit 1 until a reasoned waiver exists', () => {
  const files = {
    '.eos/project.json': { projectType: 'application', stacks: ['python'], productParadigms: ['deterministic'], commands: { test: 'pytest -q' } },
    'requirements.txt': 'openai==1.40.0\n',
  };
  const strict = run(project(files));
  assert.equal(strict.code, 1);
  assert.match(strict.out, /deterministic/i);
  assert.match(strict.out, /waiver/i);

  const waived = run(project({
    ...files,
    '.eos/project.json': {
      ...files['.eos/project.json'],
      evalWaiver: { reason: 'openai is a build-time doc generator, never on a product path', approvedBy: 'ada@example.com' },
    },
  }));
  assert.equal(waived.code, 0, waived.out);
  assert.match(waived.out, /WARN/);
});

test('an eval waiver must NOT switch off the D5 compliance boundary', () => {
  // An evalWaiver says "we don't need to grade model output". It says nothing about whether
  // regulated data reaches a model, so D5 still has to fire. [review of the EOS-003 fix]
  const { code, out } = run(project({
    '.eos/project.json': {
      projectType: 'application', stacks: ['python'], productParadigms: ['deterministic'],
      commands: { test: 'pytest -q' },
      evalWaiver: { reason: 'openai is only used by an offline doc generator', approvedBy: 'ada@example.com' },
    },
    'requirements.txt': 'openai==1.40.0\n',
    'docs/requirements.md': '# Requirements\n\nHIPAA applies to this product.\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /D5 Compliance/);
});

test('ordinary English in manifest prose is NOT mistaken for an LLM SDK', () => {
  // The widened SDK list contains words like bedrock/together/transformers/instructor. They are
  // matched against extracted dependency identifiers only — never against description text.
  const prose = [
    ['package.json', { name: 'billing', description: 'Brings billing and invoicing together for SMBs', dependencies: { express: '^4.19.0' } }],
    ['package.json', { name: 'repl', description: 'Replicate rows to the read replica', dependencies: { pg: '^8.0.0' } }],
    ['package.json', { name: 'sched', description: 'Instructor scheduling for driving schools', dependencies: { koa: '^2.0.0' } }],
    ['package.json', { name: 'chess', description: 'minimax search for our chess engine', dependencies: { lodash: '^4.0.0' } }],
    ['pom.xml', '<project><description>The bedrock of our data platform</description></project>\n'],
    ['pom.xml', '<project><description>XSLT transformers for legacy XML</description></project>\n'],
    ['pom.xml', '<project><description>Regulatory guidance engine</description></project>\n'],
    ['requirements.txt', '# needle in a haystack search\nflask==3.0.0\n'],
  ];
  for (const [file, body] of prose) {
    const { code, out } = run(project({ [file]: body }));
    assert.equal(code, 0, `${file} prose should not trip G-EVAL:\n${out}`);
  }
});

test('the same words DO count when they are real dependency identifiers', () => {
  const deps = [
    ['package.json', { name: 'x', dependencies: { '@huggingface/transformers': '^3.0.0' } }],
    ['requirements.txt', 'transformers==4.44.0\n'],
    ['requirements.txt', 'instructor==1.4.0\n'],
    ['pom.xml', '<project><dependencies><dependency><artifactId>bedrock-runtime</artifactId></dependency></dependencies></project>\n'],
  ];
  for (const [file, body] of deps) {
    const { code, out } = run(project({ [file]: body }));
    assert.equal(code, 1, `${file}=${JSON.stringify(body)} should trip G-EVAL:\n${out}`);
  }
});

test('a vendored third-party manifest does not trip the gate', () => {
  const { code, out } = run(project({
    'package.json': { name: 'app', dependencies: { express: '^4.19.0' } },
    'vendor/acme/llm-helper/composer.json': { name: 'acme/llm-helper', require: { 'openai-php/client': '^0.10' } },
  }));
  assert.equal(code, 0, out);
});

test('TOML metadata (own name / keywords) is not read as a dependency', () => {
  // A Rust crate named `minimax` or a Minecraft tool named `bedrock-*` has no LLM code; only the
  // dependency tables/arrays feed the ambiguous-word list.
  const quiet = [
    ['pyproject.toml', '[project]\nname = "bedrock-tools"\nversion = "1.0"\ndependencies = ["flask>=3"]\n'],
    ['Cargo.toml', '[package]\nname = "minimax"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n'],
    ['pyproject.toml', '[project]\nname = "lms"\nkeywords = ["instructor", "courses"]\ndependencies = ["fastapi"]\n'],
  ];
  for (const [file, body] of quiet) {
    const { code, out } = run(project({ [file]: body }));
    assert.equal(code, 0, `${file} metadata should not trip G-EVAL:\n${out}`);
  }
});

test('TOML dependency tables and arrays DO trip the gate', () => {
  const trip = [
    ['pyproject.toml', '[project]\ndependencies = ["boto3-bedrock-runtime"]\n'],
    ['pyproject.toml', '[project]\ndependencies = [\n  "fastapi",\n  "instructor>=1.4",\n]\n'],
    ['pyproject.toml', '[tool.poetry.dependencies]\ntransformers = "^4.44"\n'],
    ['Cargo.toml', '[dependencies.instructor]\nversion = "1"\n'],
    ['Pipfile', '[packages]\ntogether = "*"\n'],
  ];
  for (const [file, body] of trip) {
    const { code, out } = run(project({ [file]: body }));
    assert.equal(code, 1, `${file} dependency should trip G-EVAL:\n${out}`);
  }
});

// ---------- D5 compliance data boundary ----------

const AGENTIC_DECL = { projectType: 'application', stacks: ['node'], productParadigms: ['agentic'], commands: { test: 'npm test', eval: 'npm run eval' } };
const EVAL_OK = { ...EVAL_PLAN, ...EVAL_RUNNER };

test('EOS-004: regulated + LLM + "no redaction is implemented" prose: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nGDPR applies to this product.\n',
    'docs/compliance-profile.md': '**Regulatory regime:** GDPR\n\nDecision: no redaction is implemented;\nregulated data may be sent to third-party models.\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /D5 Compliance/);
});

test('regulated + LLM + a structured, approved, implemented boundary: exit 0', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nGDPR applies.\n',
    'docs/compliance-profile.json': {
      regimes: ['GDPR'],
      regulatedDataCategories: ['personal-data'],
      thirdPartyModelPolicy: 'redaction-gateway',
      controls: { redaction: 'implemented' },
      dataRetention: { policy: 'P30D', status: 'implemented' },
      owner: 'dpo@example.com',
      approval: { approvedBy: 'dpo@example.com', approvedOn: '2026-01-05', reviewBy: '2099-01-05' },
      implementationStatus: 'implemented',
    },
  }));
  assert.equal(code, 0, out);
});

test('a boundary control that is declared but NOT implemented: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nHIPAA applies.\n',
    'docs/compliance-profile.json': {
      regimes: ['HIPAA'],
      regulatedDataCategories: ['phi'],
      thirdPartyModelPolicy: 'redaction-gateway',
      controls: { redaction: 'not_implemented' },
      owner: 'dpo@example.com',
      approval: { approvedBy: 'dpo@example.com', approvedOn: '2026-01-05', reviewBy: '2099-01-05' },
      implementationStatus: 'implemented',
    },
  }));
  assert.equal(code, 1);
  assert.match(out, /redaction/i);
});

test('missing owner / approval fields: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nPCI-DSS applies.\n',
    'docs/compliance-profile.json': {
      regimes: ['PCI-DSS'],
      regulatedDataCategories: ['pan'],
      thirdPartyModelPolicy: 'self-hosted',
      implementationStatus: 'implemented',
    },
  }));
  assert.equal(code, 1);
  assert.match(out, /owner|approval/i);
});

test('an unknown / misspelled enum value: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nGDPR applies.\n',
    'docs/compliance-profile.json': {
      regimes: ['GDPR'],
      regulatedDataCategories: ['personal-data'],
      thirdPartyModelPolicy: 'redaction_gatway',
      controls: { redaction: 'implemented' },
      owner: 'dpo@example.com',
      approval: { approvedBy: 'dpo@example.com', approvedOn: '2026-01-05', reviewBy: '2099-01-05' },
      implementationStatus: 'implemented',
    },
  }));
  assert.equal(code, 1);
  assert.match(out, /thirdPartyModelPolicy/);
});

test('an expired approval: exit 1', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nGDPR applies.\n',
    'docs/compliance-profile.json': {
      regimes: ['GDPR'],
      regulatedDataCategories: ['personal-data'],
      thirdPartyModelPolicy: 'self-hosted',
      owner: 'dpo@example.com',
      approval: { approvedBy: 'dpo@example.com', approvedOn: '2020-01-05', reviewBy: '2021-01-05' },
      implementationStatus: 'implemented',
    },
  }));
  assert.equal(code, 1);
  assert.match(out, /expired|reviewBy/i);
});

test('regulated + LLM but no structured profile at all: exit 1 (deny by default)', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nGDPR applies to this product.\n',
  }));
  assert.equal(code, 1);
  assert.match(out, /compliance-profile\.json/);
});

test('a non-regulated project is unaffected by D5', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nA plain internal tool. No regulated data.\n',
  }));
  assert.equal(code, 0, out);
});

test('an explicit "regimes: none" profile with a rationale passes and silences prose detection', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/requirements.md': '# Requirements\n\nWe explicitly analysed GDPR and concluded it does not apply.\n',
    'docs/compliance-profile.json': {
      regimes: ['none'],
      noneRationale: 'No personal data of EU/UK residents is collected, stored or processed.',
      owner: 'dpo@example.com',
      approval: { approvedBy: 'dpo@example.com', approvedOn: '2026-01-05', reviewBy: '2099-01-05' },
    },
  }));
  assert.equal(code, 0, out);
});

test('an invalid compliance profile is an error even before the regime is known', () => {
  const { code, out } = run(project({
    '.eos/project.json': AGENTIC_DECL, ...EVAL_OK,
    'docs/compliance-profile.json': '{ not valid json',
  }));
  assert.equal(code, 1);
  assert.match(out, /compliance-profile\.json/);
});


// ---------- D6: BMAD runtime compatibility [EOS-AUD-002] ----------
// A directory named `bmad-<x>` used to count as an available skill. Every mapped BMAD skill in fact
// resolves its customization through a PROJECT-LOCAL `_bmad/` runtime that EOS does not ship, so a
// green doctor could sit next to a skill that fails on its first activation step.

const REPO = join(dirname(HOOK), '..', '..');
const LOCK = JSON.parse(readFileSync(join(REPO, '.eos/bmad.lock.json'), 'utf8'));
// The lock is validated against its schema, and a missing schema is an ERROR rather than a silent
// pass, so every sandbox that carries the lock must carry the schema too.
const LOCK_SCHEMA = JSON.parse(readFileSync(join(REPO, '.eos/schemas/bmad-lock.schema.json'), 'utf8'));

test('D6: a mapped skill that is DEPRECATED upstream is an error', () => {
  const dir = project({
    '.eos/project.json': { projectType: 'config-only', stacks: [] },
    '.eos/bmad.lock.json': LOCK, '.eos/schemas/bmad-lock.schema.json': LOCK_SCHEMA,
    '.eos/agent-map.json': {
      schemaVersion: 1,
      actions: { 'write-prd': { agent: null, prompt: 'spec', skills: ['bmad-create-prd'], handoff: 'x' } },
    },
  });
  const { code, out } = run(dir);
  assert.equal(code, 1, out);
  assert.match(out, /D6 BMAD/);
  assert.match(out, /DEPRECATED/);
  assert.match(out, /bmad-prd/, 'the error must name the replacement');
});

test('D6: the shipped agent map maps no deprecated skill', () => {
  const repoRoot = join(dirname(HOOK), '..', '..');
  const r = spawnSync(process.execPath, [HOOK], { cwd: repoRoot, encoding: 'utf8' });
  assert.doesNotMatch((r.stdout || '') + (r.stderr || ''), /D6 BMAD.*DEPRECATED/);
});

test('D6: the shallow run says it is shallow, and --deep says what it additionally checked', () => {
  // A project-level skills directory makes this deterministic on ANY machine: without one the
  // result depends on whether the developer happens to have skills in $HOME, which is exactly the
  // kind of environment coupling that makes a test pass locally and fail in CI.
  const dir = project({
    '.eos/project.json': { projectType: 'config-only', stacks: [] },
    '.eos/bmad.lock.json': LOCK,
    '.eos/schemas/bmad-lock.schema.json': LOCK_SCHEMA,
    '.github/skills/eos-local/SKILL.md': '---\nname: eos-local\n---\n# local\n',
  });
  assert.match(run(dir).out, /shallow check only/);
  assert.doesNotMatch(run(dir, ['--deep']).out, /shallow check only/);
});

test('D6: with no skills directory anywhere, BMAD readiness is UNCHECKED rather than guessed', () => {
  const dir = project({
    '.eos/project.json': { projectType: 'config-only', stacks: [] },
    '.eos/bmad.lock.json': LOCK,
    '.eos/schemas/bmad-lock.schema.json': LOCK_SCHEMA,
  });
  const r = bmadReadiness(dir, { deep: true, roots: [] });
  assert.equal(r.status, 'UNCHECKED');
  assert.equal(r.problems.length, 0);
  assert.match(r.notes.join(' '), /skill availability was not checked/);
});

test('D6: with no compatibility manifest the BMAD layer is silent rather than guessing', () => {
  const dir = project({ '.eos/project.json': { projectType: 'config-only', stacks: [] } });
  const { code, out } = run(dir, ['--deep']);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /D6 BMAD/);
});
