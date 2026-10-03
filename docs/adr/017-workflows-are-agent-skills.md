# ADR-017 — EOS's workflows are Agent Skills, written once in `.agents/skills`, mirrored for Claude Code

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR-011 (what S15 scans: `.agents/skills` replaces `.github/prompts` and `.github/skills`)
- Depends on: ADR-015 (upgrades are three-way: a moved or removed template file is an add plus a remove)
- Governs: `.agents/skills/eos-*/`, `.claude/skills/eos-*/`, `eos agents sync`, `agentPlatforms` in
  `.eos/project.json`, validate-config S11, the slash-command names

## Context

Up to 2.1 EOS shipped its slash commands as 19 VS Code prompt files (`.github/prompts/*.prompt.md`) and
two project skills in `.github/skills/`. Three things changed underneath them (checked against each
platform's documentation on 2026-10-03):

- **VS Code no longer loads prompt files in Agent Host sessions** and recommends migrating them to
  Agent Skills; the Local agent will drop them in a later release.
- **Agent Skills became the common format.** `SKILL.md` (agentskills.io) is read by GitHub Copilot in
  VS Code, the CLI and the cloud agent (`.github/skills`, `.claude/skills`, `.agents/skills`), Codex
  (`.agents/skills`), Cursor (`.agents/skills`, `.cursor/skills`, plus `.claude/skills`), Antigravity
  (`.agents/skills`) — and Claude Code, which reads **only** `.claude/skills`.
- A skill is a slash command on every one of them (`$name` in Codex), so nothing a prompt file did is
  lost.

Options considered for the source location:

1. **`.github/skills`** — what EOS used for its two skills. Copilot-only; Codex, Cursor and Antigravity
   would each need a copy.
2. **`.claude/skills`** — read by the most platforms (Claude Code, Copilot, Cursor), but not by Codex
   or Antigravity, and it names a vendor.
3. **`.agents/skills`** — read natively by Copilot, Codex, Cursor and Antigravity; only Claude Code
   needs a copy.

## Decision

**Option 3, with one generated mirror.**

1. **One source: `.agents/skills/eos-*/SKILL.md`.** All 19 workflows and the two existing skills live
   there. Every EOS skill is namespaced `eos-`, so a prompt that was `/spec` is `/eos-spec`; the five
   that already were (`/eos-next` …) keep their names.
2. **One mirror: `.claude/skills/eos-*/`, byte-identical, generated** by `eos agents sync --write` and
   checked by `eos agents sync --check` in CI. Copies, not symlinks: a Windows checkout without symlink
   support turns a link into a plain file.
3. **No `.github/skills` copy.** Copilot already reads `.agents/skills`; a third copy would show it the
   same skill three times. Copilot and Cursor do see two (`.agents` and `.claude`); the Agent Skills
   specification has clients keep one copy of a duplicated name, and because the copies are identical,
   whichever is kept behaves the same. A team that does not use Claude Code sets
   `"agentPlatforms"` without `"claude"` and the mirror is removed.
4. **The generator owns only `eos-` directories.** A team's own skills — in `.agents/skills` or in the
   mirror — are never copied, overwritten or deleted.
5. **Portable skills.** EOS's skills carry only the two standard fields, `name` (equal to the directory)
   and `description` (what it does and when to use it). No `agent:`, `tools:` or handoffs: those are
   Copilot-specific, and the body names CLI commands every platform can run. A platform-specific field
   would be added by the generator to that platform's mirror only. validate-config S11 enforces it, so a
   skill that would silently fail to load fails the build instead.
6. **The prompt files are removed in the same release.** Keeping both would show two commands for each
   workflow, in a host that no longer loads one of them. validate-config warns about a `.github/prompts/`
   left behind by an upgrade.
7. **The slash command stays a policy name.** `.eos/agent-map.json` keeps its `prompt` field (and
   `next --json` its `copilotPrompt`) so the published contract does not change; the value is now a skill
   name, and its existence is checked against `.agents/skills`. ADR-011's S15 scans `.agents/skills` in
   place of `.github/prompts` and `.github/skills`.

## Consequences

- Upgrading from 2.1: `eos upgrade` sees each prompt as removed and each skill as added; a prompt the
  project edited is kept and reported, to be ported by hand. Docs, agents and instructions cite the new
  names; the manual's upgrade section lists every rename.
- `eos agents sync` is the seed of the multi-platform generator: further platforms (agents, hooks, MCP
  configuration) are added as generated outputs of the same sources, under the same `--check`.
- A skill is a larger unit than a prompt — a folder that can carry scripts and references — so the
  compliance skeletons and future helpers can travel inside their skill.
