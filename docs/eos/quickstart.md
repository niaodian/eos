# EOS Quickstart

> **Lost at any point?** Run `node .github/eos/eos.mjs next` (or the **eos-guide** agent / `/eos-next`
> in Copilot Chat). It derives the phase from the repository itself and gives you one action, why it
> is next, how to start it, and how you will know it is done. You never have to remember the gates.

## Prerequisites (local-first — nothing enterprise required)
| Tool | Needed for | If absent |
|---|---|---|
| **Node.js** (20.10+) | the `eos` CLI, validators, hooks, JS/TS tests & evals | required — the only hard dependency (npm 10.9+, bundled with Node 22, for the `npx --offline eos` shortcut) |
| **An AI agent** — VS Code + GitHub Copilot, Claude Code, OpenAI Codex or Google Antigravity | the `eos-*` agents, the `/eos-*` slash commands (skills, `$eos-*` in Codex) and the guardrail; Copilot also applies the scoped coding rules automatically | one of them for the guided flow — the setup for each is in the [user manual, Chapter 6.6](user-manual.md#chapter-66-using-eos-with-claude-code-codex-and-antigravity); the `eos.mjs` CLI itself works without any |
| **BMAD skills** (`bmad-*`) | every stage workflow (`bmad-prd`, `bmad-architecture`, `bmad-create-story`, …) | required for the guided flow — EOS orchestrates them, it does not reimplement them. Verify with `node .github/hooks/eos-doctor.mjs --deep` |
| **`gh` CLI**, authenticated | creating the remote, and verifying branch protection during `/eos-init` | **optional**: do it in the GitHub web UI instead. Set up with `gh auth login` |
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

## What you need for what

EOS itself never calls a model and needs no API key. Each row adds to the one above it:

| You have | You get |
|---|---|
| **Node.js only** | the whole governance engine: `eos next` / `status` / `check` / `verify`, every gate, the ledger, policy locks, signed releases, the secret scan |
| **+ VS Code with GitHub Copilot** | the guided flow: the `eos-*` agents, the `/eos-*` slash commands (skills), the always-on rules and the PreToolUse guardrail. The model is the one you pick in Copilot — nothing to configure |
| **or another agent** (Claude Code, Codex, Cursor, Antigravity, Gemini CLI …) | the same skills and `AGENTS.md`, the EOS MCP server and the guardrail in that agent's own hook format. Claude Code and Antigravity work out of the box; add another with `node .github/eos/eos.mjs agents sync --platform <name> --write` ([user manual, Chapter 6.6](user-manual.md#chapter-66-using-eos-with-claude-code-codex-and-antigravity) and §7.9) |
| **+ BMAD skills** (`bmad-*`) | the authoring workflow each stage orchestrates (PRD, architecture, stories, test design). Without them `eos next` still names every step and you do it by hand |
| **+ the BMAD project runtime** (`_bmad/`, needs python3 and uv) | BMAD's project-level customization and session memory. Optional: the skills run on their shipped defaults without it |
| **an agentic / LLM product** | your product's own model calls, which the eval harness exercises ([eval-starter](examples/eval-starter/README.md)). That is product code you write anyway, not EOS configuration |

## Known limitations

- **The PreToolUse guardrail is a speed bump, not the authority.** VS Code hooks are a Preview feature, differ per agent harness, run per machine and are not run in CI. A payload the hook cannot parse is scanned as text; an internal failure of the hook still lets the call through. CI, branch protection and review decide.
- **Secret detection is heuristic.** Both guards match known key formats, credential assignments and literal fallbacks for secret-named environment variables; an obfuscated literal can pass. `gitleaks` adds vendor formats and entropy — optional locally, required in EOS CI, which installs a pinned, checksum-verified version (since eos-2.3.0); neither replaces review.
- **Until branch protection and CODEOWNERS exist, governance is contractual.** EOS cannot verify server-side protection from a laptop, so "a weakening needs a second person" holds only after the `/eos-init` hardening; `eos-doctor` reports `CONTRACTUAL` until then ([ADR-014](../adr/014-trust-chain.md)).
- **Local evidence is honest but unattested.** Evidence recorded on a laptop is `UNATTESTED_LOCAL`; a Regulated release needs evidence produced in CI (`evidencePolicy`).
- **"Any stack" is verified to different depths.** EOS's own CI exercises the Node path and the Python eval starter; the Python, Go, Java, Rust and .NET packs declare the commands EOS runs, and their toolchains are yours to install.
- **A JUnit result may be matched by name only.** Some runners — node:test on Node 20 and 22 among them — record no file in their JUnit XML (node:test records it from Node 24.11 on). EOS then matches a trace-matrix row by test name and marks it `"match": "name"`, and settles the file from the source: the file the row names must declare the test (not in a comment), and no other test file may declare the same name — give tests unique names, or name the suite in the row (`tests/login.test.mjs::login > valid password`) ([ADR-016](../adr/016-junit-test-evidence.md)).
- **Symlinks on Windows.** A checkout without symlink support turns a link into a plain file, so the product-tree digest differs from Linux and evidence recorded on one reads `STALE` on the other.

## Day-1 (copy-ready — the same sequence as the manual, §3.4)

```sh
npx degit niaodian/eos#eos-2.3.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs        # expect PASS
node .github/eos/eos.mjs init config-only --write   # declare it: no code yet (or init <pack>; --track regulated)
code .                                        # from INSIDE the project — see the warning below
```

**An existing system?** Bring EOS into that repository instead and adopt it at the delivery gates:
`eos init <pack> --brownfield --write` — no discovery or architecture first; every change is a story
held to G5, G7 and G8 ([manual §3.5](user-manual.md)).

**`git init` is not optional.** `degit` gives you a directory with no repository, and EOS binds every
verification to the git tree it ran against. Without it, the `verified` gate reports BLOCKED — which
is correct behaviour, but a confusing way to start.

**Open the project folder itself, never its parent.** VS Code discovers `.github/` relative to the
workspace root; open a parent and the custom agents, instructions and hooks are silently not found.

**A GitHub remote is a separate, manual step.** EOS scaffolds and hardens *locally*; it neither
creates a repository on GitHub for you nor pushes to one. Branch protection (the thing that makes
the CI gates actually block a merge) needs that remote to exist, so create it before or during
`/eos-init`:

```sh
gh repo create my-new-app --private --source=. --remote=origin --push
```

Then, in **Copilot Chat**:

1. **`/eos-init`** — the one-time hardening walkthrough: your answer language, branch protection,
   CODEOWNERS, approval baseline, tracked in `docs/eos/activation.md`.
2. **`/eos-next`** (or the `eos-guide` agent) — and do what it says. Repeat.

> **Declare the project on day one — `config-only` is the honest answer.** The template's own
> `.eos/project.json` describes EOS (`"templateDefault": true`), so `eos next` first sends you to
> `eos init`. With no code yet, `eos init config-only --write` (add `--track regulated` if it
> applies): the tech stack is an irreversible decision that EOS defers to **Phase 4 (Architecture)**,
> where an ADR locks it. It only becomes an error once real stack manifests (`pyproject.toml`,
> `go.mod`, a `package.json` with dependencies, …) exist while the declaration still claims there is
> no code. `eos next` then routes you back to `eos init`, which names the matching packs, and
> `eos init <pack> --write` keeps your track.

> **Two similarly-named things, doing different jobs.**
> `/eos-init` (Copilot Chat) is the **hardening walkthrough** above — the one you want on day one.
> `node .github/eos/eos.mjs init` (terminal) declares the project — its governance track and starter
> pack — and with `--write` also writes `.vscode/tasks.json` so the **EOS: Next / Resume / Verify
> Current Gate / Release Status** tasks appear in the Run Task menu.

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

> First time with a known stack: `eos init <pack> --write` declares it in **`.eos/project.json`**
> so the product-quality gate actually runs your tests, and `eos stack sync --write` puts the same
> commands into `.github/instructions/00-workspace.instructions.md` (every stack:
> `docs/eos/stack-presets.md`). Staying `config-only` once real code exists is a **hard failure**,
> not a silent skip.

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
Before release: node .github/eos/eos.mjs release-status   then /eos-release-gate
Declare:        node .github/eos/eos.mjs init [<pack>] [--track regulated] --write
Shorter:        npx --offline eos <command>   (npm 10.9+) · npm run -s eos -- <command>
Self-check:     node .github/hooks/validate-config.mjs · node .github/eos/eos.mjs doctor
Product gate:   node .github/hooks/project-gate.mjs   (runs .eos/project.json commands — any stack)
Local CI:       act push -j verify   (validate-config + eos-doctor + tests + evals; needs Docker)
```

## Reuse across projects
- User-level (shared, already installed): `~/.agents/skills/`, `~/.claude/skills/` (73 bmad-*).
- User-level agents location: `~/.copilot/agents`.
- Workspace-level (travels with repo): everything under `.github/` + `docs/`.
- New project: `npx degit <you>/template my-app` (after publishing this as a template repo). Private repo → add `--mode=git`: `npx degit --mode=git <you>/template my-app`.
