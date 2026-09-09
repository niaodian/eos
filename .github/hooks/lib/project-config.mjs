// EOS project declaration (`.eos/project.json`) — schema + loader. Zero external deps.
//
// WHY THIS EXISTS: EOS's product-quality gate used to be a shell `if [ -f package.json ]`, so a
// Python/Go/Java/Rust/.NET project's FAILING tests were never executed and CI went green
// ("EOS config green ≠ product tests green"). Heuristics can't fix that — a project must DECLARE
// what it is and how it is verified. This file is that contract; it is consumed by:
//   - .github/hooks/project-gate.mjs  (runs the declared commands — fail-closed)
//   - .github/hooks/eos-doctor.mjs    (authoritative product-paradigm signal for G-EVAL)
//   - .github/hooks/validate-config.mjs (S12: the declaration itself is valid)
// JSON, not YAML, on purpose: parsing YAML would need a dependency and EOS stays zero-dep.
// [audit EOS-002 / EOS-003]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PROJECT_CONFIG_PATH = '.eos/project.json';

export const PROJECT_TYPES = ['application', 'library', 'config-only'];
export const PARADIGMS = ['deterministic', 'agentic'];
export const STACKS = ['node', 'python', 'go', 'java', 'rust', 'dotnet', 'other'];
export const STEPS = ['install', 'lint', 'typecheck', 'test', 'eval'];
const TOP_LEVEL_KEYS = new Set([
  '$schema', 'projectType', 'stacks', 'commands', 'productParadigms', 'evalRequired',
  'evalWaiver', 'rationale', 'workflowProfile', 'complianceProfile',
]);
export const COMPLIANCE_PROFILES = ['none', 'regulated'];

// Manifests that prove a real code project exists, so "config-only" can't be used to hide one.
export const STACK_MANIFESTS = {
  node: ['package.json'],
  python: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
  go: ['go.mod'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
  rust: ['Cargo.toml'],
  dotnet: [], // matched by extension below (*.sln / *.csproj / *.fsproj)
};
const DOTNET_EXT = /\.(sln|csproj|fsproj|vbproj)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'dist', 'build', '.next', 'coverage', 'vendor', 'target', '.venv', 'venv', '__pycache__']);

// Shell metacharacters are REJECTED, not escaped: declared commands are executed WITHOUT a shell
// (spawn with shell:false), so a config value can never smuggle in a second, destructive command
// or a remote-script-to-shell pipeline. Chain steps with an ARRAY of commands instead of `&&`.
const SHELL_METACHARS = /[;&|<>`$\n\r]/;

/**
 * Split a command string into argv. Supports "quoted segments"; rejects shell metacharacters.
 * Returns { argv, error }.
 */
export function parseCommand(input) {
  if (Array.isArray(input)) {
    if (!input.length) return { argv: null, error: 'empty command array' };
    if (!input.every((t) => typeof t === 'string' && t.trim().length)) return { argv: null, error: 'command array must contain non-empty strings' };
    const tokens = input.map((t) => t.trim());
    const bad = tokens.find((t) => SHELL_METACHARS.test(t));
    if (bad) return { argv: null, error: `shell metacharacter in "${bad}" — commands run without a shell; use an array of commands to chain` };
    // A literal double quote in an argv token has no meaning without a shell, and would be handled
    // differently by the Windows .cmd path. Reject it so every platform behaves identically.
    const quoted = tokens.find((t) => t.includes('"'));
    if (quoted) return { argv: null, error: `double quote inside the argv token ${JSON.stringify(quoted)} — argv entries are passed verbatim; write the whole command as one quoted string instead` };
    return { argv: tokens, error: null };
  }
  if (typeof input !== 'string' || !input.trim()) return { argv: null, error: 'command must be a non-empty string or string array' };
  if (SHELL_METACHARS.test(input)) {
    return { argv: null, error: `shell metacharacter in "${input}" — commands run without a shell; use ["cmd a", "cmd b"] to chain, or move the pipeline into an npm/Make/tox script` };
  }
  const argv = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started) { argv.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (quote) return { argv: null, error: `unterminated ${quote} quote in "${input}"` };
  if (started) argv.push(cur);
  if (!argv.length) return { argv: null, error: 'empty command' };
  return { argv, error: null };
}

/** Normalize a step value into a list of argv arrays (a step may be a chain of commands). */
export function commandList(value) {
  if (Array.isArray(value)) {
    if (!value.length) return { commands: null, error: 'empty command array' };
    if (value.some((v) => typeof v !== 'string')) return { commands: null, error: 'a command array must contain strings' };
    const withSpace = value.filter((v) => /\s/.test(v.trim())).length;
    // An array is EITHER one argv (["go","test","./..."]) OR a chain of command strings
    // (["ruff check .", "pytest -q"]). A mix of the two is ambiguous — reject it rather than guess.
    if (withSpace && withSpace !== value.length) {
      return { commands: null, error: `ambiguous array — mix of bare tokens and full commands (${JSON.stringify(value)}). Use ONE argv array (["dotnet", "test", "app.sln"]), or a chain of complete command strings (["ruff check .", "pytest -q"]). An argument containing a space belongs in a quoted single string: "dotnet test \\"My App.sln\\"".` };
    }
  }
  const raw = Array.isArray(value) && value.every((v) => typeof v === 'string') && value.some((v) => /\s/.test(v.trim()))
    ? value            // ["ruff check .", "pytest -q"] — a chain of command STRINGS
    : [value];         // "pytest -q"  |  ["pytest", "-q"] — a single command
  const out = [];
  for (const item of raw) {
    const { argv, error } = parseCommand(item);
    if (error) return { commands: null, error };
    out.push(argv);
  }
  return { commands: out, error: null };
}

/** Shallow scan for stack manifests so a declaration can be cross-checked against reality. */
export function detectStacks(root, maxDepth = 3) {
  const found = new Set();
  (function rec(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(join(dir, e.name), depth + 1);
        continue;
      }
      for (const [stack, names] of Object.entries(STACK_MANIFESTS)) {
        if (names.includes(e.name)) found.add(stack);
      }
      if (DOTNET_EXT.test(e.name)) found.add('dotnet');
    }
  })(root, 0);
  return [...found].sort();
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Load + validate `.eos/project.json`.
 * @returns {{present:boolean, path:string, config:object|null, errors:string[], warnings:string[]}}
 */
export function loadProjectConfig(root) {
  const path = join(root, PROJECT_CONFIG_PATH);
  const errors = [];
  const warnings = [];
  if (!existsSync(path)) return { present: false, path, config: null, errors, warnings };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${PROJECT_CONFIG_PATH}: invalid JSON (${e.message})`);
    return { present: true, path, config: null, errors, warnings };
  }
  if (!isPlainObject(parsed)) {
    errors.push(`${PROJECT_CONFIG_PATH}: must be a JSON object`);
    return { present: true, path, config: null, errors, warnings };
  }

  // Unknown keys are ERRORS: a typo like "command" instead of "commands" would silently disable
  // the product-quality gate — exactly the failure mode this contract exists to prevent.
  for (const k of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.has(k)) errors.push(`${PROJECT_CONFIG_PATH}: unknown key "${k}" (allowed: ${[...TOP_LEVEL_KEYS].filter((x) => x !== '$schema').join(', ')})`);
  }

  const { projectType } = parsed;
  if (!projectType) errors.push(`${PROJECT_CONFIG_PATH}: "projectType" is required (${PROJECT_TYPES.join(' | ')})`);
  else if (!PROJECT_TYPES.includes(projectType)) errors.push(`${PROJECT_CONFIG_PATH}: unknown projectType "${projectType}" (expected ${PROJECT_TYPES.join(' | ')})`);

  let stacks = [];
  if (parsed.stacks !== undefined) {
    if (!Array.isArray(parsed.stacks) || parsed.stacks.some((s) => typeof s !== 'string')) {
      errors.push(`${PROJECT_CONFIG_PATH}: "stacks" must be an array of strings`);
    } else {
      for (const s of parsed.stacks) if (!STACKS.includes(s)) errors.push(`${PROJECT_CONFIG_PATH}: unknown stack "${s}" (expected ${STACKS.join(' | ')})`);
      stacks = parsed.stacks.filter((s) => STACKS.includes(s));
    }
  }

  const commands = {};
  if (parsed.commands !== undefined) {
    if (!isPlainObject(parsed.commands)) {
      errors.push(`${PROJECT_CONFIG_PATH}: "commands" must be an object`);
    } else {
      for (const [step, value] of Object.entries(parsed.commands)) {
        if (!STEPS.includes(step)) { errors.push(`${PROJECT_CONFIG_PATH}: unknown command step "${step}" (expected ${STEPS.join(' | ')})`); continue; }
        if (value === null) continue; // explicit "not applicable"
        const { commands: argvList, error } = commandList(value);
        if (error) errors.push(`${PROJECT_CONFIG_PATH}: commands.${step}: ${error}`);
        else commands[step] = argvList;
      }
    }
  }

  let productParadigms = null;
  if (parsed.productParadigms !== undefined) {
    if (!Array.isArray(parsed.productParadigms) || !parsed.productParadigms.length) {
      errors.push(`${PROJECT_CONFIG_PATH}: "productParadigms" must be a non-empty array (${PARADIGMS.join(' | ')})`);
    } else {
      for (const p of parsed.productParadigms) if (!PARADIGMS.includes(p)) errors.push(`${PROJECT_CONFIG_PATH}: unknown productParadigm "${p}" (expected ${PARADIGMS.join(' | ')})`);
      productParadigms = parsed.productParadigms.filter((p) => PARADIGMS.includes(p));
    }
  }

  if (parsed.workflowProfile !== undefined
      && (typeof parsed.workflowProfile !== 'string' || !/^[a-z0-9-]+$/.test(parsed.workflowProfile))) {
    errors.push(`${PROJECT_CONFIG_PATH}: "workflowProfile" must be a lower-case key of .eos/workflow.json profiles (e.g. "standard-product")`);
  }

  // `complianceProfile` can only ever TIGHTEN: docs/compliance-profile.json stays the authoritative
  // record of the data-boundary decision (audit EOS-004), so declaring "none" here never switches a
  // compliance check off — it just says nothing. Declaring "regulated" turns them on early.
  if (parsed.complianceProfile !== undefined && !COMPLIANCE_PROFILES.includes(parsed.complianceProfile)) {
    errors.push(`${PROJECT_CONFIG_PATH}: unknown complianceProfile "${parsed.complianceProfile}" (expected ${COMPLIANCE_PROFILES.join(' | ')}). The authoritative record stays docs/compliance-profile.json.`);
  }

  if (parsed.evalRequired !== undefined && typeof parsed.evalRequired !== 'boolean') {
    errors.push(`${PROJECT_CONFIG_PATH}: "evalRequired" must be a boolean`);
  }

  let evalWaiver = null;
  if (parsed.evalWaiver !== undefined) {
    if (!isPlainObject(parsed.evalWaiver)) {
      errors.push(`${PROJECT_CONFIG_PATH}: "evalWaiver" must be an object { reason, approvedBy }`);
    } else {
      const reason = typeof parsed.evalWaiver.reason === 'string' ? parsed.evalWaiver.reason.trim() : '';
      const approvedBy = typeof parsed.evalWaiver.approvedBy === 'string' ? parsed.evalWaiver.approvedBy.trim() : '';
      if (reason.length < 10) errors.push(`${PROJECT_CONFIG_PATH}: evalWaiver.reason must be a real explanation (>= 10 chars)`);
      if (!approvedBy) errors.push(`${PROJECT_CONFIG_PATH}: evalWaiver.approvedBy is required (a human owns the waiver)`);
      if (reason.length >= 10 && approvedBy) evalWaiver = { reason, approvedBy };
    }
  }

  // Fail-closed structural rules — an "application" without a test command is a vacuous gate.
  if (projectType === 'application' || projectType === 'library') {
    if (!commands.test) {
      errors.push(`${PROJECT_CONFIG_PATH}: projectType "${projectType}" requires commands.test — a project whose tests never run cannot have a quality gate.`);
    }
    if (!stacks.length) errors.push(`${PROJECT_CONFIG_PATH}: projectType "${projectType}" requires a non-empty "stacks" array`);
  }
  if (projectType === 'config-only' && Object.keys(commands).length) {
    // project-gate.mjs never executes commands for config-only, so accepting them here would
    // promise a gate that silently does nothing. A repo with real code whose stack has no
    // recognizable manifest (shell, Terraform, …) declares `application` + stacks:["other"].
    errors.push(`${PROJECT_CONFIG_PATH}: projectType "config-only" must not declare commands — they would never run. Use "application" (or "library") with stacks (use "other" if your stack has no manifest file) so commands.test is actually executed.`);
  }

  const config = {
    projectType,
    stacks,
    commands,
    productParadigms,
    workflowProfile: typeof parsed.workflowProfile === 'string' ? parsed.workflowProfile : undefined,
    complianceProfile: COMPLIANCE_PROFILES.includes(parsed.complianceProfile) ? parsed.complianceProfile : undefined,
    evalRequired: parsed.evalRequired,
    evalWaiver,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
  };
  return { present: true, path, config: errors.length ? null : config, errors, warnings };
}
