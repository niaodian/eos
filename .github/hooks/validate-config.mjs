#!/usr/bin/env node
// EOS static config validator — zero external deps.
// Run from project root: node .github/hooks/validate-config.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
];
for (const p of required) {
  if (!existsSync(join(root, p))) errors.push(`S7 missing required path: ${p}`);
}

// Collect & validate instruction files
const instrDir = join(root, '.github/instructions');
const files = walk(instrDir);
const globsByArea = {};

for (const full of files) {
  const rel = full.replace(root + '/', '');
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

// S9 hooks JSON validity + event-name validity
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

// S10 agent files must have name + description frontmatter (VS Code lists/switches by name)
const agentsDir = join(root, '.github/agents');
if (existsSync(agentsDir)) {
  for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.agent.md'))) {
    const head = fm(readFileSync(join(agentsDir, f), 'utf8'));
    if (!head) { errors.push(`S10 agents/${f}: missing YAML frontmatter`); continue; }
    if (!/^name:\s*\S/m.test(head)) errors.push(`S10 agents/${f}: missing "name" (agent won't list/switch by name in Chat)`);
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

// Report
console.log(`EOS config check — ${files.length} instruction file(s) scanned\n`);
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
