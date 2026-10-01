#!/usr/bin/env node
// EOS product-quality gate runner — zero external deps, cross-platform.
//   node .github/hooks/project-gate.mjs [--skip-install] [--json]
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
//
// --json writes one report to stdout (.eos/schemas/diagnostic.schema.json, ADR-010). The exit code
// does not change; the report's status says which kind of non-zero it was:
//   P0 the declaration is invalid                 → ERROR    (the gate cannot be evaluated)
//   P1 what the repository holds vs. its declaration → FAIL (manifests nobody declared, …)
//   P2 an agentic product declares no eval command → FAIL
//   P3 a declared command failed                  → FAIL
//   P4 a declared command could not run (no tool) → BLOCKED
import { existsSync, readFileSync } from 'node:fs';
import { join, delimiter, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProjectConfig, detectStacks, commandList, PROJECT_CONFIG_PATH } from './lib/project-config.mjs';
import { wantsJson, humanOutput, worstStatus, writeReport } from './lib/diagnostics.mjs';
import { exitAfterFlush } from './lib/exit.mjs';

const root = process.cwd();
const skipInstall = process.argv.includes('--skip-install');
const json = wantsJson();
// With --json, stdout carries the report alone; everything a person reads goes to stderr.
const say = humanOutput(json);
const problems = [];
const notes = [];
const steps = [];
const error = (code, status, message) => problems.push({ level: 'error', code, status, message });
const warn = (code, message) => problems.push({ level: 'warning', code, message });

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
  // The product's stdout goes to OUR stderr under --json (fd 2): it still reaches the log, and it
  // cannot interleave with the one document stdout is reserved for.
  const stdio = json ? ['inherit', 2, 'inherit'] : 'inherit';
  const r = viaShell
    ? spawnSync(quote(bin), args.map(quote), { cwd: root, stdio, shell: true })
    : spawnSync(bin, args, { cwd: root, stdio, shell: false });
  if (r.error) return { status: 'blocked', code: null, detail: `${cmd}: ${r.error.message}` };
  if (r.status !== 0) return { status: 'fail', code: r.status, detail: `${argv.join(' ')} exited ${r.status}` };
  return { status: 'pass', code: 0, detail: '' };
}

function runStep(step, argvList, { optional = false } = {}) {
  for (const argv of argvList) {
    say(`\n  ▸ ${step}: ${argv.join(' ')}`);
    const r = runOne(argv);
    steps.push({ step, argv, status: r.status, exitCode: r.code });
    if (r.status === 'pass') continue;
    const label = r.status === 'blocked' ? 'BLOCKED' : 'FAIL';
    const code = r.status === 'blocked' ? 'P4' : 'P3';
    if (optional) { warn(code, `${step} ${label}: ${r.detail} (non-fatal — the test step is authoritative)`); return false; }
    error(code, label, `${step} ${label}: ${r.detail}`);
    return false;
  }
  notes.push(`${step}: PASS`);
  return true;
}

/**
 * Print the verdict — as the human report, or as the one JSON document --json promises — and exit
 * once the output has flushed. The verdict LINE is the same in both modes (it becomes `summary`).
 */
function finish({ status, exitCode, verdict, scopeNote = null }) {
  const errors = problems.filter((p) => p.level === 'error');
  const warns = problems.filter((p) => p.level === 'warning');
  if (scopeNote === 'invalid-declaration') {
    for (const e of errors) say('  ERROR ' + e.message);
    say('\n' + verdict);
  } else {
    say('\nEOS product-quality gate — summary\n');
    for (const n of notes) say('  ' + n);
    for (const w of warns) say('  WARN  ' + w.message);
    for (const e of errors) say('  ERROR ' + e.message);
    say('');
    say(verdict);
  }
  if (json) {
    writeReport({
      schemaVersion: 1,
      tool: 'project-gate',
      status,
      exitCode,
      summary: verdict,
      scope: { type: 'product', id: 'product' },
      problems,
      notes,
      rerunCommand: `node .github/hooks/project-gate.mjs${skipInstall ? ' --skip-install' : ''}`,
      details: { mode: details.mode, stacks: details.stacks, executedSteps: details.executed, steps },
    });
  }
  exitAfterFlush(exitCode);
}

const details = { mode: null, stacks: [], executed: 0 };

function main() {
  // ---------- resolve what to run ----------
  const { present, config, errors: cfgErrors, warnings: cfgWarnings } = loadProjectConfig(root);
  for (const w of cfgWarnings) warn('P0', w);
  const detected = detectStacks(root);

  say('EOS product-quality gate\n');

  if (present && cfgErrors.length) {
    for (const e of cfgErrors) error('P0', 'ERROR', e);
    return finish({ status: 'ERROR', exitCode: 1, verdict: 'FAIL: invalid project declaration — the product-quality gate cannot run.', scopeNote: 'invalid-declaration' });
  }

  let plan = null; // { mode, commands }
  let executed = 0; // quality steps actually run — 0 means nothing about the product was proven

  if (present && config.templateDefault === true) {
    warn('P1', `${PROJECT_CONFIG_PATH} is still the EOS template's own declaration — the commands below are EOS's, not your product's. Run \`node .github/eos/eos.mjs init\` to declare your project.`);
  }
  if (present) {
    const mode = config.projectType;
    details.stacks = config.stacks;
    if (mode === 'config-only') {
      details.mode = 'config-only';
      if (detected.length) {
        error('P1', 'FAIL', `${PROJECT_CONFIG_PATH} declares projectType "config-only" but stack manifest(s) were found (${detected.join(', ')}). A real code project must declare "application" or "library" with a test command.`);
      } else {
        notes.push('config-only: no product code to verify (declared).');
      }
    } else {
      const undeclared = detected.filter((s) => !config.stacks.includes(s));
      if (undeclared.length) warn('P1', `stack manifest(s) found but not declared in "stacks": ${undeclared.join(', ')} — their tests will NOT run.`);
      plan = { mode, commands: config.commands };
    }
  } else if (detected.length === 0) {
    details.mode = 'config-only (inferred)';
    notes.push('config-only (inferred): no stack manifest found.');
    warn('P1', `no ${PROJECT_CONFIG_PATH} — declare the project explicitly (see docs/eos/stack-presets.md) so this stays honest as soon as code lands.`);
  } else if (detected.length === 1 && detected[0] === 'node') {
    // Backwards compatibility: a plain Node repo keeps working exactly as before, with the same
    // "package.json must define a test script" rule the CI step used to apply inline.
    warn('P1', `no ${PROJECT_CONFIG_PATH} — running the legacy Node defaults. Add the declaration (see docs/eos/stack-presets.md) to pin your own commands.`);
    let scripts = {};
    try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {}; } catch { /* unreadable/invalid package.json */ }
    if (!scripts.test) {
      error('P1', 'FAIL', 'package.json has no "test" script. A green-but-empty quality gate is worse than no gate — add a real test script or declare projectType in ' + PROJECT_CONFIG_PATH + '.');
    } else {
      const legacy = {};
      if (existsSync(join(root, 'package-lock.json'))) legacy.install = commandList('npm ci --prefer-offline --no-audit --no-fund').commands;
      for (const [step, script] of [['lint', 'lint'], ['typecheck', 'typecheck'], ['test', 'test'], ['eval', 'eval']]) {
        if (scripts[script]) legacy[step] = commandList(`npm run --silent ${script}`).commands;
      }
      plan = { mode: 'application (legacy Node defaults)', commands: legacy };
      details.stacks = ['node'];
    }
  } else {
    // The EOS-002 hole: a non-Node project used to be skipped entirely, so failing tests never ran.
    error('P1', 'FAIL', `stack manifest(s) found (${detected.join(', ')}) but there is no ${PROJECT_CONFIG_PATH}. EOS will NOT guess how to test this project — declare it (projectType + stacks + commands.test), or declare "config-only" if this repo really has no product code. See docs/eos/stack-presets.md.`);
  }

  // ---------- execute ----------
  if (plan) {
    details.mode = plan.mode;
    say(`  MODE  ${plan.mode}${present ? ` · stacks: ${config.stacks.join(', ') || '—'}` : ''}`);
    const evalRequired = present && (config.evalRequired === true
      || (config.evalRequired === undefined && (config.productParadigms || []).includes('agentic')));
    if (evalRequired && !plan.commands.eval) {
      error('P2', 'FAIL', `this project declares an agentic paradigm (or evalRequired) but ${PROJECT_CONFIG_PATH} has no commands.eval — G-EVAL cannot be proven. Add the eval command (see docs/eos/examples/eval-starter/).`);
    }
    if (plan.commands.install && !skipInstall) runStep('install', plan.commands.install, { optional: true });
    else if (plan.commands.install) notes.push('install: skipped (--skip-install)');

    for (const step of ['lint', 'typecheck', 'test', 'eval']) {
      if (!plan.commands[step]) { notes.push(`${step}: not declared (N/A)`); continue; }
      executed += 1;
      if (!runStep(step, plan.commands[step])) break;
    }
  }
  details.executed = executed;

  // ---------- report (same shape as the other EOS validators) ----------
  const errors = problems.filter((p) => p.level === 'error');
  const warnCount = problems.length - errors.length;
  if (errors.length) {
    return finish({ status: worstStatus(errors.map((e) => e.status), 'FAIL'), exitCode: 1, verdict: `FAIL: ${errors.length} error(s), ${warnCount} warning(s)` });
  }
  if (executed === 0) {
    // NOT "PASS". Nothing about the product was executed, so there is nothing to have passed.
    // A summary line reading PASS is read as "the code is verified" by every human and every agent
    // that sees it, which is precisely the false assurance a governance gate must never emit. The
    // exit code stays 0 — this is a legitimate state for a repository with no product code, not a
    // failure — but the WORD has to match what actually happened. [audit: config-only false PASS]
    return finish({ status: 'NOT_APPLICABLE', exitCode: 0, verdict: `NOT_APPLICABLE: no product code was verified${warnCount ? ` (${warnCount} warning(s))` : ''}` });
  }
  return finish({ status: 'PASS', exitCode: 0, verdict: `PASS${warnCount ? ` (${warnCount} warning(s))` : ''}` });
}

main();
