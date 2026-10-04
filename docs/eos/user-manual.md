# EOS User Manual (Engineering Operating System)

> Version: synced with `docs/eos/VERSION` (current `eos-2.6.0`)
> Applies to: recent VS Code + GitHub Copilot Chat (custom agent / hooks are recent-version capabilities; confirm the version in the "About VS Code" panel), or Claude Code, OpenAI Codex or Google Antigravity ([Chapter 6.6](#chapter-66-using-eos-with-claude-code-codex-and-antigravity)) + 73 installed `bmad-*` skills (user-level)
> Positioning: this manual is an **operating guide (how to use it)**; for design rationale and trade-offs, see `blueprint.md` in the same directory (why it is designed this way).
> Conventions: prose in English; file names / paths / commands / config keys kept verbatim.

---

## How to read this manual

| Who you are / what you want to do | Jump directly to |
|---|---|
| First-time user who wants to get running in 10 minutes | [Chapter 1 Quick start](#chapter-1-quick-start-10-minutes) |
| Need to set up the environment on a new Mac | [Chapter 2 One-time environment setup](#chapter-2-one-time-environment-setup) |
| Need to start a new project | [Chapter 3 New project Day-1](#chapter-3-new-project-day-1-bootstrap) |
| Want to understand "what exactly are rules/prompts/agents/skills/hooks" | [Chapter 4 Core concepts](#chapter-4-core-concepts-five-mechanisms) |
| **Need to go from idea all the way to post-launch iteration** | [Chapter 6 Full-lifecycle practice](#chapter-6-full-lifecycle-practice-idea-→-iteration) ← manual core |
| Working in Claude Code, Codex or Antigravity instead of VS Code + Copilot | [Chapter 6.6 Using EOS with Claude Code, Codex and Antigravity](#chapter-66-using-eos-with-claude-code-codex-and-antigravity) |
| Want to look up a slash command / agent / rule | [Chapter 7 Complete reference](#chapter-7-complete-reference-quick-reference) |
| Configuration is broken / Agent is not working as expected | [Chapter 9 Failure localization](#chapter-9-failure-localization-and-troubleshooting) |
| Want to move this system to another project/team | [Chapter 10 Cross-project reuse and distribution](#chapter-10-cross-project-reuse-and-distribution) |
| Upgrading to `eos-2.0.0`, choosing a governance track, or signing releases | [§10.5 Upgrading](#105-upgrading-from-eos-122x-to-eos-200) · [§10.6 Tracks and signed releases](#106-governance-tracks-signed-releases-and-central-policy) · [§10.7 The 2.0.1 security patch](#107-upgrading-from-eos-200-to-eos-201) · [§10.8 `eos upgrade` and 2.1.0](#108-upgrading-from-eos-20x-to-eos-210) · [§10.9 2.2.0](#109-upgrading-from-eos-21x-to-eos-220) · [§10.10 2.3.0](#1010-upgrading-from-eos-22x-to-eos-230) · [§10.11 2.4.0](#1011-upgrading-from-eos-23x-to-eos-240) · [§10.12 2.5.0](#1012-upgrading-from-eos-24x-to-eos-250) · [§10.13 2.6.0](#1013-upgrading-from-eos-25x-to-eos-260) |

---

## Table of contents

- [Chapter 1 Quick start (10 minutes)](#chapter-1-quick-start-10-minutes)
- [Chapter 2 One-time environment setup](#chapter-2-one-time-environment-setup)
- [Chapter 3 New project Day-1 Bootstrap](#chapter-3-new-project-day-1-bootstrap)
- [Chapter 4 Core concepts (five mechanisms)](#chapter-4-core-concepts-five-mechanisms)
- [Chapter 5 Mental model: layered rules + decision gates](#chapter-5-mental-model-layered-rules--decision-gates)
- [Chapter 6 Full-lifecycle practice (idea → iteration)](#chapter-6-full-lifecycle-practice-idea-→-iteration)
- [Chapter 6.5 Two onboarding paths (SaaS vs Agentic · beginner-friendly)](#chapter-65-two-onboarding-paths-saas-vs-agentic-·-beginner-friendly)
- [Chapter 6.6 Using EOS with Claude Code, Codex and Antigravity](#chapter-66-using-eos-with-claude-code-codex-and-antigravity)
- [Chapter 7 Complete reference (quick-reference)](#chapter-7-complete-reference-quick-reference)
- [Chapter 8 Configuration QA and acceptance](#chapter-8-configuration-qa-and-acceptance)
- [Chapter 9 Failure localization and troubleshooting](#chapter-9-failure-localization-and-troubleshooting)
- [Chapter 10 Cross-project reuse and distribution](#chapter-10-cross-project-reuse-and-distribution)
- [Chapter 11 Adding a technology stack](#chapter-11-adding-a-technology-stack)
- [Chapter 12 Anti-patterns quick reference](#chapter-12-anti-patterns-quick-reference)
- [Appendix A Glossary](#appendix-a-glossary)
- [Appendix B Command cheat sheet](#appendix-b-command-cheat-sheet)
- [Appendix C End-to-end example (my-app)](#appendix-c-end-to-end-example-my-app)
- [Appendix D Post-instantiation hardening (make gates authoritative)](#appendix-d-post-instantiation-hardening-make-gates-authoritative)
- [Appendix E Platform smoke checklist (by hand)](#appendix-e-platform-smoke-checklist-by-hand)

---

# Chapter 1 Quick start (10 minutes)

## 1.1 What EOS is (one sentence)

EOS = a **purely local, Git-backed, cross-project portable** Engineering Operating System. It turns "pairing with AI for development" from free-form conversation into a **standard SDLC pipeline with decision gates**: every phase has clear inputs/outputs/pass criteria, and it prioritizes reusing your installed 73 `bmad-*` skills instead of rebuilding wheels.

It solves four persistent hard problems:
1. Incomplete requirements phase → large-scale post-launch rework
2. Operational requirements (telemetry/authz/rollback...) not moved upfront into requirements → post-launch patchwork
3. Missing governance gates → code drifts from requirements, dangerous operations go unchecked
4. Chaotic rules across language stacks → unstable Agent output

## 1.2 Three commands you will use every day

In **Copilot Chat (Agent mode)** — this is the whole loop, and it is all you have to remember:

```
/eos-resume    # what was I doing, what is blocking it
/eos-next      # the ONE recommended next action, why, and how to start it
```

...or just talk to the **eos-guide** agent. This is the primary path in VS Code: it is where the
router can also open the files, run the checks and name the right BMAD skill for you.

In the **terminal** the same loop is the same engine — this is what CI runs, and what to use when
you want a script or an exit code:

```
node .github/eos/eos.mjs resume
node .github/eos/eos.mjs next
node .github/eos/eos.mjs check --gate <id> --scope <id>   # prove the step, record the evidence
```

**Shorter, same command:** `npx --offline eos next` (npm 10.9+, bundled with Node 22) or
`npm run -s eos -- next` (any npm). Keep `--offline`: the public registry has an unrelated package
named `eos`, and the flag guarantees that only this checkout runs.

**In Claude Code, Codex or Antigravity** the loop is the same, typed in that agent: `/eos-resume`
and `/eos-next` (Codex: `$eos-resume`, `$eos-next`), or just ask "what is next?" — the agent runs the
same engine, in the terminal or through the `eos` MCP server. One-time setup: [Chapter 6.6](#chapter-66-using-eos-with-claude-code-codex-and-antigravity).

The router names the agent, the prompt and the minimal
BMAD skills for each step, so you never choose from the 73 installed skills yourself. The full
contract (state model, gates, evidence, exit codes) is
[developer-experience.md](developer-experience.md).

## 1.3 Happy Path (shortest chain from idea to code)

> You do not have to memorize this chain — `eos next` walks it for you, one step at a time, and
> refuses to let you skip a gate whose evidence does not exist. It is written out here so you can
> see the shape of the method.

```
(switch agent) eos-discovery        → docs/discovery.md      (Gate G1)
/eos-requirements "<feature>"          → docs/requirements.md   (Gate G2)
/eos-spec                              → docs/prd.md            (Gate G3)
/eos-ux-spec (user-facing; skip pure backend) → docs/DESIGN.md + docs/EXPERIENCE.md (Gate G-UX)
(switch agent) eos-architecture     → docs/architecture.md + api/openapi.yaml + ADR (Gate G4)
(handoff) eos-plan                  → docs/stories/*.md      (Gate G5)
(handoff) bmad-dev-story            → src/ code              (Gate G6)
bmad-code-review                   → review has no blockers  (Gate G6)
```

> Every `→` is a gate. **Do not enter the next phase until the gate passes**--this is the core of how EOS prevents rework.
>
> **⚠️ Top prerequisite before using agents**: in VS Code you must open the **project folder itself** (the level that contains `.github/`) as the workspace root--select it via `File > Open Folder...`, or run `cd my-app && code .` in the terminal. If you open its **parent directory**, `eos-*` custom agents and `.github/instructions|hooks` will **all silently fail** (see 7.2 troubleshooting).

---

# Chapter 2 One-time environment setup

> Do these steps only once per machine. Skip anything already done (this machine is ready).

## 2.1 Prerequisite checklist

| Component | Requirement | Self-check command |
|---|---|---|
| OS | macOS, Windows 10/11, or Linux — EOS is cross-platform; native Windows needs no WSL for the core flow | macOS `sw_vers` · Windows `winver` · Linux `uname -sr` |
| VS Code | Recent version (custom agent / hooks require a recent version) | Check the real version in the About panel (`code --version` may be a shim and is not reliable) |
| GitHub Copilot | Logged in (enterprise license is only a license, not a configuration dependency) | Chat panel is usable |
| Or another agent | Claude Code, OpenAI Codex or Google Antigravity instead of VS Code + Copilot — setup in [Chapter 6.6](#chapter-66-using-eos-with-claude-code-codex-and-antigravity) | it starts in the project folder, and `/eos-next` (Codex: `$eos-next`) answers |
| Node.js | 22.10+ (the CLI, validators and hooks); `.nvmrc` names the Node major CI uses (24). Node 20 was removed in eos-2.6.0; Node 26 passed locally (26.10) and is not in EOS's CI matrix yet | `node -v` |
| BMAD skills | 73 `bmad-*` (user-level) | macOS/Linux `ls ~/.agents/skills &#124; grep -c '^bmad-'` · Windows `(Get-ChildItem ~/.agents/skills -Filter 'bmad-*').Count` |

> **On Windows or Linux?** The core flow is identical — all hooks/validators are Node and paths are
> normalized cross-platform, so **native Windows needs no WSL/Git-Bash**. For the Windows specifics
> (PowerShell 5.1 `&&` caveat, LF via `.gitattributes`, `act` needs Docker Desktop, `build-pdf.sh` via
> Git-Bash), see the quickstart's [**Windows** setup notes](quickstart.md#windows).

## 2.2 Where BMAD skills live

```
~/.agents/skills/     # 73 bmad-* (+ other gds-/wds-, 121 total)
~/.claude/skills/     # mirror, same as above
```
These are **user-level** and shared across all projects. EOS invokes them by their `bmad-*` names in prompts/agents, and **does not require copying them into the project**.

Other agents read user-level skills from their own folders: Claude Code from `~/.claude/skills/` (the
mirror above), Codex from `~/.agents/skills/`, and Antigravity from `~/.gemini/config/skills/` (IDE) or
`~/.gemini/antigravity-cli/skills/` (CLI) — link BMAD there as shown in §6.6.3.

`eos next` and `eos-doctor --deep` look for BMAD in every one of these folders — `~/.agents/skills/`,
`~/.claude/skills/`, `~/.copilot/skills/`, `~/.gemini/config/skills/`, `~/.gemini/antigravity-cli/skills/`
and the Antigravity IDE's legacy `~/.gemini/antigravity/skills/` — and in the project's `.agents/skills/`
(since eos-2.4.0). A skill found in any of them counts as installed; whether the agent you use reads
that folder is the setup above.

## 2.3 User-level agents directory (optional)

If you want to promote some `eos-*.agent.md` files to "available in all projects", put them in:
```
~/.copilot/agents/
```
(Note: it is `~/.copilot/agents`, not the VS Code User directory; this path was confirmed by testing.)

## 2.4 Hooks maturity notes

- Hooks are a VS Code **Preview** feature: the official docs state clearly that "configuration format and behavior may change in future versions", so verify in your version (official references: `docs/agent-customization/hooks.md`, `docs/agents/reference/hooks-reference.md`).
- Workspace `.github/hooks/*.json` files **load by default** (the official `chat.hookFilesLocations` setting includes `.github/hooks` by default), with no extra Preview switch required. `chat.useCustomAgentHooks` only governs agent hooks embedded in `.agent.md`, and is unrelated to workspace `.github/hooks/`.
- EOS's 8 legal events (`SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / PreCompact / SubagentStart / SubagentStop / Stop`) have been checked against the official `hooks-reference.md`; `deny-dangerous.js`'s `permissionDecision: allow/deny/ask` also matches the official PreToolUse schema.
- **Confirm hooks are really effective in your session** ("exists ≠ effective"): in Copilot Chat (Agent mode), ask it to run `echo 'api_key="sk-EXAMPLEprobe1234567"'`. Hooks loaded → denied (hits the secret-literal rule); not loaded → it harmlessly prints the string. If it is not intercepted, you most likely opened the parent directory as the workspace root (see §9.3).
- **Honest boundary**: `deny-dangerous.js` is a **local speed bump** (per-machine, Preview, parse-failure allows, CI does not call it), a defense-in-depth layer rather than authority. The real authoritative gates are the three CI hard checks + branch protection + human review (see Appendix D).
- **Other agents** run the same script through their own hook files — `.claude/settings.json`, `.codex/hooks.json`, `.agents/hooks.json` (§7.9, Chapter 6.6). VS Code's agent sessions also run the one in `.claude/settings.json`; if they refuse every tool call with "hook errored", see §6.6.7.

---

# Chapter 3 New project Day-1 Bootstrap

## 3.1 Three creation methods (choose one)

**Method A — degit (recommended, fastest)**
```sh
# Public template — plain degit works (no auth needed)
npx degit niaodian/eos#eos-2.6.0 my-new-app
cd my-new-app
git init && git add -A && git commit -m "chore: scaffold from eos"
```

**Method B — gh + GitHub template**
```sh
# Requires the repository to be a GitHub template. Verify it yourself rather than trusting this
# page — it is an owner-level setting that can be turned off again at any time:
#   gh repo view niaodian/eos --json isTemplate   ->  {"isTemplate": true}
gh repo create my-new-app --template niaodian/eos --private --clone
cd my-new-app
```

**Method C — VS Code directly New Repository from Template** (GitHub web page → Use this template).
Uses the same template setting as Method B.

> Method B/C give you the newest default branch; Method A pins a release tag. If you want everyone
> on your team to start from the *same* EOS, prefer A.

## 3.2 First thing after landing: self-check

```sh
node .github/hooks/validate-config.mjs      # expected: PASS
```

Seeing `PASS` means the rule layers, prompts, agents, and hooks are healthy, and you can start work.

## 3.3 Fill project-specific facts

**Declare the project first.** `node .github/eos/eos.mjs init` shows the two governance tracks and the
starter packs. Stack not decided yet (most 0-1 projects)? `init config-only --write`. Stack known?
`init <pack> --write`, then `stack sync --write` renders its commands into the workspace rule below.

`init --write` also starts this project's own policy lock (`.eos/policy.lock.json`) and SBOM
(`.eos/sbom.json`) — the template's described EOS. Commit them with the declaration: whether the scaffold
was committed first or not, the first push and the first pull request pass CI
([ADR-022](../adr/022-first-declaration-starts-the-policy.md)). Chose a pack? Edit its commands before you
commit the declaration, then `eos policy lock --write`: until it is committed it is the first declaration,
and nothing in it needs approving.

**Replace what still describes EOS.** `init` replaces only the declaration. These still describe EOS until you replace them: `README.md` **and** `README.zh.md`, together (the doc-parity check compares the pair; `docs/zh/README.md` belongs to EOS's manual — never overwrite it), `package.json` (name, version, `engines`; delete it if the product is not a Node project), the ADR numbering in `docs/adr/` (EOS's own series runs to ADR-023 — start yours on purpose) and `.github/CODEOWNERS`. `.nvmrc` is yours too: it names the Node major that CI and your developers share. `/eos-init` prints this list. If you are the only maintainer, declare the solo path on Day 1 — `eos init <pack> --solo --write` — so the first policy review, the release approval and any waiver have an honest exit (Phase 8, [ADR-023](../adr/023-low-assurance-exits-on-the-standard-track.md)).

Open `.github/instructions/00-workspace.instructions.md` and change it to the real facts of **your project**:
- `Local commands`: if the stack is **already decided**, replace this with the install/lint/test/typecheck commands for your stack--**copy the finished line directly** from `docs/eos/stack-presets.md` (a recipe book for Node/Python/Go/Java/Rust/.NET full stacks; copy the matching block). If the stack is **not decided yet** (most 0-1 projects are not before architecture), **keep the Node placeholder**--this is a ⛳ PROVISIONAL value, and the authoritative lock happens in **Phase 4 (Architecture)** together with `docs/adr/00X-tech-stack.md`, avoiding conflict between always-on rules and the future real stack.
- `Layout`: update it if the directory structure differs.
- Do **not** write other cross-project general beliefs here--those belong to R1 (`copilot-instructions.md`).

## 3.4 Full Day-1 sequence (copy-ready)

```sh
npx degit niaodian/eos#eos-2.6.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs
node .github/eos/eos.mjs init config-only --write   # declare it: no code yet (or init <pack> [--track regulated])
git add -A && git commit -q -m "chore: declare the project"   # with this project's policy lock and SBOM
node .github/eos/eos.mjs next                       # the one next action
# Key: run `code .` from inside the project directory so my-new-app becomes the workspace root (including .github/).
# Do not open its parent directory, or custom agents / instructions / hooks will not be discovered.
code .
# One-time hardening (make CI gates authoritative as merge blockers): run /eos-init in Copilot Chat,
# then follow the guide to check off docs/eos/activation.md item by item (branch protection + CODEOWNERS + approval baseline; see Appendix D).
```

**Not on VS Code?** Instead of `code .`, start your agent in the project folder — `claude` (Claude Code),
`codex` (Codex, after `node .github/eos/eos.mjs agents sync --platform codex --write`), or open the folder
in Antigravity — and run `/eos-init` there (Codex: `$eos-init`). [Chapter 6.6](#chapter-66-using-eos-with-claude-code-codex-and-antigravity) has the one-time
setup for each.

## 3.5 An existing system (brownfield)

A system that already runs does not have to be re-specified before EOS can help. Adopt it at the **delivery gates** with the `delivery-only` workflow profile (since eos-2.3.0): the running system is the baseline, and every change from now on is a story that must be ready (G5), verified (G7) and released (G8).

```sh
npx degit niaodian/eos#eos-2.6.0 /tmp/eos                      # the template, outside your repository
# copy into your repository: .eos/ .agents/ .github/{eos,hooks,agents,instructions}/ docs/eos/
# and merge by hand what you already have: AGENTS.md, .github/copilot-instructions.md, .github/workflows/eos-ci.yml
node .github/hooks/validate-config.mjs                          # S7 names anything still missing
node .github/eos/eos.mjs init <pack> --brownfield --write       # Standard track; the pack names your stack
node .github/eos/eos.mjs next                                   # → document the existing system
```

- **First, document what exists — do not re-specify it.** `eos next` hands you to the `eos-discovery` agent with `bmad-document-project`, which writes the as-is documentation into `docs/` with `docs/index.md` as its index. Once that file exists, `next` asks for the first story.
- **Every change is a story.** Its acceptance criteria live in the story (until a PRD exists, they stand on their own), each with a test intent; `verified` runs your tests and traces each criterion to a passing one; the release gate checks the candidate as on the Standard track, and aligns the trace matrix with the stories the release ships.
- **Not gated:** discovery, requirements, the PRD, UX, architecture, and the post-release telemetry and write-back gates — they build on a written baseline. Write a PRD whenever you like: once `docs/prd.md` exists, every story's criteria must resolve against it.
- **Graduating** to the full lifecycle is setting `"workflowProfile": "standard-product"` once the product is re-baselined — that only strengthens the policy. The reverse, moving a Standard project onto `delivery-only`, is a weakening: `eos policy lock` records it with a reason and a second person. The Regulated track does not offer this path; it requires the baseline.

---

# Chapter 4 Core concepts (five mechanisms)

EOS uses 5 native VS Code + Copilot mechanisms to carry rules. **Understanding "when it is loaded" is the key to using EOS well.**

| Mechanism | File location | When it enters context | How you trigger it | Role in EOS |
|---|---|---|---|---|
| **Instructions** | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` | Automatic: always-on or matched to file type by `applyTo` glob | No manual trigger; takes effect when editing matching files | Rule layers (coding conventions, security red lines, stack conventions) |
| **Slash commands (EOS skills)** | `.agents/skills/eos-*/SKILL.md` (since eos-2.2.0; `.claude/skills/` is a generated copy for Claude Code) | On demand: when you enter `/name` (Codex: `$name`) | Enter `/eos-requirements`, etc. in Chat | Workflows (single reusable task) |
| **Agents** | `.github/agents/*.agent.md` | On switch: continuously effective when you select an agent | Switch in Chat's agent selector | Phase orchestrators (persistent persona + tool limits + handoffs) |
| **Skills** | `.agents/skills/*/SKILL.md` (project-level; `.github/skills/` and `.claude/skills/` are read too), `~/.agents/skills/bmad-*` (user-level) | Auto-loaded by relevance, or explicitly called by an agent | Agent uses them automatically, or write `bmad-xxx` in a request | Portable capabilities (reuse BMAD + new-build augmentation) |
| **Hooks** | `.github/hooks/*.json` + scripts | Triggered by lifecycle events (PreToolUse, etc.) | Automatic; no manual action required | Deterministic guardrails (block dangerous operations, run quality gates) |
| **MCP servers** | `.mcp.json` (EOS's own read-and-verify server, `eos mcp`, since eos-2.3.0; each client asks once to trust it) · `.vscode/mcp.json.example` (top-level `"servers"`; opt-in copy to `.vscode/mcp.json`) | Client **eager-connects at session start**, workspace-global, **cannot be gated by phase** | `eos` is light and useful from Phase 1, so it is declared; Playwright is **inert by default** (`.example`) — enable it manually in Phase 7, keep the active file local and uncommitted | Structured `eos next` / `check` / `verify` for the agent ([ADR-018](../adr/018-mcp-server.md)); local tool extension (e.g., Playwright MCP drives browser self-checks; see 7.7) |

## 4.1 Key recognition: there is no "native priority"

Officially: when multiple instructions exist, **they are merged into context, and order is not guaranteed**.
So EOS **never depends on "Rule A overriding Rule B"**. The only reliable controls for conflicts are:
1. **`applyTo` scope**: use mutually exclusive globs so each rule applies only to its file class;
2. **Single responsibility**: one file governs one topic;
3. **Hooks**: constraints that need "determinism" (such as blocking `rm -rf /`) go to hooks, not Agent self-discipline.

## 4.2 always-on is the scarcest resource

`copilot-instructions.md` (R1) enters **every** session, so it must be minimal (≤40 lines, enforced by `validate-config` S5): only "cross-project, always-true" engineering beliefs (source of truth, reuse first, security red lines, operational awareness).
**If narrow scope (`applyTo`) can be used, never use always-on.**

---

# Chapter 5 Mental model: layered rules + decision gates

## 5.1 Ten rule layers (R1–R10)

| ID | Name | Landing file | Scope |
|---|---|---|---|
| R1 | Global beliefs | `.github/copilot-instructions.md` | always-on (`**`) |
| R2 | Workspace repository facts | `instructions/00-workspace.instructions.md` | `**` (this repository) |
| R3 | Frontend | `instructions/frontend/10-frontend.instructions.md` | `**/*.{tsx,jsx}` |
| R4 | Backend | `instructions/backend/10-backend-node.instructions.md` (+python) | `**/*.ts` (/ `**/*.py`) |
| R5 | Data & API | `instructions/data-api/20-data-api.instructions.md` | `**/*.{sql,prisma}` |
| R6 | Testing | `instructions/testing/30-testing.instructions.md` | `**/*.{test,spec}.*` |
| R7 | Security | `instructions/security/40-security.instructions.md` | `**` (thin guardrail) |
| R8 | Release & Ops | `instructions/release-ops/50-release-ops.instructions.md` | `**/{Dockerfile,*.yml,*.yaml}` |
| R9 | Agent orchestration | `.github/agents/eos-*.agent.md` | When switched in |
| R10 | Workflow | `.agents/skills/eos-*/SKILL.md` | When invoked |

> Note that R1, R2, and R7 all use `**`: this is **legal coexistence** (thin, complementary, single-responsibility), not a conflict.
> Validator S3 checks **exempt `**`** exactly for this reason.

## 5.2 Ten decision gates (G1–G10)

| Gate | Phase | Machine gate id | Pass criteria (do not enter the next phase if not passed) |
|---|---|---|---|
| G0 | Activation | `activation` | The project declares what it is and how it is verified |
| G1 | Discovery | `discovery-ready` | Falsifiable problem + a metric with a target **and a data source** + explicit scope in/out |
| **G2** | Requirements | `requirements-ready` | **Every operational concern is ADOPT / SKIP+reason / DEFER+owner+trigger (hard gate)** |
| G3 | Spec | `prd-ready` | Every requirement has ≥1 acceptance criterion that is **defined**, not merely mentioned |
| G-UX | UX & Design (conditional) | `ux-ready` | User-facing: DESIGN.md **and** EXPERIENCE.md, with flows/states/a11y/tokens/responsive each covered; non-UI: structured SKIP + reason |
| G-EVAL | Eval (conditional · LLM/agentic) | part of `verified` | Every LLM-backed AC has an eval case whose **measured score meets its threshold**, bound to prompt/model/dataset/grader |
| G4 | Architecture | `architecture-ready` | Irreversible decisions have ADRs; every NFR lands on a named component |
| G5 | Planning | `story-ready` | Every story is self-contained, independently implementable, with AC and decided ops tasks |
| G6 | Development | `project-gate.mjs` | lint/typecheck/unit tests all green + code review has no blockers |
| G7 | Testing | `verified` | Every AC traces to a test that **actually ran** against **this** product tree |
| **G8** | Release | `release-ready` | **The candidate itself is re-tested; quality + supply chain + NFR + rollback/canary/health all hold (hard gate)** |
| G9 | Observability | `telemetry-ready` | The success metric is emitted as a real signal; routed alerts + rollback trigger + a named owner |
| G10 | Iteration | `iteration-ready` | Every change is written back to the Spec source of truth, with an owner |

**G2 and G8 are the two hard gates**: the former blocks "post-launch rework"; the latter blocks "launching while sick".

> **Which gates are machine-enforced**: since `eos-1.13.0`, **all of them** — run one with
> `node .github/eos/eos.mjs check --gate <id>`, and `eos next` runs them for you. Each stage keeps its
> human document **and** a small structured record beside it (`docs/discovery.json`,
> `docs/requirements.json`, `docs/design.json`, `docs/architecture.json`, `docs/telemetry.json`,
> `docs/iteration.json`); the gate reads the record, because prose is exactly what a gate must not be
> able to be talked past. Before 1.13.0, G1/G2/G-UX/G4 only checked that a file existed, so four empty
> documents could carry a product to "architecture approved".
>
> What a machine still cannot decide is **judgement**: whether the problem is the right problem,
> whether a threshold was set honestly, whether a design is good. EOS records those decisions and
> refuses to invent them — a release still requires an approval from someone other than whoever
> prepared the candidate.

---

# Chapter 6 Full-lifecycle practice (idea → iteration)

> This is the core of the manual. 10 phases; each gives: **goal / when to enter / how to start (exact command) / inputs / outputs / decision gate / must-check items / anti-rework points / example**.
> Examples consistently reference the real artifacts of `my-app` (feature: user login); paths appear in each section's "example".
> Convention: `(agent) xxx` = switch to that agent in Chat; `/xxx` = enter a slash command in Chat; `` `cmd` `` = run it in the terminal.

## Panorama

```
 idea
  │
  ▼
[1] Discovery ─G1→ [2] Requirements ─G2→ [3] Spec ─G3→ [3.5] UX&Design ─G-UX→
[4] Architecture ─G4→ [5] Planning ─G5→ [6] Development ─G6→ [7] Testing ─G7→
[8] Release ─G8→ [9] Observability ─G9→ [10] Iteration ─G10→ (feeds back to drive next round [2]) ⟲
```

---

## Phase 0 — Project initialization (one-time)

| Item | Content |
|---|---|
| **Goal** | Get an empty project with healthy configuration from the template |
| **How to start** | `npx degit niaodian/eos#eos-2.6.0 my-app && cd my-app`, then declare it: `node .github/eos/eos.mjs init config-only --write` (stack undecided) or `init <pack> --write` |
| **Output** | Complete `.github/` + `docs/` skeleton |
| **Gate** | `node .github/hooks/validate-config.mjs` → **PASS** |
| **Must check** | PASS 0 errors. **If the stack is undecided, do not change** `00-workspace` yet--keep the Node placeholder; the stack is an irreversible decision, and the authority is locked in **Phase 4 (ADR)**. If the stack is known, copy `docs/eos/stack-presets.md` directly (fast path). |
| **How to open** | Run `code .` from inside `my-app/`--make **the project itself** the workspace root. Opening the parent directory makes agent/instructions/hooks all ineffective (see 7.2). |
| **★ Hardening (one-time)** | Run `/eos-init`: it guides you through enabling branch protection (runbook) + replacing CODEOWNERS handles + pinning the approval baseline, and records progress in `docs/eos/activation.md`. **This step determines whether CI gates can truly block merges** (see Appendix D); `eos-doctor` gives an advisory reminder of remaining items every time, and `/eos-release-gate` checks again before release--to avoid "systemic forgetting". Personal experiment repositories may exempt items one by one (`[~] ... reason: ...`). Before it starts, `/eos-init` lists which steps need a second person (or, on a solo project declared with `--solo`, a labelled self-approval that **you** type — an agent never runs `--self`) and which template files to replace. |
| **Example** | Full `my-app/` tree (44 files, validate PASS) |

---

## Phase 1 — Discovery (problem definition)

| Item | Content |
|---|---|
| **Goal** | Converge a "vague idea" into **one falsifiable problem sentence + measurable success metrics + known constraints** |
| **When to enter** | You have an idea but cannot yet say "what success looks like" |
| **How to start** | Switch Chat to **`(agent) eos-discovery`**; it will call `bmad-brainstorming` + `bmad-agent-analyst` (Mary), optionally using `bmad-forge-idea` for pressure testing |
| **Input** | Raw idea (spoken description is fine) |
| **Output** | `docs/discovery.md` (the narrative) **+ `docs/discovery.json`** (the record G1 reads: `problem.falsifiableBy`, `successMetric.target` + `dataSource`, `scope.in`/`scope.out`) |
| **Decision gate G1** | `node .github/eos/eos.mjs check --gate discovery-ready` — ☑ the problem states what would prove it wrong ☑ the metric has a target **and a data source** ☑ scope has both sides ☑ no unresolved blocking question |
| **Must-check items** | Can you write "what failure looks like"? Do metrics have numeric values and data sources? Did you write out-of-scope (what not to do)? |
| **Anti-rework** | This is the cheapest correction point. If the problem is not locked and you move on, every later step amplifies the deviation. |
| **Example** | `my-app/docs/discovery.md` (4 measurable metrics such as login success rate ≥98%, p95≤300ms) |

**Completion criterion**: you can explain in one sentence to a colleague "what problem we are solving, and how we know it is solved".

---

## Phase 2 — Requirements (analysis + operational pre-flight) ★ hard gate

| Item | Content |
|---|---|
| **Goal** | Expand functional requirements + NFR + **move operational requirements upfront** (telemetry/authz/rollback...), preventing "post-launch rework" |
| **When to enter** | G1 passed and `docs/discovery.md` is ready |
| **How to start** | Enter **`/eos-requirements "<feature>"`** in Chat (wraps `bmad-agent-pm` / `bmad-prd` + skill `eos-operational-readiness`) |
| **Input** | `docs/discovery.md` + `docs/discovery.json` |
| **Output** | `docs/requirements.md` (the narrative) **+ `docs/requirements.json`** (the record G2 reads: `FR<n>`, quantified `NFR<n>`, and the 11-item `operationalPreFlight`) |
| **Decision gate G2 (hard gate)** | `node .github/eos/eos.mjs check --gate requirements-ready` — plus the five checklists A/B/C/D/E (**regulated industries add the sixth F-compliance**); **any unresolved item = BLOCKER; cannot enter Spec until cleared** |
| **Must-check items** | For the 11 operational pre-flight items (telemetry/authz/audit/rollback/monitoring/canary/quota/i18n/multi-tenancy/capacity-SLO/DR), every item must choose one of three: **`ADOPT` + what will be built / `SKIP` + reason / `DEFER` + owner + trigger**. Blanks are forbidden, and so is a bare `SKIP` — since 1.13.0 the gate rejects it, along with placeholder "reasons" like `-` or `...`. Every NFR needs a target, or it cannot be verified at G8. |
| **Anti-rework** | Use the "reverse questioning method" to force out hidden requirements: who is **not authorized** to do this? How do we **roll back** if it goes wrong? How do we **know** whether it is used in production? What happens at ×100 users? |
| **Example** | `my-app/docs/requirements.md` (11-item decision table + authz matrix + A/B/C/D walkthrough conclusions with no BLOCKER) |

**Five checklists** (full content in `docs/checklists/`; **regulated industries add the sixth F**):
- **A-gap**: requirement gaps (falsifiable, measurable acceptance, boundaries/exceptions/concurrency, dependencies, scope-out, overlap check)
- **B-rework**: likely post-launch add-ons (telemetry/authz/audit/rollback/alerting/canary/rate-limit/i18n/empty-error states/reversible migration)
- **C-nfr**: non-functional requirements (performance/capacity/availability DR/security compliance/observability/maintainability/a11y, fill target values one by one)
- **D-ops**: operational pre-flight (telemetry↔metrics closure/authz matrix/audit scope/rollback plan/canary thresholds/quota/multi-tenancy/i18n/capacity alerts/runbook owner)
- **E-security**: security and secrets (no secrets in code/frontend, `.env` governance, supply-chain poisoning defense, config permission isolation, key rotation)
- **F-compliance** (**regulated industries only**): named regime selection (HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL) → cascading controls (data residency, audit retention, minimum necessary, vendor **BAA/DPA**, **Agentic data egress** decision)

> **Regulated industries (healthcare/finance, etc.) should decide the regime in the requirements phase**: `/eos-requirements` **Step 2.5 regime pre-flight** forces you to answer first whether HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL applies; selecting one runs `F-compliance.md` (dedicated command **`/eos-compliance`**: regime selection → data residency/audit retention/minimum necessary/vendor BAA/DPA/Agentic data egress) and lands these decisions **before architecture is fixed**--avoiding a teardown after launch. **Especially**: if an LLM/agent product involves PHI/PAN/regulated personal data, it must decide the "data egress" plan immediately (signed BAA/DPA · self-hosted model · redaction gateway · exclude regulated data); deciding late = model swap and architecture swap. Record the result in `docs/compliance-profile.md`.
> **Not legal advice**: EOS only enforces early engineering decisions and **does not replace** compliance officer/legal/auditor sign-off. `【New-build】`

> Supporting command: `/eos-nfr` fills C-nfr with concrete target values line by line.

---

## Phase 3 — Spec (PRD = single source of truth)

| Item | Content |
|---|---|
| **Goal** | Solidify requirements into a PRD that becomes the only downstream recognized source of truth |
| **When to enter** | G2 passed and `docs/requirements.md` has no BLOCKER |
| **How to start** | Enter **`/eos-spec`** in Chat (draft and validate with `bmad-prd`) |
| **Input** | `docs/requirements.md` + `docs/requirements.json` |
| **Output** | `docs/prd.md`: every FR has acceptance criteria + NFR section (from C-nfr, no blanks) |
| **Decision gate G3** | `node .github/eos/eos.mjs check --gate prd-ready` — ☑ every requirement has ≥1 acceptance criterion that is **defined** (its `AC<n>.<n>` id opens a list item, table row or heading **and** carries the criterion text). A sentence that merely names an id is a reference: since 1.13.0 a story can no longer claim to implement it |
| **Must-check items** | Can the acceptance criteria be written as tests? Did the NFR section copy the target values from C-nfr? Is scope-out written? |
| **Anti-rework** | The PRD is the contract. From here on, downstream only recognizes `docs/prd.md`; any "I assumed" must come back to update the PRD. |
| **Example** | `my-app/docs/prd.md` (FR1–FR5, each with AC1.1...AC5.3) |

---

## Phase 3.5 — UX & Design (visual + experience contract) ★ conditional gate

| Item | Content |
|---|---|
| **Goal** | Decide "what it looks like + how it interacts" before architecture/implementation, producing two peer contracts |
| **When to enter** | G3 passed and `docs/prd.md` is ready. **Required for user-facing products**; pure backend/API/CLI projects may SKIP |
| **How to start** | Enter **`/eos-ux-spec`** in Chat (wraps `bmad-ux`) or switch to **`(agent) eos-design`**; if the problem is still vague use `bmad-cis-design-thinking` (Maya), and for strong opinionated design use `bmad-agent-ux-designer` (Sally) |
| **Input** | `docs/prd.md` |
| **Output** | `docs/DESIGN.md` (visual identity: tokens/fonts/colors/spacing) + `docs/EXPERIENCE.md` (information architecture/user flows/screen states/interactions/a11y/journey) **+ `docs/design.json`** (the record G-UX reads: `userInterface` true/false, and `coverage` for flows/states/accessibility/designTokens/responsive) |
| **Decision gate G-UX** | `node .github/eos/eos.mjs check --gate ux-ready` — a user-facing product needs **BOTH** documents with real content and every coverage dimension `COVERED` + a ref or `NOT_APPLICABLE` + a reason. Before 1.13.0 only one file's *existence* was checked, so a UI product with no `DESIGN.md` at all walked through |
| **Must-check items** | Are empty/error/loading states defined for every screen? Can key actions be completed with keyboard only? Are colors/spacing referencing tokens or hard-coded? |
| **Anti-rework** | The UX contract comes **before** architecture and implementation: architecture uses it to decide APIs/data, stories reference screens from it, and frontend rules and telemetry land from it. The two contracts are authoritative for any later mock/import. |
| **Skippable** | Pure backend/CLI: record `{ "userInterface": false, "skipReason": "…" }` in `docs/design.json`. It must be **stated** — silence is not a skip, and neither is the bare word "SKIP". |

> Reuse note 【BMAD + augmentation】: capabilities come from `bmad-ux` / `bmad-agent-ux-designer` (Sally) / `bmad-cis-design-thinking` (Maya).
> EOS only adds orchestration (`/eos-ux-spec` skill + `eos-design` agent + G-UX gate) and **does not rebuild design capability**.

---

## Phase 4 — Architecture (solution + data model + API contract + ADR)

| Item | Content |
|---|---|
| **Goal** | Technical solution, data model, API contract, NFR landing points, and trace for key decisions (ADR) |
| **When to enter** | G3 passed and `docs/prd.md` is ready |
| **How to start** | Switch Chat to **`(agent) eos-architecture`** (calls `bmad-architecture`/Winston); run **`/eos-adr`** for every irreversible decision; run **`/eos-deploy-topology`** to choose deployment topology |
| **Input** | `docs/prd.md`, `docs/requirements.json` (for the NFR set), `docs/EXPERIENCE.md`+`docs/DESIGN.md` (if UX phase was done), `docs/checklists/C-nfr.md`, `docs/checklists/G-deployment.md` |
| **Output** | `docs/architecture.md` (including Deployment section) **+ `docs/architecture.json`** (the record G4 reads: a decision for stack/topology/authz/security/audit/rollback/DR/data/API/event — plus tool allow-list, bounded orchestration, memory layering, async boundary and eval architecture for an agentic product, and the data/approval boundary for a regulated one — and an `nfrLandingPoints` entry per NFR), `docs/data-model.md`, `api/openapi.yaml`, `docs/adr/NNN-*.md`, filled `G-deployment.md` |
| **Decision gate G4** | `node .github/eos/eos.mjs check --gate architecture-ready` — ☑ every concern is `DECIDED` + summary or `NOT_APPLICABLE` + reason ☑ stack and topology each cite an ADR that **exists** ☑ **every NFR in `docs/requirements.json` lands on a named component and mechanism** |
| **Must-check items** | Was the API contract written **before** implementation? Does each ADR list alternatives and trade-offs? Does every NFR have a landing point? **Did the deployment topology choose "the simplest option that satisfies NFR" (rather than following the K8s trend)**? |
| **Anti-rework** | "API before implementation" lets frontend and backend proceed in parallel and anchors the contract in tests; ADRs prevent team amnesia. |
| **Example** | `my-app/docs/adr/0001-session-strategy.md` (3-solution comparison + trade-off), `my-app/api/openapi.yaml` (written before `src/auth.js`) |

**ADR template elements** (auto-generated by `/eos-adr`): Status / Context / Decision / Consequences (focus on 1-N scale and reversibility) / Alternatives considered. One file per decision, linked from `docs/architecture.md`.

> **Lock the tech stack in the architecture phase** (irreversible decision; Phase 0 intentionally only leaves a placeholder): after choosing language/framework, ① update `00-workspace` `Local commands` from `docs/eos/stack-presets.md` ② enable the corresponding R3 stack rule ③ write `docs/adr/00X-tech-stack.md`. **G4 validates "stack locked"**--so always-on `00-workspace` matches the real stack and eliminates the conflict between the Phase 0 ⛳ placeholder and the later stack.

> **Select the deployment topology in the architecture phase** (also an NFR-driven architecture decision): run `/eos-deploy-topology` to walk through `docs/checklists/G-deployment.md`--among **bare process / Docker / K8s / serverless / PaaS**, **choose the simplest option that satisfies NFR** (do not default to K8s), and land `docs/adr/NNN-deployment-topology.md` + the Deployment section of `architecture.md`. EOS **does not pre-assume** Docker or K8s: topology is decided in this phase by SLO/RTO/RPO/peak QPS; real cluster/registry/cloud belongs to `【Needs enterprise env】`, and local dev/CI can still run without it. The selected topology's manifests (`Dockerfile`/`compose.yml`/`k8s/*.yaml`/`serverless.yml`) automatically receive R8 `release-ops` rules, and the G8 release gate then validates rollback/canary/health consistency with the topology.

---

## Phase 5 — Planning (break into Epics→Stories)

| Item | Content |
|---|---|
| **Goal** | Break architecture into independently implementable, self-contained stories |
| **When to enter** | G4 passed |
| **How to start** | Switch Chat to **`(agent) eos-plan`** (`bmad-create-epics-and-stories` → `bmad-create-story` → `bmad-sprint-planning`); design acceptance tests first for every AC with **`bmad-testarch-atdd`**; **if it contains LLM/agentic components, also run `/eos-eval-spec` to design the evaluation set (G-EVAL)**; finally validate readiness with `bmad-check-implementation-readiness` |
| **Input** | `docs/prd.md`, `docs/architecture.md`, `docs/EXPERIENCE.md` (if UX phase was done) |
| **Output** | `docs/epics/*`, `docs/stories/*.md` (each includes **acceptance test outline**), **`docs/eval-plan.md` (LLM features)** Each story is `docs/stories/<ID>.md` — the file name is the id — with `## Acceptance criteria` (a table: `AC | Statement | Test intent | Eval case`), `## Operational tasks` (clauses separated by `;`, or the full-width `；`) and `## Dependencies`. `eos stage init story --id <ID> --write` writes it with a `TODO(eos)` where an answer belongs, and a story that still holds one is not ready. Declaring the agentic paradigm makes `eos init` list the stories that lack an `Eval case` column: model-backed behaviour takes an `EVAL-<n>` id, deterministic behaviour takes `N/A — deterministic`. |
| **Decision gate G5** | ☑ Every story is self-contained ☑ independently implementable ☑ includes AC **and every AC has acceptance test design (ATDD)** ☑ telemetry/authz/rollback are landed as concrete tasks **☑ LLM features have eval-plan (G-EVAL) or explicit SKIP** |
| **Must-check items** | Can a developer start work from this story **without going back to read elsewhere**? Is DoD written? **Is the acceptance test intent defined for every AC**? **Are the eval set/grader/threshold for LLM features defined**? |
| **Anti-rework** | The "readiness gate" prevents missing context in the middle of development; **shifting testing left** makes acceptance criteria testable before coding and prevents "adding tests later just to fill coverage"; **shifting eval left** gives nondeterministic LLM output a measurable baseline before coding. |
| **Cadence** | **Draft the whole backlog in one pass, then review it in one pass, then promote one story at a time.** `story-ready` is evaluated per scope (`--scope <STORY-ID>`) and the router focuses the first unfinished story, so unpromoted drafts block nothing. Reviewing 20 drafts as one table is the only cheap moment to cut, merge or reorder scope; discovering the backlog one story at a time hides it. Promotion stays serial on purpose -- each story should absorb what the previous ones actually taught you before it goes ready. |
| **Example** | `my-app/docs/stories/story-001-auth.md` (AC + self-contained context + DoD = Ready) |

---

## Phase 6 — Development (implement per story)

| Item | Content |
|---|---|
| **Goal** | Implement the story under stack rules + guardrails, and **pass code review before completion** |
| **When to enter** | G5 passed, story = Ready |
| **How to start** | Enter **`bmad-dev-story`** in Chat to implement (use `bmad-quick-dev` for fast cases); after implementation run **`bmad-code-review`** (three-way adversarial review: Blind Hunter / Edge Case Hunter / Acceptance Auditor), resolve blockers before entering G7 |
| **Input** | `docs/stories/story-XXX.md` |
| **Output** | `src/` code + corresponding tests + **code review conclusion (blockers resolved)** |
| **Automatically effective rules** | Editing `.tsx/.jsx`→R3 frontend rules; `.ts`→R4 backend; `.sql/.prisma`→R5; `.test.*`→R6; **all** `**`→R1+R2+R7 (automatically injected by applyTo; you do not need manual loading) |
| **Guardrails (automatic)** | **PreToolUse** `deny-dangerous.js` blocks `rm -rf /`, `DROP TABLE`, `git push --force`, etc.; **PostToolUse** `quality.json` runs lint+typecheck+test |
| **Decision gate G6** | ☑ lint/typecheck/unit tests all green (quality gate hook allows) ☑ **code review has no blockers (`bmad-code-review`)** |
| **Must-check items** | Are dangerous operations actually blocked? Is the quality gate empty-running because `package.json` lacks a test script? **Did code review run? Were blockers resolved or silently skipped**? |
| **Anti-rework** | Hooks turn constraints from "Agent self-discipline" into "deterministic interception"; **code review fills design/logic/edge/security blind spots that automation cannot find**--they complement each other and neither can be omitted. |
| **Example** | `my-app/src/auth.js` (zero-dependency `node:crypto`); quality-gate simulation exit 0, 10/10 tests passed |

> For the quality gate to be truly effective, project `package.json` must have a `test` script (and optional `lint`/`typecheck` scripts), otherwise the hook will empty-run via `--if-present`. Minimal `package.json` in my-app: `{"scripts":{"test":"node --test"}}`.

> **verify-as-you-build (optional · opt-in)**: after implementing a frontend story, in **agent mode** you can use **Playwright MCP** to drive the local dev server and self-check the interaction you just wrote--similar to Antigravity's Chrome integration. Browser MCP is **not enabled by default** (to avoid eager startup in early phases); first run `cp .vscode/mcp.json.example .vscode/mcp.json` (sandbox locked to localhost). This is a **development convenience**, not deterministic; formal verification in Phase 7 uses `/eos-e2e` to solidify Playwright specs. See 7.7.

---

## Phase 7 — Testing (verification + traceability)

| Item | Content |
|---|---|
| **Goal** | Verify according to the test strategy, establish spec↔test traceability, and **verify NFR targets** |
| **When to enter** | G6 passed |
| **How to start** | Enter **`bmad-tea`** (Murat) / `bmad-testarch-test-design` / `bmad-testarch-automate` / `bmad-testarch-trace` / **`bmad-testarch-nfr`** / `bmad-qa-generate-e2e-tests`; **use `/eos-e2e` for user-facing flows** (orchestrates Playwright framework + E2E generation + trace; during development Playwright MCP can drive browser self-checks, see 7.7); **LLM features: run the eval set + regression baseline according to `docs/eval-plan.md`** |
| **Input** | `docs/prd.md` (AC list), **`docs/checklists/C-nfr.md` (NFR targets)**, **`docs/eval-plan.md` (LLM features)**, `src/` code |
| **Output** | Test suite + `docs/trace-matrix.md` (AC ↔ test mapping — the *human* decision) **+ `docs/evidence/test-run.json`** (the *machine* result: which test ran, against which product tree, and what it returned) + **`docs/evidence/nfr-summary.json`** + **`docs/evidence/eval-summary.json`** (LLM features). Since eos-2.2.0 the `verified` gate writes `test-run.json` itself from the JUnit XML your runner already emits — declare `"evidence": {"junit": ["reports/junit/*.xml"]}`; see [examples/trace-evidence](examples/trace-evidence/README.md) |
| **Effective rule R6** | Test pyramid; **every AC has ≥1 test**; `describe(<criterion id>)` naming; no real timers/no order dependency; changed-line coverage ≥80%; **verify NFR targets with `bmad-testarch-nfr`**; **verify LLM output with eval set+grader (not exact-match), see `ai/10-ai-llm` rule** |
| **Decision gate G7** | `node .github/eos/eos.mjs check --gate verified --scope <STORY-ID>` — ☑ every AC traces to a test that **exists and actually ran** ☑ the run describes **this** product tree ☑ **NFR targets verified, or deferred with an owner + trigger + a future `dueBy`** ☑ **LLM features: the measured score meets its threshold, recomputed by EOS from the summary's own numbers** ☑ **spec-alignment quantified (`/eos-spec-align`)**. Before 1.13.0 a hand-written `PASS` in the matrix was enough |
| **Must-check items** | Are there ACs not covered by any test? **Were the P95/throughput/SLO targets defined in C-nfr verified** (instead of set and forgotten)? Are deferred items explicitly marked with triggers? **Did the LLM eval score reach the threshold? Were regressions run after prompt/model changes?** Since 1.13.0, editing the source, tests, prompts or eval data **after** verifying makes the recorded PASS `STALE` and blocks the merge — re-run, do not re-assert A failing run names the first failing test, and "no toolchain" is reported apart from "the tests failed". A trace-matrix test name is read to the end of its cell (or to the closing backtick), so apostrophes and brackets in a name are fine. |
| **Anti-rework** | The trace matrix exposes "untested acceptance criteria"; **NFR verification exposes "targets set but never verified"**; **eval regression exposes "prompt changes broke something else"**. |
| **Example** | `my-app/test/auth.test.js` (10 AC-traced tests all green), `my-app/docs/trace-matrix.md` (11/12 ACs have tests, 1 performance item explicitly deferred) |

---

## Phase 8 — Release (release gate) ★ hard gate

| Item | Content |
|---|---|
| **Goal** | Release only after passing quality/security/rollback/canary/NFR gates |
| **When to enter** | G7 passed |
| **How to start** | Enter **`/eos-release-gate`** in Chat; if runbook is missing, run **`/eos-runbook <service>`** first **Freeze first:** merge every fix and finish every edit under `docs/` and `src/` before you verify — each later change makes every story's evidence STALE. The order is: freeze → verify every story → measure the NFR targets → bind the summaries → `verify-release`. |
| **Input** | Test results, NFR verification results (`docs/evidence/nfr-summary.json` — measure each target and write it with [examples/nfr-summary](examples/nfr-summary/README.md)), `ops/runbook.md`. `eos status` has listed what G8 needs since the project was declared |
| **Output** | Release-gate report (PASS/FAIL item by item), `ops/runbook.md` (one section per service) |
| **Decision gate G8 (hard gate)** | `node .github/eos/eos.mjs verify-release --release <id>` runs all 14 checks the prompt lists: ① the candidate is committed ② **the quality commands re-run ON THIS candidate** ③ stories VERIFIED ④ **each story's verification describes THIS tree** ⑤ spec alignment ⑥ secret scan ⑦ dependency audit ⑧ NFR evidence ⑨ compliance boundary ⑩ waivers ⑪ runbook: rollback **+ canary + health/readiness** ⑫ deployment-topology ADR ⑬ enforcement authority ⑭ **every one-way decision confirmed by a person** (its ADR is `accepted`, with `Confirmed by` and `Confirmed at`). **Any FAIL blocks release**; `DEFERRED` is visible and never green — and only a deferred **NFR** target can be promoted: on the Standard track, with an owner, a trigger and a `dueBy` in the future (a `dueBy` that has passed is a FAIL), with the approval bound to the whole list. A deferred dependency audit still blocks, and a Regulated or Controlled release is never promoted with any deferral |
| **Must-check items** | Are rollback steps "exact executable steps" or empty words? Do deferred canary items have triggers? Does audit show 0 vulnerabilities? **Were NFR targets verified**? Note that `VERIFIED → APPROVED` needs an approval recorded by **someone other than whoever prepared the candidate** — no model, and no automation, can supply it On a one-person project declared `approvalMode: "solo"` (Standard track), that approval is `eos approve --self --reason "<why>"`, typed by the person — an agent never runs `--self` — recorded as `assurance: "self"` and shown as a self-approval in `status`, `next` and the release record. `eos approve` prints every deferred target first; after `RELEASED`, `eos next` lists what is owed and by when. The runbook is read in the project's `language` (a Chinese runbook needs 回滚 · 灰度 · 健康检查). |
| **Anti-rework** | No rollback/no canary/unverified NFR means no launch--blocks "launching while sick". |
| **Example** | `my-app/docs/release-gate.md` (all applicable items pass, `npm audit` 0 vulns), `my-app/docs/trace-matrix.md` (performance NFR item explicitly deferred+trigger), `my-app/ops/runbook.md` (`FEATURE_LOGIN=off` rollback) |

---

## Phase 9 — Observability (telemetry landing + ops loop) ★ machine gate since 1.13.0

| Item | Content |
|---|---|
| **Goal** | Telemetry is live, metrics are visible, and an operational loop exists |
| **When to enter** | G8 passed / after release |
| **How to start** | Enter **`/eos-telemetry-plan`** in Chat |
| **Input** | `docs/discovery.json` (the success metric), events in code |
| **Output** | `docs/telemetry-plan.md` (the narrative) **+ `docs/telemetry.json`** (the record G9 reads: signals, dashboards, routed alerts, sensitive-operation audit, `rolloutMetrics.rollbackTrigger`, owner) |
| **Decision gate G9** | `node .github/eos/eos.mjs check --gate telemetry-ready --scope <release>` — ☑ the **discovery success metric** is emitted as a named signal ☑ dashboards exist ☑ every alert has a `routesTo` (an alert nobody receives is not an alert) ☑ a rollback trigger is defined ☑ a named owner reads it. Then `transition --to OBSERVED` |
| **Must-check items** | Does every success metric defined in Phase 1 have a corresponding telemetry event? Are sensitive operations audited? Are alert thresholds defined? |
| **Anti-rework** | Telemetry is designed in the **requirements phase** (D-ops); here we only verify implementation--avoiding the post-launch discovery that "we cannot quantify impact". |
| **Example** | `my-app/src/auth.js` emits 5 `auth.*` events (attempted/succeeded/failed/session.created/destroyed) |

---

## Phase 10 — Iteration (iterate / extend / evolve) ★ machine gate since 1.13.0

| Item | Content |
|---|---|
| **Goal** | Metrics feed back into the next round of requirements; manage change and architecture evolution |
| **When to enter** | After launch operations, with data/feedback |
| **How to start** | Switch Chat to **`(agent) eos-review`** (`bmad-correct-course` change management, `bmad-retrospective` retrospective, `bmad-document-project` brownfield docs, `bmad-sprint-status`) |
| **Input** | Signals from `docs/telemetry.json`, user feedback |
| **Output** | **`docs/iteration.json`** (the record G10 reads: the learnings, **where each one landed**, the eval-dataset update and baseline decision for an agentic product, and a named owner recording CONTINUE / CORRECT_COURSE / STOP) + change proposal, next-round backlog, retro notes, updated ADRs |
| **Decision gate G10** | `node .github/eos/eos.mjs check --gate iteration-ready --scope <release>` — ☑ every learning is written back to a document that **exists** ☑ the record names **this** release (one write-back cannot close every future release) ☑ an agentic product feeds production into its eval dataset and re-baselines a changed prompt/model ☑ the decision has an owner. Then `transition --to ITERATED` |
| **Must-check items** | Did the change modify code only and forget to update the PRD? (that is spec/code drift, anti-pattern P10) |
| **Anti-rework** | `eos-review`'s handoff takes you directly back to `/eos-requirements`, closing the loop into the next round [2]. A **rolled-back** release comes here too: `ROLLED_BACK` routes to an incident review and closes through this same write-back — it can never reship the candidate that just failed. |
| **Example** | `my-app/docs/prd.md §6 Iteration Log`: telemetry observation triggers CR-001, written back into PRD |

---

## 6.x Phase quick-reference (one page)

| Phase | How to start | Artifact | Gate | → Next step |
|---|---|---|---|---|
| 1 Discovery | `(agent) eos-discovery` | `discovery.md` **+ `discovery.json`** | `discovery-ready` | `/eos-requirements "<f>"` |
| 2 Requirements | `/eos-requirements "<f>"` | `requirements.md` **+ `requirements.json`** | **`requirements-ready`★** | `/eos-spec` |
| 3 Spec | `/eos-spec` | `docs/prd.md` | `prd-ready` | `/eos-ux-spec` (backend may skip → `eos-architecture`) |
| 3.5 UX & Design | `/eos-ux-spec` (or `(agent) eos-design`) | `DESIGN.md`+`EXPERIENCE.md` **+ `design.json`** | `ux-ready` (conditional) | `(agent) eos-architecture` |
| 4 Architecture | `(agent) eos-architecture` + `/eos-adr` + `/eos-deploy-topology` | `architecture.md` **+ `architecture.json`**+`openapi.yaml`+`adr/*` | `architecture-ready` | `(agent) eos-plan` (lock stack+ADR+topology first) |
| 5 Planning | `(agent) eos-plan` | `docs/stories/*` | `story-ready` | `bmad-dev-story` |
| 6 Development | `bmad-dev-story` → `bmad-code-review` | `src/*` + review conclusion | `project-gate.mjs` | `/eos-e2e` (or `bmad-tea`/`bmad-testarch-*`) |
| 7 Testing | `/eos-e2e` (or `bmad-tea`/`bmad-testarch-*`) | tests + `trace-matrix.md` **+ `evidence/test-run.json`** | `verified` | `/eos-release-gate` |
| 8 Release | `/eos-release-gate` (+`/eos-runbook`) | gate report + runbook **+ `evidence/nfr-summary.json`** | **`release-ready`★** | `/eos-telemetry-plan` |
| 9 Observability | `/eos-telemetry-plan` | `telemetry-plan.md` **+ `telemetry.json`** | `telemetry-ready` | `(agent) eos-review` |
| 10 Iteration | `(agent) eos-review` | **`iteration.json`** + PRD write-back | `iteration-ready` | ⟲ `/eos-requirements` (next round) |

> **Do not skip phases**: every EOS command/agent prints "→ Next step" when it finishes (the **Next** breadcrumb at the end of prompts + the agent **handoff** button). Phases 6/7 are pure BMAD skills; `eos-plan`'s "Start Development" handoff already gives the agent the entire downstream tail chain (dev→review G6→test G7→release G8), so the flow does not break after it runs.

> **One-time hardening (Phase 0, do not forget)**: `/eos-init` turns CI gates from "contractually present" into "merge-blocking authority" (branch protection + CODEOWNERS + approval baseline), recorded in `docs/eos/activation.md`; `eos-doctor` gives an advisory reminder of remaining items **every run**, and `/eos-release-gate` (G8) checks again before release--this is the triple reminder that prevents "systemic forgetting".

---

# Chapter 6.5 Two onboarding paths (SaaS vs Agentic · beginner-friendly)

> Chapter 6 gave the complete 10-phase lifecycle. This chapter turns it into **two concrete copyable paths**: one for **traditional SaaS software** (deterministic), and one for **Agentic/LLM products** (probabilistic). The two paths share the **same trunk** (both go G1→G10) and only have specialized actions in a few phases. **You do not need to memorize these--just copy the commands.**

## 6.5.0 First clarify: which kind of project is this?

| Ask yourself | Traditional SaaS | Agentic/LLM |
|---|---|---|
| Is the core logic deterministic? (same input → same output) | ✅ Yes | ❌ No (LLMs are stochastic) |
| Does it "call a large model/RAG/agent"? | No | ✅ Yes |
| Examples | E-commerce admin, CRM, order system, management dashboard | Intelligent customer service, RAG Q&A, AI assistant, multi-agent workflow |
| Key difficulty | Transaction consistency, concurrency, permissions | Hallucination, evaluation, cost, prompt injection |

> **Hybrid projects** (such as "SaaS backend + an AI customer-service module"): the main body follows the SaaS path; the AI module additionally follows the Agentic-specific steps (marked 🟣 below). EOS rules take effect **automatically by directory**--AI code placed under `ai/`/`llm/`/`rag/` automatically overlays Agentic rules, while the rest of the code follows backend stack rules. The two mechanisms **do not fight** (see Chapter 6.5.3).

---

## 6.5.1 Path A — Traditional SaaS software (deterministic)

**Example goal**: build a "to-do API" (CRUD + user isolation). Just copy commands end to end.

### Step 0: Create project + choose stack (5 minutes)
```sh
npx degit niaodian/eos#eos-2.6.0 todo-api && cd todo-api
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs          # expect PASS
node .github/eos/eos.mjs init node-service --write   # declare the stack (or python-service, go-service… — `eos init` lists them)
git add -A && git commit -q -m "chore: declare the project"   # with its policy lock and SBOM — edit the commands first (§3.3)
```
**Stack already decided?** `eos init <pack> --write` declares it; `node .github/eos/eos.mjs stack sync --write` then renders its `Local commands` into `.github/instructions/00-workspace.instructions.md`.
**Not decided yet?** Declare `eos init config-only --write` instead--the **authoritative stack lock happens in Step 4 Architecture** (together with ADR), and `eos init <pack> --write` then keeps your track. SaaS projects usually know the stack at Step 0.

### Step 1–3: Clarify what to build (enter one by one in Chat)
```
(switch to agent) eos-discovery        → produces docs/discovery.md (problem+success metrics)
/eos-requirements "To-do CRUD with multi-user isolation"   → docs/requirements.md (G2 hard gate: five checklists)
/eos-compliance "needed only for regulated sectors like healthcare/finance" → docs/compliance-profile.md (regulated adds sixth F; otherwise skip)
/eos-spec                              → docs/prd.md (every requirement has AC)
```
> **G2 hard gate must pass**: five checklists A/B/C/D/E have no unresolved items. SaaS projects should especially watch **performance/DR in C-nfr**, **authz matrix/data lifecycle in D-ops**, and **multi-tenant isolation in E-security**.

### 🔵 Step 4: Architecture (SaaS-specific focus)
```
(switch to agent) eos-architecture     → architecture.md + data-model + api/openapi.yaml
/eos-adr "tech stack choice / database choice"       → record ADR for irreversible decisions; **lock stack here** = update 00-workspace + enable R3
/eos-deploy-topology                   → choose deployment topology (bare process/Docker/K8s/serverless/PaaS, simplest option satisfying NFR) + deployment-topology ADR
```
At **G4**, the architecture agent forces your SaaS design to include:
- **Transaction boundaries** (which writes must be atomic), **idempotency keys** (retry safety)
- **Deterministic fault tolerance**: external calls need timeout + exponential backoff + circuit breaker (**not** AI-style reflection retry)
- **API contract first**: `openapi.yaml` precedes implementation; breaking changes require a new version + deprecation policy
- **Multi-tenant isolation** (if multi-tenant): every query is scoped by tenant, and cross-tenant access is denied by default

### Step 5–6: Break stories + write code
```
(switch to agent) eos-plan             → docs/stories/* (each story includes acceptance test design ATDD)
bmad-dev-story                     → src/ code (automatically constrained by backend stack rules)
bmad-code-review                   → code review, resolve blockers (G6 Definition of Done)
```
When writing code, SaaS rules take effect **automatically** (you do not need to load them manually; editing the matching file triggers them): layering (Routes→Services→Repos), input validation, transactions/idempotency, UTC time + money in minor units/Decimal, OTel observability.

### 🔵 Step 7: Testing (SaaS-specific: contract + DB state)
```
bmad-tea / bmad-testarch-*         → unit + integration tests
/eos-e2e                               → user-facing flow E2E (Playwright; MCP self-checks available during development)
/eos-spec-align                        → quantify: AC coverage / first-pass rate / drift
```
SaaS **G7** requires: every AC has ≥1 test, **API contract tests** (against openapi.yaml), **DB state integration tests** (transaction commit/rollback, constraints, idempotency), and NFR targets verified.
The gate reads the *machine* result, not a hand-written PASS — and since eos-2.2.0 you write no code for it. Have your runner write JUnit XML (node:test `--test-reporter=junit --test-reporter-destination=reports/junit/node.xml`, pytest `--junitxml=reports/junit/python.xml`, vitest, Playwright, Maven/Gradle, gotestsum …) and declare where in `.eos/project.json`: `"evidence": {"junit": ["reports/junit/*.xml"]}`. The `verified` gate runs `commands.test`, reads only the reports that run wrote, answers every `docs/trace-matrix.md` row from them and writes `docs/evidence/test-run.json` bound to the product tree. Keep `/reports/junit/` in `.gitignore` (the template already does). Tests that run in another CI step: `node .github/eos/eos.mjs evidence junit --write`. See [examples/trace-evidence](examples/trace-evidence/README.md) — a runnable Node + Python example — and ADR-016.

### Step 8–10: Release + observability + iteration
```
/eos-runbook todo-api                  → ops/runbook.md (rollback, gradual rollout, health checks)
/eos-release-gate                      → G8 five gates (quality+audit+NFR+rollback+canary)
/eos-telemetry-plan                    → telemetry (SaaS side: QPS/latency/5xx golden signals)
(switch to agent) eos-review       → iteration writes back to PRD
```

---

## 6.5.2 Path B — Agentic / LLM product (probabilistic)

**Example goal**: build an "intelligent customer-service agent" (change order shipping address, with tool calls). The trunk is **the same** as Path A; steps marked 🟣 are **Agentic-specific**.

### Step 0: Create project + create AI directories
```sh
npx degit niaodian/eos#eos-2.6.0 cs-agent && cd cs-agent
git init && git add -A && git commit -q -m "chore: scaffold from eos"
mkdir -p ai/prompts evals                       # AI code goes here; Agentic rules overlay automatically
node .github/hooks/validate-config.mjs          # expect PASS
node .github/eos/eos.mjs init rag-app --write    # the Python LLM pack: agentic paradigm + an eval command
git add -A && git commit -q -m "chore: declare the project"   # with its policy lock and SBOM — edit the commands first (§3.3)
```
Choose Python as the stack (most common for LLM products): `rag-app` is the Python LLM pack--adjust its commands to your project, and add the **AI/LLM additional layer** from stack-presets.

### Step 1–3: Same as Path A (discovery → requirements → spec)
```
(switch to agent) eos-discovery
/eos-requirements "customer-service agent: change shipping address after order, requires authn, anti-BOLA, anti-injection"
/eos-compliance "needed only if PHI/PAN/regulated personal data is involved"   → if regulated, decide Agentic data egress plan immediately
/eos-spec
```
> In **G2**, Agentic projects must especially write **eval success metrics** (accuracy/first-pass rate), **cost/token budget**, and **injection defenses** into requirements--these are the lifeblood of probabilistic products.

### 🟣 Step 4: Architecture (Agentic-specific focus)
```
(switch to agent) eos-architecture     → architecture.md (agent orchestration diagram + tool allow-list)
/eos-adr "orchestration strategy: single-pass state machine vs ReAct loop"
```
At **G4**, the architecture agent forces Agentic design to include:
- **Tool allow-list** (typed schema; agent can only call allow-listed tools)
- **Bounded orchestration** (state machine/graph; unbounded self-invocation forbidden)
- **Memory layering**: short-term (context window) / long-term (vector store, eventually consistent) / strongly consistent (still SQL; **do not use the vector store as source of truth**)
- **Asynchronous decoupling**: LLM calls >1s **must not** block a Web request thread; use async queues (Celery/BullMQ)
- **Cognitive fault tolerance** (**not** SaaS-style backoff): tool/LLM failure → capture error → inject into prompt → bounded reflection retry ≤N times → degrade

### 🟣 Step 5: Break stories + **design evaluation set (G-EVAL)**
```
(switch to agent) eos-plan
/eos-eval-spec                         → docs/eval-plan.md (G-EVAL conditional gate)
```
`/eos-eval-spec` makes you define the evaluation set **before writing code**--this is the "ATDD" of probabilistic systems. The evaluation set must include: golden cases, **prompt-injection adversarial cases**, RAG recall (recall@k), tool-call accuracy, cost/latency budget.
> **Do not want to write an evaluator from scratch?** Copy `docs/eos/examples/eval-starter/` (zero-dependency runnable starter) and adapt it.

### 🟣 Step 6–7: Write AI code + run evals
```
bmad-dev-story                     → agent/tools/chains under ai/ + versioned prompts under ai/prompts/
bmad-code-review
node --test evals/eval.test.mjs    → run eval baseline (G-EVAL machine-enforced: must meet threshold)
```
Start `evals/` from [examples/eval-starter](examples/eval-starter/README.md) (Node, or `python/` for Python stacks) and declare the same command as `commands.eval`. The starter writes `docs/evidence/eval-summary.json` — the numbers, thresholds, model, dataset and grader, bound to the product tree — which is what G-EVAL reads; an eval command that merely exits 0 does not pass. To score your real model rather than the stub, run it with `EVAL_AGENT=llm`: any OpenAI-compatible endpoint through Node's built-in `fetch` (or Python's stdlib), the key from an environment variable / CI secret, and record / replay — without a key it replays a committed recording, and the summary is marked unattested (since eos-2.2.0; see the starter's *Connect a real model*).
When writing AI code, Agentic rules take effect **automatically**: prompts saved as files (not inline strings), tool typed schema, temperature=0 for reproducibility, treat model output as **untrusted** (anti-injection, output review, do not put secrets/PII into prompts), LLM tracing (token/cost/context/tool-span).

> **Key**: LLM output **cannot be tested with exact-match unit tests** (it is probabilistic)--you must use **evaluation set + grader + regression baseline**.
> If changing prompt/model falls below baseline = no release. This is the most fundamental testing difference between SaaS and Agentic.

### Step 8–10: Release + LLM observability + evaluation flywheel
```
/eos-release-gate                      → G8 (including secret-scan + eval baseline)
/eos-telemetry-plan                    → LLM side: token spend/context usage/tool-chain tracing
(switch to agent) eos-review       → user feedback → new eval cases → rebaseline (evaluation flywheel)
```

---

## 6.5.3 Key differences between the two paths (one table · avoid paradigm pollution)

| Dimension | 🔵 SaaS (deterministic) | 🟣 Agentic (probabilistic) |
|---|---|---|
| **State** | SQL transactions + idempotency, strongly consistent | Short-term context / long-term vector store / strongly consistent still SQL |
| **Fault tolerance** | Timeout + exponential backoff + circuit breaker | Capture error → inject prompt → bounded reflection → degrade |
| **Testing** | Unit + **contract tests + DB state integration tests** (exact-assert) | **Evaluation set + grader + regression baseline** (exact-match forbidden) |
| **Dedicated gates** | G4 transactions/resilience | **G-EVAL** (evaluation) + G4 async decoupling |
| **Observability** | OTel + QPS/latency/5xx | token/cost/context/tool-span |
| **Execution model** | Request-response is enough | Calls >1s go through async queue; do not block request thread |
| **Lifeblood risks** | Transaction inconsistency, concurrency, unauthorized access | Hallucination, missing evaluation, runaway cost, prompt injection |

> ⚠️ **Strictly forbidden to swap**: do not use SaaS exponential backoff to repeatedly call a model for a logic error (burns tokens and does not converge); do not use AI reflection to handle a pure network timeout (that needs a circuit breaker). EOS rules explicitly isolate the two mechanisms, and hybrid projects are checked for isolation points by `eos-architecture` at G4--but **if you copy the paths above, you will not go wrong**.

---

# Chapter 6.6 Using EOS with Claude Code, Codex and Antigravity

EOS is not tied to VS Code. The engine, the gates, the evidence and the workflows are the same in
every agent. What differs is where each agent reads its configuration, how you call a workflow, and
which trust prompts it asks you to accept once. Since eos-2.3.0, `eos agents sync` writes every
platform's configuration from one source ([ADR-019](../adr/019-agent-platforms.md)): a fresh copy of
the template already works in **Claude Code** and **Google Antigravity**, and **OpenAI Codex** needs
one command. This chapter is the setup and the daily workflow for those three; §7.9 lists every
platform and file.

> Whatever the agent, three things never change: `node .github/eos/eos.mjs next` decides the next
> step, a gate passes only on recorded evidence, and approving, waiving and moving a state remain
> commands a person runs. No agent, and no MCP tool, can do them for you.

## 6.6.0 What is the same, and what differs

| | VS Code + Copilot | Claude Code | OpenAI Codex | Google Antigravity |
|---|---|---|---|---|
| Generated by default | yes | yes | no — `eos agents sync --platform codex --write` | yes |
| Project instructions | `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/` | `AGENTS.md`, while the repository has no `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| EOS workflows (skills) | `.agents/skills/` · `/eos-next` | `.claude/skills/`, a generated copy · `/eos-next` | `.agents/skills/` · `$eos-next` | `.agents/skills/` · `/eos-next` |
| BMAD skills (user level) | `~/.agents/skills/` (§2.2) | `~/.claude/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/` (IDE) · `~/.gemini/antigravity-cli/skills/` (CLI) — see 6.6.3 |
| Stage orchestrators | `.github/agents/` — the agent picker and handoff buttons | none: run the step's skills, or hand over the handoff package (6.6.4) | `.codex/agents/` — ask Codex to spawn one | `.agents/agents/` — pick one as the agent, or run it as a subagent |
| Guardrail hook | `.github/hooks/guardrails.json` | `.claude/settings.json` | `.codex/hooks.json` | `.agents/hooks.json` |
| EOS MCP server | `.mcp.json` | `.mcp.json` | `.codex/config.toml` | `.agents/mcp_config.json` |
| Trust you grant once | the workspace and the MCP server | the workspace and the MCP server | the project, then each hook (`/hooks`) | MCP tools ask on each call unless you allow them |

## 6.6.1 Claude Code

**Set up**

1. Make BMAD visible: Claude Code reads personal skills from `~/.claude/skills/`, the mirror in §2.2.
   EOS's own workflows travel with the repository in `.claude/skills/`.
2. Start Claude Code in the project root, the folder that contains `.eos/` and `AGENTS.md`, and
   accept the workspace trust dialog:
   ```sh
   cd my-app && claude
   ```
3. When Claude Code asks, approve the `eos` MCP server from `.mcp.json`. `/mcp` shows its status;
   `claude mcp reset-project-choices` asks again.
4. Type `/eos-next`. It runs `node .github/eos/eos.mjs next` and prints the one next action.

**What is wired, and where**

- `.claude/skills/eos-*` — the EOS workflows, a byte-identical copy of `.agents/skills/`. Edit the
  source, then run `eos agents sync --write`; CI fails on a hand-edited copy.
- `.claude/settings.json` — the guardrail, `node .github/hooks/deny-dangerous.js --format claude`,
  before every `Bash`, `PowerShell`, `Write` and `Edit` call. Your own permissions and hooks in that
  file are kept; EOS owns only its entry.
- `.mcp.json` — the `eos` server. Ask "what is next?" and Claude can call `eos_next` instead of the
  terminal.
- `AGENTS.md` — read while the repository has no `CLAUDE.md`. If you add one, start it with
  `@AGENTS.md`.

**Working a stage.** Claude Code gets no EOS subagents: VS Code reads `.claude/agents/` too and would
list every orchestrator twice. When `eos next` names an agent such as `eos-architecture`, run the
BMAD skill it names (`/bmad-architecture`), or give Claude the handoff package (6.6.4) and ask it to
follow `.github/agents/eos-architecture.agent.md`.

## 6.6.2 OpenAI Codex

**Set up**

1. Generate the Codex files once, from the project root, and commit them:
   ```sh
   node .github/eos/eos.mjs agents sync --platform codex --write
   node .github/eos/eos.mjs verify
   ```
   This adds `codex` to `agentPlatforms` in `.eos/project.json` — an input of every gate, hence the
   `verify` — and writes `.codex/config.toml` (a marked `[mcp_servers.eos]` block),
   `.codex/hooks.json` and `.codex/agents/eos-*.toml`. A `.codex/config.toml` you already have keeps
   its content.
2. Start Codex in the project root (`codex`, the IDE extension or the ChatGPT desktop app) and
   **trust the project**: Codex reads `.codex/` only in a trusted project.
3. Run `/hooks` and approve the EOS guardrail. Codex asks again whenever the hook changes.
4. `/mcp` lists the `eos` server. BMAD skills in `~/.agents/skills/` are found as they are.
5. Type `$eos-next`. Codex calls skills with `$`; `/skills` lists them.

**What is wired, and where**

- `.agents/skills/` — the EOS workflows, read natively in every directory up to the repository root.
- `.codex/hooks.json` — the guardrail before `Bash` and `apply_patch`.
- `.codex/config.toml` — the `eos` MCP server, in a block EOS marks and owns.
- `.codex/agents/eos-*.toml` — the six orchestrators, rendered from `.github/agents/`.

**Working a stage.** When `eos next` names an agent, ask Codex to spawn it: "Spawn the
eos-architecture agent to design the architecture." Codex finds a custom agent by its name, and
`/agent` switches between running agent threads. Skills are `$eos-requirements`,
`$bmad-architecture` and so on.

## 6.6.3 Google Antigravity

**Set up**

1. Open the project folder in the Antigravity IDE, or start the Antigravity CLI in it. Its files are
   generated by default: `.agents/hooks.json`, `.agents/mcp_config.json` and `.agents/agents/`.
2. Make BMAD visible. Antigravity reads global skills from `~/.gemini/config/skills/` (the IDE and
   Antigravity 2.0) and `~/.gemini/antigravity-cli/skills/` (the CLI), not from `~/.agents/skills/`.
   On macOS and Linux, link them once (for the CLI, link into its folder the same way):
   ```sh
   mkdir -p ~/.gemini/config/skills
   ln -s ~/.agents/skills/bmad-* ~/.gemini/config/skills/
   ```
   On Windows, copy the `bmad-*` folders into `%USERPROFILE%\.gemini\config\skills\` instead.
3. Type `/eos-next`. MCP tools ask before each call by default; `/mcp` opens the MCP manager (in the
   IDE: **…** › **MCP Servers**).

**What is wired, and where**

- `.agents/skills/` — the EOS workflows, read natively.
- `.agents/hooks.json` — the guardrail before every `run_command`. Its command finds the repository root with `git rev-parse --show-toplevel`, because Antigravity starts a hook in `.agents/`, not in the project root. In headless mode nobody can approve an MCP call, so a read-only EOS tool (`eos_next`, `eos_status`, `eos_health`, `eos_explain` …) is refused until you allow it for the `eos` server in Antigravity's permission settings — allow the read-only ones only; EOS does not write that list for you.
- `.agents/mcp_config.json` — the `eos` server.
- `.agents/agents/eos-*.md` — the six orchestrators, rendered from `.github/agents/`.

**Working a stage.** Pick the agent `eos next` names, `eos-architecture` for example, as the agent in
the chat, or ask the main agent to run it as a subagent. It follows the same instructions as
Copilot's `eos-architecture`; there are no handoff buttons, so it names the next agent instead.

## 6.6.4 The lifecycle on each platform

`eos next` describes each step the same way everywhere: a slash command, an agent, BMAD skills or a
command. Read its **Start** block and translate it:

| `eos next` names… | VS Code + Copilot | Claude Code | OpenAI Codex | Google Antigravity |
|---|---|---|---|---|
| slash command `eos-requirements` | `/eos-requirements` | `/eos-requirements` | `$eos-requirements` | `/eos-requirements` |
| agent `eos-architecture` | switch to it, or click its handoff button | follow `.github/agents/eos-architecture.agent.md`, with the handoff package | "spawn the eos-architecture agent" | pick `eos-architecture`, or run it as a subagent |
| skills `bmad-architecture` | the agent uses them | `/bmad-architecture` | `$bmad-architecture` | `/bmad-architecture` |
| a command | run it | run it, or let Claude run it | run it, or let Codex run it | run it, or let the agent run it |

**The handoff package works in every agent.** It names the goal, the agent and skills to use, the
files that matter (hash-bound) and the command to come back with:

```sh
node .github/eos/eos.mjs handoff --scope story --id STORY-012   # writes .eos/handoffs/STORY-012.json
```

Then tell the agent: "Carry out `.eos/handoffs/STORY-012.json`; do not widen the scope." When it is
done, `eos next` takes over again: the gate decides, not the agent.

The Happy Path of §1.3, typed in Claude Code:

```
/eos-next                      → the first step: /bmad-brainstorming → docs/discovery.md     (G1)
/eos-requirements "<feature>"  → docs/requirements.md                                         (G2)
/eos-spec                      → docs/prd.md                                                  (G3)
/eos-ux-spec                   → docs/DESIGN.md + docs/EXPERIENCE.md (skip for pure backend)
/bmad-architecture             → docs/architecture.md + ADRs                                  (G4)
/bmad-create-story             → docs/stories/*.md                                            (G5)
/bmad-dev-story                → src/ code, then /bmad-code-review                            (G6)
```

In Codex, type `$` instead of `/`. In Antigravity, the stage agents can take the place of the skills.

## 6.6.5 Check that everything is wired

| Check | How | Expected |
|---|---|---|
| The guardrail runs | ask the agent to run the probe command from §2.4 | refused by the secret rule |
| The workflows load | `/eos-next` (Codex: `$eos-next`) | six blocks: Current, Blockers, Recommended next, Why, Start, Done when |
| The MCP server answers | ask "what is next?" | the agent calls `eos_next` after your one-time approval |
| The generated files are current | `node .github/eos/eos.mjs agents sync --check` | `PASS`; CI runs the same check |

## 6.6.6 Cursor, Gemini CLI and the Tier-2 agents

The same command adds them: `node .github/eos/eos.mjs agents sync --platform cursor --write`, or
`gemini`, `kiro`, `qwen`, `devin`, `opencode`, `cline`. Gemini CLI also gets `AGENTS.md` added to its
context files, which it does not read by default. The Tier-2 files are generated from each vendor's
documentation and are **not yet verified on a real installation**; check them before you rely on
them (§7.9).

## 6.6.7 Known differences

- **Handoff buttons are Copilot's.** In other agents the orchestrator names the next agent or slash
  command, and so does `eos next`.
- **The scoped coding rules load automatically only in Copilot.** VS Code applies
  `.github/instructions/**` by file glob. Other agents reach those rules through `AGENTS.md`, which
  points to them: ask the agent to read the rule for the files it is about to change.
- **Claude Code runs the workflows as skills, not as EOS subagents** (6.6.1).
- **BMAD lives in a different folder per agent** (6.6.0). `eos-doctor --deep` and `eos next` check
  every one of them, Antigravity's included (since eos-2.4.0, §2.2), so a BMAD install in any of them
  counts. They cannot tell which folder your agent reads: an install only in `~/.agents/skills/`
  satisfies the check but stays invisible to Antigravity until you link it (6.6.3).
- **Hooks are local speed bumps.** Each agent asks you to trust them once. If the hook itself fails,
  some agents let the call through (Claude Code) and some refuse it (VS Code); CI stays the authority
  (Appendix D).
- **VS Code's agent sessions also run the Claude Code hook.** If every tool call in a VS Code agent
  session is refused with "hook errored", check that `.claude/settings.json` runs the plain command
  line `node .github/hooks/deny-dangerous.js --format claude` (`eos agents sync --write` restores it),
  then quit and reopen VS Code: reloading the window does not restart the agent host.

---

# Chapter 7 Complete reference (quick-reference)

## 7.1 Slash commands (EOS skills, `.agents/skills/`)

| Command | Purpose | Parameter | Output |
|---|---|---|---|
| `/eos-requirements` | Requirements analysis + operational pre-flight (wraps bmad-agent-pm / bmad-prd) | `<feature or docs/discovery.md path>` | `docs/requirements.md` |
| `/eos-spec` | Produce PRD source of truth (bmad-prd) | `<docs/requirements.md path>` | `docs/prd.md` |
| `/eos-ux-spec` | Design UX/UI visual+experience contract (wraps bmad-ux) | `<docs/prd.md path>` | `docs/DESIGN.md` + `docs/EXPERIENCE.md` |
| `/eos-eval-spec` | Design LLM/agentic evaluation plan (conditional gate G-EVAL) | `<docs/prd.md path>` | `docs/eval-plan.md` |
| `/eos-spec-align` | Quantify spec alignment (AC coverage/first-pass rate/drift, G7 metric) | — | Alignment report (`spec-align.mjs`) |
| `/eos-e2e` | Orchestrate browser/E2E tests (Playwright framework+generation+trace); during development Playwright MCP can drive browser self-checks (see 7.7) | — | Playwright specs + `docs/trace-matrix.md` |
| `/eos-adr` | Record one architecture decision | `<decision title>` | `docs/adr/NNN-*.md` |
| `/eos-deploy-topology` | Choose deployment topology (bare process/Docker/K8s/serverless/PaaS), align NFR, and land ADR | — | Fill `G-deployment.md` + `docs/adr/NNN-deployment-topology.md` + Deployment section in `architecture.md` |
| `/eos-nfr` | Fill C-nfr with concrete target values line by line | — | Updates `C-nfr.md` + PRD NFR section |
| `/eos-compliance` | Regulated-industry compliance pre-flight (regime selection + boundary controls, conditional; uses F-compliance) | `<regime name or domain description>` | `docs/compliance-profile.md` |
| `/eos-telemetry-plan` | Design telemetry and align it with success metrics | — | `docs/telemetry-plan.md` |
| `/eos-release-gate` | Run release gate (G8) | — | Gate report |
| `/eos-runbook` | Generate operations runbook (rollback, gradual rollout, health/readiness) | `<service name>` | `ops/runbook.md` (one section per service) — the file G8 reads |
| `/eos-validate-config` | EOS configuration static+semantic health check | — | Issue table (does not change code) |

Since eos-2.2.0 every slash command is an **Agent Skill** in `.agents/skills/eos-*/SKILL.md` — the open format Copilot (VS Code, CLI, cloud agent), Codex, Cursor and Antigravity read natively; VS Code's Agent Host no longer loads prompt files. Claude Code reads only `.claude/skills/`, so EOS keeps a byte-identical copy there: edit the skill in `.agents/skills/`, then run `node .github/eos/eos.mjs agents sync --write` (CI runs `agents sync --check`). In Codex the commands are `$eos-spec`, `$eos-next` …; `/eos-next`, `/eos-resume`, `/eos-status`, `/eos-help` and `/eos-init` are described in Chapter 1 and §3.

## 7.2 EOS CLI (`node .github/eos/eos.mjs <command>`)

Everything below is offline, zero-dependency and cross-platform. Exit codes: `0` pass · `1` fail or
rejected transition · `2` blocked/pending/stale · `3` EOS itself cannot be evaluated. To look rather
than gate — a shell prompt, a session-start hook, an `&&` chain — use `status` or `health`, which exit
`0` whenever EOS can evaluate, or `next --exit-zero` / `resume --exit-zero` (since eos-2.4.0), which
exit `0` instead of `1` or `2` and still `3` when EOS cannot evaluate. The flag never switches on by
itself, and the `--json` document keeps the real `exitCode`.

Besides the one recommended action, `eos next` says — once each, and only when it applies — **Not activated yet** (`/eos-init` is still pending), **Awaiting a person** (a one-way ADR is still `proposed`), **Start measuring now** (an NFR is stated at a scale: build that dataset into the first story that touches it) and, at the release, **freeze first** and what comes after it (G9 and G10 are needed to leave `RELEASED`, not to ship it). A stale `product` focus no longer pins `next` once the baseline passes, and `verify` evaluates only the stages the baseline has reached.

| Command | Purpose |
|---|---|
| `next` | The ONE recommended next action, why, and how to start it (`--why`, `--all`, `--exit-zero`) |
| `resume` | Restore this machine's focus in a new session (`--exit-zero`) |
| `status` | Where the product and the active scope are (`--changed`), and — since eos-2.2.0 — what the release gate (G8) will need that does not exist yet: a dependency audit, NFR measurements, a runbook, a deployment-topology ADR (`next` names the missing ones once there is product code) |
| `check --gate <id> [--scope <id>]` | Run one gate for real and record the evidence |
| `explain <gate>` | The full rule set for one gate, on demand |
| `transition --scope <type> --id <id> --to <STATE>` | Move a scope, guarded by recorded evidence |
| `approve --scope <type> --id <id>` | Record an approval — must be a **different** person from the requester, unless the project declared `approvalMode: "solo"` and the person adds `--self --reason "<why>"` (recorded as a self-approval; an agent never runs `--self`). Prints the deferred NFR list first and binds the approval to it |
| `release-status` / `verify-release --release <id>` | Aggregate readiness / candidate-bound verification (G8) |
| **`product-tree`** | The identity of the tree a verification applies to. `--json` prints the digest a summary your own runner writes must embed |
| **`evidence junit [<report.xml>…] [--write]`** | Answers every `docs/trace-matrix.md` reference from JUnit XML reports and writes `docs/evidence/test-run.json` — for tests that ran in another CI step. Refuses a report older than any product file (exit 2). Without files it reads `evidence.junit`; the `verified` gate does the same conversion on every run |
| **`providers`** | What external authorities this project consults, and what each says right now. Absent by default — with none configured, every gate still reaches a verdict offline |
| `waive --gate … --reason … --risk-owner … --expires …` | Record an expiring, owned waiver (never available for a non-waivable gate) |
| `handoff --scope <type> --id <id>` | Hand the current step to another agent/session |
| `ledger [--verify] [--against <ref>]` | Verify the append-only hash chain |
| `focus --scope <type> --id <id>` | Set this machine's local focus (carries no authority) |
| `init [<pack>] [--solo] [--write]` | Report or create local, non-destructive integration files; with a pack, declare the project (`--solo`: the Standard track's one-maintainer approval path). It keeps the `language`, platforms and exclusions you already chose, and lists the stories that need an `Eval case` column when you declare `agentic` |
| `stage init <stage> [--write] [--interactive]` | The skeleton of a stage's machine record (`docs/<stage>.json`) and its document, generated from the schema: every required field with a `TODO(eos)` placeholder — every gate rejects the record until each is answered, so a skeleton never advances a stage. Samples: [examples/stage-records](examples/stage-records/README.md) (since eos-2.3.0) `stage init story --id <ID> [--ac AC1.1,AC1.2] [--write]` writes the story file in the format `story-ready` reads; `stage init design` also writes `docs/EXPERIENCE.md`. |
| `stack sync [--write]` | Render the always-on workspace rule's `Local commands` from `.eos/project.json`, so the prose cannot disagree with what CI runs. Blocks rather than guessing when no stack is declared |
| `agents sync [--platform <x>] [--write] [--check]` | Generate what each agent platform reads from one source: skill copies, the EOS MCP entry, the guardrail hook in the platform's dialect, agents where they do not collide. Shared configuration files keep everything that is not EOS's; `--platform` adds a platform to `agentPlatforms`; CI runs `--check` (since eos-2.2.0; platforms since eos-2.3.0, see 7.9) |
| `mcp` | Serve the read and verify commands to an agent over the Model Context Protocol (stdio): `next`, `status`, `resume`, `health`, `explain`, `check`, `verify`, `release-status`, a stage skeleton, `product-tree`, `doctor`, `policy check`. Approving, waiving, transitions, release signing and everything that rewrites governance files are deliberately not tools ([ADR-018](../adr/018-mcp-server.md)). `eos agents sync` writes each platform's client configuration (since eos-2.3.0) |
| `doctor` | Is EOS itself wired correctly? |

**Gate ids** (`check --gate <id>`): `activation` · `discovery-ready` · `requirements-ready` ·
`prd-ready` · `ux-ready` · `architecture-ready` · `story-ready` · `verified` · `release-ready` ·
`telemetry-ready` · `iteration-ready`.

## 7.3 Orchestrator Agents (`.github/agents/`)

| Agent | Phase | Reused BMAD | handoff to |
|---|---|---|---|
| `eos-discovery` | 1 problem definition | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea | → `/eos-requirements` |
| `eos-design` | 3.5 UX/design | bmad-ux, bmad-agent-ux-designer(Sally), bmad-cis-design-thinking(Maya) | → `eos-architecture` |
| `eos-architecture` | 4 architecture | bmad-architecture (Winston) | → `eos-plan` |
| `eos-plan` | 5 planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd | → `bmad-dev-story` → `bmad-code-review` |
| `eos-review` | 10 iteration | bmad-correct-course, bmad-retrospective, bmad-document-project | → `/eos-requirements` (next round) |

> **How to switch agent**: in Copilot Chat's mode/agent selector → select the target agent (such as `eos-discovery`).
> After switching, that persona remains active (including its `tools` limits and `handoffs`) until you switch again.
>
> **⚠️ Only see "Agent / Ask / Plan" + "Configure Custom Agents...", and cannot find eos-* custom agents?**
> **Top cause (90%): you opened the parent directory in VS Code, not the project root.** VS Code scans `.github/agents/` only under the **opened workspace root** (single level, non-recursive). If you opened a parent folder that "contains many projects" (for example `~/Developer/Projects/`, while the project is in its child `my-app/`), then `.github/` is not at the root → **custom agents, `.github/instructions/`, and `.github/hooks/` all silently fail** (the status bar may still show a child repository's git branch name, which is misleading).
>
> **30-second self-check (most important)**:
> 1. In the left VS Code Explorer, can you directly see `.github/` and `README.md` on the **first top-level screen**? Yes → root is correct;
>    seeing a bunch of project folders (`my-app/`, `other-app/`, ...) → you opened the wrong parent directory.
> 2. Run `ls .github/agents` in the integrated terminal: if it lists 5 `eos-*.agent.md` files but the selector is still empty, root opening is almost certainly wrong.
> 3. **Fix**: `File > Open Folder...` and select the **project folder itself** (the level that contains `.github/`), or run `cd my-app && code .` in the terminal.
>
> After excluding the "root" factor, troubleshoot in this order (**do not need** to copy `.github/agents/` into the user-level directory--`.github/agents/*.agent.md` is the official default recognized location):
>
> | Check | How |
> |---|---|
> | ① Confirm opened at **workspace root** | See the 30-second self-check above--this is the most common cause, so exclude it first. |
> | ② Does the agent file have a legal `name`? | Every `.agent.md` frontmatter must have `name:`, containing only lowercase letters/digits/hyphens (`^[a-z0-9-]+$`). Run `node .github/hooks/validate-config.mjs`; S10 reports missing/illegal/duplicate names. |
> | ③ Reload window | After creating/degit-ing a project: command palette `Developer: Reload Window`, so VS Code rescans agent files. |
> | ④ Version | Custom agents require recent VS Code + Copilot Chat. Use "About VS Code" for the real version (`code --version` is a shim and unreliable). `【Verify in your version】` UI entry locations vary slightly by version. |
> | ⑤ Settings not overridden | Check user/workspace `settings.json` did not change `chat.agentFilesLocations` to omit `.github/agents` (the default includes it, usually no setting needed). |
>
> **Alternative path** if they still do not appear: run the flow directly with slash commands--EOS skills such as `/eos-requirements`, `/eos-compliance`, `/eos-spec`, `/eos-ux-spec`, `/eos-eval-spec`, `/eos-release-gate` do not depend on the agent selector; type `/` to see them. Agents are only "orchestration personas", and their capabilities can all be manually triggered with the corresponding slash commands/skills (see 7.1 and `docs/eos/agent-map.md`).

Codex and Antigravity get the same six orchestrators, generated from these files (`.codex/agents/`,
`.agents/agents/`); Claude Code runs their steps as skills. See [Chapter 6.6](#chapter-66-using-eos-with-claude-code-codex-and-antigravity).

## 7.4 Rule files (`.github/instructions/`)

| File | `applyTo` | Governs |
|---|---|---|
| `00-workspace.instructions.md` | `**` | Repository facts: directory layout, local commands, Git conventions |
| `frontend/10-frontend.instructions.md` | `**/*.{tsx,jsx}` | React/Next.js component conventions, responsive/multi-device, a11y (WCAG AA), i18n, performance budget/CWV |
| `backend/10-backend-node.instructions.md` | `**/*.ts` | Node/TS layering, deterministic resilience (circuit breaker/backoff), transactions/idempotency, UTC/money, OTel |
| `backend/10-backend-python.instructions.md` | `**/*.py` | FastAPI routes→services→repositories, Pydantic, resilience, transactions, OTel |
| `backend/10-backend-go.instructions.md` | `**/*.go` | Go layering, concurrency, resilience, OTel |
| `backend/10-backend-java.instructions.md` | `**/*.java` | Spring Boot layering, transactions, Resilience4j, Micrometer/OTel |
| `backend/10-backend-rust.instructions.md` | `**/*.rs` | Rust layering, concurrency safety, resilience, tracing/OTel |
| `backend/10-backend-dotnet.instructions.md` | `**/*.cs` | .NET layering, async/persistence, Polly, OTel |
| `ai/10-ai-llm.instructions.md` | `**/{ai,llm,rag}/**` | **Agentic additional layer**: prompt-as-artifact, tool/agent architecture, cognitive reflection fault tolerance, memory layering, async decoupling, evaluation, LLM safety, tracing |
| `data-api/20-data-api.instructions.md` | `**/*.{sql,prisma}` | Data modeling, migrations, data lifecycle, multi-tenant isolation, API contracts/deprecation, time zone/money storage |
| `testing/30-testing.instructions.md` | `**/*.{test,spec}.*` | Test pyramid, AC traceability, contract+DB state integration tests, coverage gate, NFR/eval dual track |
| `security/40-security.instructions.md` | `**` | Input validation, deny-by-default, multi-tenancy, secrets, supply chain, data classification (thin guardrail) |
| `release-ops/50-release-ops.instructions.md` | `**/{Dockerfile,*.yml,*.yaml}` | Deployment topology (decided in Phase 4/G4, see `G-deployment.md`), reproducible builds, release preconditions, health endpoints |

> R1 global beliefs are in `.github/copilot-instructions.md` (not in the table because it is the always-on top-level file).

## 7.5 Project-level skills (`.agents/skills/`)

| Skill | When to use | Purpose |
|---|---|---|
| `eos-operational-readiness` | Phase 2/4 | Force ADOPT/SKIP/DEFER decisions for 10 operational/NFR items, with no blanks |
| `eos-compliance-skeletons` | Development phase (when building 🟡 privacy controls) | Points to runnable starter skeletons (redaction/consent/DSAR/audit; implemented for four default reference stacks: Node/ESM · Python/stdlib · Go · Java/JDK), turning "what should be built" into "starter scaffold"; `redactorFromProfile()` auto-reads the **Regulatory regime:** line from `/eos-compliance` to select a profile |

> See the phase mapping table in `docs/eos/agent-map.md` for the 73 user-level `bmad-*` skills.

## 7.6 Hooks (`.github/hooks/`)

| File | Event | Purpose |
|---|---|---|
| `guardrails.json` + `deny-dangerous.js` | PreToolUse | Blocks dangerous operations + **supply-chain poisoning (`curl&#124;bash`/`--unsafe-perm`) + hardcoded secret literals** (outputs `permissionDecision:"deny"`). Other agent platforms run the same script with `--format <platform>`, from the hook `eos agents sync` generates for them (see 7.9) |
| `quality.json` | PostToolUse | Runs lint+typecheck+test quality gate after file writes (**advisory**, not the authoritative gate: it always exits 0; the authority is `project-gate.mjs` in CI) |
| `config-check.json` | PostToolUse | Automatically runs `validate-config.mjs` after every edit (configuration S1–S14) **+ `eos-doctor.mjs` (SDLC clinic / G-EVAL wiring / secret scan)** (also advisory) |
| `validate-config.mjs` | Manual/called by hook | Zero-dependency static validator (S1–S14: rule/agent/prompt frontmatter, glob, required paths, hook events, **S12 `.eos/project.json` declaration validity**, **S13 the `.eos/` workflow spine and its cross-references**, **S14 the always-on workspace rule must not describe a stack the project never declared**) |
| `project-gate.mjs` | Manual / **called by CI (authoritative)** | Cross-stack product-quality gate: actually executes install/lint/typecheck/test/eval as declared in `.eos/project.json`. **Fail closed** — an `application` without `commands.test`, a stack manifest with no declaration, or a missing toolchain (BLOCKED) all exit 1 |
| `eos-doctor.mjs` | **PostToolUse (per edit, via `config-check.json`)** / manual / called by CI | Zero-dependency SDLC clinic: **D0 project declaration**, D1/D2 G-EVAL (driven by the `productParadigms` declaration; SDK/dir discovery is only a safety net), D3 G-UX, **D4 secret scan (calls `secret-scan.mjs`)**, **D5 compliance data boundary (validates the structured `docs/compliance-profile.json`, no longer prose keywords)** |
| `secret-scan.mjs` | Manual / called by eos-doctor + CI | Secret scanning: built-in zero-dependency regexes (hardcoded secrets/private keys, accidentally committed `.env`) **+ if `gitleaks` is installed, automatically adds deep scan** (`.gitleaks.toml` allowlist); hits exit 1 and output is redacted |
| `spec-align.mjs` | Manual (`/eos-spec-align`) / called by CI | Quantified spec alignment: parses `prd.md`+`trace-matrix.md` → AC coverage / first-pass rate / drift — a row's pass is read from `docs/evidence/test-run.json` when it exists, the Result column only without it (since eos-2.2.0); `--strict` is **fail closed**: missing files, an AC-less PRD, an empty matrix, drift, orphan rows and failing rows all exit 1 |
| `*.test.mjs` | `node --test` / CI | Regression tests for the gates themselves (deny-dangerous / spec-align / project-gate / eos-doctor / check-doc-parity) — so a future edit cannot quietly restore "green but empty" |

**Manual guardrail test** (terminal):
```sh
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | node .github/hooks/deny-dangerous.js
# → {"hookSpecificOutput":{...,"permissionDecision":"deny",...}}
echo '{"tool_input":{"command":"ls"}}' | node .github/hooks/deny-dangerous.js
# → {}
```

**Local CI (third enforcement layer, requires Docker)**: besides "real-time Hook + configuration static validation", EOS provides repository-wide batch gates run by `act`.
```sh
act push -W .github/workflows/eos-ci.yml -j verify   # runs .github/workflows/eos-ci.yml: validate-config + eos-doctor + tests + evals
act push -W .github/workflows/eos-ci.yml --pull=false --action-offline-mode   # fully offline after images have been pulled once
```
> The three enforcement layers divide responsibilities: **Hook (real-time per edit)**=`config-check.json` runs `validate-config.mjs`+`eos-doctor.mjs` after every edit (configuration compliance + G-EVAL wiring), `quality.json` runs quality gates, `guardrails.json` blocks dangerous operations · **static validation (manual/on demand)**=the same two scripts can be run anytime · **act CI (whole-repo batch before merge/release)**=`eos-ci.yml` runs validate-config+eos-doctor+tests+evals. The same gate (such as G-EVAL) is enforced both per-edit and in CI, so issues are found early and cannot slip through.

## 7.7 Six requirement checklists (`docs/checklists/`; sixth only for regulated industries)

| File | Name | Use | Used at which gate |
|---|---|---|---|
| `A-gap.md` | Requirement gaps | Falsifiable/measurable/boundaries/dependencies/scope-out/overlap | G2 |
| `B-rework.md` | Likely post-launch add-ons | telemetry/authz/audit/rollback/alerting/canary/rate-limit/i18n/empty-error-loading states/reversible migration | G2 |
| `C-nfr.md` | Non-functional requirements | Performance/capacity/DR/security/observability/maintainability/a11y targets filled item by item | G2 + G4 |
| `D-ops.md` | Operational pre-flight | telemetry↔metrics/authz matrix/audit/rollback/canary/quota/multi-tenancy/i18n/capacity alerts/runbook | G2 |
| `E-security.md` | Security and secrets | no secrets in code/frontend/`.env` governance, supply-chain poisoning defense, config permission isolation, key rotation | G2 + G8 |
| `F-compliance.md` | Regulated-industry compliance (**regulated only**) | regime selection (HIPAA/PCI/SOC2/SOX/GDPR/CCPA/PIPL)→data residency/audit retention/minimum necessary/BAA·DPA/Agentic data egress | G2 + G8 |
| `F-compliance-hipaa.md` | HIPAA controls→landing-point mapping (companion appendix) | Security Rule technical/administrative/physical safeguards + minimum necessary/de-identification + breach notification + 6-year retention, mapped line by line to real EOS landing points (🟢/🟡/⚪ tiers) | G2 + G8 |
| `F-compliance-pci-dss.md` | PCI-DSS controls→landing-point mapping (companion appendix) | v4.0 twelve requirements + Requirement 3 card-data storage special table + scope-reduction strategy (SAQ A) | G2 + G8 |
| `F-compliance-gdpr-pipl.md` | GDPR/PIPL privacy controls→landing-point mapping (companion appendix) | lawfulness/consent, DSAR (access/deletion/portability), cross-border transfer (SCCs vs PIPL security assessment), ROPA/DPIA, 72h notification; includes GDPR↔PIPL difference table | G2 + G8 |

---

## 7.8 Browser automation testing (Playwright MCP)【New-build · maps to VS Code MCP native mechanism】

Want the "agent to personally open the browser, click around, and screenshot self-check" (similar to Antigravity's Chrome integration)? The native VS Code + Copilot approach is **MCP server + agent mode**. The template packages it as a **purely local, sandboxed, default-off (opt-in)** Playwright MCP:

> **Why default off?** (This is a real design defect fixed in eos-1.7.1.) MCP servers are **eager-started once by the client at session/conversation start** and are **workspace-global**--they **cannot be gated by SDLC phase**. If an active `.vscode/mcp.json` ships with the template, then from the moment **Phase 1 just types an idea**, clients (Copilot CLI / VS Code Chat alike) will pop "Starting MCP servers playwright..." to bring up a browser--unnecessary and wasteful. VS Code's `chat.mcp.autostart` is Experimental and only affects VS Code, so it cannot save CLI. **The only robust cross-client approach: do not provide active config by default; opt in at Phase 7.**

- **Configuration (inert)**: the template ships **`.vscode/mcp.json.example`**--no MCP client reads `.example`, so **nothing auto-starts**.
- **Enable in Phase 7 (opt-in)**: `cp .vscode/mcp.json.example .vscode/mcp.json`, then reload window/session. The active `mcp.json` is ignored by `.gitignore`, **kept local only**, and never committed back to the template. Remove it with `rm .vscode/mcp.json` when done.
- **Configuration format**: top-level key is **`"servers"`** (note: not the generic README's `"mcpServers"`--that is another client format).
- **Engine**: `@playwright/mcp` (official Microsoft), uses accessibility tree, is highly deterministic, no telemetry; same source as the Playwright chosen by BMAD's `bmad-testarch-framework`.
- **Guardrails**: `sandboxEnabled: true` + top-level `sandbox` locks **file writes to workspace and network to localhost** (official macOS/Linux feature)--the agent-driven browser can only hit your own dev server and cannot leave the fence.
- **First use**: one-time networked `npx playwright install chromium` (and let `@playwright/mcp` download on first use); VS Code first launch shows a **trust dialog**. Afterwards, Playwright tools appear in the **agent mode** tools selector.

**Usage**: run `/eos-e2e` (see 7.1) to orchestrate `bmad-testarch-framework` (initialize) → `bmad-qa-generate-e2e-tests` / `bmad-testarch-automate` (generate/extend) → `bmad-testarch-trace` (AC↔E2E matrix). **During development**, if you want the agent to use Playwright MCP to reproduce/explore localhost, first enable opt-in as above, then **solidify findings into deterministic Playwright specs**.

**Honest boundaries**:
- Browser MCP is **not enabled by default**--**only manually opt in during Phase 7**, avoiding eager startup interference in early phases (see "Why default off" above).
- The MCP layer is **nondeterministic**--use it only for development self-checks, **never in CI**, and **never as a substitute** for deterministic specs. CI only runs Playwright scripts (`eos-ci.yml` / `bmad-testarch-ci`).
- `sandbox` is macOS/Linux only; the network allowlist defaults to `localhost`/`127.0.0.1`; if the app under test needs external resources (CDN, etc.), add domains as needed.
- Want deeper performance/network troubleshooting with **real Chrome**? `【Optional】` switch to Google's `chrome-devtools-mcp`--but it **enables usage telemetry + calls the CrUX API by default**, so for pure local use you must add `--no-usage-statistics --no-performance-crux`.
- Further "on-demand loading" direction: Playwright officially also provides **CLI + SKILLS** forms (for coding agents to lazy-load by relevance, naturally avoiding eager startup)--`【Verify in your version】` maturity; this can be future evolution.
- The concrete UI for agent mode + MCP evolves by version, `【Verify in your version】`.

---

## 7.9 Agent platforms (`eos agents sync`)

EOS is written once and generated for each agent platform the team uses ([ADR-019](../adr/019-agent-platforms.md)). Three open standards carry most of it — `AGENTS.md`, Agent Skills in `.agents/skills/`, and the `eos mcp` server ([ADR-018](../adr/018-mcp-server.md)). `eos agents sync` writes the rest in each platform's own format: its MCP entry, its pre-tool hook (the same `deny-dangerous.js`, run with `--format <platform>`), and agents or skill copies where a platform reads only its own directory.

| Platform | Generated for it | One-time trust step |
|---|---|---|
| GitHub Copilot *(default)* | `.mcp.json` — its agents, skills and `.github/hooks/guardrails.json` are the template's own | VS Code asks you to trust the MCP server before it first starts |
| Claude Code *(default)* | `.claude/skills/` copy, the hook in `.claude/settings.json`, `.mcp.json` | Claude Code asks once to approve the project's MCP server |
| Google Antigravity *(default)* | `.agents/hooks.json`, `.agents/mcp_config.json`, `.agents/agents/` | MCP tools ask per call |
| OpenAI Codex | `.codex/config.toml` (a marked `[mcp_servers.eos]` block), `.codex/hooks.json`, `.codex/agents/*.toml` | Trust the project, and approve each hook once (`/hooks`) |
| Cursor | `.cursor/hooks.json` (shell commands), `.cursor/mcp.json` | MCP asks per call (Run Modes) |
| Gemini CLI | `.gemini/settings.json`: `AGENTS.md` added to `context.fileName`, the hook (`BeforeTool`), MCP | Trust the folder |
| Kiro · Qwen Code · Windsurf / Devin Desktop · OpenCode · Cline *(Tier 2)* | `.kiro/…` · `.qwen/…` · `.devin/…` · `opencode.json` and a plugin · `.clinerules/hooks/PreToolUse` | Generated from each vendor's documentation — **not yet verified on a real installation** |

- **Choose the platforms** in `.eos/project.json` → `"agentPlatforms"`. Absent, the default set is generated (Copilot, Claude Code, Antigravity): the files in `.agents/`, `.github/`, `.claude/` and `.mcp.json`, which also give Codex, Cursor and Gemini CLI the skills and `AGENTS.md`, and Cursor the Claude hook. One command adds a platform: `node .github/eos/eos.mjs agents sync --platform codex --write`. It edits `agentPlatforms`, an input of every gate, so re-run `eos verify` afterwards.
- **Shared files stay yours.** EOS owns its entries — the `eos` server, the hook handlers that run `deny-dangerous.js`, a marked TOML block — never the rest of `.claude/settings.json` or `.mcp.json`, and never a hook of yours: your hooks keep their order around EOS's, and a group of yours that runs the guardrail beside your own handlers stays as you wrote it. Removing a platform removes only EOS's entries and handlers, and a file only when nothing else is left in it. A file EOS cannot merge safely (JSON with comments, a TOML that already defines `eos` or makes `mcp_servers` inline) is refused, not half-written, and nothing is written through a symbolic link. A whole file EOS writes (the Cline hook script, `eos-*` agents …) is replaced or removed only while it carries EOS's mark; your own file at that path is never touched.
- **CI runs `agents sync --check`.** Edit the sources (`.agents/skills/`, `.github/agents/`, `.github/hooks/`), never a generated file. `eos upgrade` regenerates these files for your platforms instead of comparing them with the template's.
- **Not generated:** Claude Code subagents (VS Code also reads `.claude/agents/` and would list every orchestrator twice; Claude Code runs the same workflows as skills); Cline's MCP entry (Cline reads only its global `~/.cline/mcp.json`); Trae, CodeBuddy and Comate, whose documentation could not be fetched — `AGENTS.md` and the CLI serve them until they are verified on a real machine.

# Chapter 8 Configuration QA and acceptance

## 8.1 Static validation (must run after every configuration change)

```sh
node .github/hooks/validate-config.mjs
```

| Check | Level | Meaning |
|---|---|---|
| S1 | error | Every `.instructions.md` has legal YAML frontmatter |
| S2 | warn | Every `.instructions.md` has `applyTo` (otherwise it can only be mounted manually) |
| S3 | error | Non-`**` files have no duplicate glob (`**` legally coexists and is exempt) |
| S4 | warn | Common source types (such as .ts/.tsx/.py/.sql) have rule coverage |
| S5 | error/warn | Always-on budget: `copilot-instructions.md` ≤40 lines (error); each `applyTo:"**"` rule file ≤300 words (warn) |
| S6 | warn | File name matches `NN-area[-stack].instructions.md` convention |
| S7 | error | Required paths/files exist (copilot-instructions.md, instructions/, prompts/, agents/, hooks/, docs/eos/agent-map.md) |
| S9 | error | hook JSON is legal and event names are valid |
| S10 | error/warn | Every `.agent.md` has `name` (error; if missing, Chat will not list it by name) + `description` (warn) |
| S11 | error | Every skill in `.agents/skills/` loads: its `name` equals its directory and it has a `description`; EOS's own carry only those two fields. A leftover `.github/prompts/` warns |
| S12 | error/warn | `.eos/project.json` is valid; a stack manifest with no declaration is an error (a Node-only repo warns) |
| S13 | error/warn | Workflow, gates and agent map load and cross-reference (gates, states, agents, prompts, the codes a gate `enforces`); a profile that requires the compliance boundary has it; an absent file warns |
| S14 | error | The commands in the always-on workspace rule match the declared stack |
| S15 | error | Prompts, agents, instructions, skills and agent-map handoffs cite only gates, gate codes, commands, states, transitions, prompts, agents and scripts that exist ([ADR-011](../adr/011-prompts-cite-only-the-policy.md)) |

> Expected output: `PASS`. Any **error** must be fixed before continuing; **warn** is handled case by case.
> (The above are the checks actually implemented in current `validate-config.mjs`.)

## 8.2 Semantic validation (periodic / after major changes)

Enter **`/eos-validate-config`** in Chat: have Agent read all of `.github/`, detect rule contradictions, duplicates, overly broad scopes, and broken links, then output a `[file][issue type][severity][suggestion]` table, **without changing code**.

## 8.3 Behavioral acceptance Rubric (smoke)

Run one minimal dry-run feature (such as "user login") end to end through 10 phases, checking off each item:

| Phase | Expected output | Pass criteria |
|---|---|---|
| Discovery | One-sentence problem+metrics | ☐ falsifiable ☐ has metrics |
| Requirements | PRD draft + four checklists | ☐ no unresolved BLOCKER |
| Spec | `docs/prd.md` | ☐ every requirement has AC |
| Architecture | ADR + API contract | ☐ ADR has trade-off ☐ API before implementation |
| Planning | story list | ☐ every story has AC+context |
| Development | code + passes hook | ☐ compliant code not blocked ☐ dangerous command blocked |
| Testing | tests + trace | ☐ every AC has ≥1 test ☐ all green |
| Release | gate report | ☐ all five gates pass |
| Observability | telemetry in production | ☐ key paths visible |
| Iteration | write back to Spec | ☐ `docs/prd.md` updated |

> See **Appendix C** for the complete real example (`my-app` 12/12 passed, report in `my-app/docs/eos/walkthrough.md`).

## 8.4 What CI runs in your repository

`.github/workflows/eos-ci.yml` came with the template, and it is two things at once: the governance gate
every project runs, and EOS's own test suite ([ADR-021](../adr/021-eos-tests-run-only-in-eos.md)).
`.github/eos/ci-plan.mjs` tells them apart from `.eos/project.json`: the template ships its own
declaration marked `"templateDefault": true`, and `eos init` replaces it with yours.

| Job / step | In your project | In EOS itself |
|---|---|---|
| `verify` — validate-config, doc parity, SBOM, governance versions, generated docs, agent platforms, doctor `--deep`, gitleaks and the secret scan, spec-align, ledger, policy lock, `eos doctor` | runs | runs |
| `verify` — the product-quality gate (`project-gate.mjs`) | runs **your** declared install / lint / typecheck / test / eval | runs EOS's declared suite |
| `verify` — the five `EOS tests ·` layers | skipped | runs |
| `coverage` and `cross-platform` | skipped — no runner starts | runs |
| `release-candidate` (tags only) | runs | runs |

Until you declare your project, a push still runs EOS's suites — and they pass, because the tree is still
the template's. Mark only `verify` as a required check ([Appendix D.1](#appendix-d-post-instantiation-hardening-make-gates-authoritative)).

**When it runs.** On a push to `main` or `master` and on a tag; on every pull request, where a new commit
cancels the pull request's earlier run; and once a week on the default branch, where a project runs only
the short `plan` job. A branch without a pull request is not built when you push it: open a pull request,
or add the branch to `on.push.branches` (a release branch, say).

**Which Node, which runner.** Every `setup-node` step in `eos-ci.yml` and `eos-release.yml` reads `.nvmrc` (24), so CI and your developers share one source; `coverage` runs Node 22 and EOS's own matrix runs 22 and 24. Linux jobs run on `ubuntu-24.04`, not the moving `ubuntu-latest`. **The policy check is reported on its own:** a failing `EOS policy integrity` step no longer skips the product quality gate — a separate step reports its verdict, so a policy that still needs its approver cannot hide whether your tests pass, and the other way round. A solo project's `<name> (self)` approver is accepted there. The `plan` job's log prints `self=<true|false>`.

---

# Chapter 9 Failure localization and troubleshooting

## 9.1 Failure localization decision tree

```
Agent output does not match expectation
├─ Rules ineffective for a certain file class → check that rule's applyTo glob (validate-config S2/S3)
│                                             common: used comma string "a,b" instead of braces "{a,b}"
├─ Rules overridden/mutually contradictory    → run /eos-validate-config semantic check; inspect whether multiple "**" files conflict in wording
├─ Slash command not recognized               → skill missing, or its name differs from its directory (validate-config S11)
├─ Switched agent but ineffective             → confirm the agent is actually selected in Chat agent selector; check whether *.agent.md tools are too narrow
├─ Dangerous operation not blocked            → deny-dangerous.js schema; grep hookSpecificOutput.permissionDecision
├─ Quality gate empty-runs/does not block     → package.json lacks test/lint/typecheck scripts (hook uses --if-present)
├─ bmad-* cannot be invoked                   → confirm the skill exists under ~/.agents/skills/; check name spelling
└─ Global rules ineffective                   → confirm path is exactly .github/copilot-instructions.md (S1)
```

## 9.2 "Is this a rule, prompt, agent, or hook problem?"

| Symptom | Most likely root cause | How to verify |
|---|---|---|
| Wrong only for a certain file class | **rule** (applyTo) | Try another file type to see whether it reproduces |
| Wrong in every file, wording conflicts | **rule** (multiple always-on conflicts) | `/eos-validate-config` |
| Entering `/x` has no effect | **skill** (name/frontmatter) | Check that `.agents/skills/x/SKILL.md` exists, its `name` is `x` and it has a description (validate-config S11); Claude Code: `eos agents sync --check` |
| Flow skips steps or persona is wrong | **agent** (not switched/handoff) | Check current Chat agent; inspect handoffs config |
| Dangerous command passes / quality gate does not run | **hook** (schema/script/script lacks scripts) | Feed JSON using the manual test commands in 7.5 |

## 9.3 Common pitfalls (tested)

- **VS Code opened the parent directory, not the project root** → `eos-*` agents, `.github/instructions`, and `.github/hooks` all silently fail (most common pitfall). Run `code .` from inside the project directory; Explorer top level should directly show `.github/` (see 7.2's 30-second self-check).
- `code --version` returning `3.0.12` is a shim, **not the real version**; check the VS Code About panel for the real version.
- Private template `npx degit user/repo` fails → must use `npx degit --mode=git user/repo`.
- PreToolUse used the wrong schema (`decision:"block"` belongs to PostToolUse) → cannot block. Correct is `hookSpecificOutput.permissionDecision:"deny"`.
- Multiple `applyTo:"**"` files are **not** conflicts (thin, complementary, single-responsibility); validator S3 exempts them.
- Editing `docs/prd.md` does **not** invalidate every story. Story evidence is bound to the criteria each story *cites*, so adding or rewriting an unrelated `AC` leaves the rest of the backlog fresh; rewriting or deleting a criterion a story cites correctly makes that story `STALE`. Verification (G7) is bound to the product tree as well, so a PRD edit still re-opens it.
- **Claude Code does not list `/eos-next`** → `.claude/skills/` is missing or out of date: run `node .github/eos/eos.mjs agents sync --write`, and check that `agentPlatforms` includes `claude`.
- **Codex ignores `.codex/`** → the project is not trusted, or the hook is not approved yet: trust the project, then run `/hooks` (§6.6.2).
- **Antigravity cannot find a BMAD skill** → it reads global skills from `~/.gemini/config/skills/`, not `~/.agents/skills/` (§6.6.3).
- **Every tool call in a VS Code agent session is refused with "hook errored"** → the Claude Code hook in `.claude/settings.json` cannot run; see §6.6.7.

---

# Chapter 10 Cross-project reuse and distribution

## 10.1 What goes where (key layering)

| Layer | Location | What to put there | Characteristic |
|---|---|---|---|
| **User-level (shared across all projects)** | `~/.agents/skills/`, `~/.claude/skills/` | 73 generic `bmad-*` capabilities | Installed, does not travel with project |
| User-level agents (optional) | `~/.copilot/agents/` | `eos-*.agent.md` files you want globally | Visible to all projects |
| **Workspace-level (travels with project)** | project `.github/` + `docs/` | EOS rules/prompts/agents/skills/hooks + docs | Travels with repo, shared by team |

> Principle: **generic capabilities go user-level; project-specific items go under `.github/`**. Putting project-specific items at user level = cross-project pollution (anti-pattern P13).

## 10.2 One-command new project initialization

```sh
# Method A: degit (public repository — no auth needed)
# Pin the release tag: the default branch moves, a tag does not.
npx degit niaodian/eos#eos-2.6.0 my-app
cd my-app && git init

# Method B: git clone at the tag, into a fresh history
git clone --depth 1 --branch eos-2.6.0 https://github.com/niaodian/eos.git my-app
cd my-app && git checkout --orphan main && git commit -m "chore: start from eos-2.6.0"

# Either way, declare the project: the template's own declaration describes EOS, not you
node .github/eos/eos.mjs init                       # the tracks, the packs, and what is declared
node .github/eos/eos.mjs init config-only --write   # no code yet — or <pack>, with --track regulated if it applies (--solo: one maintainer)
git add -A && git commit -q -m "chore: declare the project"   # the declaration, with this project's policy lock and SBOM
```

## 10.3 Distribution to a team (purely local, no enterprise dependency)

1. Everyone starts from the **same release tag** (`eos-2.6.0`). The default branch keeps moving, so
   an unpinned copy is a slightly different EOS for every person who takes one.
2. `【Needs org/GitHub settings】` The GitHub **template repository** setting is owner-level: EOS can
   neither apply nor verify it locally, so do not take this page's word for it —
   `gh repo view niaodian/eos --json isTemplate` answers in one line, and the answer can change
   without anything in this repository changing. `gh repo create --template` works while it is
   `true`; the pinned `degit` / `clone` above work regardless and are what pin a *version*.
3. Shared `bmad-*` skills are installed by each person at user level (once). Verify with
   `node .github/hooks/eos-doctor.mjs --deep`: it reports BLOCKED rather than PASS when a mapped
   skill is installed but cannot activate in this project.
4. **Do not** write any enterprise intranet/interface/SSO dependency into configuration--keep it offline-runnable.

> `【Optional · needs enterprise env】`: org-level instructions distribution, private registry, cloud agents--
> these are not on the main path; add them separately as needed without affecting local self-containment.

## 10.4 Versioning and upgrades

- Every EOS configuration change: update `docs/eos/VERSION` (e.g., `eos-1.4.1`→`eos-1.6.0`), run `validate-config.mjs`, commit with Conventional Commits.
- Upgrading existing projects (2.1.0+): `eos upgrade --from <new template> --base <the template you started from>` — a dry run by default, `--write` to apply. Per file it compares the two templates with your copy: what only EOS changed is updated, what only you changed is kept, and a file both changed is never overwritten — the new version is parked under `.eos/local/upgrade/` for a hand merge. Your declaration, evidence, ledger, waivers, stories and README are never touched. Fetch both templates yourself (degit or the attested release tarball) and run the NEW version's CLI; number your own ADRs from 100 ([ADR-015](../adr/015-three-way-upgrades.md)). User-level `bmad-*` upgrades independently.
- What changed: `eos upgrade` prints the entries of [CHANGELOG.md](CHANGELOG.md) between your version and the new one (since eos-2.3.0). EOS releases on trains — at most one minor version a week, patches only for security fixes and regressions, breaking changes only in a minor — and the stable choice is the newest minor that has been out a week without a patch ([CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence)).

### 10.4.1 Upgrading from `eos-1.12.0` to `eos-1.13.0`

This release closes the findings of the `eos-1.12.0` audit. It is deliberately **fail-closed**: an
existing repository will go red before it goes green, and each red line names exactly what to add.

| What changed | What you will see | What to do |
|---|---|---|
| **Evidence is bound to the tested product tree** (EOS-AUD-001) | Every previously recorded gate result is `STALE` ("evaluator version changed", "predates tested-product-tree binding") | Re-run the gates: `eos check --gate story-ready --scope <id>` then `eos check --gate verified --scope <id>`. Nothing is lost — the old evidence is still readable, it is simply no longer *current*. |
| **G1 / G2 / G-UX / G4 are real gates** (EOS-AUD-003) | The product state resets toward `UNINITIALIZED`, and `eos next` asks for `docs/discovery.json`, `docs/requirements.json`, `docs/design.json`, `docs/architecture.json` | Write the four structured records beside the documents you already have. The prompts (`/eos-requirements`, `/eos-ux-spec`) and agents produce them; the schemas are in `.eos/schemas/`. |
| **Product states renamed** | `PRD_APPROVED` → `PRD_BASELINED`, `ARCHITECTURE_APPROVED` → `ARCHITECTURE_BASELINED`, plus a new `UX_BASELINED` | Nothing. Product state is *derived*, so no ledger rewrite is needed. The rename exists because a machine finding a document complete is not a human approving it. |
| **Acceptance criteria must be defined, not mentioned** (EOS-AUD-004) | `prd-ready` reports "referenced but never defined: AC…" | State each criterion as a list item, table row or heading that opens with its id and carries the text. |
| **Operational tasks need a decision** (EOS-AUD-005) | `story-ready` reports `Telemetry: "SKIP" with no reason` | Use `ADOPT — <task>; owner: <who>; verify: <how>`, `SKIP — <reason>`, or `DEFER — owner: <who>; trigger: <what ends it>`. |
| **Trace rows need a machine result** (EOS-AUD-006) | `verified` reports "a hand-written PASS … is a claim, not a result" | Emit `docs/evidence/test-run.json` from your runner — see [examples/trace-evidence](examples/trace-evidence/README.md). Since eos-2.2.0, declaring `evidence.junit` replaces that mapping step. |
| **The release gate checks what the prompt asks for** (EOS-AUD-007) | `release-ready` adds candidate quality, dependency audit, NFR evidence, canary, health/readiness, topology and enforcement authority | Declare `commands.audit`, record `docs/evidence/nfr-summary.json`, and extend `ops/runbook.md`. An offline audit is `DEFERRED`, never green — and cannot be promoted. A deferred NFR target can be, on the Standard track, with an owner, a trigger and a future `dueBy` (§10.13). |
| **RELEASED continues into G9 and G10** (EOS-AUD-010) | After `RELEASED`, `eos next` asks for telemetry rather than another release | Produce `docs/telemetry.json` (`/eos-telemetry-plan`), then `docs/iteration.json` (`eos-review` agent). |
| **BMAD runtime is verified** (EOS-AUD-002) | `eos-doctor --deep` may report BLOCKED: skills installed, `_bmad/` runtime absent | Install the BMAD project runtime with its own installer, or unmap those skills. EOS itself works without BMAD — see [ADR-003](../adr/003-bmad-runtime-boundary.md). |

**Nothing about this upgrade is silent.** If a gate cannot be proven — no git repository, no
toolchain, no network for the dependency audit — it reports BLOCKED or DEFERRED. It never reports
PASS, and it never quietly skips.

Fastest path for an existing repository:

```sh
node .github/eos/eos.mjs next        # tells you the ONE next thing, every time
node .github/hooks/eos-doctor.mjs --deep
```


### 10.4.2 Upgrading from `eos-1.13.x` to `eos-1.14.0`

One thing changes that needs a decision from you; the rest is automatic.

**You must state what each release ships.** The release gate no longer assumes "every story that
exists" belongs to every release — that assumption re-verified finished work against every future
candidate, made two release trains impossible, and let an approval survive a change to what was
being approved.

```sh
node .github/eos/eos.mjs release init --release <id>   # proposes a manifest from the current state
$EDITOR .eos/releases/<id>.json                        # you decide: replace every TODO reason
node .github/eos/eos.mjs check --gate release-ready --scope <id>
```

`release init` proposes only stories that are **already verified**, and lists everything else as an
exclusion carrying a `TODO` you must replace. It will not decide for you, and the gate rejects a
manifest that leaves any story unaccounted for.

| What else changed | What you will see | What to do |
|---|---|---|
| **Approvals are bound to the manifest** | `what this release ships changed after it was approved` | Re-approve. This is the point: consent was given to a specific set of changes. |
| **Machine summaries carry a `producer`** | `docs/evidence/*.json … producer is required` | Add `"producer": { "type": "local", "name": "<your runner>" }`. Use `"type": "ci"` when it really is CI. |
| **Evidence trust is reported** | `evidence-trust — test-run: UNATTESTED_LOCAL …` | Nothing, by default: local evidence passes. A **regulated** product is BLOCKED on it, and any project can require better via `requiredEvidence` in the manifest. |
| **G10 write-back binds content** | `specWriteBack[0].targetDigest is required` | Record the SHA-256 of each updated spec *after* you updated it, so a later revert is visible. |
| **Project root is explicit** | `doctor --deep` prints `PROJECT root … (selected by …)` | Nothing. Use `--project-root` or `EOS_PROJECT_ROOT` when the answer should not be inferred. |
| **Project skills beat user skills** | a project copy (`.github/skills/<name>`; since eos-2.2.0 `.agents/skills/<name>`) now wins | Nothing, unless you relied on a user-level skill shadowing a project one — which was never intended. |

Recorded evidence from 1.13.x becomes `STALE` (the gate versions moved) and is cleared by re-running
the gates. Nothing needs hand-editing, and nothing is silently reinterpreted.


### 10.4.3 Upgrading from `eos-1.15.x` to `eos-1.17.0`

Nothing needs a decision from you, but one gate can newly fail on an existing project.

| What changed | What you will see | What to do |
|---|---|---|
| **The locked stack must reach the always-on rule** | `architecture-ready` fails with `… still carries the PROVISIONAL placeholder` | Declare the stack in `.eos/project.json`, then run `node .github/eos/eos.mjs stack sync --write` — it renders the `Local commands` block from that declaration. Your ADR was never the problem: no later agent reads it, they all read that rule, so a surviving ⛳ marker kept telling them to run `npm ci` on a Python project. |
| **Story evidence follows the criteria a story cites** | Most story evidence is `STALE` once (`gate definition version changed`), then stops going stale for unrelated PRD edits | Re-run `eos check --gate story-ready --scope <id>`. From here, adding or rewriting a criterion your story does **not** cite leaves it fresh — which is what makes specifying a whole backlog up front affordable. |
| **Stage agents run their own gates** | Stages end with a preview, a confirmation request, the gate output and the next stage named | Nothing. If an agent still hands you a command to paste, it is not following `05-stage-closeout` — say so. |
| **Optional answer language** | Nothing, unless you set it | Add `"language": "zh-CN"` (any BCP-47 tag) to `.eos/project.json` to fix the language agents reply in. A non-tag value is now an error rather than a silent fallback to English. |
| **The workspace rule cannot contradict the stack** (S14) | `validate-config` fails with `… describe a node project … but .eos/project.json declares python` | Replace the `Local commands` block. S14 compares which **stack** a command belongs to, never its wording, so `npm test` and `npm run test` are the same thing; a stack-agnostic command (`make test`) and `stacks: ["other"]` are never reported. |

Recorded evidence becomes `STALE` once because the gate versions moved; re-running the gates clears
it. No ledger rewrite, no hand-editing.


### 10.4.4 Upgrading from `eos-1.17.x` to `eos-1.18.0`

Additive. Nothing you already have stops working, but three things behave differently and one is a
correctness fix you want.

| What changed | What you will see | What to do |
|---|---|---|
| **The ledger is safe under concurrent writers** | Nothing, unless you had it | `appendEvent` took no lock, so two processes writing at once (two agents, a hook racing a terminal, CI racing a local run) forked the hash chain and `ledger --verify` then reported tampering that never happened. Evidence, waivers, manifests and the head record are now written atomically too. If you ever saw an unexplained "the ledger was rewritten", this was why. |
| **A repository with no product code no longer reports PASS** | `project-gate` ends with `NOT_APPLICABLE: no product code was verified`; `status` and `doctor` say `NO PRODUCT CODE VERIFIED` | Nothing — the exit code is still 0. If you were reading that PASS as "the code is verified", it never meant that. Declare `application`/`library` with `commands.test` when code lands. |
| **Gate results carry their own provenance** | `check --json` gains `policySource`, `affectedArtifacts`, `rerunCommand`, `waiverEligible`; each check gains `artifact` | Nothing. Consumers that parsed prose can read fields instead. |
| **A file from a NEWER EOS now fails closed** | `EOS ERROR — this repository was written by a newer version of EOS` | Upgrade EOS. `eos migrate` explains the gap and never rewrites a file it does not fully understand. |

New commands, all optional: `verify` (run only the gates a change can have affected), `health`
(blockers, stale evidence, waivers, trend), `migrate`, `sbom`, `docs` (generate the gate
reference, state diagrams and evidence graph from the policy), and `new` (scaffold
`.eos/project.json` from a starter pack).

Two new workflow profiles sit above `standard-product`: `controlled` permits no waivers at all,
and `regulated` additionally requires a recorded reason for every change classification. Each tier
is strictly no weaker than the one below it, and a test enforces that. Switch with
`workflowProfile` in `.eos/project.json`, then re-verify:
`node .github/eos/eos.mjs verify --full`.

### 10.4.5 Upgrading from `eos-1.18.x` to `eos-1.19.0`

One gap closed. Nothing you have stops working.

| What changed | What you will see | What to do |
|---|---|---|
| **The ledger has a merge policy** | `git merge` now CONFLICTS on `.eos/ledger/events.jsonl` instead of producing a chain that `ledger --verify` later rejects | Run `node .github/eos/eos.mjs ledger --resolve` to see the plan, then `--write`. Both sides are replayed into one chain in timestamp order; every event is kept. |
| **A merged ledger is no longer called tampering** | `MERGE DIVERGENCE, not tampering` instead of `the ledger was rewritten` | Nothing. The old message accused whoever ran `git merge` of rewriting history. |

The `.gitattributes` rule is what forces the conflict. If you scaffolded before 1.19.0, copy these
two lines into your own `.gitattributes` — without them git will merge the ledger textually and
report success on a chain that is already broken:

```gitattributes
.eos/ledger/events.jsonl -merge
.eos/ledger/head.json    -merge
```

### 10.4.6 Upgrading from `eos-1.19.x` to `eos-1.20.0`

Nothing you have stops working. One new file should be committed, and the ledger messages that
used to accuse you of tampering now say what actually happened.

| What changed | What you will see | What to do |
|---|---|---|
| **No gate gets weaker silently** | A new CI step, `eos policy check`, compares `.eos/gates.json`, `.eos/workflow.json` and `.eos/project.json` with the base branch. Any loosening fails: a gate made `not_applicable`, a check removed, `config-only`, a weaker profile, a quality command removed. | Run `node .github/eos/eos.mjs policy lock --write` once and commit `.eos/policy.lock.json`. Until then, a change that weakens nothing still passes; one that does fails. |
| **A weakening needs a second person** | `eos policy lock --write --reason "<why>"` drafts the acknowledgement with an EMPTY `approver` | Someone other than the requester fills in `approver` and commits it. `eos policy diff` lists every change, classified. |
| **Stricter schemas are breaking changes** | A schema that now rejects files that used to pass is reported `BREAKING` | Bump the governed file's `schemaVersion` and register a migration, or acknowledge it like a weakening. |
| **Two runs of one gate no longer look like tampering** | Evidence and its ledger entry are written as one unit. A run stopped halfway is reported as `INTERRUPTED`, with the command that completes it. | Nothing. If `doctor` shows `INTERRUPTED`, re-run the command it names. |
| **A merge re-checks status history** | After `eos ledger --resolve`, a story both branches moved is reset to the last state both agreed on, by a `reconcile` entry | Re-run that story's gates. If you resolved a merge with 1.19.0, `ledger --verify` may now ask you to run `--resolve --write` once. It only appends; nothing earlier changes. |
| **You are told before the merge** | `status`, `next` and `verify` warn when the base branch is moving a story you are also moving | Coordinate, or expect the reconcile above. EOS compares with your local refs and never fetches. |
| **Focus is per branch** | `eos resume` no longer hands back another branch's story | Nothing. A focus saved before 1.20.0 is still honoured. |
| **Tests are bounded and timed** | Every test has a time limit; `run-tests.mjs` prints per-file times; `eos health` shows the local test-time trend | Nothing. To watch for slow creep in your own CI, set `EOS_TEST_BASELINE_ENV` and record a baseline with `--record-baseline`. |

Commit `.gitignore` too: it now ignores `.eos/ledger/pending.json`, a transient record that exists
only while a gate run is in progress.

### 10.4.7 Upgrading from `eos-1.20.x` to `eos-1.21.0`

For most projects nothing changes. One declaration that used to be accepted is now refused, and the
CLI's files moved.

| What changed | What you will see | What to do |
|---|---|---|
| **The `regulated` profile requires the compliance boundary** | With `"workflowProfile": "regulated"` but no `"complianceProfile": "regulated"`, every command exits 3 (`ERROR`) and `validate-config` fails `S13` | Add `"complianceProfile": "regulated"` with an `"evidencePolicy"` (`ci` or `attested`), or choose a different profile. A profile for regulated work must not pass on evidence the compliance boundary would refuse. |
| **The CLI is split into command modules** | `.github/eos/eos.mjs` is now a small entry point; the handlers live in `.github/eos/commands/` | When you merge the new `.github/` into your project, take `.github/eos/commands/` too — `eos.mjs` does not start without it. Commands, flags, output and exit codes are unchanged. |
| **The policy lock records the compliance requirement** | Dropping `requiresCompliance` from a profile is a `WEAKENING` in `eos policy diff` | If you committed `.eos/policy.lock.json`: after merging the new `.eos/workflow.json`, `policy check` fails because the lock is out of date, even though the change only strengthens. Run `node .github/eos/eos.mjs policy lock --write` once and commit it; no acknowledgement is needed. |
| **Unknown command names are always unknown** | `eos constructor` or `eos toString` used to crash with exit 1; now they are unknown commands (exit 3), like any typo | Nothing. |
| **Piped output arrives whole** | On macOS and Windows a large `--json` document piped to another program could arrive cut off (at 8 KB on Node 20): the CLI exited before the pipe had drained | Nothing. A script that retried or skipped unparseable EOS output no longer needs to. |
| **Every test layer runs on Windows and macOS** | The `cross-platform` CI job runs all five layers, not only unit and contract | Nothing. On a runner slower than GitHub's, `EOS_LAYER_TIMEOUT_MS` raises the per-layer backstop, as `EOS_TEST_TIMEOUT_MS` already does per test. |

Merge `.eos/schemas/` together with `.eos/workflow.json`: the old schema does not know
`requiresCompliance` and would reject the new workflow file.

### 10.4.8 Upgrading from `eos-1.21.x` to `eos-1.22.0`

Nothing you have stops working, unless one of your prompts cites a name the policy does not define.
Then CI names the file and the line.

| What changed | What you will see | What to do |
|---|---|---|
| **Hooks report their verdict as data** | `project-gate.mjs --json` and `eos-doctor.mjs --json` write one report to stdout (`.eos/schemas/diagnostic.schema.json`), and `eos check --json` and `eos verify-release --json` add `problems[]` | Nothing. Without `--json` the hooks print exactly what they did before, and no exit code changed. |
| **A failing test is FAIL, even when it prints "BLOCKED"** | `verified` and `release-ready` read project-gate's verdict instead of searching its output, and a test suite that prints more than 1 MB no longer turns into `ERROR` | Merge `.github/hooks/` together with `.github/eos/`. With an older project-gate the gates report a named `ERROR` ("did not produce a valid diagnostic report"), never a pass. |
| **Prompts may cite only what exists** | `validate-config` S15 fails on any gate, gate code, command, state, transition, `/prompt`, agent or script that a prompt, agent, instruction, skill or agent-map handoff cites and the policy does not define. It names the file and line, and suggests the closest name. | Fix the citation it names. A gate code your method uses that has no gate of its own is declared on the gate that enforces it (`enforces` in `.eos/gates.json`), as `verified` does for G6 and G-EVAL. |
| **The agent map is generated in both languages** | `eos docs --write` adds `docs/eos/generated/actions.md` and `docs/zh/generated/actions.md` | Run `node .github/eos/eos.mjs docs --write` once and commit both; `docs --check` keeps them current. |
| **Schema errors name the value** | Length and bound errors read "0 is below the minimum 1" and "is 3 character(s), shorter than the minimum 64" | Nothing, unless a script of yours matched the old wording ("string shorter than", "< minimum"). |

Merge `.eos/schemas/` together with `.eos/gates.json`: the old gate schema does not know
`enforces`. A committed `.eos/policy.lock.json` stays valid, because `enforces` documents the
policy and does not change it.

### 10.4.9 `evidencePolicy` — how much provenance your release evidence needs

`docs/evidence/*.json` is bytes on disk. A summary emitted by a verified CI run and one typed by a
person are identical bytes, and `producer` is the only thing that separates them — a **claim**, not a
proof. So the project states how much provenance it requires, and EOS enforces *that*:

| `evidencePolicy` | Release evidence must be… |
|---|---|
| `local` (default) | anything, including produced on a laptop — honest, and fine for most projects |
| `ci` | produced by a CI producer (`"producer": { "type": "ci", … }`) |
| `attested` | carrying provenance an adapter can verify (Core verifies none itself) |

**A regulated project must declare it.** Leaving it unset fails, because "nobody decided" is not a
policy. It may legitimately choose `local` — an **air-gapped** environment cannot reach an
attestation authority at all, and refusing to ship there would exclude exactly the users who need
governance most — but the reason must be written down:

```jsonc
{
  "complianceProfile": "regulated",
  "evidencePolicy": "local",
  "evidencePolicyReason": "Air-gapped network; no external attestation authority is reachable."
}
```

This is the same shape as SKIP / DEFER everywhere else in EOS: **a blank is refused; a stated
decision is respected.** See [ADR-005](../adr/005-external-authority-boundary.md).


### 10.4.10 Provider adapters — letting EOS ask an authority it cannot be

Two things a program on your laptop cannot know: whether the server really enforces branch
protection, and whether a build came from the pipeline it claims. EOS reports both honestly
(`BLOCKED` / `UNVERIFIED`) and stops there. An adapter is how a project that *can* reach those
authorities gets a real answer.

**Absent by default.** With no `.eos/providers.json`, nothing changes: every gate still reaches a
verdict offline. To opt in:

```jsonc
{
  "schemaVersion": 1,
  "providers": [
    { "adapter": "github-governance", "subjects": ["enforcement-authority"],
      "options": { "branch": "main", "requiredChecks": ["verify"], "minApprovals": 1 } }
  ]
}
```

```sh
node .github/eos/eos.mjs providers      # what is configured, and what it says right now
```

**The rule that makes this safe: only a `PASS` may raise a verdict.** A provider that is absent,
unreachable, unauthenticated, timed out or crashed leaves the verdict *exactly* as it was before any
adapter existed — so adding one can never make you worse off, and never introduces a new blocker.
Not knowing is not evidence.

**Only `activation` and `release-ready` consult a provider.** The development loop (G1–G7) never
does, so no provider problem can block day-to-day work.

**EOS never handles a credential.** Adapters delegate to `gh`, which is already authenticated and
keeps the token in its own store — EOS passes none, reads none, and can leak none. And EOS is
**read-only**: it will tell you branch protection is missing; it will never configure it for you,
because a tool that can grant itself enforcement authority can also remove it.

See [ADR-005](../adr/005-external-authority-boundary.md) and
[ADR-006](../adr/006-provider-adapters.md).

## 10.5 Upgrading from `eos-1.22.x` to `eos-2.0.0`

`eos-2.0.0` is a major release. It adds the two governance tracks, signed release manifests, attested
CI releases, central policy distribution and governance reports (all in §10.6), and it changes how a
project is declared. Everything else — the CLI, exit codes, evidence, ledger and waiver formats — is
unchanged.

**What changes for an existing project**

1. **The template's declaration is marked as the template's.** EOS ships its own `.eos/project.json`
   with `"templateDefault": true`. Keep your own declaration when you merge — never take the
   template's. If a project still has the template's declaration, the `project-declaration`
   activation check fails and `eos next` sends you to `eos init`.
2. **`eos init` declares the project.** In 1.x, `init` only created local VS Code tasks. Now
   `eos init` shows what is declared, the two tracks and the starter packs; `eos init <pack> --write`
   writes the declaration; `eos init --write` still creates the local files. A declaration your
   project already made is never replaced without `--force` — except `config-only`, which takes a pack
   when code lands and keeps its track. `eos new <pack>` still works.
3. **`release-ready` is now version 4.0.0**, with two new checks: `manifest-signature` and
   `release-integrity`. On the Standard track a missing signature or artifact list is
   `NOT_APPLICABLE`; on both tracks, anything present must verify. Release evidence recorded by
   release-ready 3.x is stale, so re-run the gate before you release.
4. **A Regulated project needs a release key and provenance.** Under `complianceProfile: "regulated"`
   the release gate requires a signed manifest and provenance for every shipped artifact (§10.6.2,
   §10.6.3). Generate the key once and store its private half as the `EOS_RELEASE_SIGNING_KEY`
   repository secret if CI signs your releases.
5. **The policy lock must be re-recorded.** The upgrade strengthens `release-ready`, so
   `eos policy check` reports that the policy changed since the lock was written. Nothing gets weaker,
   so no reason or second approver is needed.

**Upgrade steps**

```sh
# 1. Merge the new template's .github/ and .eos/ (gates.json, workflow.json, agent-map.json,
#    schemas/) — keep your own .eos/project.json, evidence, waivers, ledger and releases
# 2. Check the declaration and the track
node .github/eos/eos.mjs init
# 3. See what the upgrade changed in the policy, record it, and regenerate the derived docs
node .github/eos/eos.mjs policy lock
node .github/eos/eos.mjs policy lock --write
node .github/eos/eos.mjs docs --write
# 4. Re-verify: evidence recorded under the previous gate versions is stale
node .github/eos/eos.mjs verify --full
```

> If the template's package.json reaches your repository root, EOS treats it as tooling, not as a
> Node project: it becomes product code as soon as it has a dependency, an entry point or a script
> that runs something other than EOS — and `eos next` then sends you to `eos init` to declare the stack.

## 10.6 Governance tracks, signed releases and central policy

### 10.6.1 Choosing a governance track

A project is on one of two tracks. The track is derived from the declaration — the Regulated track is
exactly `complianceProfile: "regulated"` — so there is no third setting that could disagree with what
is enforced. `eos status` and `eos next` show the track and what a release on it must carry.

| | Standard (default) | Regulated |
|---|---|---|
| Choose it | `eos init <pack> --write` | `eos init <pack> --track regulated --write` |
| Release evidence | may be recorded locally | must come from CI (`evidencePolicy` `ci` or `attested`) |
| Signed release manifest | verified when present, never required | required |
| Provenance for every artifact | verified when present, never required | required |
| Missing signature at release | `NOT_APPLICABLE`, with the command that adds it | `FAIL` — the release is blocked |

**Day one, no code yet:** `eos init config-only --write` (add `--track regulated` if it applies). The
product gate then reports `NOT_APPLICABLE`, never `PASS`. When code lands, `eos next` sends you to
`eos init`, which names the packs that match the code it finds; `eos init <pack> --write` replaces the
config-only declaration without `--force` and keeps your track.

**Changing track later** is deliberate: `eos init <pack> --track <track> --force`. Moving from
Regulated to Standard weakens the policy, so `eos next` and `eos status` show it until
`eos policy lock --write --reason "<why>"` records it and a second person signs it off as the approver
in `.eos/policy.lock.json` — EOS records that approval; it never grants it.

### 10.6.2 Signed release manifests

```sh
node .github/eos/eos.mjs release keygen --write                # once per project
node .github/eos/eos.mjs release init --release v1.4.0         # scaffold the manifest
node .github/eos/eos.mjs release bind --release v1.4.0         # bind artifacts, SBOM and ledger head
node .github/eos/eos.mjs release sign --release v1.4.0 --key ~/.config/eos/keys/my-app-release.pem
node .github/eos/eos.mjs release verify --release v1.4.0       # signature, artifact digests, provenance
```

- `release keygen` writes the public key to `.eos/keys/release.pub`, declares it in
  `.eos/project.json` → `release.signing.publicKey`, and writes the private key outside the repository
  (`~/.config/eos/keys/<repo>-release.pem`, mode 600). It refuses any private-key path inside the
  repository, even through a symlink, and `secret-scan` catches one that gets committed anyway.
- `release bind` records what ships — the files listed in `release.artifacts` (for example
  `"dist/*.tgz"`) with their SHA-256 digests — plus the SBOM and the committed ledger head. It appends
  nothing to the ledger.
- The signature is Ed25519 over the manifest's canonical JSON, so a CRLF checkout or a re-indented
  file still verifies, while any change to the content does not. Signing never changes the digest
  approvals are bound to.
- The release gate checks both on the candidate commit: `manifest-signature` (a wrong signature always
  fails; a missing one fails only on Regulated) and `release-integrity` (every listed artifact matches
  its digest, and on Regulated is covered by provenance).

### 10.6.3 Attested releases in CI

`.github/workflows/eos-release.yml` builds and attests your releases. Pushing a `v*` or `eos-*` tag runs
it; a pull request that touches it runs a dry run that attests but publishes nothing.

1. **plan** — reads the track from `.eos/project.json` (the workflow keeps no copy of the rule).
2. **build** — replace this step with your real build; everything in `dist/` is attested. The default
   ships the repository as a source archive with its SBOM and `SHA256SUMS`.
3. **attest** — GitHub artifact attestations (SLSA v1 provenance), on both tracks.
4. **slsa** — Regulated only: the SLSA Build Level 3 generator, pinned to a release tag.
5. **manifest** — binds and, with the `EOS_RELEASE_SIGNING_KEY` secret, signs the release manifest.
6. **publish** — a draft GitHub release with every asset; nothing is published until every job the
   track requires has succeeded.

Only the jobs that need it get `id-token: write`; `eos-ci.yml` gets none. Verify a release with
`gh attestation verify <file> --repo <owner>/<repo>`, and bind the provenance to the manifest offline
with `eos release verify --release <id> --provenance <file>`. To exercise the Regulated path without
publishing, dispatch the workflow on your default branch with `track=regulated`.

### 10.6.4 Central policy distribution

An organisation publishes one policy baseline; every repository vendors it and enforces it offline.

```sh
# In the organisation's policy repository
node .github/eos/eos.mjs policy export --name acme-baseline --version 2026.10 --sign --key <private-key>
# In each project: declare "policyUpstream" in .eos/project.json, then
node .github/eos/eos.mjs policy sync --check    # what would change — writes nothing
node .github/eos/eos.mjs policy sync            # vendor .eos/policy.upstream.json and pin its digest
node .github/eos/eos.mjs policy check           # offline, in CI: is anything weaker than the baseline?
```

- `policyUpstream.source` is an `https://` URL (plain `http` only on loopback, redirects refused) or a
  `file:` path to a checkout of the policy repository; `policyUpstream.publicKey` is the key a signed
  baseline must verify against.
- `policy sync` is the only command that fetches policy. `policy check` stays offline: it compares
  your policy with the vendored baseline, and anything weaker is a `WEAKENING` with an `upstream:` id,
  which needs a reason and a second person like any other weakening.
- The floor cannot be removed quietly: re-locking keeps the digest `policy sync` pinned, a signed
  baseline is re-verified on every `policy check`, and removing `policyUpstream` — or pointing it
  elsewhere — is itself a `WEAKENING`.

### 10.6.5 Governance reports

```sh
node .github/eos/eos.mjs report --format markdown --out governance.md
node .github/eos/eos.mjs report --org team-a.json team-b.json --format markdown
```

One repository's report covers the track, every gate's latest verdict and pass rate from the ledger,
waivers, the policy lock, the SBOM and its freshness, release signatures and an `attention` list. `--org` aggregates
the JSON reports of many repositories. Every report is validated against its published schema
(`governance-report`, `governance-org-report`) before it is written.

See [ADR-012](../adr/012-supply-chain-trust-model.md) and
[ADR-013](../adr/013-central-policy-distribution.md).

## 10.7 Upgrading from `eos-2.0.0` to `eos-2.0.1`

A security patch for the two secret guards: the PreToolUse hook (`deny-dangerous.js`) and the scanner
(`secret-scan.mjs`, run by CI and by the release-ready `secret-scan` check). The policy, the gates, the CLI,
evidence, the ledger and waivers do not change, so there is nothing to re-lock or re-verify. The scanner
now reads lines it used to skip, though, so a project that passed on 2.0.0 can fail on 2.0.1 — and when it
does, a hardcoded value was hiding there.

| What changed | What you will see | What to do |
|---|---|---|
| **One rule set for both guards** — `.github/hooks/lib/secret-rules.mjs` | The hook and the scanner agree on what is a secret and what is a placeholder; before, they had drifted apart | Nothing — it arrives with `.github/hooks/` |
| **Lines that read an environment variable are scanned** | A literal fallback is reported: `process.env.X \|\| "<LITERAL>"`, `os.environ.get("X", "<LITERAL>")`, `env("X", "<LITERAL>")`, `${X:-<LITERAL>}`, and a key on a line whose comment names an env var | Remove the literal; keep the value in the environment or a secret store. A development default must be an obvious placeholder (`change-me`, `<TOKEN>`) |
| **More credential forms and key formats** | JSON keys (`"password": "<VALUE>"`), Django's `SECRET_KEY`, unquoted `key=value` in `.properties` / `.ini` / `.cfg` / `.conf`, project-scoped OpenAI keys, Anthropic keys, fine-grained GitHub tokens, Stripe live keys and encrypted or PGP private keys | The same: move the value out, or replace it with a placeholder |
| **The hook reads each field of a tool call as itself** | A double-quoted credential is denied (it used to slip through as an escaped `\"`); two lines of a file are no longer read as one command; documentation may name a command; the old text an edit replaces is not judged; a payload it cannot parse is scanned instead of allowed | Nothing. An agent that was blocked from writing documentation that merely mentions a command is no longer blocked |
| **An obvious placeholder is not a secret for the hook either** | `.env.example` values such as `change-me` or `<TOKEN>` are no longer denied | Nothing |

**Upgrade steps**

```sh
# 1. Take the new template's .github/hooks/ (deny-dangerous.js, secret-scan.mjs and lib/secret-rules.mjs)
# 2. Scan, and move every reported value out of the code
node .github/hooks/secret-scan.mjs
```

## 10.8 Upgrading from `eos-2.0.x` to `eos-2.1.0`

The first upgrade you can do with `eos upgrade` itself — run the 2.1.0 CLI against your project. The
gates, the policy and the evidence formats do not change; what changes is what EOS gives you to
satisfy them.

| What changed | What you will see | What to do |
|---|---|---|
| **`eos upgrade`** ([ADR-015](../adr/015-three-way-upgrades.md)) | An upgrade is a three-way comparison per file: updated, kept, or parked under `.eos/local/upgrade/` for a hand merge — never overwritten | Use it for this upgrade (below) and every later one. Number your own ADRs from 100 |
| **The eval-starter writes the summary G-EVAL reads** | `docs/evidence/eval-summary.json`, bound to the product tree; a stdlib-only Python twin in `python/` | Agentic products: re-copy the starter (or add `summary.mjs` and its `writeSummary` call to your runner) and cite its `EVAL-n` ids in your stories |
| **`init --write` creates the approval baseline** | `.vscode/settings.json` from the committed example; `eos-doctor` D8 warns when it is missing or loosened | Run `node .github/eos/eos.mjs init --write` once on each machine |
| **Docs** | The quickstart's *What you need for what* and *Known limitations*; ADR-014 (the trust chain); SaaS step 7 and Agentic steps 6–7 now name the machine summaries the gates read | Read the known limitations once |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.0.1 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.1.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it
node .github/eos/eos.mjs policy lock && node .github/eos/eos.mjs verify --full
```

---

## 10.9 Upgrading from `eos-2.1.x` to `eos-2.2.0`

The gates do not get stricter for a project that changes nothing. What changes is the slash commands'
names and format, and how much of the evidence EOS now produces for you.

| What changed | What you will see | What to do |
|---|---|---|
| **Slash commands are Agent Skills** ([ADR-017](../adr/017-workflows-are-agent-skills.md)) | `.github/prompts/` is gone; every workflow is `.agents/skills/eos-*/SKILL.md`, and `/spec` is `/eos-spec` (table below). `.claude/skills/` is a generated copy for Claude Code | Type the new names. A prompt you edited is reported by the upgrade as a conflict and kept: port it into its skill, then delete `.github/prompts/` (validate-config warns while it exists). Run `eos agents sync --write` after every upgrade; set `"agentPlatforms"` to stop generating for platforms you do not use |
| **The verified gate reads JUnit XML** ([ADR-016](../adr/016-junit-test-evidence.md)) | Declare `"evidence": {"junit": ["reports/junit/*.xml"]}` and G7 derives `docs/evidence/test-run.json` from the reports its own run wrote | Optional — a project that writes its own summary is read as before. To switch, make the runner write JUnit (see [examples/trace-evidence](examples/trace-evidence/README.md)), declare it, re-lock the policy (REVIEW) and delete your mapping step |
| **Packs declare the audit and the evidence** | Every starter pack with code declares `commands.audit`; most declare `evidence.junit` | Nothing for an existing declaration; add `commands.audit` if yours has none — G8 fails without it |
| **`eos status` previews the release gate** | *Release gate ahead (G8)*: the audit, NFR measurements, runbook, topology ADR (and the signing key on the Regulated track); `eos next` names the missing ones | Produce them while the stories run, not at the release. NFR measurements: [examples/nfr-summary](examples/nfr-summary/README.md) |
| **The eval-starter scores a real model** | `EVAL_AGENT=llm`: any OpenAI-compatible endpoint, the key from an environment variable, record / replay; a replayed run is marked unattested | Optional: record a cassette with your model and commit it |

| Before 2.2 | Since 2.2 |
|---|---|
| `/requirements` · `/spec` · `/ux-spec` · `/nfr` | `/eos-requirements` · `/eos-spec` · `/eos-ux-spec` · `/eos-nfr` |
| `/adr` · `/deploy-topology` · `/compliance` | `/eos-adr` · `/eos-deploy-topology` · `/eos-compliance` |
| `/eval-spec` · `/e2e` · `/spec-align` | `/eos-eval-spec` · `/eos-e2e` · `/eos-spec-align` |
| `/release-gate` · `/runbook` · `/telemetry-plan` · `/validate-config` | `/eos-release-gate` · `/eos-runbook` · `/eos-telemetry-plan` · `/eos-validate-config` |
| `/eos-next` · `/eos-resume` · `/eos-status` · `/eos-help` · `/eos-init` | unchanged |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.1.0 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.2.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it
node .github/eos/eos.mjs agents sync --write && node .github/eos/eos.mjs policy lock && node .github/eos/eos.mjs verify --full
```

## 10.10 Upgrading from `eos-2.2.x` to `eos-2.3.0`

Nothing gets stricter for a project that changes nothing. What is new is how much of EOS each agent platform gets, and two ways in that did not exist before: an MCP server and brownfield adoption.

| What changed | What you will see | What to do |
|---|---|---|
| **Agent platforms are generated** ([ADR-019](../adr/019-agent-platforms.md)) | `.mcp.json`, `.claude/settings.json`, `.agents/hooks.json`, `.agents/mcp_config.json` and `.agents/agents/` appear — the default platforms are Copilot, Claude Code and Antigravity. The upgrade regenerates them for your platforms instead of comparing them with the template's | If you already had `.claude/settings.json` or `.mcp.json`, your content is kept and EOS adds only its entry. Using Codex, Cursor or Gemini CLI: `eos agents sync --platform <name> --write`. Declare `"agentPlatforms"` to generate less (§7.9) |
| **`eos mcp`** ([ADR-018](../adr/018-mcp-server.md)) | Your agent may ask once to trust the `eos` MCP server | Approve it, or decline: the CLI works as before |
| **A new workflow profile, `delivery-only`** ([ADR-020](../adr/020-brownfield-delivery-gates.md)) | `eos policy check` reports that the policy changed, and every recorded gate result is STALE (`.eos/workflow.json` changed) | `eos policy lock` shows one added profile and nothing weakened; re-lock with `--write`, then `eos verify --full`. For an existing system that has not adopted EOS yet, see §3.5 |
| **`eos stage init`** | A stage record can start from a schema-generated skeleton | Optional; a skeleton with `TODO(eos)` placeholders never passes a gate |
| **CI requires gitleaks** | `eos-ci.yml` installs a pinned, checksum-verified gitleaks and sets `EOS_REQUIRE_GITLEAKS=1` | Nothing, unless your CI cannot download it — then remove the variable and keep the built-in scan |
| **The guardrail speaks each platform's dialect** | `deny-dangerous.js --format <platform>` | Nothing: the generated hooks pass it |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.2.0 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.3.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it, and regenerate the agent-platform files
node .github/eos/eos.mjs policy lock --write && node .github/eos/eos.mjs verify --full
```

## 10.11 Upgrading from `eos-2.3.x` to `eos-2.4.0`

Nothing gets stricter for a project that changes nothing. `.eos/gates.json`, `.eos/workflow.json` and the evaluator version are unchanged, so recorded gate results stay FRESH — except the gates bound to the product tree (`verified`, `release-ready`): EOS's own files are part of that tree, so those re-run after every upgrade.

| What changed | What you will see | What to do |
|---|---|---|
| **Node 24 in CI; Node 20 is end-of-life** | `eos-ci.yml` runs Node 20, 22 and 24 on Linux, macOS and Windows — one more job. `engines` still says `>=20.10.0` | Move developers and your own CI to Node 22 or 24; keep 20 only while something forces you to |
| **Node 24's JUnit report records each test's file** | On Node 24.11 and later, `docs/evidence/test-run.json` says `"match": "file"` where Node 20 and 22 said `"name"`, and its paths are repository-relative | Verify on one Node major, on every machine and in CI: a run on another major rewrites `test-run.json`, which every story's `verified` evidence binds |
| **BMAD found where Antigravity reads it** | `eos next` and `eos-doctor --deep` no longer report BMAD missing when it is installed only for Antigravity (§2.2) | Nothing |
| **The runbook is `ops/runbook.md`** | The `eos-runbook` skill and the docs name the file G8 reads; they used to name `ops/runbook-<service>.md`, which G8 never read | If you have `ops/runbook-<service>.md`, merge it into `ops/runbook.md`, one section per service |
| **`eos next --exit-zero`, `eos resume --exit-zero`** | New, opt-in flags (§7.2) | Use them where the card must not fail a chain — a prompt, a hook, `&&`; `3` still means EOS cannot evaluate |
| **The orchestrators read the same in every tool** | `.agents/agents/` (and `.codex/agents/`) say how to reach the next agent in each tool | Nothing: the upgrade regenerates them |
| **EOS's own coverage thresholds rise** | `.eos/test-budget.json` sets 97 / 79 / 96 for EOS's own suite | Nothing, unless you edited that file — the upgrade then parks a conflict for you to merge |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.3.0 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.4.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it, and regenerate the agent-platform files
node .github/eos/eos.mjs policy check && node .github/eos/eos.mjs verify --full
```

## 10.12 Upgrading from `eos-2.4.x` to `eos-2.5.0`

Nothing gets stricter for a project that changes nothing. `.eos/gates.json`, `.eos/workflow.json` and the evaluator version are unchanged, and a declared project's policy digest is the same as before — the new template marker is recorded only where it is set. As after every upgrade, the gates bound to the product tree (`verified`, `release-ready`) re-run.

| What changed | What you will see | What to do |
|---|---|---|
| **Your CI no longer runs EOS's own tests** ([ADR-021](../adr/021-eos-tests-run-only-in-eos.md)) | In `verify`, the five `EOS tests ·` steps are skipped; `coverage` and `cross-platform` show as skipped jobs, and a short `plan` job appears (§8.4) | Require only `verify` in branch protection (Appendix D.1). If you edited `eos-ci.yml` — a toolchain setup step, say — the upgrade parks the new version under `.eos/local/upgrade/`: merge it by hand |
| **When CI runs** | A push builds `main`, `master` and tags only; a pull request is built once per commit, and a new commit cancels its older run; a weekly run starts only the `plan` job | Open a pull request for a branch you want built, or add the branch to `on.push.branches`; delete the `schedule:` block if you do not want the weekly run |
| **The first declaration starts your own policy** ([ADR-022](../adr/022-first-declaration-starts-the-policy.md)) | Only in a copy that has not declared itself: `eos init <pack> --write` also writes `.eos/policy.lock.json` and `.eos/sbom.json` (§3.3), and the first push and the first pull request pass `policy check` | Not declared yet? `policy check` fails on the lock's digest until you run `eos init`, which `eos next` asks for first |
| **Marking a declaration as the template's own is a weakening** | Adding `"templateDefault": true` to a declared project is `WEAKENING project:templateDefault:declared->template` | Nothing, unless you do that — then it needs a reason and a second person |
| **`eos init` keeps the SBOM current** | A declaration that changes the stacks — code landing in a `config-only` project, say — regenerates `.eos/sbom.json`; `sbom --check` names `eos sbom --write` when it fails | Commit `.eos/sbom.json` with the declaration |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.4.0 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.5.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it, and regenerate the agent-platform files
node .github/eos/eos.mjs policy check && node .github/eos/eos.mjs verify --full
```

## 10.13 Upgrading from `eos-2.5.x` to `eos-2.6.0`

**This release has breaking changes** (it is a minor version, as 2.2.0 was): Node 20 is gone, a deferral needs a `dueBy` to be promoted, `release-ready` has a new check, and the gate versions change. The policy digest changes with them — nothing in it weakens anything, so `eos policy lock --write` needs no approver — and recorded PASS evidence for `architecture-ready`, `story-ready`, `verified` and `release-ready` reads STALE once: re-run `eos verify --full`.

| What changed | What you will see | What to do |
|---|---|---|
| **Node 20 is gone — `engines` is `>=22.10.0`** | The template ships `.nvmrc` (`24`); every `setup-node` step in `eos-ci.yml` and `eos-release.yml` reads it, the cross-platform matrix is Node 22 and 24, and Linux jobs run on `ubuntu-24.04` | Move developers and your own CI to Node 22.10 or later. Keep `.nvmrc`: it is yours, and the Node major changes in that one place. If you edited `eos-ci.yml`, the upgrade parks the new version under `.eos/local/upgrade/` — merge it by hand, and replace any `node-version: '20'` of yours with `node-version-file: '.nvmrc'` |
| **A deferred NFR can ship — with a date** | `release-ready` stays `DEFERRED` (never PASS). On the Standard track `CANDIDATE → VERIFIED` accepts it when every deferred target has an `owner`, a `trigger` and a `dueBy` in the future; a `dueBy` that has passed makes `nfr-evidence` FAIL. `eos approve` prints the whole deferred list first and binds the approval to it; after `RELEASED`, `status` and `next` keep listing it | Add `dueBy` (`YYYY-MM-DD`) to each `DEFER` in `docs/evidence/nfr-summary.json`. A deferred dependency audit still blocks, and a Regulated or Controlled release is never promoted with a deferral |
| **The solo path** (`approvalMode`) | `.eos/project.json` accepts `"approvalMode": "solo"` — Standard track only. Then `eos approve --self --reason "<why>"`, `eos policy lock --self` and a waiver approver written `<name> (self)` are accepted and recorded as `assurance: "self"`, and every place that shows the approval says so. Switching to `solo` is itself a WEAKENING that needs an independent approver | Only if you are the one maintainer: `eos init <pack> --solo --write`. An agent never runs `--self` — the guardrail refuses it, and the MCP server exposes no approving tool |
| **A person confirms the one-way decisions** | `release-ready` has a new check, `one-way-doors-confirmed`: every architecture decision that cites an ADR needs that ADR at `Status: accepted` with `Confirmed by` and `Confirmed at`. G4 still passes with a `proposed` ADR and says so. G4 now also fails when the stack is DECIDED but `.eos/project.json` declares no `stacks`, or the workspace rule's `Local commands` differ from what `stack sync` renders | Read each ADR the architecture cites, set `Status: accepted`, add `Confirmed by: <name>` and `Confirmed at: <date>`, commit it; run `eos stack sync --write` |
| **CI reports the policy check on its own** | A failing `EOS policy integrity` step no longer skips the product quality gate; a separate step reports its verdict. The `plan` job logs `self=<true or false>` | If you edited `eos-ci.yml`, the upgrade parks the new version: merge it |
| **The guardrail judges what a command executes** | Heredoc bodies, the quoted arguments of `git commit` or `echo`, comments, and files that are not shell scripts are data, not commands. A credential rule needs one high-entropy token. A download parsed by `node -e` is allowed, and so is `kill $PID`; the refusal names the rule, the text it matched and a fix | Nothing |
| **`eos next` says more** | Not activated yet · awaiting a person (a `proposed` ADR) · start measuring now (an NFR stated at a scale) · freeze first, and what comes after the release (G9, G10). A stale `product` focus no longer pins `next`, and `verify` no longer records a FAIL for a stage not reached | Nothing |
| **Smaller changes** | `eos stage init story --id <ID>`, and a design record that also writes `docs/EXPERIENCE.md`; `init` keeps the `language` and platforms you chose and lists the stories lacking an `Eval case` when you declare `agentic`; `productTree.exclude` keeps a record such as `docs/pilot-log.md` out of the product tree (adding one is a policy REVIEW); a trace-matrix test name is read to the end of its cell; a failing run names its first failing test; a Chinese runbook passes for `language: zh`; `operability` is an NFR category; the eval-starter cassette field is `requestSha256`; `check-doc-parity` names both files | If gitleaks flags a cassette, rename `key` to `requestSha256` in it (the old name is still read) |

**Upgrade steps**

```sh
npx degit niaodian/eos#eos-2.5.0 /tmp/eos-base    # the version you are on — see docs/eos/VERSION
npx degit niaodian/eos#eos-2.6.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # review the plan
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # apply it, and regenerate the agent-platform files
node .github/eos/eos.mjs policy lock --write      # the gate versions changed; nothing in it needs an approver
node .github/eos/eos.mjs policy check && node .github/eos/eos.mjs verify --full
```

---

# Chapter 11 Adding a technology stack

EOS stack rules are **pluggable**. Adding a stack = add one `*.instructions.md` + corresponding `applyTo`:

1. Create a subfolder under `.github/instructions/` (such as `backend/`).
2. Create `NN-backend-go.instructions.md`, frontmatter:
   ```yaml
   ---
   name: 'Backend (Go)'
   description: 'Go service conventions'
   applyTo: "**/*.go"
   ---
   ```
3. Write that stack's layering/validation/error-handling/lint-format-test conventions.
4. **Ensure the glob is mutually exclusive with existing rules** (avoid overlapping with `**/*.ts`, etc.); run `validate-config.mjs` to validate S3.
5. If the new stack has different test/lint commands, also update `Local commands` in `00-workspace.instructions.md`.

> Default reference stacks: frontend TS+Next.js, backend Node/TS or Python/FastAPI, data PostgreSQL+OpenAPI.
> All are replaceable--changing stack only changes `applyTo` and body text, not the EOS skeleton.
>
> **Shortcut**: R3 rules for six major backend stacks Node/Python/Go/Java/Rust/.NET + React frontend are already shipped with the template;
> finished command lines + frontmatter for each stack are in `docs/eos/stack-presets.md` (recipe book). Copy the matching block; no need to handwrite.

---

# Chapter 12 Anti-patterns quick reference

| # | Anti-pattern | Consequence | EOS defense |
|---|---|---|---|
| P1 | Write only functional Spec, no NFR | SLO explodes after launch | C-nfr is required for G2 |
| P2 | Operational requirements not moved upfront | Post-launch rework ×3 | D-ops + `eos-operational-readiness` + G2 |
| P3 | Stuff all rules into copilot-instructions.md | always-on blows up and pollutes all sessions | R1≤40 lines (S5 gate); split thin slices by applyTo |
| P4 | Rebuild wheels (existing bmad-* but create new) | Dual maintenance and drift | Mark source for deliverables; agent-map.md |
| P5 | Assume native priority exists | Silent errors after version changes | Rely on applyTo + Hooks, not order |
| P6 | Comma-string multi-glob `"a,b"` | Behavior unverified | Use braces `{a,b}` + subfolders; S2/S3 |
| P7 | Use `decision:"block"` in PreToolUse | Cannot block dangerous operations | Use `permissionDecision:"deny"` |
| P8 | Rule bloat in one overlong file | Token overbudget and truncation | Split by single responsibility |
| P9 | Make irreversible decisions with no ADR | Team amnesia | G4 requires ADR; `/eos-adr` |
| P10 | Skip Spec and output code directly | Code drifts from requirements | G3 is prerequisite to G5; no prd.md, no Planning |
| P11 | Release with no rollback/canary | Cannot recover from incidents | G8 five gates; `/eos-release-gate` |
| P12 | Hardcode enterprise interfaces in local config | Breaks outside intranet | Pure-local constraint; only write locally verifiable content |
| P13 | Put project-specific config at user level | Cross-project pollution | Generic goes user-level; specific goes `.github/` |
| P14 | Publish rule changes without validation | Silent failure | Run `validate-config.mjs` + rubric after every change |

---

# Appendix A Glossary

| Term | Meaning |
|---|---|
| EOS | Engineering Operating System, this engineering operating system |
| Gate (G1–G10) | Decision gate; do not enter the next phase until the gate passes |
| hard gate | G2 (requirements), G8 (release); any BLOCKER blocks |
| applyTo | instructions frontmatter field that limits rule scope with glob |
| always-on | Rules that enter every session (R1/R2/R7), the scarcest resource |
| handoff | "handoff" to the next agent/prompt defined in agent frontmatter |
| BMAD | Installed 73 `bmad-*` skill system; EOS prioritizes reuse |
| ADR | Architecture Decision Record, one decision per file |
| AC | Acceptance Criteria, must be measurable and testable |
| NFR | Non-functional requirements (performance/capacity/DR/security/observability...) |
| trace matrix | AC ↔ test mapping table, ensuring no missed tests |
| Hook | Lifecycle event scripts under `.github/hooks/` (Preview) |
| Contractual vs technical authority | CI gates "existing" is contractual; only when downstream enables **server-side branch protection** requiring `verify` to pass does it become "merge-blocking" technical authority |
| activation (post-instantiation hardening) | One-time actions after instantiating from the template (branch protection + CODEOWNERS + approval baseline [+ compliance profile if regulated]); ledger `docs/eos/activation.md`, guided by `/eos-init`, detailed in Appendix D |
| keystone | The "keystone" that makes gates authoritative: CODEOWNERS + settings baseline are provided with the repo, while server-side branch protection is enabled downstream |

---

# Appendix B Command cheat sheet

```
# ── Terminal — the loop (this is all you need day to day) ──
npx degit niaodian/eos#eos-2.6.0 my-app   # create new project
node .github/eos/eos.mjs init                       # what is declared, the two tracks, the starter packs
node .github/eos/eos.mjs init <pack> --write        # declare it (config-only until the stack is decided; --track regulated)
node .github/eos/eos.mjs init <pack> --solo --write  # one maintainer: the Standard track's labelled self-approval path
node .github/eos/eos.mjs stage init story --id <ID> --write  # a story file in the format story-ready reads
node .github/eos/eos.mjs init --write               # local VS Code tasks (never overwrites)
node .github/eos/eos.mjs next                       # the ONE next action, why, how to start it
node .github/eos/eos.mjs resume                     # new session? pick up where you stopped
node .github/eos/eos.mjs check --gate <id> --scope <id>   # prove a step, record the evidence
node .github/eos/eos.mjs transition --scope story --id <id> --to <STATE>
node .github/eos/eos.mjs explain <gate>             # the full rule set for one gate, on demand
node .github/eos/eos.mjs release keygen --write     # once: the release signing key (private half stays outside the repo)
node .github/eos/eos.mjs release bind|sign|verify --release <id>   # bind artifacts + SBOM + ledger head; sign; verify
node .github/eos/eos.mjs policy sync --check        # what the organisation baseline would change
node .github/eos/eos.mjs report --format markdown   # governance report: gates, waivers, SBOM, signatures
npx --offline eos <command>                         # the same CLI, shorter (npm 10.9+)
node .github/hooks/validate-config.mjs              # config self-check (expect PASS)
npm test                                            # run tests (same as quality gate)
npm audit                                           # dependency audit before release

# ── Claude Code · Codex · Antigravity (Chapter 6.6) ──
/eos-next  /eos-resume  /eos-status     # Claude Code and Antigravity: the same skills
$eos-next  $eos-resume  $eos-status     # Codex calls skills with $
node .github/eos/eos.mjs agents sync --platform codex --write   # add a platform (once, then commit)
node .github/eos/eos.mjs handoff --scope story --id <id>        # a step's context, for any agent

# ── Copilot Chat (Agent mode) ──
(agent) eos-guide            # unified entry point: reads the state, gives one action, hands off
/eos-next  /eos-resume  /eos-status   # the same loop as prompts
/eos-help                    # lost? print memory card + current phase + next step (read-only, no file changes)
/eos-init                    # Phase 0: one-time hardening (branch protection + CODEOWNERS + approval baseline → activation.md)
(agent) eos-discovery        # Phase 1: problem definition        → G1
/eos-requirements "<feature>"    # Phase 2: requirements+operational pre-flight → G2★
/eos-spec                        # Phase 3: PRD source of truth      → G3
/eos-ux-spec                     # Phase 3.5: UX visual+experience contract → G-UX (required for user-facing, skip pure backend)
(agent) eos-architecture     # Phase 4: architecture             → G4
  /eos-adr "<decision>"          #   └ every irreversible decision
  /eos-nfr                       #   └ fill NFR target values
(agent) eos-plan             # Phase 5: break stories            → G5
bmad-dev-story               # Phase 6: implementation           → G6
bmad-code-review             #   └ pre-completion code review (no blockers) → G6
bmad-tea / bmad-testarch-*   # Phase 7: testing+traceability     → G7
/eos-runbook <service>           # Phase 8: prepare runbook first
/eos-release-gate                # Phase 8: release gate             → G8★
/eos-telemetry-plan              # Phase 9: telemetry loop           → G9
(agent) eos-review           # Phase 10: iteration write-back    → G10
/eos-validate-config             # Anytime: configuration semantic health check
```

---

# Appendix C End-to-end example (my-app)

A real dry-run that passed end to end (feature: user login), **12/12 gates passed**, usable as a "golden answer" reference.

| Phase | Example artifact |
|---|---|
| 1 Discovery | `my-app/docs/discovery.md` |
| 2 Requirements | `my-app/docs/requirements.md` (11-item operational decision table + authz matrix) |
| 3 Spec | `my-app/docs/prd.md` (FR1–5 + AC + iteration log) |
| 4 Architecture | `my-app/docs/adr/0001-session-strategy.md`, `my-app/api/openapi.yaml` |
| 5 Planning | `my-app/docs/stories/story-001-auth.md` |
| 6 Development | `my-app/src/auth.js` (zero-dependency node:crypto) |
| 7 Testing | `my-app/test/auth.test.js` (10 AC-traced, all green), `my-app/docs/trace-matrix.md` |
| 8 Release | `my-app/docs/release-gate.md`, `my-app/ops/runbook.md` |
| 9 Observability | 5 `auth.*` events in `src/auth.js` |
| 10 Iteration | `my-app/docs/prd.md §6` (CR-001 write-back) |
| Acceptance report | `my-app/docs/eos/walkthrough.md` (full scorecard + reproduction commands) |

**Reproduce** (terminal):
```sh
npx degit niaodian/eos#eos-2.6.0 my-app && cd my-app
node .github/hooks/validate-config.mjs        # PASS
npm test                                      # 10/10 green
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | node .github/hooks/deny-dangerous.js  # deny
```

---

# Appendix D Post-instantiation hardening (make gates authoritative)

> Why this step is needed: EOS hard enforcement is **"contractual"**--the 3 CI hard gates (validate-config / eos-doctor / secret-scan) and hooks themselves **exist, but becoming "merge-blocking authority" depends on you completing branch protection on the GitHub server side**.
> The template cannot make these server-side decisions for your organization (`【Needs org/GitHub settings】`), but below are exact one-time steps.
> This directly answers the keystone item (T1) from third-party audit: "first make gates authoritative; only then does it make sense to block the remaining soft-gate/self-modification risks."

> **Progress tracking**: this appendix is the "complete steps (how to do it)"; the repo's `docs/eos/activation.md` is the "checkable ledger (what is done)",
> advisory-reminded by `eos-doctor` every run and rechecked before release by `/eos-release-gate` (G8). Use **`/eos-init`** for guided execution--
> it does what can be done locally for you (replace handles, copy baseline) and prints the exact server-side branch-protection steps (the template cannot enable them for you).

## D.1 Make 3 CI hard gates "required checks" `【Needs org/GitHub settings】`

GitHub repository → **Settings → Rules → Rulesets → New branch ruleset**, targeting the default branch:

1. Set **Enforcement status** to **`Active`**. A new ruleset is created **Disabled**, and a Disabled ruleset enforces nothing no matter what else you tick below -- this is the most common way a developer ends up believing they are protected when they are not.
2. Check **Require a pull request before merging** (forbid direct push to the default branch).
3. Check **Require status checks to pass before merging** → search and select **`verify`** (the job in `eos-ci.yml`).
   -- This step turns validate-config / eos-doctor / secret-scan from "green-light advice" into "red-light block".
   Select `verify` only: `coverage` and `cross-platform` test EOS itself and are skipped in your repository ([§8.4](#84-what-ci-runs-in-your-repository)).
4. Check **Require review from Code Owners** (paired with CODEOWNERS in D.2).
5. (Recommended) Check **Do not allow bypassing the above settings**, to avoid casual administrator bypass.

**Plan limits -- read this before you start.** On GitHub Free, a **private** repository does not enforce rulesets at all: GitHub saves the ruleset and then tells you "Your rulesets won't be enforced on this private repository until you upgrade this organization account to GitHub Team". **Require review from Code Owners** is likewise not offered. Your three honest options are: make the repository public, upgrade to Pro/Team, or waive the ledger line with exactly that reason.

Verify from the terminal instead of trusting the settings page:

```sh
gh api repos/<owner>/<repo>/rules/branches/main        # non-empty array = Active rules apply; [] = nothing enforced
gh api repos/<owner>/<repo>/branches/main/protection   # classic protection only; returns 404 when you use a ruleset
```

> Because the legacy `/protection` endpoint 404s for a ruleset, never read that 404 as "unprotected" -- check the ruleset endpoint first. Personal namespace repositories have **no** such protection by default.

**On a private repository, prove it by behaviour.** A ruleset can be saved, show "Active" and still enforce nothing. Open a throwaway pull request that makes `verify` fail and look at the merge button: if it is enabled, or `verify` is not listed as required, the protection is not in force. Delete the branch afterwards.

**One maintainer?** Branch protection and Code Owners review need someone else who can merge; on a private Free repository waive the item with a reason. Everything else EOS asks a second person for has the solo path (`approvalMode: "solo"`, §10.13): a labelled self-approval you type yourself, never an agent.

## D.2 Enable CODEOWNERS governance protection

The template provides `.github/CODEOWNERS` with the repo (covering `instructions/ agents/ hooks/ workflows/ prompts/` and `docs/eos/`, security/compliance checklists). **After instantiation**, replace all `@niaodian` entries with your team handle (teams recommended over individuals, e.g., `@your-org/platform-team`). Together with D.1 "Require review from Code Owners", this prevents agents or anyone with write access from **modifying governance files without review** (answering audit E1/H5: agent `editFiles` self-modifying rules).

## D.3 Pin the local approval baseline

```sh
cp .vscode/settings.json.example .vscode/settings.json    # active file remains local (git-ignored)
```

Key item: keep `chat.tools.global.autoApprove` as `false` (`true` equals /yolo and disables key safety protection);
`chat.tools.terminal.autoApprove` has a built-in dangerous-command denylist (defense-in-depth with `deny-dangerous.js`).
The setting keys have been checked against official `docs/agents/reference/ai-settings.md`; auto-approval evolves quickly, so re-verify in your version.

## D.4 Known trade-offs and residual risks (honest list)

The following are **intentional design trade-offs** in EOS (inherent costs of local-first / opt-in / reuse-first). They are not bugs, but please explicitly confirm that the team accepts the residual risks and knows the mitigations:

| Trade-off | Residual risk | Mitigation |
|---|---|---|
| `.vscode/*` is gitignored by default; `mcp.json` remains local after opt-in (audit F2/C2) | Sandbox/approval baseline can be privately changed locally without detection | Repo-provided `settings.json.example`/`mcp.json.example` safety baselines + review; team convention |
| `bmad-*` skills are installed **user-level** and not pinned (audit H4/T6) | Skill versions/presence differ across machines → agentic behavior is not fully reproducible | Record the team's unified bmad version in `docs/`; critical skills may be vendored/submoduled |
| Hooks are Preview, per-machine, allow on parse failure, and CI does not call them (audit G2) | Real-time interception of destructive operations is not authoritative and can be bypassed | Authority is D.1 CI hard gates + human review; hooks are only speed bumps |
| agent has `editFiles` (audit H5) | In principle it can modify its own governance files | D.2 CODEOWNERS + D.1 required review (blocks once enabled) |
| `gitleaks` deep scan is an **optional enhancement locally**; if absent it degrades to the built-in rules | Running only zero-dependency built-in regexes is weaker than full gitleaks rules | Built-in `secret-scan.mjs` always runs as a CI hard gate (baseline). Since eos-2.3.0 EOS CI installs a pinned, checksum-verified `gitleaks` and sets `EOS_REQUIRE_GITLEAKS=1`, so there a missing gitleaks fails instead of degrading |
| **Windows**: core hooks are Node (cross-platform); early `quality.json` once used `sh -c` (round-2 N1 changed it to `node .github/hooks/quality.mjs`, native Windows no longer needs WSL/Git-Bash) | Directory fallback traversal without `git` once showed absolute paths on Windows (normalized with `path.relative`); availability of external tools such as `bmad-*` and `act` (requires Docker Desktop) still varies by platform | Three core hooks + `quality.mjs` are implemented cross-platform; **authoritative quality gate is in CI (`ubuntu-latest`)**, independent of local OS |

**Requires organization decision (template does not decide, `【Needs org standard】`)**: CI runner standard (currently `ubuntu-24.04`), approved secret store, namespace/repository ownership, model pin/registration strategy, artifact integrity (SBOM/signing/SLSA). These are not violations; they are organization-standard questions.

---

# Appendix E Platform smoke checklist (by hand)

EOS cannot log in to your agent, and its automated tests spawn the hook commands it generates but never drive a real agent. So when you set a platform up, or after an upgrade, run this once **yourself**, in an agent where you are logged in. A model does not run this checklist — its answer would be the thing under test.

For each platform: open the project folder, start a fresh session and ask one question — **"What should I do next?"**

| Platform | How to start it | What you should see |
|---|---|---|
| VS Code + GitHub Copilot Chat | Chat → the **eos-guide** agent, or `/eos-next` | a call to the `eos_next` tool (or to `node .github/eos/eos.mjs next`) and one recommended action with its reason |
| Claude Code | `claude` in the project folder, then `/eos-next` | the same card; the first shell command runs without a hook error |
| OpenAI Codex | `codex` in a trusted project folder, then `$eos-next` | the card; the guardrail hook asks for approval once (`/hooks`) |
| Cursor | the Agent chat: "What should I do next?" | an `eos_next` MCP call (Cursor asks per call), and the shell guardrail |
| Google Antigravity | the IDE, or `agy` in the project folder, then `/eos-next` | the card; a shell command is **not** refused by the guardrail (it runs from `.agents/`); in headless mode the read-only EOS tools must be allowed (§6.6.3) |
| Gemini CLI | `gemini` in the project folder: "What should I do next?" | an `eos_next` MCP call |

If a platform prints `MODULE_NOT_FOUND` or a hook error, run `node .github/eos/eos.mjs agents sync --check` and then `node .github/eos/eos.mjs agents sync --write`. If it shows no EOS call at all, the platform's own MCP or hook settings are the place to look (§6.6.5).

---

> This manual evolves with the template version. For changes, sync `docs/eos/VERSION` and run `validate-config.mjs`.
> For design rationale (why it is designed this way), see `docs/eos/blueprint.md`; this manual only covers "how to use it".
