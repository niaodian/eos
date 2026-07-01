# EOS Quickstart

## Prerequisites (local-first — nothing enterprise required)
| Tool | Needed for | If absent |
|---|---|---|
| **Node.js** (18+) | validators, hooks, JS/TS tests & evals | required — the only hard dependency |
| **Docker** + `act` | local CI (`act push`) — runs GitHub Actions locally | **optional**: skip CI and run the same checks directly (below) |
| stack toolchains (pnpm, python/pytest, go, spectral, golangci-lint…) | only the stack you actually use | install on demand; each is optional per stack |

- **No network required** for the core flow (validators, hooks, tests, evals all run offline).
- **One-time online step**: the *first* `act` run pulls a runner image + actions (cached afterwards);
  then `act push --pull=false --action-offline-mode` is fully offline. Prefer not to use Docker at all?
  Run the identical gate directly:
  ```sh
  node .github/hooks/validate-config.mjs && node .github/hooks/eos-doctor.mjs \
    && npm run -s verify --if-present     # verify = tests + evals, if package.json has it
  ```
- `npm audit` (a G8 item) needs a lockfile — run `npm i --package-lock-only` first; offline it may
  defer (re-run when online), never a hard local blocker.

## Day-1 (from clone to first spec)
1. Open this folder in VS Code.
2. Validate config: `node .github/hooks/validate-config.mjs` (expect PASS).
3. In Copilot Chat (Agent mode):
   - Switch to the **eos-discovery** agent → produces `docs/discovery.md`.
   - Run `/requirements "<feature>"` → `docs/requirements.md` + operational decision table (Gate G2).
   - Run `/spec` → `docs/prd.md` (reuses bmad-create-prd, validated by bmad-validate-prd).
4. Commit.

> First time: set project facts in `.github/instructions/00-workspace.instructions.md` —
> copy your stack's preset from `docs/eos/stack-presets.md` (Node/Python/Go/Java/Rust/.NET).

## Happy Path (shortest entry)
```
/requirements "<one-line feature>"
```
Then follow handoffs: → /spec → /ux-spec (user-facing) → (agent) eos-architecture → (handoff) eos-plan → bmad-dev-story → bmad-code-review.

## Memory card
```
New feature:   /requirements "<feature>" → /spec → /ux-spec → (agent) eos-architecture
                                          → (handoff) eos-plan → bmad-dev-story → bmad-code-review
Before release: /release-gate
Self-check:     node .github/hooks/validate-config.mjs
Local CI:       act push -j verify   (validate-config + eos-doctor + tests + evals; needs Docker)
```

## Reuse across projects
- User-level (shared, already installed): `~/.agents/skills/`, `~/.claude/skills/` (73 bmad-*).
- User-level agents location: `~/.copilot/agents`.
- Workspace-level (travels with repo): everything under `.github/` + `docs/`.
- New project: `npx degit <you>/template my-app` (after publishing this as a template repo). Private repo → add `--mode=git`: `npx degit --mode=git <you>/template my-app`.
