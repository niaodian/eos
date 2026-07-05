# EOS Quickstart

> **Lost at any point?** Run `/eos-help` in Copilot Chat — it detects which phase this repo is in,
> prints the memory card, and tells you the exact next step (and any pending one-time hardening).

## Prerequisites (local-first — nothing enterprise required)
| Tool | Needed for | If absent |
|---|---|---|
| **Node.js** (18+) | validators, hooks, JS/TS tests & evals | required — the only hard dependency |
| **Docker** + `act` | local CI (`act push`) — runs GitHub Actions locally | **optional**: skip CI and run the same checks directly (below) |
| stack toolchains (pnpm, python/pytest, go, spectral, golangci-lint, gitleaks…) | only the stack you use; `gitleaks` deepens secret scanning | install on demand; each is optional (secret-scan falls back to built-in patterns without gitleaks) |

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

### Windows
EOS runs **natively on Windows** (PowerShell or Command Prompt) — WSL/Git-Bash is *not* needed for the
core flow (hooks, validators, tests are all Node, and paths are normalized cross-platform):
- **Install Node.js**: from [nodejs.org](https://nodejs.org), or a package manager
  (`winget install OpenJS.NodeJS.LTS` / `choco install nodejs-lts`).
- **Command chaining**: the `&&` and `\` line-continuation shown above are POSIX. **PowerShell 7+** and
  **Command Prompt** support `&&`; **Windows PowerShell 5.1** does not — just run each command on its
  own line:
  ```
  node .github/hooks/validate-config.mjs
  node .github/hooks/eos-doctor.mjs
  ```
- **Line endings**: the repo ships a `.gitattributes` that forces **LF**, so hooks/scripts stay valid
  after a Windows checkout. Leave `core.autocrlf` unset (don't re-mangle them to CRLF).
- **`act`** (local CI) needs **Docker Desktop** (WSL2 backend); otherwise use the direct `node ...`
  commands above — they are the same gate.
- **`build-pdf.sh`** (optional manual→PDF) is a Bash script — run it from **Git-Bash or WSL**, or just
  read `docs/eos/user-manual.md` directly.

## Day-1 (from clone to first spec)
1. Open this folder in VS Code.
2. Validate config: `node .github/hooks/validate-config.mjs` (expect PASS).
3. **One-time harden** (turns the CI gates from advisory into merge-blocking): run `/eos-init` in Copilot
   Chat — it walks you through branch protection + CODEOWNERS + approval baseline, tracked in
   `docs/eos/activation.md`. Personal/throwaway repo? Waive items with a reason; `eos-doctor` keeps score.
4. In Copilot Chat (Agent mode):
   - Switch to the **eos-discovery** agent → produces `docs/discovery.md`.
   - Run `/requirements "<feature>"` → `docs/requirements.md` + operational decision table (Gate G2).
   - Run `/spec` → `docs/prd.md` (reuses bmad-create-prd, validated by bmad-validate-prd).
5. Commit.

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
One-time harden: /eos-init   (branch protection + CODEOWNERS + approval baseline → docs/eos/activation.md)
Before release: /release-gate
Self-check:     node .github/hooks/validate-config.mjs
Local CI:       act push -j verify   (validate-config + eos-doctor + tests + evals; needs Docker)
```

## Reuse across projects
- User-level (shared, already installed): `~/.agents/skills/`, `~/.claude/skills/` (73 bmad-*).
- User-level agents location: `~/.copilot/agents`.
- Workspace-level (travels with repo): everything under `.github/` + `docs/`.
- New project: `npx degit <you>/template my-app` (after publishing this as a template repo). Private repo → add `--mode=git`: `npx degit --mode=git <you>/template my-app`.
