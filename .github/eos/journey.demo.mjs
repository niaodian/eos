// Not a test — a scripted end-to-end walkthrough used to produce REAL output for the release
// report. It builds a throwaway repo from this template and drives the whole journey:
//   initialize → start a feature → requirements → story-ready FAILS → recommended action →
//   repair → story-ready PASSES → resume in a new session → verify → release status.
// Run:  node .github/eos/journey.demo.mjs
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'eos-journey-'));
const keep = process.argv.includes('--keep');

for (const top of ['.github', '.eos', 'docs', 'src', 'api', 'ops', 'AGENTS.md', 'README.md', 'README.zh.md']) {
  try { cpSync(join(ROOT, top), join(dir, top), { recursive: true }); } catch { /* optional */ }
}

const write = (rel, body) => {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n', 'utf8');
};

let step = 0;
function eos(args, { note = '' } = {}) {
  step++;
  console.log(`\n${'═'.repeat(78)}\n▌ ${step}. $ node .github/eos/eos.mjs ${args.join(' ')}${note ? `\n▌    ${note}` : ''}\n${'═'.repeat(78)}`);
  const r = spawnSync(process.execPath, [join(dir, '.github/eos/eos.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, EOS_ACTOR: 'demo-dev' } });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  console.log(`  → exit ${r.status}`);
  return r.status;
}

// ── 1. a fresh product repository: EOS is installed but nothing is declared ────────────────────
write('.eos/project.json', { projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] });
write('package.json', { name: 'demo-app', private: true, scripts: { test: 'node --version' } });
eos(['next'], { note: 'product code exists but the declaration is still the template' });

// ── 2. declare the project (this is what "activation" means locally) ───────────────────────────
write('.eos/project.json', {
  $schema: './schemas/project.schema.json',
  projectType: 'application',
  stacks: ['node'],
  productParadigms: ['deterministic'],
  workflowProfile: 'standard-product',
  commands: { test: 'node --version' },
});
eos(['next'], { note: 'activation now passes; the router moves on to the product baseline' });

// ── 3. walk the baseline ───────────────────────────────────────────────────────────────────────
write('docs/discovery.md', '# Discovery\n\nUsers abandon checkout because login fails. Success: login error rate < 0.5%.\n');
eos(['next']);
write('docs/requirements.md', '# Requirements\n\nFR1 password login. NFR: p95 < 300ms. Telemetry, authz and rollback decided.\n');
write('docs/prd.md', '# PRD\n\n## Login\n\n- AC1.1 the user can log in with a valid password\n- AC1.2 the user can log out\n');
write('docs/EXPERIENCE.md', '# Experience\n\nSKIP — no user-facing surface (internal API only).\n');
write('docs/architecture.md', '# Architecture\n\nSingle service, Postgres, no queue.\n');
eos(['next'], { note: 'discovery + requirements + PRD + UX decision + architecture all exist' });

// ── 4. start a feature: the story is drafted, but AC1.2 has no test intent ─────────────────────
write('docs/stories/STORY-012.md', [
  '---', 'id: STORY-012', 'title: Password login', 'changeType: FEATURE', '---', '',
  '## Acceptance criteria', '',
  '| AC | Statement | Test intent | Eval case |',
  '| --- | --- | --- | --- |',
  '| AC1.1 | the user can log in | tests/login.test.mjs::accepts a valid password | — |',
  '| AC1.2 | the user can log out | — | — |', '',
  '## Operational tasks', '',
  '- Telemetry: emit auth.login.result with outcome',
  '- Authorization: session required for /account',
  '- Rollback: feature flag login_v2 disables the path', '',
  '## Dependencies', '', '- none', '',
].join('\n'));
eos(['next'], { note: 'THE GATE-FAILURE EXPERIENCE: one concrete blocker, one action, one command' });
eos(['check', '--gate', 'story-ready', '--scope', 'STORY-012']);

// ── 5. an illegal promotion is refused ─────────────────────────────────────────────────────────
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED'], { note: 'illegal jump' });

// ── 6. repair the missing acceptance-test intent ────────────────────────────────────────────────
write('docs/stories/STORY-012.md', [
  '---', 'id: STORY-012', 'title: Password login', 'changeType: FEATURE', '---', '',
  '## Acceptance criteria', '',
  '| AC | Statement | Test intent | Eval case |',
  '| --- | --- | --- | --- |',
  '| AC1.1 | the user can log in | tests/login.test.mjs::accepts a valid password | — |',
  '| AC1.2 | the user can log out | tests/logout.test.mjs::clears the session | — |', '',
  '## Operational tasks', '',
  '- Telemetry: emit auth.login.result with outcome',
  '- Authorization: session required for /account',
  '- Rollback: feature flag login_v2 disables the path', '',
  '## Dependencies', '', '- none', '',
].join('\n'));
eos(['check', '--gate', 'story-ready', '--scope', 'STORY-012'], { note: 'RED → GREEN, evidence recorded' });
eos(['next']);

// ── 7. promote, implement, verify ───────────────────────────────────────────────────────────────
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'IN_REVIEW']);
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'READY_FOR_DEV']);
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'IN_DEVELOPMENT']);

// ── 8. a NEW chat session: resume ───────────────────────────────────────────────────────────────
eos(['resume'], { note: 'a fresh session recovers the focus without re-reading any document' });

// ── 9. verification fails until the trace matrix exists ─────────────────────────────────────────
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'READY_FOR_TEST']);
eos(['next'], { note: 'the verified gate now drives the recommendation' });
write('docs/trace-matrix.md', [
  '| AC | Test | Result |', '| --- | --- | --- |',
  '| AC1.1 | tests/login.test.mjs | ✅ |', '| AC1.2 | tests/logout.test.mjs | ✅ |', '',
].join('\n'));
eos(['check', '--gate', 'verified', '--scope', 'STORY-012']);
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'VERIFIED']);

// ── 10. a governance change invalidates the evidence (STALE), and merge is refused ──────────────
write('docs/prd.md', '# PRD\n\n## Login\n\n- AC1.1 the user can log in with a valid password\n- AC1.2 the user can log out\n- AC1.3 the user can reset a password\n');
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED'], { note: 'an input moved after verification → STALE' });
eos(['check', '--gate', 'verified', '--scope', 'STORY-012'], { note: 're-verify against the new inputs' });
eos(['transition', '--scope', 'story', '--id', 'STORY-012', '--to', 'MERGED']);

// ── 11. release readiness names the remaining gate ──────────────────────────────────────────────
eos(['release-status', '--release', 'v0.2.0']);
eos(['status']);
eos(['ledger', '--verify']);

console.log(`\nSandbox: ${dir}${keep ? ' (kept)' : ' (removed)'}\n`);
if (!keep) rmSync(dir, { recursive: true, force: true });
