---
applyTo: "**"
---
# Workspace Conventions (this repo only)

> Keep cross-project engineering beliefs in copilot-instructions.md (R1).
> This file holds repo-specific facts only, so R1 stays portable.

## Layout
- `src/` app code · `docs/` specs & ADRs · `api/` OpenAPI · `ops/` runbooks · `.github/` EOS config.

## Local commands
- Test: `node .github/eos/run-tests.mjs`.
- Machine-executed source of truth: **`.eos/project.json`** (`projectType` + `stacks` + `commands`).
  The prose line above is for humans; `node .github/hooks/project-gate.mjs` runs the JSON. Keep them
  in sync — an `application` without `commands.test` fails closed instead of passing vacuously, and
  `validate-config` (S14) fails CI if the commands above describe a stack this project did not
  declare. That check exists because no later agent reads your tech-stack ADR; every one of them
  reads this file.
- Local CI: `act push` runs `.github/workflows/eos-ci.yml` in Docker (validate-config + eos-doctor + project-gate).

## Git
- Conventional Commits. Branch: `feat/<story-id>-slug`. One story per PR.
