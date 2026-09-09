#!/usr/bin/env node
// EOS product-quality gate runner — zero external deps, cross-platform.
//   node .github/hooks/project-gate.mjs [--skip-install]
//
// Runs the project's OWN quality commands (install → lint → typecheck → test → eval) as declared in
// `.eos/project.json`, for ANY stack. It replaces the old `if [ -f package.json ]` CI branch, which
// silently skipped Python/Go/Java/Rust/.NET projects: a failing pytest could not fail EOS CI.
// [audit EOS-002]
//
// Contract (fail-closed):
//   - projectType application|library  → commands.test is REQUIRED and MUST run and pass.
//   - projectType config-only          → no product tests, but only if no stack manifest is present.
//   - missing toolchain (binary not on PATH) → BLOCKED, exit 1. Never a silent pass.
//   - no declaration at all            → Node repos keep the legacy behaviour (compat); any other
//                                        detected stack fails closed asking for the declaration.
// Commands run WITHOUT a shell (see lib/project-config.mjs for the trust boundary).
import { existsSync, readFileSync } from 'node:fs';
import { join, delimiter, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProjectConfig, detectStacks, commandList, PROJECT_CONFIG_PATH } from './lib/project-config.mjs';

const root = process.cwd();
const skipInstall = process.argv.includes('--skip-install');
const errors = [];
const warns = [];
const notes = [];

// ---------- command resolution (explicit, so "tool not installed" is BLOCKED, never skipped) ----------
const isWin = process.platform === 'win32';
const PATHEXT = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);

function resolveBinary(cmd) {
  const candidates = (base) => (isWin && !/\.[a-z0-9]+$/i.test(base) ? PATHEXT.map((x) => base + x) : [base]);
  if (cmd.includes('/') || cmd.includes('\\')) {
    const base = isAbsolute(cmd) ? cmd : resolve(root, cmd);
    return candidates(base).find((c) => existsSync(c)) || null;
  }
  for (const dir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const hit = candidates(join(dir, cmd)).find((c) => existsSync(c));
    if (hit) return hit;
  }
  return null;
}

/** @returns {{status:'pass'|'fail'|'blocked', code:number|null, detail:string}} */
function runOne(argv) {
  const [cmd, ...args] = argv;
  const bin = resolveBinary(cmd);
  if (!bin) return { status: 'blocked', code: null, detail: `"${cmd}" is not installed / not on PATH` };
  // Windows .cmd/.bat shims cannot be spawned directly by Node; they need cmd.exe. Spawn the
  // RESOLVED path (quoted), never the raw token: cmd.exe treats a leading "/" as a switch, so a
  // POSIX-style token like ./gradlew would otherwise fail even though the shim was found. Tokens
  // are already validated to contain no shell metacharacters, so this stays a closed surface.
  const viaShell = isWin && /\.(cmd|bat)$/i.test(bin);
  const quote = (s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '')}"` : s);
  const r = viaShell
    ? spawnSync(quote(bin), args.map(quote), { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync(bin, args, { cwd: root, stdio: 'inherit', shell: false });
  if (r.error) return { status: 'blocked', code: null, detail: `${cmd}: ${r.error.message}` };
  if (r.status !== 0) return { status: 'fail', code: r.status, detail: `${argv.join(' ')} exited ${r.status}` };
  return { status: 'pass', code: 0, detail: '' };
}

function runStep(step, argvList, { optional = false } = {}) {
  for (const argv of argvList) {
    console.log(`\n  ▸ ${step}: ${argv.join(' ')}`);
    const r = runOne(argv);
    if (r.status === 'pass') continue;
    const label = r.status === 'blocked' ? 'BLOCKED' : 'FAIL';
    if (optional) { warns.push(`${step} ${label}: ${r.detail} (non-fatal — the test step is authoritative)`); return false; }
    errors.push(`${step} ${label}: ${r.detail}`);
    return false;
  }
  notes.push(`${step}: PASS`);
  return true;
}

// ---------- resolve what to run ----------
const { present, config, errors: cfgErrors, warnings: cfgWarnings } = loadProjectConfig(root);
warns.push(...cfgWarnings);
const detected = detectStacks(root);

console.log('EOS product-quality gate\n');

if (present && cfgErrors.length) {
  for (const e of cfgErrors) console.log('  ERROR ' + e);
  console.log('\nFAIL: invalid project declaration — the product-quality gate cannot run.');
  process.exit(1);
}

let plan = null; // { mode, commands }

if (present) {
  const mode = config.projectType;
  if (mode === 'config-only') {
    if (detected.length) {
      errors.push(`${PROJECT_CONFIG_PATH} declares projectType "config-only" but stack manifest(s) were found (${detected.join(', ')}). A real code project must declare "application" or "library" with a test command.`);
    } else {
      notes.push('config-only: no product code to verify (declared).');
    }
  } else {
    const undeclared = detected.filter((s) => !config.stacks.includes(s));
    if (undeclared.length) warns.push(`stack manifest(s) found but not declared in "stacks": ${undeclared.join(', ')} — their tests will NOT run.`);
    plan = { mode, commands: config.commands };
  }
} else if (detected.length === 0) {
  notes.push('config-only (inferred): no stack manifest found.');
  warns.push(`no ${PROJECT_CONFIG_PATH} — declare the project explicitly (see docs/eos/stack-presets.md) so this stays honest as soon as code lands.`);
} else if (detected.length === 1 && detected[0] === 'node') {
  // Backwards compatibility: a plain Node repo keeps working exactly as before, with the same
  // "package.json must define a test script" rule the CI step used to apply inline.
  warns.push(`no ${PROJECT_CONFIG_PATH} — running the legacy Node defaults. Add the declaration (see docs/eos/stack-presets.md) to pin your own commands.`);
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {}; } catch { /* unreadable/invalid package.json */ }
  if (!scripts.test) {
    errors.push('package.json has no "test" script. A green-but-empty quality gate is worse than no gate — add a real test script or declare projectType in ' + PROJECT_CONFIG_PATH + '.');
  } else {
    const legacy = {};
    if (existsSync(join(root, 'package-lock.json'))) legacy.install = commandList('npm ci --prefer-offline --no-audit --no-fund').commands;
    for (const [step, script] of [['lint', 'lint'], ['typecheck', 'typecheck'], ['test', 'test'], ['eval', 'eval']]) {
      if (scripts[script]) legacy[step] = commandList(`npm run --silent ${script}`).commands;
    }
    plan = { mode: 'application (legacy Node defaults)', commands: legacy };
  }
} else {
  // The EOS-002 hole: a non-Node project used to be skipped entirely, so failing tests never ran.
  errors.push(`stack manifest(s) found (${detected.join(', ')}) but there is no ${PROJECT_CONFIG_PATH}. EOS will NOT guess how to test this project — declare it (projectType + stacks + commands.test), or declare "config-only" if this repo really has no product code. See docs/eos/stack-presets.md.`);
}

// ---------- execute ----------
if (plan) {
  console.log(`  MODE  ${plan.mode}${present ? ` · stacks: ${config.stacks.join(', ') || '—'}` : ''}`);
  const evalRequired = present && (config.evalRequired === true
    || (config.evalRequired === undefined && (config.productParadigms || []).includes('agentic')));
  if (evalRequired && !plan.commands.eval) {
    errors.push(`this project declares an agentic paradigm (or evalRequired) but ${PROJECT_CONFIG_PATH} has no commands.eval — G-EVAL cannot be proven. Add the eval command (see docs/eos/examples/eval-starter/).`);
  }
  if (plan.commands.install && !skipInstall) runStep('install', plan.commands.install, { optional: true });
  else if (plan.commands.install) notes.push('install: skipped (--skip-install)');

  for (const step of ['lint', 'typecheck', 'test', 'eval']) {
    if (!plan.commands[step]) { notes.push(`${step}: not declared (N/A)`); continue; }
    if (!runStep(step, plan.commands[step])) break;
  }
}

// ---------- report (same shape as the other EOS validators) ----------
console.log('\nEOS product-quality gate — summary\n');
for (const n of notes) console.log('  ' + n);
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
