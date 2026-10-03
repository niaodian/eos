---
name: eos-validate-config
description: Static and semantic lint of the EOS configuration — instructions, skills, agents, hooks and the project declaration. Use after editing anything under .github/, .agents/ or .eos/, or when eos next reports a configuration error.
---
# Validate EOS Configuration

1. Run static check: `node .github/hooks/validate-config.mjs` and report output.
2. Read all `.github/instructions/**/*.instructions.md`. Detect:
   - Contradictions (two files giving opposite guidance on the same topic).
   - Duplication (same rule repeated; recommend which file should own it).
   - Over-broad scope (a rule in always-on that should be narrowed via applyTo).
3. Read `.agents/skills/**` and `.github/agents/**`. Verify every referenced
   `bmad-*` skill and every relative Markdown link resolves.
4. Output a table: [file] [issue type] [severity] [suggested fix]. Make no code changes.

> **Next (Phase 0 → 1):** once this reports PASS, switch to the `eos-discovery` agent in the Chat
> mode picker to start Discovery (Gate G1). This hop is manual — a skill can't render a handoff button.
