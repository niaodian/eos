# EOS Template — Engineering Operating System

A portable, **local-first** engineering operating system for VS Code + GitHub Copilot,
orchestrating the installed **BMAD** skills (73 `bmad-*`) across the full SDLC.

## What's inside
```
.github/
  copilot-instructions.md       # R1 always-on global rules (minimal)
  instructions/                 # R2–R8 scoped rules (applyTo globs, subfolder-organized)
  prompts/                      # R10 slash-command workflows (reuse bmad-*)
  agents/                       # R9 orchestrator agents with handoffs
  skills/                       # project-level new capabilities (e.g. operational-readiness)
  hooks/                        # deterministic guardrails + validators (Preview)
docs/
  checklists/                   # A-gap, B-rework, C-nfr, D-ops
  eos/                          # blueprint, user-manual, quickstart, stack-presets, agent-map, VERSION
  adr/ epics/ stories/          # SDD artifacts
api/ ops/ src/
```

## Verified on this machine
- VS Code 1.120.0 · `applyTo: "**/*.{ts,tsx}"` (brace globs) → loads correctly.
- PreToolUse hook (`hookSpecificOutput.permissionDecision: "deny"`) → blocks destructive ops.
- 73 `bmad-*` skills load from user-level dirs.

## Start here
See [docs/eos/quickstart.md](docs/eos/quickstart.md). First command:
```
node .github/hooks/validate-config.mjs    # expect PASS
```

**Full user manual** (idea → launch → iteration, every command & gate explained):
[docs/eos/user-manual.md](docs/eos/user-manual.md).

Design rationale (why it's built this way): [docs/eos/blueprint.md](docs/eos/blueprint.md).

Per-stack setup presets (Node/Python/Go/Java/Rust/.NET): [docs/eos/stack-presets.md](docs/eos/stack-presets.md).

## Notes
- No org/network dependencies: fully local & Git-portable.
- Hooks are a VS Code **Preview** feature; `.github/hooks/*.json` load by default.
- There is **no native rule priority** — control is via `applyTo` scope + conventions + hooks.
