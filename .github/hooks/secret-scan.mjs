#!/usr/bin/env node
// EOS secret scanner — zero external deps. Static defense-in-depth for hardcoded secrets.
// Scans git-tracked text files (and the working tree if not a repo) for secret literals and
// for a committed .env. Complements the PreToolUse guardrail (real-time) and CI (batch).
//   node .github/hooks/secret-scan.mjs
// Exit 1 on any finding. Redacts matches in output (never prints the secret).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname } from 'node:path';

const root = process.cwd();
const findings = [];

// High-signal secret patterns (kept tight to avoid false positives).
const PATTERNS = [
  ['OpenAI-style key', /sk-[A-Za-z0-9]{16,}/],
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_\-]{35}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN\s+(RSA|EC|OPENSSH|DSA|PRIVATE)\s+(PRIVATE\s+)?KEY-----/],
  ['hardcoded credential', /(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"'${}\n]{6,}["']/i],
];
// Allow obvious placeholders / env references (reduce false positives).
const IGNORE_LINE = /(process\.env|os\.environ|import\.meta\.env|System\.getenv|\$\{|<[A-Z_]+>|example|placeholder|changeme|xxx+|your[_-])/i;

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java', '.rs', '.cs', '.rb', '.php', '.sh', '.env', '.json', '.yaml', '.yml', '.toml', '.ini', '.md', '.txt', '.sql', '.properties']);
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
        else acc.push(join(dir, e.name).replace(root + '/', ''));
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
  if (!TEXT_EXT.has(ext) && base !== '.env') continue;
  if (rel.includes('/eval-starter/') || base === 'secret-scan.mjs' || base === 'deny-dangerous.js') continue; // self / examples with placeholder patterns
  const full = join(root, rel);
  let txt;
  try { if (statSync(full).size > 512 * 1024) continue; txt = readFileSync(full, 'utf8'); } catch { continue; }
  txt.split('\n').forEach((line, i) => {
    if (IGNORE_LINE.test(line)) return;
    for (const [kind, re] of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const hit = m[0];
        const red = hit.length > 8 ? hit.slice(0, 4) + '***' + hit.slice(-2) : '***';
        findings.push({ file: rel, line: i + 1, kind, sample: red });
        break;
      }
    }
  });
}

console.log('EOS secret scan\n');
if (findings.length) {
  for (const f of findings) console.log(`  LEAK  ${f.file}:${f.line}  ${f.kind}${f.sample ? `  (${f.sample})` : ''}`);
  console.log(`\nFAIL: ${findings.length} potential secret(s). Move to env vars / a secret store; add a .env.example instead.`);
  process.exit(1);
}
console.log('PASS — no hardcoded secrets found in tracked files.');
