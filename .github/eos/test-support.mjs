// Shared test support for the EOS guided-workflow suites. NOT a test file itself
// (CI runs the *.test.mjs files explicitly), just the sandbox builder + CLI runner they share.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
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
 *
 * A sandbox is a REAL git repository: the tested-product-tree identity is derived from git, and a
 * fixture that skipped that would be testing a different engine than the one developers run.
 */
export function project(files = {}, { withGovernance = true, withHooks = false, git = true } = {}) {
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
  if (git) gitInit(dir);
  // Machine summaries must name the tree they describe; fill in the sandbox's real digest.
  if (git && existsSync(join(dir, 'docs/evidence'))) { bindTree(dir); commitAll(dir, 'bind machine summaries'); }
  return dir;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'EOS Test', GIT_AUTHOR_EMAIL: 'test@eos.local',
  GIT_COMMITTER_NAME: 'EOS Test', GIT_COMMITTER_EMAIL: 'test@eos.local',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

export function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** Initialise + commit, so the sandbox has a product tree AND a candidate commit. */
export function gitInit(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  // The ledger and evidence are EOS's own output; ignoring them here mirrors nothing in the real
  // template (they ARE tracked), but committing them is what a developer does, so we commit all.
  return commitAll(dir, 'baseline');
}

export function commitAll(dir, message = 'change') {
  git(dir, ['add', '-A']);
  return git(dir, ['commit', '-q', '--no-gpg-sign', '-m', message]);
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
  '## Login (FR1)',
  '',
  '- AC1.1 the user can log in with a valid password',
  '- AC1.2 the user can log out and the session is destroyed',
  '',
].join('\n');

/** Build a story markdown file body. */
export function story({
  id = 'STORY-001',
  title = 'Login',
  changeType = 'FEATURE',
  classificationReason = '',
  state = null,
  rows = [['AC1.1', 'user can log in', 'tests/login.test.mjs::valid password', '—']],
  ops = true,
  deps = true,
} = {}) {
  const fmLines = [`id: ${id}`, `title: ${title}`, `changeType: ${changeType}`];
  if (classificationReason) fmLines.push(`classificationReason: ${classificationReason}`);
  if (state) fmLines.push(`state: ${state}`);
  const out = ['---', ...fmLines, '---', '', '## Acceptance criteria', '',
    '| AC | Statement | Test intent | Eval case |', '| --- | --- | --- | --- |'];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  out.push('');
  if (ops) {
    out.push('## Operational tasks', '',
      '- Telemetry: ADOPT — emit auth.login.result with outcome; owner: @platform; verify: tests/login.test.mjs',
      '- Authorization: ADOPT — session required for /account; owner: @platform; verify: tests/login.test.mjs',
      '- Rollback: ADOPT — feature flag login_v2 disables the path; owner: @platform; verify: ops/runbook.md', '');
  }
  if (deps) out.push('## Dependencies', '', '- none — the auth service already exists and nothing else blocks this story', '');
  return out.join('\n');
}

// --------------------------------------------------------------------------- baseline artifacts
// The product-baseline gates (G1/G2/G-UX/G4) read structured records, not just file existence, so
// fixtures that want to be PAST those gates need real ones.

export const DISCOVERY_MD = [
  '# Discovery', '',
  'Users abandon the sign-in flow because the password reset loop takes more than five minutes',
  'and gives no feedback. We believe a single-page reset with inline validation removes the',
  'abandonment. This is measurable: sign-in completion is instrumented today, so we can see',
  'whether the number moves at all after the change ships to the first cohort of users.', '',
  '## Scope', '',
  'In scope: the password reset flow and its telemetry. Out of scope: single sign-on, which is a',
  'separate procurement decision and would not be affected by anything in this change.', '',
].join('\n');

export const DISCOVERY_RECORD = {
  schemaVersion: 1,
  problem: {
    statement: 'Users abandon the sign-in flow because the password reset loop is slow and silent.',
    falsifiableBy: 'Sign-in completion does not improve after the reset flow is shortened.',
    affectedUsers: 'returning customers on web',
  },
  successMetric: { name: 'sign-in completion rate', baseline: 0.62, target: 0.8, unit: 'ratio', dataSource: 'auth.login.result events in the analytics warehouse' },
  scope: { in: ['password reset flow', 'sign-in telemetry'], out: ['single sign-on', 'account deletion'] },
};

export const REQUIREMENTS_MD = [
  '# Requirements', '',
  'The system must let a user reset a password in a single page, validate inline, and report the',
  'outcome as a telemetry event so the success metric can be observed. Availability and latency',
  'targets are stated below, and each operational concern carries an explicit decision rather than',
  'an omission, so nothing is discovered for the first time during the release gate.', '',
  '## Functional', '',
  'FR1 covers the single-page reset itself: the user submits an email address, receives a',
  'single-use token, sets a new password, and is returned to the sign-in page already',
  'authenticated. Every failure path reports a reason the user can act on.', '',
  '## Non-functional', '',
  'NFR1 fixes the perceived cost of the flow at a p95 of 800 milliseconds measured at the handler,',
  'because a reset that feels slow is abandoned regardless of whether it eventually succeeds.', '',
].join('\n');

const ADOPT = (note) => ({ decision: 'ADOPT', note });
export const REQUIREMENTS_RECORD = {
  schemaVersion: 1,
  functional: [{ id: 'FR1', statement: 'A user can reset a password from one page', priority: 'MUST' }],
  nfr: [{ id: 'NFR1', category: 'performance', statement: 'Reset completes quickly', target: 'p95 < 800ms' }],
  operationalPreFlight: {
    telemetry: ADOPT('emit auth.login.result and auth.reset.result'),
    authz: ADOPT('reset tokens are single-use and bound to the account'),
    audit: ADOPT('password changes are written to the audit sink'),
    rollback: ADOPT('feature flag login_v2 disables the new path'),
    monitoring: ADOPT('reset failure rate alert routed to @platform'),
    canary: ADOPT('5% cohort for 24h before full rollout'),
    quota: { decision: 'SKIP', reason: 'reset attempts are already rate-limited by the auth service' },
    i18n: { decision: 'DEFER', owner: '@design', trigger: 'when the first non-English market is signed' },
    multiTenancy: { decision: 'SKIP', reason: 'this is a single-tenant consumer product with no tenant boundary' },
    capacitySlo: ADOPT('99.9% monthly availability for the auth path'),
    dr: ADOPT('auth database has a 15 minute RPO via streaming replication'),
  },
};

export const DESIGN_SKIP_RECORD = {
  schemaVersion: 1,
  userInterface: false,
  skipReason: 'This service exposes only a machine API consumed by other services; no human interacts with it.',
};

export const ARCHITECTURE_MD = [
  '# Architecture', '',
  'A stateless Node service fronts the reset flow and writes to the existing auth database. The',
  'deployment topology is a rolling deployment behind the existing load balancer, which is what the',
  'rollback and canary mechanisms below actually use. Authorization stays in the auth service, and',
  'every password change is written to the audit sink before the response is returned to the user.', '',
  '## Components', '',
  'The reset handler is the only new component. It validates the token, updates the credential row',
  'inside a single transaction, emits the telemetry event, and writes the audit record. Nothing',
  'else in the platform learns about reset tokens, which keeps the blast radius of this change to',
  'one deployable unit and one database table.', '',
  '## Failure behaviour', '',
  'A token that is expired, already used or unknown returns the same response, so the endpoint',
  'cannot be used to enumerate accounts. A database failure fails the request loudly rather than',
  'reporting a success the user cannot rely on.', '',
].join('\n');

const DECIDED = (summary, adr = null) => (adr ? { status: 'DECIDED', summary, adr } : { status: 'DECIDED', summary });
export const ARCHITECTURE_RECORD = {
  schemaVersion: 1,
  decisions: {
    techStack: DECIDED('Node 20 service, existing PostgreSQL', 'docs/adr/001-tech-stack.md'),
    deploymentTopology: DECIDED('rolling deployment behind the existing load balancer', 'docs/adr/002-deployment-topology.md'),
    authz: DECIDED('single-use reset tokens verified by the auth service'),
    security: DECIDED('tokens hashed at rest, TLS in transit'),
    audit: DECIDED('password changes written to the audit sink'),
    rollback: DECIDED('feature flag login_v2 plus image rollback'),
    disasterRecovery: DECIDED('streaming replication with a 15 minute RPO'),
    dataModel: DECIDED('reuses the existing credential tables'),
    apiContract: DECIDED('POST /auth/reset documented in api/openapi.yaml'),
    eventContract: { status: 'NOT_APPLICABLE', reason: 'this service publishes no domain events; it only emits telemetry' },
  },
  nfrLandingPoints: [{ nfr: 'NFR1', component: 'auth-reset handler', mechanism: 'single round trip with a prepared statement' }],
};

export const ADR_STACK = ['# 1. Tech stack', '', '## Status', 'Accepted', '', '## Decision', '',
  'The reset service is written in Node 20 and reuses the existing PostgreSQL credential store,',
  'because the auth service already owns those tables and a second datastore would split the',
  'transaction boundary that makes single-use reset tokens safe.', ''].join('\n');

export const ADR_TOPOLOGY = ['# 2. Deployment topology', '', '## Status', 'Accepted', '', '## Decision', '',
  'A rolling deployment behind the existing load balancer, with a 5% canary cohort for 24 hours.',
  'Rollback is an image rollback plus the login_v2 feature flag, and readiness is reported on',
  '/ready, which is the probe the load balancer already consumes.', ''].join('\n');

export const RUNBOOK = ['# Runbook', '', '## Rollback', '',
  'Disable the login_v2 feature flag, then roll the deployment back to the previous image.', '',
  '## Canary', '', 'Route 5% of traffic for 24 hours and watch the reset failure rate.', '',
  '## Health and readiness', '', 'GET /health for liveness, GET /ready for readiness.', ''].join('\n');

export const NFR_SUMMARY = {
  schemaVersion: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  runId: 'local-1',
  producer: { type: 'local', name: 'eos-test-fixture' },
  productTree: '@tree',
  targets: [{ id: 'NFR1', category: 'performance', decision: 'ADOPT', metric: 'p95 latency', comparator: '<=', threshold: 800, observed: 410, unit: 'ms', status: 'PASS' }],
};

export const TELEMETRY_MD = ['# Telemetry plan', '',
  'The sign-in completion rate is emitted as auth.login.result from the auth-reset handler and is',
  'read on the Auth funnel dashboard. The reset failure rate alert pages the platform on-call, and',
  'the canary is aborted when reset failures exceed two percent over ten minutes.', '',
  '## Ownership', '',
  'The platform team owns these signals. Every password change is written to the audit sink with',
  'the actor, the time and the outcome, so a support question can be answered without reading the',
  'application logs, and so a rollback decision can be justified after the fact rather than',
  'reconstructed from memory.', ''].join('\n');

export const TELEMETRY_RECORD = {
  schemaVersion: 1,
  owner: '@platform',
  signals: [{ metric: 'sign-in completion rate', emittedAs: 'auth.login.result', source: 'auth-reset handler' }],
  dashboards: [{ name: 'Auth funnel', ref: 'dashboards/auth-funnel.json' }],
  alerts: [{ name: 'reset failure rate', condition: 'failures > 2% over 10m', routesTo: '@platform on-call' }],
  sensitiveOperationAudit: { status: 'COVERED', operations: ['password change'], sink: 'audit-log' },
  rolloutMetrics: { canaryMetric: 'reset failure rate', rollbackTrigger: 'reset failures exceed 2% over 10 minutes', observationWindow: '24h' },
};

export const ITERATION_RECORD = {
  schemaVersion: 1,
  release: 'R-1',
  learnings: [{ observation: 'Reset completion improved but mobile users still drop at the token step', source: 'telemetry', metric: 'sign-in completion rate' }],
  specWriteBack: [{ target: 'docs/requirements.json', change: 'added a mobile-specific reset requirement', targetDigest: '@digest:docs/requirements.json' }],
  decision: { outcome: 'CONTINUE', owner: '@platform' },
};

/** Resolve `@digest:<path>` placeholders in a record against the sandbox's real file contents. */
export function bindDigests(dir, record) {
  const out = JSON.parse(JSON.stringify(record));
  for (const w of out.specWriteBack || []) {
    if (typeof w.targetDigest === 'string' && w.targetDigest.startsWith('@digest:')) {
      const rel = w.targetDigest.slice('@digest:'.length);
      w.targetDigest = createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex');
    }
  }
  return out;
}

/** A release manifest for the sandbox: everything verified is included, nothing is left unaccounted. */
export function manifest(dir, { releaseId = 'R-1', includedStories = ['STORY-001'], extra = {} } = {}) {
  const commit = git(dir, ['rev-parse', 'HEAD']).out.trim() || null;
  return {
    schemaVersion: 1,
    releaseId,
    candidateCommit: commit,
    productTreeDigest: treeDigest(dir),
    includedStories,
    targetEnvironments: ['production'],
    requiredApprovals: { count: 1 },
    ...extra,
  };
}

/** Write the manifest for a sandbox release, bound to the current candidate. */
export function writeManifest(dir, opts = {}) {
  const m = manifest(dir, opts);
  write(dir, `.eos/releases/${m.releaseId}.json`, m);
  commitAll(dir, `release manifest ${m.releaseId}`);
  return m;
}

/**
 * A machine test-run summary matching the default story fixture.
 * `productTree` is REQUIRED by the gate, so fixtures fill it from the sandbox: `@tree` is a
 * placeholder resolved by `bindTree()` once the sandbox exists.
 */
export function testRun({ acs = ['AC1.1'], testPath = 'tests/login.test.mjs', selector = 'valid password', status = 'PASS', productTree = '@tree' } = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    runId: 'local-1',
    producer: { type: 'local', name: 'eos-test-fixture' },
    framework: 'node:test',
    command: 'node --test',
    ...(productTree ? { productTree } : {}),
    results: acs.map((ac) => ({ ac, testPath, selector, status })),
  };
}

/** The digest a machine summary must embed for this sandbox. */
export function treeDigest(dir) {
  const r = run(dir, ['product-tree', '--json']);
  try { return JSON.parse(r.stdout).productTree.digest; } catch { return null; }
}

/**
 * Replace every `productTree: '@tree'` placeholder under `docs/evidence/` with this sandbox's real
 * digest. Machine summaries are excluded from the product tree by design, so writing them does not
 * move the digest they record.
 */
export function bindTree(dir) {
  const digest = treeDigest(dir);
  const evidenceDir = join(dir, 'docs/evidence');
  if (!digest || !existsSync(evidenceDir)) return digest;
  for (const name of readdirSync(evidenceDir)) {
    if (!name.endsWith('.json')) continue;
    const full = join(evidenceDir, name);
    let data;
    try { data = JSON.parse(readFileSync(full, 'utf8')); } catch { continue; }
    if (data.productTree === '@tree') {
      data.productTree = { digest };
      writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
  }
  return digest;
}

export const TEST_FILE = "import { test } from 'node:test';\ntest('valid password', () => {});\n";

export const TRACE_MATRIX = [
  '# Trace matrix', '',
  '| AC | Test | Result |', '| --- | --- | --- |',
  '| AC1.1 | tests/login.test.mjs::valid password | PASS |', '',
].join('\n');

/** Trace + machine results covering BOTH PRD criteria — what a release needs (spec-align strict). */
export const TRACE_MATRIX_FULL = [
  '# Trace matrix', '',
  '| AC | Test | Result |', '| --- | --- | --- |',
  '| AC1.1 | tests/login.test.mjs::valid password | PASS |',
  '| AC1.2 | tests/logout.test.mjs::clears the session | PASS |', '',
].join('\n');

export const LOGOUT_TEST = "import { test } from 'node:test';\ntest('clears the session', () => {});\n";

/** Everything a release candidate needs on top of a verified story. */
export const releaseFiles = (extra = {}) => ({
  'ops/runbook.md': RUNBOOK,
  'docs/evidence/nfr-summary.json': NFR_SUMMARY,
  'docs/trace-matrix.md': TRACE_MATRIX_FULL,
  'tests/logout.test.mjs': LOGOUT_TEST,
  'docs/evidence/test-run.json': {
    ...testRun(),
    results: [
      { ac: 'AC1.1', testPath: 'tests/login.test.mjs', selector: 'valid password', status: 'PASS' },
      { ac: 'AC1.2', testPath: 'tests/logout.test.mjs', selector: 'clears the session', status: 'PASS' },
    ],
  },
  '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node --version', audit: 'node --version' } },
  ...extra,
});

/** Everything a fixture needs to be PAST the product baseline gates (G1/G2/G-UX/G4). */
export const baselineFiles = (extra = {}) => ({
  '.eos/project.json': APP_PROJECT,
  'docs/discovery.md': DISCOVERY_MD,
  'docs/discovery.json': DISCOVERY_RECORD,
  'docs/requirements.md': REQUIREMENTS_MD,
  'docs/requirements.json': REQUIREMENTS_RECORD,
  'docs/prd.md': PRD_2AC,
  'docs/design.json': DESIGN_SKIP_RECORD,
  'docs/architecture.md': ARCHITECTURE_MD,
  'docs/architecture.json': ARCHITECTURE_RECORD,
  'docs/adr/001-tech-stack.md': ADR_STACK,
  'docs/adr/002-deployment-topology.md': ADR_TOPOLOGY,
  ...extra,
});

/** Baseline + a ready story + real test file + machine trace evidence. */
export const storyFiles = (extra = {}) => baselineFiles({
  'docs/stories/STORY-001.md': story(),
  'tests/login.test.mjs': TEST_FILE,
  'docs/trace-matrix.md': TRACE_MATRIX,
  'docs/evidence/test-run.json': testRun(),
  ...extra,
});

export const hasHooks = (dir) => existsSync(join(dir, '.github/hooks'));
