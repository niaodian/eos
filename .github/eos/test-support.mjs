// Shared test support for the EOS guided-workflow suites. NOT a test file itself
// (CI runs the *.test.mjs files explicitly), just the sandbox builder + CLI runner they share.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const EOS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(EOS_DIR, '..', '..');
export const CLI = join(EOS_DIR, 'eos.mjs');

const sandboxes = [];

/** Templates copied into every sandbox so a fixture only declares what it changes. */
export const TEMPLATE = {
  workflow: join(REPO_ROOT, '.eos/workflow.json'),
  gates: join(REPO_ROOT, '.eos/gates.json'),
  agentMap: join(REPO_ROOT, '.eos/agent-map.json'),
  schemas: join(REPO_ROOT, '.eos/schemas'),
};

/**
 * Build a throwaway project root. `files` maps repo-relative paths to string or JSON content.
 * The EOS governance files (+ the hooks the gates shell out to) are copied in unless the fixture
 * overrides them, so a sandbox behaves exactly like a real repository.
 */
export function project(files = {}, { withGovernance = true, withHooks = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-guide-'));
  sandboxes.push(dir);
  if (withGovernance) {
    mkdirSync(join(dir, '.eos'), { recursive: true });
    cpSync(TEMPLATE.workflow, join(dir, '.eos/workflow.json'));
    cpSync(TEMPLATE.gates, join(dir, '.eos/gates.json'));
    cpSync(TEMPLATE.agentMap, join(dir, '.eos/agent-map.json'));
    cpSync(TEMPLATE.schemas, join(dir, '.eos/schemas'), { recursive: true });
    // The agent/prompt existence check reads these directories.
    cpSync(join(REPO_ROOT, '.github/agents'), join(dir, '.github/agents'), { recursive: true });
    cpSync(join(REPO_ROOT, '.github/prompts'), join(dir, '.github/prompts'), { recursive: true });
    write(dir, 'docs/eos/activation.md', '# Activation\n\n- [x] Branch protection\n');
  }
  if (withHooks) {
    cpSync(join(REPO_ROOT, '.github/hooks'), join(dir, '.github/hooks'), { recursive: true });
  }
  for (const [rel, body] of Object.entries(files)) write(dir, rel, body);
  return dir;
}

export function write(dir, rel, body) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n', 'utf8');
  return full;
}

export function run(dir, args = [], env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, EOS_ACTOR: 'tester', ...env },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
}

export function runJson(dir, args = [], env = {}) {
  const r = run(dir, [...args, '--json'], env);
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* leave null so the assertion shows the raw output */ }
  return { ...r, json };
}

export const cleanup = () => {
  for (const d of sandboxes) rmSync(d, { recursive: true, force: true });
  sandboxes.length = 0;
};

/** Minimal, valid project declaration for an application sandbox. */
export const APP_PROJECT = {
  projectType: 'application',
  stacks: ['node'],
  productParadigms: ['deterministic'],
  commands: { test: 'node --test' },
};

export const PRD_2AC = [
  '# PRD',
  '',
  '## Login',
  '',
  '- AC1.1 the user can log in with a valid password',
  '- AC1.2 the user can log out',
  '',
].join('\n');

/** Build a story markdown file body. */
export function story({
  id = 'STORY-001',
  title = 'Login',
  changeType = 'FEATURE',
  state = null,
  rows = [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', '—']],
  ops = true,
  deps = true,
} = {}) {
  const fmLines = [`id: ${id}`, `title: ${title}`, `changeType: ${changeType}`];
  if (state) fmLines.push(`state: ${state}`);
  const out = ['---', ...fmLines, '---', '', '## Acceptance criteria', '',
    '| AC | Statement | Test intent | Eval case |', '| --- | --- | --- | --- |'];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  out.push('');
  if (ops) {
    out.push('## Operational tasks', '',
      '- Telemetry: emit auth.login.result with outcome',
      '- Authorization: session required for /account',
      '- Rollback: feature flag login_v2 disables the path', '');
  }
  if (deps) out.push('## Dependencies', '', '- none', '');
  return out.join('\n');
}

export const hasHooks = (dir) => existsSync(join(dir, '.github/hooks'));
