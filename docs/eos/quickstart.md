# EOS Quickstart

> **Lost at any point?** Run `node .github/eos/eos.mjs next` (or the **eos-guide** agent / `/eos-next`
> in Copilot Chat). It derives the phase from the repository itself and gives you one action, why it
> is next, how to start it, and how you will know it is done. You never have to remember the gates.

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
    && node .github/hooks/project-gate.mjs   # your declared lint/typecheck/test/eval — any stack
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

## Day-1 (copy-ready — the same sequence as the manual, §3.4)

```sh
npx degit niaodian/eos#eos-1.15.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs        # expect PASS
code .                                        # from INSIDE the project — see the warning below
```

**`git init` is not optional.** `degit` gives you a directory with no repository, and EOS binds every
verification to the git tree it ran against. Without it, the `verified` gate reports BLOCKED — which
is correct behaviour, but a confusing way to start.

**Open the project folder itself, never its parent.** VS Code discovers `.github/` relative to the
workspace root; open a parent and the custom agents, instructions and hooks are silently not found.

Then, in **Copilot Chat**:

1. **`/eos-init`** — the one-time hardening walkthrough: branch protection, CODEOWNERS, approval
   baseline, tracked in `docs/eos/activation.md`.
2. **`/eos-next`** (or the `eos-guide` agent) — and do what it says. Repeat.

> **Two similarly-named things, doing different jobs.**
> `/eos-init` (Copilot Chat) is the **hardening walkthrough** above — the one you want on day one.
> `node .github/eos/eos.mjs init --write` (terminal) only writes `.vscode/tasks.json` so the
> **EOS: Next / Resume / Verify Current Gate / Release Status** tasks appear in the Run Task menu.
> It is a convenience, not a step you have to take.

Prefer the terminal? Every prompt has a CLI equivalent — `eos next`, `eos resume`, `eos status` —
and the two are the same engine. Chat is the shorter path in VS Code; the CLI is what CI runs.

That is the whole loop. Everything below is reference material for when you want to know *why*.

- The router walks you through discovery → requirements → PRD → UX → architecture → stories, then
  per story: readiness → implementation → verification → merge, and after shipping:
  telemetry → write-back. Each step names the Copilot agent (or `/prompt`) and the minimal BMAD
  skills — you never pick from the 73 installed skills yourself.
- Each stage produces a document for people **and** a small structured record for the machine
  (`docs/discovery.json`, `docs/requirements.json`, `docs/design.json`, `docs/architecture.json`).
  The gate reads the record: an empty document does not advance the product, and a verification is
  bound to the exact source, tests, prompts and eval data it ran against — so changing them makes
  the recorded PASS `STALE` instead of leaving it standing.
- **One-time harden** (turns the CI gates from advisory into merge-blocking): run `/eos-init` in
  Copilot Chat — branch protection + CODEOWNERS + approval baseline, tracked in
  `docs/eos/activation.md`. Personal/throwaway repo? Waive items with a reason; `eos-doctor` keeps score.
- Starting a new chat later? `node .github/eos/eos.mjs resume` (or `/eos-resume`) restores what you
  were doing, the last verified gate and the current blocker — no re-reading documents.

> First time: set project facts in `.github/instructions/00-workspace.instructions.md` —
> copy your stack's preset from `docs/eos/stack-presets.md` (Node/Python/Go/Java/Rust/.NET), and
> declare the same commands in **`.eos/project.json`** so the product-quality gate actually runs
> your tests. The template ships as `projectType: "config-only"`; leaving it there once real code
> exists is a **hard failure**, not a silent skip.

## Happy Path (shortest entry)
```
node .github/eos/eos.mjs next
```
Do the one action it names, then run it again. If you prefer Chat, the **eos-guide** agent runs the
same command and offers the handoff button for the agent the router picked.

## Memory card
```
The loop:       eos resume → do the one action → eos check --gate <id> --scope <id> → eos next
Where am I:     node .github/eos/eos.mjs status         (add --changed for what your edits affect)
Why this rule:  node .github/eos/eos.mjs explain <gate> (activation|prd-ready|story-ready|verified|release-ready)
Promote work:   node .github/eos/eos.mjs transition --scope story --id <id> --to <STATE>
One-time harden: /eos-init   (branch protection + CODEOWNERS + approval baseline → docs/eos/activation.md)
Before release: node .github/eos/eos.mjs release-status   then /release-gate
Self-check:     node .github/hooks/validate-config.mjs · node .github/eos/eos.mjs doctor
Product gate:   node .github/hooks/project-gate.mjs   (runs .eos/project.json commands — any stack)
Local CI:       act push -j verify   (validate-config + eos-doctor + tests + evals; needs Docker)
```

## Reuse across projects
- User-level (shared, already installed): `~/.agents/skills/`, `~/.claude/skills/` (73 bmad-*).
- User-level agents location: `~/.copilot/agents`.
- Workspace-level (travels with repo): everything under `.github/` + `docs/`.
- New project: `npx degit <you>/template my-app` (after publishing this as a template repo). Private repo → add `--mode=git`: `npx degit --mode=git <you>/template my-app`.
