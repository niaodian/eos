// EOS SDLC gate doctor regression tests — lock the G-EVAL detection contract.
//   node --test .github/hooks/eos-doctor.test.mjs
// [audit EOS-003: `llmPresent` was inferred from a short SDK regex + the dir names ai/llm/rag, so an
//  agentic product using litellm (or a self-wrapped model gateway) from src/virtual_employee/ passed
//  the eval gate with no eval plan and no harness at all.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const run = (dir) => {
  const r = spawnSync(process.execPath, [HOOK], { cwd: dir, encoding: 'utf8' });
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
