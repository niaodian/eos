---
name: spec
description: Produce the PRD as the single source of truth (reuses bmad-create-prd)
argument-hint: <path to docs/requirements.md>
agent: agent
tools: ['search', 'editFiles']
---
# Spec (PRD) — EOS

1. Read `docs/requirements.md` (must have passed G2).
2. Draft the PRD using skill `bmad-create-prd`.
3. Append an NFR section sourced from `docs/checklists/C-nfr.md` (do not leave blank).
4. Validate with skill `bmad-validate-prd`. Any failed criterion => BLOCKER.

Output: `docs/prd.md`.
