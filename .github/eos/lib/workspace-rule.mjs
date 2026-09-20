// Rendering the always-on workspace rule from the project's own declaration.
//
// The problem this solves: a tech-stack ADR is read by nobody. Every later agent reads
// `.github/instructions/00-workspace.instructions.md`, so until the locked stack reaches THAT file
// the architecture decision has no effect on any session — and a stale Node placeholder actively
// misdirects a Python project. G4 makes the stack land there and S14 keeps it honest, but both only
// tell you the file is wrong; neither writes it.
//
// This does, and it is deliberately NOT a text transform of prose. The source is
// `.eos/project.json` — the same declaration `project-gate.mjs` actually executes — so the rendered
// line cannot drift from what CI runs. Presets are a fallback for the window where the stack is
// decided but no code exists yet, never a substitute for a declared command.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const WORKSPACE_RULE = '.github/instructions/00-workspace.instructions.md';

// The commands a stack uses before the project has declared its own. These mirror
// docs/eos/stack-presets.md, but live here as data: parsing prose to generate a governance file
// would make the generator break whenever someone reworded the manual.
export const STACK_PRESETS = {
  node: { Install: 'npm ci', Lint: 'npm run lint', Test: 'npm test', Typecheck: 'npm run typecheck' },
  python: { Install: 'pip install -r requirements.txt', Lint: 'ruff check .', Test: 'pytest', Typecheck: 'mypy .' },
  go: { Install: 'go mod download', Lint: 'golangci-lint run', Test: 'go test ./...', Typecheck: 'go vet ./...' },
  java: { Install: 'mvn -q dependency:go-offline', Lint: 'mvn -q spotless:check', Test: 'mvn -q test', Build: 'mvn -q compile' },
  rust: { Install: 'cargo fetch', Lint: 'cargo clippy -- -D warnings', Test: 'cargo test', Typecheck: 'cargo check' },
  dotnet: { Install: 'dotnet restore', Lint: 'dotnet format --verify-no-changes', Test: 'dotnet test', Build: 'dotnet build' },
};

const LABELS = { install: 'Install', lint: 'Lint', test: 'Test', typecheck: 'Typecheck', eval: 'Eval', audit: 'Audit' };
const COMMANDS_LINE = /^- Install:.*$/m;
// The whole provisional block: the ⛳ heading marker plus the blockquote that explains it. Both
// exist only to say "no stack has been chosen yet", so both are wrong once one has been.
const PROVISIONAL_MARKER = / {2}⛳ PROVISIONAL[^\n]*/;
const PROVISIONAL_NOTE = /^> The line below is the \*\*Node reference default\*\*[\s\S]*?fast path\); the ADR still records it\.\n/m;

/**
 * A declared command is stored as parsed argv (`[[bin, ...args], …]`) because EOS executes it
 * without a shell. Rendering from that exact structure is the point: the prose then shows the
 * argv CI runs, so the two cannot disagree. Multiple steps read as a shell chain, which is what a
 * human would type to reproduce them.
 */
const flatten = (value) => (Array.isArray(value) ? value : [])
  .map((argv) => (Array.isArray(argv) ? argv.join(' ') : String(argv)))
  .filter(Boolean)
  .join(' && ')
  .trim();

/**
 * What the `Local commands` line should say, and where that answer came from.
 * @returns {{line:string|null, source:string, reason:string|null, stacks:string[]}}
 */
export function renderCommandsLine(project) {
  const stacks = (project?.stacks || []).filter((s) => s !== 'other');
  const declared = project?.commands || {};
  const parts = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const cmd = flatten(declared[key]);
    if (cmd) parts.push(`${label}: \`${cmd}\``);
  }
  if (parts.length) return { line: `- ${parts.join(' · ')}.`, source: 'declared-commands', reason: null, stacks };

  // No commands yet. That is the normal state between "the architecture picked a stack" and "the
  // first scaffold story landed", so fall back to the stack's presets rather than refusing.
  const usable = stacks.filter((s) => STACK_PRESETS[s]);
  if (!usable.length) {
    return {
      line: null,
      stacks,
      source: 'none',
      reason: project?.stacks?.length
        ? `.eos/project.json declares ${project.stacks.join(' + ')}, which has no preset — declare "commands" so the rule states what this project actually runs`
        : '.eos/project.json declares no stacks and no commands, so there is nothing to state yet — lock the stack in the architecture first',
    };
  }
  const merged = {};
  for (const s of usable) for (const [label, cmd] of Object.entries(STACK_PRESETS[s])) {
    // First stack wins a label, so a node+python project reads as node-then-python rather than
    // silently losing one of them.
    if (!merged[label]) merged[label] = cmd;
  }
  const line = `- ${Object.entries(merged).map(([l, c]) => `${l}: \`${c}\``).join(' · ')}.`;
  return { line, source: 'stack-presets', reason: null, stacks };
}

/**
 * Apply the rendered line to the rule file's text, clearing the provisional block with it.
 * @returns {{text:string, changed:boolean}}
 */
export function applyToRule(text, line) {
  let out = text;
  if (COMMANDS_LINE.test(out)) out = out.replace(COMMANDS_LINE, line);
  out = out.replace(PROVISIONAL_MARKER, '').replace(PROVISIONAL_NOTE, '');
  return { text: out, changed: out !== text };
}

/**
 * Plan (and optionally perform) the sync.
 * @returns {{ok:boolean, changed:boolean, reason:string|null, line:string|null, source:string, path:string, before:string|null, after:string|null}}
 */
export function syncWorkspaceRule(root, project, { write = false } = {}) {
  const path = WORKSPACE_RULE;
  const full = join(root, path);
  const base = { path, line: null, source: 'none', before: null, after: null, changed: false };
  if (!existsSync(full)) {
    return { ...base, ok: false, reason: `${path} does not exist — it is the always-on rule every later agent reads` };
  }
  const { line, source, reason } = renderCommandsLine(project);
  if (!line) return { ...base, ok: false, reason };

  const before = readFileSync(full, 'utf8');
  const { text: after, changed } = applyToRule(before, line);
  if (changed && write) writeFileSync(full, after, 'utf8');
  return { ok: true, changed, reason: null, line, source, path, before, after };
}
