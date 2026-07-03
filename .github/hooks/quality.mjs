#!/usr/bin/env node
// EOS quality — PostToolUse hook, cross-platform (Node, not `sh -c`) so it also runs on native
// Windows without WSL/Git-Bash. [round-2 N1]
// ADVISORY ONLY: runs the project's fast lint / typecheck scripts if they exist and reports issues,
// but NEVER blocks the tool call (always exits 0). PostToolUse fires after EVERY edit, so the full
// test suite is deliberately left to CI (.github/workflows/eos-ci.yml) + branch protection — running
// it on every tool call would stall the agent loop on any real repo. Just fast local feedback. [round-2 N1; round-3 nit]
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('package.json')) {
  console.log('EOS quality: no package.json — skipped.');
  process.exit(0);
}

let scripts = {};
try { scripts = (JSON.parse(readFileSync('package.json', 'utf8')).scripts) || {}; }
catch { console.log('EOS quality: package.json unreadable — skipped.'); process.exit(0); }

// On Windows, npm scripts must run through a shell so `npm`/`npm.cmd` resolves; on POSIX we spawn
// npm directly. Args are a fixed whitelist (no interpolation), so shell:true carries no injection risk.
const isWin = process.platform === 'win32';
for (const name of ['lint', 'typecheck']) {  // 'test' is intentionally CI-owned (see header) — too slow per-edit
  if (!scripts[name]) continue;
  const r = spawnSync('npm', ['run', '-s', name], { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.log(`EOS quality: "${name}" reported issues (advisory — the authoritative gate is CI).`);
  }
}
process.exit(0); // advisory hook: never block
