#!/usr/bin/env node
// EOS secret scanner — zero external deps for the baseline; auto-enhances with gitleaks if present.
// Scans git-tracked text files (and the working tree if not a repo) for secret literals and
// for a committed .env. Complements the PreToolUse guardrail (real-time) and CI (batch).
//   node .github/hooks/secret-scan.mjs
// If `gitleaks` is on PATH it ALSO runs a deeper scan (optional enhancement — never required;
// absence degrades gracefully to the built-in patterns). Exit 1 on any finding. Matches redacted.
// The rules are ./lib/secret-rules.mjs, shared with the PreToolUse hook. The import is static on
// purpose: this scanner is an authority (CI, and the release-ready `secret-scan` check), so a
// missing rule module must fail the run, never quietly scan nothing.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, relative } from 'node:path';
import { findSecret, isConfigFile, redact } from './lib/secret-rules.mjs';

const root = process.cwd();
const findings = [];

// The guards' own sources hold the patterns themselves, so they are exempt — by exact path, so a
// project file that merely shares one of these names is still scanned.
const SELF = new Set(['.github/hooks/secret-scan.mjs', '.github/hooks/deny-dangerous.js', '.github/hooks/lib/secret-rules.mjs']);

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java', '.rs', '.cs', '.rb', '.php', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.env', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.tf', '.tfvars', '.hcl', '.xml', '.gradle', '.md', '.txt', '.sql', '.properties']);
// Secret-bearing files with no (or an unusual) extension — matched by exact basename. [audit D3]
const TEXT_NAMES = new Set(['Dockerfile', 'Containerfile', '.npmrc', '.netrc', '.pgpass', '.env']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);

function listFiles() {
  try {
    const out = execSync('git ls-files', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean);
  } catch {
    const acc = [];
    (function rec(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rec(join(dir, e.name)); }
        else acc.push(relative(root, join(dir, e.name)).split(/[\\/]/).join('/'));
      }
    })(root);
    return acc;
  }
}

// A committed .env is itself a finding (should be gitignored).
for (const envName of ['.env', '.env.local', '.env.production', '.env.development']) {
  try {
    const tracked = execSync(`git ls-files ${envName}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (tracked) findings.push({ file: envName, line: 0, kind: 'committed .env file (should be gitignored)', sample: '' });
  } catch { /* not a git repo — skip */ }
}

for (const rel of listFiles()) {
  const ext = extname(rel).toLowerCase();
  const base = rel.split('/').pop();
  if (!TEXT_EXT.has(ext) && !TEXT_NAMES.has(base)) continue;
  if (rel.includes('/eval-starter/') || SELF.has(rel)) continue; // self / examples with placeholder patterns
  const full = join(root, rel);
  let txt;
  try { if (statSync(full).size > 512 * 1024) continue; txt = readFileSync(full, 'utf8'); } catch { continue; }
  const configFile = isConfigFile(rel);
  // Every line is read. Before 2.0.1 a line that mentioned an environment variable was skipped
  // whole, which hid exactly the literal fallback (`process.env.X || "<LITERAL>"`) that leaks.
  txt.split('\n').forEach((line, i) => {
    const hit = findSecret(line, { configFile });
    if (hit) findings.push({ file: rel, line: i + 1, kind: hit.kind, sample: redact(hit.value) });
  });
}

// --- Optional deeper scan: gitleaks (if installed). Enhancement only — never required. ---
let gitleaksRan = false;
let gitleaksFailed = false;
function hasGitleaks() {
  try { execSync('gitleaks version', { stdio: 'ignore' }); return true; } catch { return false; }
}
if (hasGitleaks()) {
  gitleaksRan = true;
  const cfg = join(root, '.gitleaks.toml');
  const cfgArg = existsSync(cfg) ? `--config ${JSON.stringify(cfg)}` : '';
  const isRepo = existsSync(join(root, '.git'));
  // `dir` scans the filesystem (works with or without git history); redaction on.
  const cmd = `gitleaks dir . ${cfgArg} --no-banner --redact --exit-code 2`.replace(/\s+/g, ' ').trim();
  try {
    execSync(cmd, { cwd: root, stdio: 'ignore' });
  } catch (e) {
    // gitleaks exits non-zero (2) when it finds leaks; treat as failure.
    if (e && e.status === 2) gitleaksFailed = true;
    else gitleaksFailed = false; // other errors (e.g. usage) shouldn't hard-fail the baseline
  }
}

console.log('EOS secret scan\n');
const engine = gitleaksRan ? 'built-in patterns + gitleaks' : 'built-in patterns (install gitleaks for deeper scan)';
console.log(`  engine: ${engine}`);
if (findings.length || gitleaksFailed) {
  for (const f of findings) console.log(`  LEAK  ${f.file}:${f.line}  ${f.kind}${f.sample ? `  (${f.sample})` : ''}`);
  if (gitleaksFailed) console.log('  LEAK  gitleaks reported findings — run `gitleaks dir . --redact` for details.');
  const n = findings.length + (gitleaksFailed ? 1 : 0);
  console.log(`\nFAIL: ${n} potential secret source(s). Move to env vars / a secret store; add a .env.example instead.`);
  process.exit(1);
}
console.log('PASS — no hardcoded secrets found in tracked files.');
