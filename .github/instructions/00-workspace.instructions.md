---
applyTo: "**"
---
# Workspace Conventions (this repo only)

> Keep cross-project engineering beliefs in copilot-instructions.md (R1).
> This file holds repo-specific facts only, so R1 stays portable.

## Layout
- `src/` app code · `docs/` specs & ADRs · `api/` OpenAPI · `ops/` runbooks · `.github/` EOS config.

## Local commands  ⛳ PROVISIONAL — stack is locked at Phase 4 (Architecture) via ADR
> The line below is the **Node reference default** (a placeholder — it does NOT commit the project
> to a stack). The stack is an irreversible decision: lock it at **Phase 4** in an ADR
> (`docs/adr/00X-tech-stack.md`), then replace this line from `docs/eos/stack-presets.md` and enable
> the matching R3 rule. Already know the stack? Copy your block now (fast path); the ADR still records it.
- Install: `npm ci` · Lint: `npm run lint` · Test: `npm test` · Typecheck: `npm run typecheck`.
- Machine-executed source of truth: **`.eos/project.json`** (`projectType` + `stacks` + `commands`).
  The prose line above is for humans; `node .github/hooks/project-gate.mjs` runs the JSON. Keep them
  in sync — an `application` without `commands.test` fails closed instead of passing vacuously.
- Local CI: `act push` runs `.github/workflows/eos-ci.yml` in Docker (validate-config + eos-doctor + project-gate).

## Git
- Conventional Commits. Branch: `feat/<story-id>-slug`. One story per PR.
