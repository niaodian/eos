#!/usr/bin/env node
// EOS static config validator — zero external deps.
// Run from project root: node .github/hooks/validate-config.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadProjectConfig, detectStacks, PROJECT_CONFIG_PATH } from './lib/project-config.mjs';
import { loadWorkflow, loadGates, loadAgentMap } from '../eos/lib/registry.mjs';

const root = process.cwd();
const errors = [];
const warns = [];

const fm = (txt) => {
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
};

// Recursively collect *.instructions.md (supports subfolder organization)
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.instructions.md')) acc.push(p);
  }
  return acc;
}

// S7 directory + key-file completeness
const required = [
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.github/prompts',
  '.github/agents',
  '.github/hooks',
  'docs/eos/agent-map.md',
  'docs/eos/activation.md',
];
for (const p of required) {
  if (!existsSync(join(root, p))) errors.push(`S7 missing required path: ${p}`);
}

// Collect & validate instruction files
const instrDir = join(root, '.github/instructions');
const files = walk(instrDir);
const globsByArea = {};

for (const full of files) {
  const rel = relative(root, full).split(/[\\/]/).join('/');
  const base = rel.split('/').pop();
  const txt = readFileSync(full, 'utf8');
  const head = fm(txt);

  // S1 frontmatter present
  if (!head) {
    errors.push(`S1 ${rel}: missing/invalid YAML frontmatter`);
    continue;
  }
  // S6 naming convention (warn only — subfolders relax this)
  if (!/^\d\d-[a-z0-9-]+\.instructions\.md$/.test(base)) {
    warns.push(`S6 ${rel}: filename not "NN-area[-stack].instructions.md"`);
  }
  // S2 applyTo present
  const m = head.match(/applyTo:\s*["']?(.+?)["']?\s*$/m);
  if (!m) {
    warns.push(`S2 ${rel}: no applyTo (rule won't auto-apply; manual attach only)`);
    continue;
  }
  const glob = m[1].trim().replace(/^["']|["']$/g, '');
  // area = top folder under instructions/, else 'root'
  const parts = rel.replace('.github/instructions/', '').split('/');
  const area = parts.length > 1 ? parts[0] : 'root';
  (globsByArea[area] ||= []).push({ rel, glob });
}

// S3 duplicate identical SPECIFIC glob (heuristic overlap detection).
// The universal "**" scope is an intentionally shared pattern for multiple thin
// always-on rule files (e.g. workspace conventions + security), so it is exempt.
const seen = {};
for (const area in globsByArea) {
  for (const { rel, glob } of globsByArea[area]) {
    if (glob === '**') continue; // always-on scope: additive, not a conflict
    if (seen[glob]) errors.push(`S3 duplicate glob "${glob}" in ${seen[glob]} and ${rel}`);
    else seen[glob] = rel;
  }
}

// S4 coverage of common source types (warn)
const allGlobs = Object.values(globsByArea).flat().map((x) => x.glob).join(' ');
for (const [label, needle] of [['*.ts', 'ts'], ['*.tsx', 'tsx'], ['*.py', 'py'], ['*.sql', 'sql']]) {
  if (!allGlobs.includes(needle)) warns.push(`S4 no rule appears to cover ${label}`);
}

// S5 always-on budget — copilot-instructions.md (R1) enters EVERY session, and applyTo:"**" rule files
// share that per-session cost ("always-on is the scarcest resource"). Enforces blueprint P3/P8, which
// documented this budget but left it unchecked. R1 line cap is a hard gate; the word cap is advisory.
const bodyWords = (s) => (s.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/\S+/g) || []).length;
const R1 = '.github/copilot-instructions.md';
if (existsSync(join(root, R1))) {
  const t = readFileSync(join(root, R1), 'utf8');
  const lines = t.replace(/\n+$/, '').split('\n').length;
  if (lines > 40) errors.push(`S5 ${R1}: ${lines} lines (>40) — R1 enters every session; keep it minimal, split thin slices by applyTo`);
  if (bodyWords(t) > 300) warns.push(`S5 ${R1}: ${bodyWords(t)} words (>300 budget) — split thin slices by applyTo`);
}
for (const { rel, glob } of Object.values(globsByArea).flat()) {
  if (glob !== '**') continue; // only always-on files share the every-session cost
  const w = bodyWords(readFileSync(join(root, rel), 'utf8'));
  if (w > 300) warns.push(`S5 ${rel}: ${w} words (>300 budget) — trim or move a slice to a scoped applyTo rule`);
}

// S9 hooks JSON validity + event-name validity.
// These 8 names are the official VS Code Copilot hook events, confirmed against
// docs/agents/reference/hooks-reference.md (they also happen to match Claude Code's set).
// Hooks are a VS Code *Preview* feature — names/schema may change; re-verify on your version. [audit G1]
const validEvents = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PreCompact', 'SubagentStart', 'SubagentStop', 'Stop',
];
const hooksDir = join(root, '.github/hooks');
if (existsSync(hooksDir)) {
  for (const f of readdirSync(hooksDir).filter((f) => f.endsWith('.json'))) {
    try {
      const j = JSON.parse(readFileSync(join(hooksDir, f), 'utf8'));
      for (const ev of Object.keys(j.hooks || {})) {
        if (!validEvents.includes(ev)) errors.push(`S9 ${f}: invalid hook event "${ev}"`);
      }
    } catch (e) {
      errors.push(`S9 ${f}: invalid JSON (${e.message})`);
    }
  }
}

// S10 agent files must have valid name + description frontmatter (VS Code lists/switches by name)
// VS Code accepts agent names matching /^[a-z0-9-]+$/ and de-dupes by name; guard both.
const agentsDir = join(root, '.github/agents');
if (existsSync(agentsDir)) {
  const seenNames = new Map();
  for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.agent.md'))) {
    const head = fm(readFileSync(join(agentsDir, f), 'utf8'));
    if (!head) { errors.push(`S10 agents/${f}: missing YAML frontmatter`); continue; }
    const nameM = head.match(/^name:\s*(.+?)\s*$/m);
    if (!nameM) {
      errors.push(`S10 agents/${f}: missing "name" (agent won't list/switch by name in Chat)`);
    } else {
      const name = nameM[1].replace(/^['"]|['"]$/g, '');
      if (!/^[a-z0-9-]+$/.test(name)) errors.push(`S10 agents/${f}: name "${name}" must match ^[a-z0-9-]+$ (no uppercase/spaces) or Chat drops it`);
      if (seenNames.has(name)) errors.push(`S10 agents/${f}: duplicate name "${name}" (also in ${seenNames.get(name)}) — collides in the Chat picker`);
      else seenNames.set(name, f);
    }
    if (!/^description:\s*\S/m.test(head)) warns.push(`S10 agents/${f}: missing "description"`);
  }
}

// S11 prompt files must have name + description frontmatter
const promptsDir = join(root, '.github/prompts');
if (existsSync(promptsDir)) {
  for (const f of readdirSync(promptsDir).filter((f) => f.endsWith('.prompt.md'))) {
    const head = fm(readFileSync(join(promptsDir, f), 'utf8'));
    if (!head) { errors.push(`S11 prompts/${f}: missing YAML frontmatter`); continue; }
    if (!/^description:\s*\S/m.test(head)) warns.push(`S11 prompts/${f}: missing "description"`);
  }
}

// S12 the project declaration itself must be valid — it decides which product gates run, so a typo
// in it silently disables the quality/eval gate. Present-but-broken is always an ERROR. When it is
// ABSENT, mirror project-gate.mjs exactly so the two never disagree: a plain Node repo keeps the
// legacy npm defaults (WARN — no regression for repos created before this contract existed), while
// any other stack has no legacy default and must declare itself (ERROR). [audit EOS-002/EOS-003]
const proj = loadProjectConfig(root);
for (const e of proj.errors) errors.push(`S12 ${e}`);
for (const w of proj.warnings) warns.push(`S12 ${w}`);
if (!proj.present) {
  const detected = detectStacks(root);
  const legacyNodeOnly = detected.length === 1 && detected[0] === 'node';
  if (detected.length && !legacyNodeOnly) {
    errors.push(`S12 stack manifest(s) found (${detected.join(', ')}) but no ${PROJECT_CONFIG_PATH} — declare projectType + stacks + commands.test so the product-quality gate actually runs (see docs/eos/stack-presets.md).`);
  } else if (legacyNodeOnly) {
    warns.push(`S12 no ${PROJECT_CONFIG_PATH} — falling back to the legacy Node defaults (npm scripts). Declare the project to pin your own commands (see docs/eos/stack-presets.md).`);
  } else {
    warns.push(`S12 no ${PROJECT_CONFIG_PATH} — add it when product code lands so tests/evals are gated for your stack.`);
  }
}

// S13 the guided-workflow spine must load and cross-reference correctly. `.eos/workflow.json`,
// `.eos/gates.json` and `.eos/agent-map.json` decide which gates run, what a transition requires
// and which agent a developer is sent to — a typo in any of them would quietly change the process
// itself. ABSENT is a WARN (a repo created before this contract keeps working, and the router
// routes it to activation); PRESENT-BUT-BROKEN is always an ERROR. [eos-1.12.0]
const wf = loadWorkflow(root);
const gt = loadGates(root);
const am = loadAgentMap(root);
for (const [label, res] of [['workflow', wf], ['gates', gt], ['agent map', am]]) {
  if (!res.present) { warns.push(`S13 no .eos/${label === 'agent map' ? 'agent-map' : label}.json — the guided workflow is inactive; run \`node .github/eos/eos.mjs init\``); continue; }
  for (const e of res.errors) errors.push(`S13 ${e}`);
}
if (wf.workflow && gt.gates) {
  const gateIds = new Set(gt.gates.gates.map((g) => g.id));
  for (const [pname, profile] of Object.entries(wf.workflow.profiles)) {
    for (const [ct, cfg] of Object.entries(profile.changeTypes)) {
      for (const gid of Object.keys(cfg.gates || {})) {
        if (!gateIds.has(gid)) errors.push(`S13 .eos/workflow.json: profile "${pname}" / ${ct} references unknown gate "${gid}"`);
      }
    }
  }
  for (const machine of Object.values(wf.workflow.stateMachines)) {
    for (const t of machine.transitions) {
      if (t.requiresGate && !gateIds.has(t.requiresGate)) errors.push(`S13 .eos/workflow.json: transition ${t.from} → ${t.to} requires unknown gate "${t.requiresGate}"`);
      if (!machine.states.includes(t.from) || !machine.states.includes(t.to)) errors.push(`S13 .eos/workflow.json: transition ${t.from} → ${t.to} uses a state that is not declared`);
    }
  }
}
if (am.agentMap) {
  for (const [actionId, entry] of Object.entries(am.agentMap.actions)) {
    // The built-in VS Code agent is literally named "agent" and has no file.
    if (entry.agent && entry.agent !== 'agent' && !existsSync(join(root, `.github/agents/${entry.agent}.agent.md`))) {
      errors.push(`S13 .eos/agent-map.json: action "${actionId}" maps to agent "${entry.agent}" but .github/agents/${entry.agent}.agent.md does not exist`);
    }
    if (entry.prompt && !existsSync(join(root, `.github/prompts/${entry.prompt}.prompt.md`))) {
      errors.push(`S13 .eos/agent-map.json: action "${actionId}" maps to prompt "/${entry.prompt}" but .github/prompts/${entry.prompt}.prompt.md does not exist`);
    }
  }
}

// Report
console.log(`EOS config check — ${files.length} instruction file(s) scanned\n`);
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
// Non-failing reminder: VS Code only discovers .github/{agents,instructions,hooks,prompts}
// at the OPENED workspace root. Opening a PARENT folder makes all of them silently inactive.
console.log('  NOTE  In VS Code, open THIS folder as the workspace root (File > Open Folder > select it).');
console.log('        If you open a parent folder, custom agents/instructions/hooks are NOT discovered.');
console.log('  NOTE  One-time: run /eos-init to make the CI gates merge-blocking (branch protection +');
console.log('        CODEOWNERS + approval baseline). Progress is tracked in docs/eos/activation.md.');
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
