// Prompt ↔ policy alignment (ADR-011).
//
// Skills, agents and instructions are hand-written and tell agents what to run: `eos check --gate
// story-ready`, `--to READY_FOR_DEV`, "hand off to `eos-plan`", "/eos-release-gate", "G6". Nothing
// checked that those names exist. Renaming a gate, a state or a prompt left every file that cited
// the old name sending agents to something that is not there, with every check still green.
//
// This reads every name a prompt may cite from the machine-readable policy — gates and their
// codes, the codes a gate declares it `enforces`, state machines and their transitions, the command
// registry, skill/agent files — and reports each citation that names nothing. The vocabulary
// is never restated here, so the check cannot drift from the policy it checks. It is a static
// check of REFERENCES; it does not judge whether prose is good advice.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listSkills, SKILLS_DIR } from './skills.mjs';

/**
 * What is scanned: everything hand-written that agents are told to read. Since 2.2 the slash commands
 * are Agent Skills in .agents/skills (ADR-017); the .claude/skills mirror is generated from them and
 * kept byte-identical by `eos agents sync --check`, so checking the source checks both.
 */
export const ALIGNMENT_SOURCES = [
  '.github/copilot-instructions.md', 'AGENTS.md',
  SKILLS_DIR, '.github/agents', '.github/instructions',
];

// VS Code's built-in chat modes: a handoff may target them without an agent file.
const BUILTIN_AGENTS = new Set(['agent', 'ask', 'edit']);
// A token that is a placeholder in an example, not a name: <id>, ${input:x}, …, STATE-like words.
const PLACEHOLDER = /[<>{}$…*|[\]]|\.\.\./;
const trimToken = (t) => t.replace(/^[`'"(]+|[`'",.;:)!?]+$/g, '');

function listNames(root, dir, suffix) {
  const full = join(root, dir);
  if (!existsSync(full)) return new Set();
  return new Set(readdirSync(full).filter((f) => f.endsWith(suffix)).map((f) => f.slice(0, -suffix.length)));
}

function listDirs(root, dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return new Set();
  return new Set(readdirSync(full, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
}

/**
 * Everything a prompt may cite, read from the policy.
 * @param {string} root
 * @param {{gates: object, workflow: object, commands: string[]}} policy
 */
export function alignmentVocabulary(root, { gates, workflow, commands }) {
  const defs = gates?.gates || [];
  const machines = Object.entries(workflow?.stateMachines || {}).map(([name, m]) => ({
    name,
    states: new Set(m.states || []),
    edges: new Set((m.transitions || []).map((t) => `${t.from}→${t.to}`)),
  }));
  return {
    gateIds: new Set(defs.map((g) => g.id)),
    // `--gate` accepts an id or a gate's own code; prose may also cite a code a gate enforces.
    gateCodes: new Set(defs.map((g) => g.code)),
    enforcedCodes: new Set(defs.flatMap((g) => (g.enforces || []).map((e) => e.code))),
    machines,
    states: new Set(machines.flatMap((m) => [...m.states])),
    commands: new Set(commands || []),
    // A slash command is a skill: `/eos-next` resolves to .agents/skills/eos-next/SKILL.md.
    prompts: new Set(listSkills(root)),
    agents: listNames(root, '.github/agents', '.agent.md'),
    skills: listDirs(root, SKILLS_DIR),
    root,
  };
}

/** The closest known name, for a "did you mean" — only when it is genuinely close. */
function closest(name, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(name, c);
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return best && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? ` — did you mean "${best}"?` : '';
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j];
      row[j] = next;
    }
  }
  return row[b.length];
}

const machineFor = (scope, vocab) => {
  if (!scope || PLACEHOLDER.test(scope)) return null;
  if (['product', 'story', 'release'].includes(scope)) return vocab.machines.find((m) => m.name === scope) || null;
  if (/^STORY-/i.test(scope)) return vocab.machines.find((m) => m.name === 'story') || null;
  return null;
};

/** Checks that only make sense on code: CLI invocations and their arguments, gate ids, script paths. */
function checkCode(seg, add, vocab) {
  const cli = /(?:\bnode\s+(?:\.\/)?\.github\/eos\/eos\.mjs|(?<![\w./-])eos)\s+([a-z][a-z-]*)\b([^`]*)/g;
  for (const m of seg.matchAll(cli)) {
    const [, name, rest] = m;
    if (!vocab.commands.has(name)) {
      add('command', name, `cites \`eos ${name}\`, which is not an EOS command${closest(name, vocab.commands)} (\`node .github/eos/eos.mjs help\` lists them)`);
      continue;
    }
    if (name === 'explain') {
      const target = trimToken(rest.trim().split(/\s+/)[0] || '');
      if (target && !target.startsWith('--') && !PLACEHOLDER.test(target) && !vocab.gateIds.has(target) && !vocab.gateCodes.has(target)) {
        add('gate', target, `cites gate "${target}", which .eos/gates.json does not define${closest(target, vocab.gateIds)}`);
      }
    }
  }
  for (const m of seg.matchAll(/--gate[\s=]+(\S+)/g)) {
    const gate = trimToken(m[1]);
    if (!gate || PLACEHOLDER.test(gate)) continue;
    if (!vocab.gateIds.has(gate) && !vocab.gateCodes.has(gate)) {
      add('gate', gate, `cites gate "${gate}", which .eos/gates.json does not define${closest(gate, vocab.gateIds)}`);
    }
  }
  const scope = trimToken((seg.match(/--scope[\s=]+(\S+)/) || [])[1] || '');
  for (const m of seg.matchAll(/--to[\s=]+(\S+)/g)) {
    const state = trimToken(m[1]);
    if (!/^[A-Z][A-Z_]+$/.test(state)) continue;
    const machine = machineFor(scope, vocab);
    if (machine && !machine.states.has(state)) {
      add('state', state, `cites --to ${state} for a ${machine.name}, which is not a state of the ${machine.name} machine in .eos/workflow.json${closest(state, machine.states)}`);
    } else if (!machine && !vocab.states.has(state)) {
      add('state', state, `cites --to ${state}, which is not a state in .eos/workflow.json${closest(state, vocab.states)}`);
    }
  }
  const whole = seg.trim();
  if (/^[a-z]+(?:-[a-z]+)*-ready$/.test(whole) && !vocab.gateIds.has(whole)) {
    add('gate', whole, `cites gate \`${whole}\`, which .eos/gates.json does not define${closest(whole, vocab.gateIds)}`);
  }
}

/** Checks that apply to all text: gate codes, state transitions, script and schema paths. */
function checkText(text, add, vocab) {
  for (const m of text.matchAll(/(?<![\w-])G(?:-[A-Z]+|[0-9]+)(?![\w-])/g)) {
    const code = m[0];
    if (!vocab.gateCodes.has(code) && !vocab.enforcedCodes.has(code)) {
      add('gate-code', code, `cites ${code}, which is neither a gate code in .eos/gates.json nor a code a gate declares it "enforces"`);
    }
  }
  for (const m of text.matchAll(/\b([A-Z][A-Z_]{2,})\b(?=\s*(?:→|->)\s*([A-Z][A-Z_]{2,})\b)/g)) {
    const [, from, to] = m;
    if (!vocab.states.has(from) || !vocab.states.has(to)) continue;
    if (!vocab.machines.some((mc) => mc.edges.has(`${from}→${to}`))) {
      add('transition', `${from} → ${to}`, `describes ${from} → ${to}, which is not a transition in .eos/workflow.json`);
    }
  }
  for (const m of text.matchAll(/(?:^|[\s`'"(])((?:\.\/)?(?:\.github\/(?:eos|hooks)\/[\w./-]+\.mjs|\.eos\/schemas\/[\w.-]+\.json))/g)) {
    const rel = m[1].replace(/^\.\//, '');
    if (PLACEHOLDER.test(rel) || existsSync(join(vocab.root, rel))) continue;
    add('path', rel, `cites ${rel}, which does not exist`);
  }
}

/** Slash commands, outside fenced code (where `/tmp` is a path, not a command). */
function checkSlash(text, add, vocab) {
  // A slash command starts a word: after whitespace, a bracket or a quote. `rem/%/clamp`, `and/or`
  // and URLs are paths, not prompts.
  for (const m of text.matchAll(/(?<=^|[\s(\["'])\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![\w/-]|\.\w)/g)) {
    const name = m[1];
    if (!vocab.prompts.has(name)) {
      add('prompt', `/${name}`, `cites /${name}, but ${SKILLS_DIR}/${name}/SKILL.md does not exist${closest(name, vocab.prompts)}`);
    }
  }
}

function checkAgents(line, add, vocab, { frontmatterOrList }) {
  const names = [];
  const handoff = frontmatterOrList && line.match(/^\s*-?\s*agent:\s*['"]?([A-Za-z0-9_.-]+)/);
  if (handoff) names.push(handoff[1]);
  for (const m of line.matchAll(/`?\b(eos-[a-z0-9-]+)\b`?\s+agent\b/g)) names.push(m[1]);
  for (const m of line.matchAll(/\bagent:?\s+`?(eos-[a-z0-9-]+)\b/gi)) names.push(m[1]);
  for (const name of new Set(names)) {
    if (BUILTIN_AGENTS.has(name) || vocab.agents.has(name)) continue;
    add('agent', name, `hands off to agent "${name}", but .github/agents/${name}.agent.md does not exist${closest(name, vocab.agents)}`);
  }
}

/**
 * Every unresolvable citation in one Markdown text.
 * @returns {Array<{file:string, line:number, kind:string, ref:string, message:string}>}
 */
export function scanText(text, file, vocab) {
  const problems = [];
  const seen = new Set();
  const lines = text.split('\n');
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === '---';
  lines.forEach((raw, i) => {
    const add = (kind, ref, message) => {
      const key = `${i}\u0000${kind}\u0000${ref}`;
      if (seen.has(key)) return;
      seen.add(key);
      problems.push({ file, line: i + 1, kind, ref, message });
    };
    if (inFrontmatter && i > 0 && raw.trim() === '---') { inFrontmatter = false; return; }
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; return; }
    const spans = inFence ? [raw] : [...raw.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const seg of spans) checkCode(seg, add, vocab);
    checkText(raw, add, vocab);
    if (!inFence) {
      // Outside code, a slash command is anywhere in prose; inside a span it must be the whole span
      // (`/eos-init`), so `cd /tmp` or `/v1/users` in an example is never read as a prompt.
      const prose = raw.replace(/`[^`]*`/g, ' ');
      checkSlash(prose, add, vocab);
      for (const seg of spans) if (/^\/[a-z][a-z0-9-]*$/.test(seg.trim())) checkSlash(seg.trim(), add, vocab);
    }
    checkAgents(raw, add, vocab, { frontmatterOrList: inFrontmatter || /^\s*-\s*agent:/.test(raw) });
  });
  return problems;
}

function markdownFiles(root, rel, acc = []) {
  const full = join(root, rel);
  if (!existsSync(full)) return acc;
  if (rel.endsWith('.md')) { acc.push(rel); return acc; }
  for (const e of readdirSync(full, { withFileTypes: true })) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) markdownFiles(root, child, acc);
    else if (e.name.endsWith('.md')) acc.push(child);
  }
  return acc;
}

/**
 * Check every hand-written source, and the handoff text of every agent-map action.
 * @returns {Array<{file:string, line:number, kind:string, ref:string, message:string}>}
 */
export function checkAlignment(root, vocab, { agentMap = null } = {}) {
  const problems = [];
  for (const source of ALIGNMENT_SOURCES) {
    for (const rel of markdownFiles(root, source)) {
      problems.push(...scanText(readFileSync(join(root, rel), 'utf8'), rel, vocab));
    }
  }
  for (const [action, entry] of Object.entries(agentMap?.actions || {})) {
    if (typeof entry.handoff !== 'string') continue;
    for (const p of scanText(entry.handoff, `.eos/agent-map.json#${action}`, vocab)) problems.push({ ...p, line: null });
  }
  return problems;
}
