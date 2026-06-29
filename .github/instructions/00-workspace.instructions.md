---
applyTo: "**"
---
# Workspace Conventions (this repo only)

> Keep cross-project engineering beliefs in copilot-instructions.md (R1).
> This file holds repo-specific facts only, so R1 stays portable.

## Layout
- `src/` app code · `docs/` specs & ADRs · `api/` OpenAPI · `ops/` runbooks · `.github/` EOS config.

## Local commands (no remote CI assumed)
- Install: `npm ci` · Lint: `npm run lint` · Test: `npm test` · Typecheck: `npm run typecheck`.
- Adjust to your stack — ready presets (Node/Python/Go/Java/Rust/.NET) in `docs/eos/stack-presets.md`.

## Git
- Conventional Commits. Branch: `feat/<story-id>-slug`. One story per PR.
