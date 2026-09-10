# EOS User Manual (Engineering Operating System)

> Version: synced with `docs/eos/VERSION` (current `eos-1.14.0`)
> Applies to: recent VS Code + GitHub Copilot Chat (custom agent / hooks are recent-version capabilities; confirm the version in the "About VS Code" panel) + 73 installed `bmad-*` skills (user-level)
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
| Want to look up a slash command / agent / rule | [Chapter 7 Complete reference](#chapter-7-complete-reference-quick-reference) |
| Configuration is broken / Agent is not working as expected | [Chapter 9 Failure localization](#chapter-9-failure-localization-and-troubleshooting) |
| Want to move this system to another project/team | [Chapter 10 Cross-project reuse and distribution](#chapter-10-cross-project-reuse-and-distribution) |

---

## Table of contents

- [Chapter 1 Quick start (10 minutes)](#chapter-1-quick-start-10-minutes)
- [Chapter 2 One-time environment setup](#chapter-2-one-time-environment-setup)
- [Chapter 3 New project Day-1 Bootstrap](#chapter-3-new-project-day-1-bootstrap)
- [Chapter 4 Core concepts (five mechanisms)](#chapter-4-core-concepts-five-mechanisms)
- [Chapter 5 Mental model: layered rules + decision gates](#chapter-5-mental-model-layered-rules--decision-gates)
- [Chapter 6 Full-lifecycle practice (idea → iteration)](#chapter-6-full-lifecycle-practice-idea-→-iteration)
- [Chapter 6.5 Two onboarding paths (SaaS vs Agentic · beginner-friendly)](#chapter-65-two-onboarding-paths-saas-vs-agentic-·-beginner-friendly)
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

In the **terminal** — this is the whole loop, and it is all you have to remember:

```
node .github/eos/eos.mjs resume   # what was I doing, what is blocking it
node .github/eos/eos.mjs next     # the ONE recommended next action, why, and how to start it
node .github/eos/eos.mjs check --gate <id> --scope <id>   # prove the step, record the evidence
```

In **Copilot Chat (Agent mode)** the same loop is the **eos-guide** agent, or the prompts
`/eos-next` · `/eos-resume` · `/eos-status`. The router names the agent, the prompt and the minimal
BMAD skills for each step, so you never choose from the 73 installed skills yourself. The full
contract (state model, gates, evidence, exit codes) is
[developer-experience.md](developer-experience.md).

## 1.3 Happy Path (shortest chain from idea to code)

> You do not have to memorize this chain — `eos next` walks it for you, one step at a time, and
> refuses to let you skip a gate whose evidence does not exist. It is written out here so you can
> see the shape of the method.

```
(switch agent) eos-discovery        → docs/discovery.md      (Gate G1)
/requirements "<feature>"          → docs/requirements.md   (Gate G2)
/spec                              → docs/prd.md            (Gate G3)
/ux-spec (user-facing; skip pure backend) → docs/DESIGN.md + docs/EXPERIENCE.md (Gate G-UX)
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
| Node.js | 18+ (used by validators and hooks) | `node -v` |
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

---

# Chapter 3 New project Day-1 Bootstrap

## 3.1 Three creation methods (choose one)

**Method A — degit (recommended, fastest)**
```sh
# Public template — plain degit works (no auth needed)
npx degit niaodian/eos#eos-1.14.0 my-new-app
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

Open `.github/instructions/00-workspace.instructions.md` and change it to the real facts of **your project**:
- `Local commands`: if the stack is **already decided**, replace this with the install/lint/test/typecheck commands for your stack--**copy the finished line directly** from `docs/eos/stack-presets.md` (a recipe book for Node/Python/Go/Java/Rust/.NET full stacks; copy the matching block). If the stack is **not decided yet** (most 0-1 projects are not before architecture), **keep the Node placeholder**--this is a ⛳ PROVISIONAL value, and the authoritative lock happens in **Phase 4 (Architecture)** together with `docs/adr/00X-tech-stack.md`, avoiding conflict between always-on rules and the future real stack.
- `Layout`: update it if the directory structure differs.
- Do **not** write other cross-project general beliefs here--those belong to R1 (`copilot-instructions.md`).

## 3.4 Full Day-1 sequence (copy-ready)

```sh
npx degit niaodian/eos#eos-1.14.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs
# Key: run `code .` from inside the project directory so my-new-app becomes the workspace root (including .github/).
# Do not open its parent directory, or custom agents / instructions / hooks will not be discovered.
code .
# One-time hardening (make CI gates authoritative as merge blockers): run /eos-init in Copilot Chat,
# then follow the guide to check off docs/eos/activation.md item by item (branch protection + CODEOWNERS + approval baseline; see Appendix D).
```

---

# Chapter 4 Core concepts (five mechanisms)

EOS uses 5 native VS Code + Copilot mechanisms to carry rules. **Understanding "when it is loaded" is the key to using EOS well.**

| Mechanism | File location | When it enters context | How you trigger it | Role in EOS |
|---|---|---|---|---|
| **Instructions** | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md` | Automatic: always-on or matched to file type by `applyTo` glob | No manual trigger; takes effect when editing matching files | Rule layers (coding conventions, security red lines, stack conventions) |
| **Prompts** | `.github/prompts/*.prompt.md` | On demand: when you enter `/name` | Enter `/requirements`, etc. in Chat | Workflows (single reusable task) |
| **Agents** | `.github/agents/*.agent.md` | On switch: continuously effective when you select an agent | Switch in Chat's agent selector | Phase orchestrators (persistent persona + tool limits + handoffs) |
| **Skills** | `.github/skills/*/SKILL.md` (project-level), `~/.agents/skills/bmad-*` (user-level) | Auto-loaded by relevance, or explicitly called by an agent | Agent uses them automatically, or write `bmad-xxx` in a prompt | Portable capabilities (reuse BMAD + new-build augmentation) |
| **Hooks** | `.github/hooks/*.json` + scripts | Triggered by lifecycle events (PreToolUse, etc.) | Automatic; no manual action required | Deterministic guardrails (block dangerous operations, run quality gates) |
| **MCP servers** | `.vscode/mcp.json.example` (top-level `"servers"`; opt-in copy to `.vscode/mcp.json`) | Client **eager-connects at session start**, workspace-global, **cannot be gated by phase** | **Inert by default** (`.example`); enable manually in Phase 7, keep active file local and uncommitted | Local tool extension (e.g., Playwright MCP drives browser self-checks; see 7.7) |

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
| R10 | Workflow | `.github/prompts/*.prompt.md` | When invoked |

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
| **How to start** | `npx degit niaodian/eos#eos-1.14.0 my-app && cd my-app` |
| **Output** | Complete `.github/` + `docs/` skeleton |
| **Gate** | `node .github/hooks/validate-config.mjs` → **PASS** |
| **Must check** | PASS 0 errors. **If the stack is undecided, do not change** `00-workspace` yet--keep the Node placeholder; the stack is an irreversible decision, and the authority is locked in **Phase 4 (ADR)**. If the stack is known, copy `docs/eos/stack-presets.md` directly (fast path). |
| **How to open** | Run `code .` from inside `my-app/`--make **the project itself** the workspace root. Opening the parent directory makes agent/instructions/hooks all ineffective (see 7.2). |
| **★ Hardening (one-time)** | Run `/eos-init`: it guides you through enabling branch protection (runbook) + replacing CODEOWNERS handles + pinning the approval baseline, and records progress in `docs/eos/activation.md`. **This step determines whether CI gates can truly block merges** (see Appendix D); `eos-doctor` gives an advisory reminder of remaining items every time, and `/release-gate` checks again before release--to avoid "systemic forgetting". Personal experiment repositories may exempt items one by one (`[~] ... reason: ...`). |
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
| **How to start** | Enter **`/requirements "<feature>"`** in Chat (wraps `bmad-agent-pm` / `bmad-prd` + skill `eos-operational-readiness`) |
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

> **Regulated industries (healthcare/finance, etc.) should decide the regime in the requirements phase**: `/requirements` **Step 2.5 regime pre-flight** forces you to answer first whether HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL applies; selecting one runs `F-compliance.md` (dedicated command **`/compliance`**: regime selection → data residency/audit retention/minimum necessary/vendor BAA/DPA/Agentic data egress) and lands these decisions **before architecture is fixed**--avoiding a teardown after launch. **Especially**: if an LLM/agent product involves PHI/PAN/regulated personal data, it must decide the "data egress" plan immediately (signed BAA/DPA · self-hosted model · redaction gateway · exclude regulated data); deciding late = model swap and architecture swap. Record the result in `docs/compliance-profile.md`.
> **Not legal advice**: EOS only enforces early engineering decisions and **does not replace** compliance officer/legal/auditor sign-off. `【New-build】`

> Supporting command: `/nfr` fills C-nfr with concrete target values line by line.

---

## Phase 3 — Spec (PRD = single source of truth)

| Item | Content |
|---|---|
| **Goal** | Solidify requirements into a PRD that becomes the only downstream recognized source of truth |
| **When to enter** | G2 passed and `docs/requirements.md` has no BLOCKER |
| **How to start** | Enter **`/spec`** in Chat (draft and validate with `bmad-prd`) |
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
| **How to start** | Enter **`/ux-spec`** in Chat (wraps `bmad-ux`) or switch to **`(agent) eos-design`**; if the problem is still vague use `bmad-cis-design-thinking` (Maya), and for strong opinionated design use `bmad-agent-ux-designer` (Sally) |
| **Input** | `docs/prd.md` |
| **Output** | `docs/DESIGN.md` (visual identity: tokens/fonts/colors/spacing) + `docs/EXPERIENCE.md` (information architecture/user flows/screen states/interactions/a11y/journey) **+ `docs/design.json`** (the record G-UX reads: `userInterface` true/false, and `coverage` for flows/states/accessibility/designTokens/responsive) |
| **Decision gate G-UX** | `node .github/eos/eos.mjs check --gate ux-ready` — a user-facing product needs **BOTH** documents with real content and every coverage dimension `COVERED` + a ref or `NOT_APPLICABLE` + a reason. Before 1.13.0 only one file's *existence* was checked, so a UI product with no `DESIGN.md` at all walked through |
| **Must-check items** | Are empty/error/loading states defined for every screen? Can key actions be completed with keyboard only? Are colors/spacing referencing tokens or hard-coded? |
| **Anti-rework** | The UX contract comes **before** architecture and implementation: architecture uses it to decide APIs/data, stories reference screens from it, and frontend rules and telemetry land from it. The two contracts are authoritative for any later mock/import. |
| **Skippable** | Pure backend/CLI: record `{ "userInterface": false, "skipReason": "…" }` in `docs/design.json`. It must be **stated** — silence is not a skip, and neither is the bare word "SKIP". |

> Reuse note 【BMAD + augmentation】: capabilities come from `bmad-ux` / `bmad-agent-ux-designer` (Sally) / `bmad-cis-design-thinking` (Maya).
> EOS only adds orchestration (`/ux-spec` prompt + `eos-design` agent + G-UX gate) and **does not rebuild design capability**.

---

## Phase 4 — Architecture (solution + data model + API contract + ADR)

| Item | Content |
|---|---|
| **Goal** | Technical solution, data model, API contract, NFR landing points, and trace for key decisions (ADR) |
| **When to enter** | G3 passed and `docs/prd.md` is ready |
| **How to start** | Switch Chat to **`(agent) eos-architecture`** (calls `bmad-architecture`/Winston); run **`/adr`** for every irreversible decision; run **`/deploy-topology`** to choose deployment topology |
| **Input** | `docs/prd.md`, `docs/requirements.json` (for the NFR set), `docs/EXPERIENCE.md`+`docs/DESIGN.md` (if UX phase was done), `docs/checklists/C-nfr.md`, `docs/checklists/G-deployment.md` |
| **Output** | `docs/architecture.md` (including Deployment section) **+ `docs/architecture.json`** (the record G4 reads: a decision for stack/topology/authz/security/audit/rollback/DR/data/API/event — plus tool allow-list, bounded orchestration, memory layering, async boundary and eval architecture for an agentic product, and the data/approval boundary for a regulated one — and an `nfrLandingPoints` entry per NFR), `docs/data-model.md`, `api/openapi.yaml`, `docs/adr/NNN-*.md`, filled `G-deployment.md` |
| **Decision gate G4** | `node .github/eos/eos.mjs check --gate architecture-ready` — ☑ every concern is `DECIDED` + summary or `NOT_APPLICABLE` + reason ☑ stack and topology each cite an ADR that **exists** ☑ **every NFR in `docs/requirements.json` lands on a named component and mechanism** |
| **Must-check items** | Was the API contract written **before** implementation? Does each ADR list alternatives and trade-offs? Does every NFR have a landing point? **Did the deployment topology choose "the simplest option that satisfies NFR" (rather than following the K8s trend)**? |
| **Anti-rework** | "API before implementation" lets frontend and backend proceed in parallel and anchors the contract in tests; ADRs prevent team amnesia. |
| **Example** | `my-app/docs/adr/0001-session-strategy.md` (3-solution comparison + trade-off), `my-app/api/openapi.yaml` (written before `src/auth.js`) |

**ADR template elements** (auto-generated by `/adr`): Status / Context / Decision / Consequences (focus on 1-N scale and reversibility) / Alternatives considered. One file per decision, linked from `docs/architecture.md`.

> **Lock the tech stack in the architecture phase** (irreversible decision; Phase 0 intentionally only leaves a placeholder): after choosing language/framework, ① update `00-workspace` `Local commands` from `docs/eos/stack-presets.md` ② enable the corresponding R3 stack rule ③ write `docs/adr/00X-tech-stack.md`. **G4 validates "stack locked"**--so always-on `00-workspace` matches the real stack and eliminates the conflict between the Phase 0 ⛳ placeholder and the later stack.

> **Select the deployment topology in the architecture phase** (also an NFR-driven architecture decision): run `/deploy-topology` to walk through `docs/checklists/G-deployment.md`--among **bare process / Docker / K8s / serverless / PaaS**, **choose the simplest option that satisfies NFR** (do not default to K8s), and land `docs/adr/NNN-deployment-topology.md` + the Deployment section of `architecture.md`. EOS **does not pre-assume** Docker or K8s: topology is decided in this phase by SLO/RTO/RPO/peak QPS; real cluster/registry/cloud belongs to `【Needs enterprise env】`, and local dev/CI can still run without it. The selected topology's manifests (`Dockerfile`/`compose.yml`/`k8s/*.yaml`/`serverless.yml`) automatically receive R8 `release-ops` rules, and the G8 release gate then validates rollback/canary/health consistency with the topology.

---

## Phase 5 — Planning (break into Epics→Stories)

| Item | Content |
|---|---|
| **Goal** | Break architecture into independently implementable, self-contained stories |
| **When to enter** | G4 passed |
| **How to start** | Switch Chat to **`(agent) eos-plan`** (`bmad-create-epics-and-stories` → `bmad-create-story` → `bmad-sprint-planning`); design acceptance tests first for every AC with **`bmad-testarch-atdd`**; **if it contains LLM/agentic components, also run `/eval-spec` to design the evaluation set (G-EVAL)**; finally validate readiness with `bmad-check-implementation-readiness` |
| **Input** | `docs/prd.md`, `docs/architecture.md`, `docs/EXPERIENCE.md` (if UX phase was done) |
| **Output** | `docs/epics/*`, `docs/stories/*.md` (each includes **acceptance test outline**), **`docs/eval-plan.md` (LLM features)** |
| **Decision gate G5** | ☑ Every story is self-contained ☑ independently implementable ☑ includes AC **and every AC has acceptance test design (ATDD)** ☑ telemetry/authz/rollback are landed as concrete tasks **☑ LLM features have eval-plan (G-EVAL) or explicit SKIP** |
| **Must-check items** | Can a developer start work from this story **without going back to read elsewhere**? Is DoD written? **Is the acceptance test intent defined for every AC**? **Are the eval set/grader/threshold for LLM features defined**? |
| **Anti-rework** | The "readiness gate" prevents missing context in the middle of development; **shifting testing left** makes acceptance criteria testable before coding and prevents "adding tests later just to fill coverage"; **shifting eval left** gives nondeterministic LLM output a measurable baseline before coding. |
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

> **verify-as-you-build (optional · opt-in)**: after implementing a frontend story, in **agent mode** you can use **Playwright MCP** to drive the local dev server and self-check the interaction you just wrote--similar to Antigravity's Chrome integration. Browser MCP is **not enabled by default** (to avoid eager startup in early phases); first run `cp .vscode/mcp.json.example .vscode/mcp.json` (sandbox locked to localhost). This is a **development convenience**, not deterministic; formal verification in Phase 7 uses `/e2e` to solidify Playwright specs. See 7.7.

---

## Phase 7 — Testing (verification + traceability)

| Item | Content |
|---|---|
| **Goal** | Verify according to the test strategy, establish spec↔test traceability, and **verify NFR targets** |
| **When to enter** | G6 passed |
| **How to start** | Enter **`bmad-tea`** (Murat) / `bmad-testarch-test-design` / `bmad-testarch-automate` / `bmad-testarch-trace` / **`bmad-testarch-nfr`** / `bmad-qa-generate-e2e-tests`; **use `/e2e` for user-facing flows** (orchestrates Playwright framework + E2E generation + trace; during development Playwright MCP can drive browser self-checks, see 7.7); **LLM features: run the eval set + regression baseline according to `docs/eval-plan.md`** |
| **Input** | `docs/prd.md` (AC list), **`docs/checklists/C-nfr.md` (NFR targets)**, **`docs/eval-plan.md` (LLM features)**, `src/` code |
| **Output** | Test suite + `docs/trace-matrix.md` (AC ↔ test mapping — the *human* decision) **+ `docs/evidence/test-run.json`** (the *machine* result: which test ran, against which product tree, and what it returned) + **`docs/evidence/nfr-summary.json`** + **`docs/evidence/eval-summary.json`** (LLM features). See [examples/trace-evidence](examples/trace-evidence/README.md) — it is a ~30-line mapping step in your own runner, not an EOS plugin |
| **Effective rule R6** | Test pyramid; **every AC has ≥1 test**; `describe(<criterion id>)` naming; no real timers/no order dependency; changed-line coverage ≥80%; **verify NFR targets with `bmad-testarch-nfr`**; **verify LLM output with eval set+grader (not exact-match), see `ai/10-ai-llm` rule** |
| **Decision gate G7** | `node .github/eos/eos.mjs check --gate verified --scope <STORY-ID>` — ☑ every AC traces to a test that **exists and actually ran** ☑ the run describes **this** product tree ☑ **NFR targets verified or deferred with an owner+trigger** ☑ **LLM features: the measured score meets its threshold, recomputed by EOS from the summary's own numbers** ☑ **spec-alignment quantified (`/spec-align`)**. Before 1.13.0 a hand-written `PASS` in the matrix was enough |
| **Must-check items** | Are there ACs not covered by any test? **Were the P95/throughput/SLO targets defined in C-nfr verified** (instead of set and forgotten)? Are deferred items explicitly marked with triggers? **Did the LLM eval score reach the threshold? Were regressions run after prompt/model changes?** Since 1.13.0, editing the source, tests, prompts or eval data **after** verifying makes the recorded PASS `STALE` and blocks the merge — re-run, do not re-assert |
| **Anti-rework** | The trace matrix exposes "untested acceptance criteria"; **NFR verification exposes "targets set but never verified"**; **eval regression exposes "prompt changes broke something else"**. |
| **Example** | `my-app/test/auth.test.js` (10 AC-traced tests all green), `my-app/docs/trace-matrix.md` (11/12 ACs have tests, 1 performance item explicitly deferred) |

---

## Phase 8 — Release (release gate) ★ hard gate

| Item | Content |
|---|---|
| **Goal** | Release only after passing quality/security/rollback/canary/NFR gates |
| **When to enter** | G7 passed |
| **How to start** | Enter **`/release-gate`** in Chat; if runbook is missing, run **`/runbook <service>`** first |
| **Input** | Test results, NFR verification results, `ops/runbook-*.md` |
| **Output** | Release-gate report (PASS/FAIL item by item), `ops/runbook-<service>.md` |
| **Decision gate G8 (hard gate)** | `node .github/eos/eos.mjs verify-release --release <id>` runs all 13 checks the prompt lists: ① the candidate is committed ② **the quality commands re-run ON THIS candidate** ③ stories VERIFIED ④ **each story's verification describes THIS tree** ⑤ spec alignment ⑥ secret scan ⑦ dependency audit ⑧ NFR evidence ⑨ compliance boundary ⑩ waivers ⑪ runbook: rollback **+ canary + health/readiness** ⑫ deployment-topology ADR ⑬ enforcement authority. **Any FAIL blocks release**; `DEFERRED` (an offline audit, an NFR with owner+trigger) is visible and never green |
| **Must-check items** | Are rollback steps "exact executable steps" or empty words? Do deferred canary items have triggers? Does audit show 0 vulnerabilities? **Were NFR targets verified**? Note that `VERIFIED → APPROVED` needs an approval recorded by **someone other than whoever prepared the candidate** — no model, and no automation, can supply it |
| **Anti-rework** | No rollback/no canary/unverified NFR means no launch--blocks "launching while sick". |
| **Example** | `my-app/docs/release-gate.md` (all applicable items pass, `npm audit` 0 vulns), `my-app/docs/trace-matrix.md` (performance NFR item explicitly deferred+trigger), `my-app/ops/runbook-auth.md` (`FEATURE_LOGIN=off` rollback) |

---

## Phase 9 — Observability (telemetry landing + ops loop) ★ machine gate since 1.13.0

| Item | Content |
|---|---|
| **Goal** | Telemetry is live, metrics are visible, and an operational loop exists |
| **When to enter** | G8 passed / after release |
| **How to start** | Enter **`/telemetry-plan`** in Chat |
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
| **Anti-rework** | `eos-review`'s handoff takes you directly back to `/requirements`, closing the loop into the next round [2]. A **rolled-back** release comes here too: `ROLLED_BACK` routes to an incident review and closes through this same write-back — it can never reship the candidate that just failed. |
| **Example** | `my-app/docs/prd.md §6 Iteration Log`: telemetry observation triggers CR-001, written back into PRD |

---

## 6.x Phase quick-reference (one page)

| Phase | How to start | Artifact | Gate | → Next step |
|---|---|---|---|---|
| 1 Discovery | `(agent) eos-discovery` | `discovery.md` **+ `discovery.json`** | `discovery-ready` | `/requirements "<f>"` |
| 2 Requirements | `/requirements "<f>"` | `requirements.md` **+ `requirements.json`** | **`requirements-ready`★** | `/spec` |
| 3 Spec | `/spec` | `docs/prd.md` | `prd-ready` | `/ux-spec` (backend may skip → `eos-architecture`) |
| 3.5 UX & Design | `/ux-spec` (or `(agent) eos-design`) | `DESIGN.md`+`EXPERIENCE.md` **+ `design.json`** | `ux-ready` (conditional) | `(agent) eos-architecture` |
| 4 Architecture | `(agent) eos-architecture` + `/adr` + `/deploy-topology` | `architecture.md` **+ `architecture.json`**+`openapi.yaml`+`adr/*` | `architecture-ready` | `(agent) eos-plan` (lock stack+ADR+topology first) |
| 5 Planning | `(agent) eos-plan` | `docs/stories/*` | `story-ready` | `bmad-dev-story` |
| 6 Development | `bmad-dev-story` → `bmad-code-review` | `src/*` + review conclusion | `project-gate.mjs` | `/e2e` (or `bmad-tea`/`bmad-testarch-*`) |
| 7 Testing | `/e2e` (or `bmad-tea`/`bmad-testarch-*`) | tests + `trace-matrix.md` **+ `evidence/test-run.json`** | `verified` | `/release-gate` |
| 8 Release | `/release-gate` (+`/runbook`) | gate report + runbook **+ `evidence/nfr-summary.json`** | **`release-ready`★** | `/telemetry-plan` |
| 9 Observability | `/telemetry-plan` | `telemetry-plan.md` **+ `telemetry.json`** | `telemetry-ready` | `(agent) eos-review` |
| 10 Iteration | `(agent) eos-review` | **`iteration.json`** + PRD write-back | `iteration-ready` | ⟲ `/requirements` (next round) |

> **Do not skip phases**: every EOS command/agent prints "→ Next step" when it finishes (the **Next** breadcrumb at the end of prompts + the agent **handoff** button). Phases 6/7 are pure BMAD skills; `eos-plan`'s "Start Development" handoff already gives the agent the entire downstream tail chain (dev→review G6→test G7→release G8), so the flow does not break after it runs.

> **One-time hardening (Phase 0, do not forget)**: `/eos-init` turns CI gates from "contractually present" into "merge-blocking authority" (branch protection + CODEOWNERS + approval baseline), recorded in `docs/eos/activation.md`; `eos-doctor` gives an advisory reminder of remaining items **every run**, and `/release-gate` (G8) checks again before release--this is the triple reminder that prevents "systemic forgetting".

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
npx degit niaodian/eos#eos-1.14.0 todo-api && cd todo-api
node .github/hooks/validate-config.mjs          # expect PASS
```
**Stack already decided?** Open `.github/instructions/00-workspace.instructions.md` and copy `Local commands` from your stack block (`docs/eos/stack-presets.md`, fast path).
**Not decided yet?** Keep the Node placeholder--the **authoritative stack lock happens in Step 4 Architecture** (together with ADR). SaaS projects usually know the stack at Step 0, so they can copy directly.

### Step 1–3: Clarify what to build (enter one by one in Chat)
```
(switch to agent) eos-discovery        → produces docs/discovery.md (problem+success metrics)
/requirements "To-do CRUD with multi-user isolation"   → docs/requirements.md (G2 hard gate: five checklists)
/compliance "needed only for regulated sectors like healthcare/finance" → docs/compliance-profile.md (regulated adds sixth F; otherwise skip)
/spec                              → docs/prd.md (every requirement has AC)
```
> **G2 hard gate must pass**: five checklists A/B/C/D/E have no unresolved items. SaaS projects should especially watch **performance/DR in C-nfr**, **authz matrix/data lifecycle in D-ops**, and **multi-tenant isolation in E-security**.

### 🔵 Step 4: Architecture (SaaS-specific focus)
```
(switch to agent) eos-architecture     → architecture.md + data-model + api/openapi.yaml
/adr "tech stack choice / database choice"       → record ADR for irreversible decisions; **lock stack here** = update 00-workspace + enable R3
/deploy-topology                   → choose deployment topology (bare process/Docker/K8s/serverless/PaaS, simplest option satisfying NFR) + deployment-topology ADR
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
/e2e                               → user-facing flow E2E (Playwright; MCP self-checks available during development)
/spec-align                        → quantify: AC coverage / first-pass rate / drift
```
SaaS **G7** requires: every AC has ≥1 test, **API contract tests** (against openapi.yaml), **DB state integration tests** (transaction commit/rollback, constraints, idempotency), and NFR targets verified.

### Step 8–10: Release + observability + iteration
```
/runbook todo-api                  → ops/runbook-todo-api.md (including rollback steps)
/release-gate                      → G8 five gates (quality+audit+NFR+rollback+canary)
/telemetry-plan                    → telemetry (SaaS side: QPS/latency/5xx golden signals)
(switch to agent) eos-review       → iteration writes back to PRD
```

---

## 6.5.2 Path B — Agentic / LLM product (probabilistic)

**Example goal**: build an "intelligent customer-service agent" (change order shipping address, with tool calls). The trunk is **the same** as Path A; steps marked 🟣 are **Agentic-specific**.

### Step 0: Create project + create AI directories
```sh
npx degit niaodian/eos#eos-1.14.0 cs-agent && cd cs-agent
mkdir -p ai/prompts evals                       # AI code goes here; Agentic rules overlay automatically
node .github/hooks/validate-config.mjs          # expect PASS
```
Choose Python as the stack (most common for LLM products): copy the two blocks **Python + AI/LLM additional layer** from stack-presets.

### Step 1–3: Same as Path A (discovery → requirements → spec)
```
(switch to agent) eos-discovery
/requirements "customer-service agent: change shipping address after order, requires authn, anti-BOLA, anti-injection"
/compliance "needed only if PHI/PAN/regulated personal data is involved"   → if regulated, decide Agentic data egress plan immediately
/spec
```
> In **G2**, Agentic projects must especially write **eval success metrics** (accuracy/first-pass rate), **cost/token budget**, and **injection defenses** into requirements--these are the lifeblood of probabilistic products.

### 🟣 Step 4: Architecture (Agentic-specific focus)
```
(switch to agent) eos-architecture     → architecture.md (agent orchestration diagram + tool allow-list)
/adr "orchestration strategy: single-pass state machine vs ReAct loop"
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
/eval-spec                         → docs/eval-plan.md (G-EVAL conditional gate)
```
`/eval-spec` makes you define the evaluation set **before writing code**--this is the "ATDD" of probabilistic systems. The evaluation set must include: golden cases, **prompt-injection adversarial cases**, RAG recall (recall@k), tool-call accuracy, cost/latency budget.
> **Do not want to write an evaluator from scratch?** Copy `docs/eos/examples/eval-starter/` (zero-dependency runnable starter) and adapt it.

### 🟣 Step 6–7: Write AI code + run evals
```
bmad-dev-story                     → agent/tools/chains under ai/ + versioned prompts under ai/prompts/
bmad-code-review
node --test evals/*.test.mjs       → run eval baseline (G-EVAL machine-enforced: must meet threshold)
```
When writing AI code, Agentic rules take effect **automatically**: prompts saved as files (not inline strings), tool typed schema, temperature=0 for reproducibility, treat model output as **untrusted** (anti-injection, output review, do not put secrets/PII into prompts), LLM tracing (token/cost/context/tool-span).

> **Key**: LLM output **cannot be tested with exact-match unit tests** (it is probabilistic)--you must use **evaluation set + grader + regression baseline**.
> If changing prompt/model falls below baseline = no release. This is the most fundamental testing difference between SaaS and Agentic.

### Step 8–10: Release + LLM observability + evaluation flywheel
```
/release-gate                      → G8 (including secret-scan + eval baseline)
/telemetry-plan                    → LLM side: token spend/context usage/tool-chain tracing
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

# Chapter 7 Complete reference (quick-reference)

## 7.1 Slash commands (`.github/prompts/`)

| Command | Purpose | Parameter | Output |
|---|---|---|---|
| `/requirements` | Requirements analysis + operational pre-flight (wraps bmad-agent-pm / bmad-prd) | `<feature or docs/discovery.md path>` | `docs/requirements.md` |
| `/spec` | Produce PRD source of truth (bmad-prd) | `<docs/requirements.md path>` | `docs/prd.md` |
| `/ux-spec` | Design UX/UI visual+experience contract (wraps bmad-ux) | `<docs/prd.md path>` | `docs/DESIGN.md` + `docs/EXPERIENCE.md` |
| `/eval-spec` | Design LLM/agentic evaluation plan (conditional gate G-EVAL) | `<docs/prd.md path>` | `docs/eval-plan.md` |
| `/spec-align` | Quantify spec alignment (AC coverage/first-pass rate/drift, G7 metric) | — | Alignment report (`spec-align.mjs`) |
| `/e2e` | Orchestrate browser/E2E tests (Playwright framework+generation+trace); during development Playwright MCP can drive browser self-checks (see 7.7) | — | Playwright specs + `docs/trace-matrix.md` |
| `/adr` | Record one architecture decision | `<decision title>` | `docs/adr/NNN-*.md` |
| `/deploy-topology` | Choose deployment topology (bare process/Docker/K8s/serverless/PaaS), align NFR, and land ADR | — | Fill `G-deployment.md` + `docs/adr/NNN-deployment-topology.md` + Deployment section in `architecture.md` |
| `/nfr` | Fill C-nfr with concrete target values line by line | — | Updates `C-nfr.md` + PRD NFR section |
| `/compliance` | Regulated-industry compliance pre-flight (regime selection + boundary controls, conditional; uses F-compliance) | `<regime name or domain description>` | `docs/compliance-profile.md` |
| `/telemetry-plan` | Design telemetry and align it with success metrics | — | `docs/telemetry-plan.md` |
| `/release-gate` | Run release gate (G8) | — | Gate report |
| `/runbook` | Generate operations runbook (including rollback steps) | `<service name>` | `ops/runbook-<service>.md` |
| `/validate-config` | EOS configuration static+semantic health check | — | Issue table (does not change code) |

## 7.2 EOS CLI (`node .github/eos/eos.mjs <command>`)

Everything below is offline, zero-dependency and cross-platform. Exit codes: `0` pass · `1` fail or
rejected transition · `2` blocked/pending/stale · `3` EOS itself cannot be evaluated.

| Command | Purpose |
|---|---|
| `next` | The ONE recommended next action, why, and how to start it (`--why`, `--all`) |
| `resume` | Restore this machine's focus in a new session |
| `status` | Where the product and the active scope are (`--changed`) |
| `check --gate <id> [--scope <id>]` | Run one gate for real and record the evidence |
| `explain <gate>` | The full rule set for one gate, on demand |
| `transition --scope <type> --id <id> --to <STATE>` | Move a scope, guarded by recorded evidence |
| `approve --scope <type> --id <id>` | Record an approval — must be a **different** person from the requester |
| `release-status` / `verify-release --release <id>` | Aggregate readiness / candidate-bound verification (G8) |
| **`product-tree`** | The identity of the tree a verification applies to. `--json` prints the digest your test runner embeds in `docs/evidence/test-run.json` |
| `waive --gate … --reason … --risk-owner … --expires …` | Record an expiring, owned waiver (never available for a non-waivable gate) |
| `handoff --scope <type> --id <id>` | Hand the current step to another agent/session |
| `ledger [--verify] [--against <ref>]` | Verify the append-only hash chain |
| `focus --scope <type> --id <id>` | Set this machine's local focus (carries no authority) |
| `init [--write]` | Report or create local, non-destructive integration files |
| `doctor` | Is EOS itself wired correctly? |

**Gate ids** (`check --gate <id>`): `activation` · `discovery-ready` · `requirements-ready` ·
`prd-ready` · `ux-ready` · `architecture-ready` · `story-ready` · `verified` · `release-ready` ·
`telemetry-ready` · `iteration-ready`.

## 7.3 Orchestrator Agents (`.github/agents/`)

| Agent | Phase | Reused BMAD | handoff to |
|---|---|---|---|
| `eos-discovery` | 1 problem definition | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea | → `/requirements` |
| `eos-design` | 3.5 UX/design | bmad-ux, bmad-agent-ux-designer(Sally), bmad-cis-design-thinking(Maya) | → `eos-architecture` |
| `eos-architecture` | 4 architecture | bmad-architecture (Winston) | → `eos-plan` |
| `eos-plan` | 5 planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd | → `bmad-dev-story` → `bmad-code-review` |
| `eos-review` | 10 iteration | bmad-correct-course, bmad-retrospective, bmad-document-project | → `/requirements` (next round) |

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
> **Alternative path** if they still do not appear: run the flow directly with slash commands--prompt files such as `/requirements`, `/compliance`, `/spec`, `/ux-spec`, `/eval-spec`, `/release-gate` do not depend on the agent selector; type `/` to see them. Agents are only "orchestration personas", and their capabilities can all be manually triggered with corresponding prompts/skills (see 7.1 and `docs/eos/agent-map.md`).

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

## 7.5 Project-level Skill (`.github/skills/`)

| Skill | When to use | Purpose |
|---|---|---|
| `eos-operational-readiness` | Phase 2/4 | Force ADOPT/SKIP/DEFER decisions for 10 operational/NFR items, with no blanks |
| `eos-compliance-skeletons` | Development phase (when building 🟡 privacy controls) | Points to runnable starter skeletons (redaction/consent/DSAR/audit; implemented for four default reference stacks: Node/ESM · Python/stdlib · Go · Java/JDK), turning "what should be built" into "starter scaffold"; `redactorFromProfile()` auto-reads the **Regulatory regime:** line from `/compliance` to select a profile |

> See the phase mapping table in `docs/eos/agent-map.md` for the 73 user-level `bmad-*` skills.

## 7.6 Hooks (`.github/hooks/`)

| File | Event | Purpose |
|---|---|---|
| `guardrails.json` + `deny-dangerous.js` | PreToolUse | Blocks dangerous operations + **supply-chain poisoning (`curl&#124;bash`/`--unsafe-perm`) + hardcoded secret literals** (outputs `permissionDecision:"deny"`) |
| `quality.json` | PostToolUse | Runs lint+typecheck+test quality gate after file writes (**advisory**, not the authoritative gate: it always exits 0; the authority is `project-gate.mjs` in CI) |
| `config-check.json` | PostToolUse | Automatically runs `validate-config.mjs` after every edit (configuration S1–S13) **+ `eos-doctor.mjs` (SDLC clinic / G-EVAL wiring / secret scan)** (also advisory) |
| `validate-config.mjs` | Manual/called by hook | Zero-dependency static validator (S1–S13: rule/agent/prompt frontmatter, glob, required paths, hook events, **S12 `.eos/project.json` declaration validity**, **S13 the `.eos/` workflow spine and its cross-references**) |
| `project-gate.mjs` | Manual / **called by CI (authoritative)** | Cross-stack product-quality gate: actually executes install/lint/typecheck/test/eval as declared in `.eos/project.json`. **Fail closed** — an `application` without `commands.test`, a stack manifest with no declaration, or a missing toolchain (BLOCKED) all exit 1 |
| `eos-doctor.mjs` | **PostToolUse (per edit, via `config-check.json`)** / manual / called by CI | Zero-dependency SDLC clinic: **D0 project declaration**, D1/D2 G-EVAL (driven by the `productParadigms` declaration; SDK/dir discovery is only a safety net), D3 G-UX, **D4 secret scan (calls `secret-scan.mjs`)**, **D5 compliance data boundary (validates the structured `docs/compliance-profile.json`, no longer prose keywords)** |
| `secret-scan.mjs` | Manual / called by eos-doctor + CI | Secret scanning: built-in zero-dependency regexes (hardcoded secrets/private keys, accidentally committed `.env`) **+ if `gitleaks` is installed, automatically adds deep scan** (`.gitleaks.toml` allowlist); hits exit 1 and output is redacted |
| `spec-align.mjs` | Manual (`/spec-align`) / called by CI | Quantified spec alignment: parses `prd.md`+`trace-matrix.md` → AC coverage / first-pass rate / drift; `--strict` is **fail closed**: missing files, an AC-less PRD, an empty matrix, drift, orphan rows and failing rows all exit 1 |
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
act push -j verify            # runs .github/workflows/eos-ci.yml: validate-config + eos-doctor + tests + evals
act push --pull=false --action-offline-mode   # fully offline after images have been pulled once
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

**Usage**: run `/e2e` (see 7.1) to orchestrate `bmad-testarch-framework` (initialize) → `bmad-qa-generate-e2e-tests` / `bmad-testarch-automate` (generate/extend) → `bmad-testarch-trace` (AC↔E2E matrix). **During development**, if you want the agent to use Playwright MCP to reproduce/explore localhost, first enable opt-in as above, then **solidify findings into deterministic Playwright specs**.

**Honest boundaries**:
- Browser MCP is **not enabled by default**--**only manually opt in during Phase 7**, avoiding eager startup interference in early phases (see "Why default off" above).
- The MCP layer is **nondeterministic**--use it only for development self-checks, **never in CI**, and **never as a substitute** for deterministic specs. CI only runs Playwright scripts (`eos-ci.yml` / `bmad-testarch-ci`).
- `sandbox` is macOS/Linux only; the network allowlist defaults to `localhost`/`127.0.0.1`; if the app under test needs external resources (CDN, etc.), add domains as needed.
- Want deeper performance/network troubleshooting with **real Chrome**? `【Optional】` switch to Google's `chrome-devtools-mcp`--but it **enables usage telemetry + calls the CrUX API by default**, so for pure local use you must add `--no-usage-statistics --no-performance-crux`.
- Further "on-demand loading" direction: Playwright officially also provides **CLI + SKILLS** forms (for coding agents to lazy-load by relevance, naturally avoiding eager startup)--`【Verify in your version】` maturity; this can be future evolution.
- The concrete UI for agent mode + MCP evolves by version, `【Verify in your version】`.

---

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
| S11 | warn | Every `.prompt.md` has `description` |

> Expected output: `PASS`. Any **error** must be fixed before continuing; **warn** is handled case by case.
> (The above are the checks actually implemented in current `validate-config.mjs`.)

## 8.2 Semantic validation (periodic / after major changes)

Enter **`/validate-config`** in Chat: have Agent read all of `.github/`, detect rule contradictions, duplicates, overly broad scopes, and broken links, then output a `[file][issue type][severity][suggestion]` table, **without changing code**.

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

---

# Chapter 9 Failure localization and troubleshooting

## 9.1 Failure localization decision tree

```
Agent output does not match expectation
├─ Rules ineffective for a certain file class → check that rule's applyTo glob (validate-config S2/S3)
│                                             common: used comma string "a,b" instead of braces "{a,b}"
├─ Rules overridden/mutually contradictory    → run /validate-config semantic check; inspect whether multiple "**" files conflict in wording
├─ Slash command not recognized               → prompt missing description frontmatter; file name must be *.prompt.md
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
| Wrong in every file, wording conflicts | **rule** (multiple always-on conflicts) | `/validate-config` |
| Entering `/x` has no effect | **prompt** (name/frontmatter) | Check whether `.github/prompts/x.prompt.md` exists and has description |
| Flow skips steps or persona is wrong | **agent** (not switched/handoff) | Check current Chat agent; inspect handoffs config |
| Dangerous command passes / quality gate does not run | **hook** (schema/script/script lacks scripts) | Feed JSON using the manual test commands in 7.5 |

## 9.3 Common pitfalls (tested)

- **VS Code opened the parent directory, not the project root** → `eos-*` agents, `.github/instructions`, and `.github/hooks` all silently fail (most common pitfall). Run `code .` from inside the project directory; Explorer top level should directly show `.github/` (see 7.2's 30-second self-check).
- `code --version` returning `3.0.12` is a shim, **not the real version**; check the VS Code About panel for the real version.
- Private template `npx degit user/repo` fails → must use `npx degit --mode=git user/repo`.
- PreToolUse used the wrong schema (`decision:"block"` belongs to PostToolUse) → cannot block. Correct is `hookSpecificOutput.permissionDecision:"deny"`.
- Multiple `applyTo:"**"` files are **not** conflicts (thin, complementary, single-responsibility); validator S3 exempts them.

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
npx degit niaodian/eos#eos-1.14.0 my-app

# Method B: git clone at the tag, into a fresh history
git clone --depth 1 --branch eos-1.14.0 https://github.com/niaodian/eos.git my-app
cd my-app && git checkout --orphan main && git commit -m "chore: start from eos-1.14.0"
```

## 10.3 Distribution to a team (purely local, no enterprise dependency)

1. Everyone starts from the **same release tag** (`eos-1.14.0`). The default branch keeps moving, so
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
- Upgrading existing projects: diff `.github/` from the new template version, selectively merge; user-level `bmad-*` upgrades independently.

### 10.4.1 Upgrading from `eos-1.12.0` to `eos-1.13.0`

This release closes the findings of the `eos-1.12.0` audit. It is deliberately **fail-closed**: an
existing repository will go red before it goes green, and each red line names exactly what to add.

| What changed | What you will see | What to do |
|---|---|---|
| **Evidence is bound to the tested product tree** (EOS-AUD-001) | Every previously recorded gate result is `STALE` ("evaluator version changed", "predates tested-product-tree binding") | Re-run the gates: `eos check --gate story-ready --scope <id>` then `eos check --gate verified --scope <id>`. Nothing is lost — the old evidence is still readable, it is simply no longer *current*. |
| **G1 / G2 / G-UX / G4 are real gates** (EOS-AUD-003) | The product state resets toward `UNINITIALIZED`, and `eos next` asks for `docs/discovery.json`, `docs/requirements.json`, `docs/design.json`, `docs/architecture.json` | Write the four structured records beside the documents you already have. The prompts (`/requirements`, `/ux-spec`) and agents produce them; the schemas are in `.eos/schemas/`. |
| **Product states renamed** | `PRD_APPROVED` → `PRD_BASELINED`, `ARCHITECTURE_APPROVED` → `ARCHITECTURE_BASELINED`, plus a new `UX_BASELINED` | Nothing. Product state is *derived*, so no ledger rewrite is needed. The rename exists because a machine finding a document complete is not a human approving it. |
| **Acceptance criteria must be defined, not mentioned** (EOS-AUD-004) | `prd-ready` reports "referenced but never defined: AC…" | State each criterion as a list item, table row or heading that opens with its id and carries the text. |
| **Operational tasks need a decision** (EOS-AUD-005) | `story-ready` reports `Telemetry: "SKIP" with no reason` | Use `ADOPT — <task>; owner: <who>; verify: <how>`, `SKIP — <reason>`, or `DEFER — owner: <who>; trigger: <what ends it>`. |
| **Trace rows need a machine result** (EOS-AUD-006) | `verified` reports "a hand-written PASS … is a claim, not a result" | Emit `docs/evidence/test-run.json` from your runner — see [examples/trace-evidence](examples/trace-evidence/README.md). It is a ~30-line mapping step, in your language. |
| **The release gate checks what the prompt asks for** (EOS-AUD-007) | `release-ready` adds candidate quality, dependency audit, NFR evidence, canary, health/readiness, topology and enforcement authority | Declare `commands.audit`, record `docs/evidence/nfr-summary.json`, and extend `ops/runbook.md`. An offline audit is `DEFERRED`, never green. |
| **RELEASED continues into G9 and G10** (EOS-AUD-010) | After `RELEASED`, `eos next` asks for telemetry rather than another release | Produce `docs/telemetry.json` (`/telemetry-plan`), then `docs/iteration.json` (`eos-review` agent). |
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
| **Project skills beat user skills** | a `.github/skills/<name>` copy now wins | Nothing, unless you relied on a user-level skill shadowing a project one — which was never intended. |

Recorded evidence from 1.13.x becomes `STALE` (the gate versions moved) and is cleared by re-running
the gates. Nothing needs hand-editing, and nothing is silently reinterpreted.


### 10.4.3 `evidencePolicy` — how much provenance your release evidence needs

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
| P9 | Make irreversible decisions with no ADR | Team amnesia | G4 requires ADR; `/adr` |
| P10 | Skip Spec and output code directly | Code drifts from requirements | G3 is prerequisite to G5; no prd.md, no Planning |
| P11 | Release with no rollback/canary | Cannot recover from incidents | G8 five gates; `/release-gate` |
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
npx degit niaodian/eos#eos-1.14.0 my-app   # create new project
node .github/eos/eos.mjs init --write               # local VS Code tasks (never overwrites)
node .github/eos/eos.mjs next                       # the ONE next action, why, how to start it
node .github/eos/eos.mjs resume                     # new session? pick up where you stopped
node .github/eos/eos.mjs check --gate <id> --scope <id>   # prove a step, record the evidence
node .github/eos/eos.mjs transition --scope story --id <id> --to <STATE>
node .github/eos/eos.mjs explain <gate>             # the full rule set for one gate, on demand
node .github/hooks/validate-config.mjs              # config self-check (expect PASS)
npm test                                            # run tests (same as quality gate)
npm audit                                           # dependency audit before release

# ── Copilot Chat (Agent mode) ──
(agent) eos-guide            # unified entry point: reads the state, gives one action, hands off
/eos-next  /eos-resume  /eos-status   # the same loop as prompts
/eos-help                    # lost? print memory card + current phase + next step (read-only, no file changes)
/eos-init                    # Phase 0: one-time hardening (branch protection + CODEOWNERS + approval baseline → activation.md)
(agent) eos-discovery        # Phase 1: problem definition        → G1
/requirements "<feature>"    # Phase 2: requirements+operational pre-flight → G2★
/spec                        # Phase 3: PRD source of truth      → G3
/ux-spec                     # Phase 3.5: UX visual+experience contract → G-UX (required for user-facing, skip pure backend)
(agent) eos-architecture     # Phase 4: architecture             → G4
  /adr "<decision>"          #   └ every irreversible decision
  /nfr                       #   └ fill NFR target values
(agent) eos-plan             # Phase 5: break stories            → G5
bmad-dev-story               # Phase 6: implementation           → G6
bmad-code-review             #   └ pre-completion code review (no blockers) → G6
bmad-tea / bmad-testarch-*   # Phase 7: testing+traceability     → G7
/runbook <service>           # Phase 8: prepare runbook first
/release-gate                # Phase 8: release gate             → G8★
/telemetry-plan              # Phase 9: telemetry loop           → G9
(agent) eos-review           # Phase 10: iteration write-back    → G10
/validate-config             # Anytime: configuration semantic health check
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
| 8 Release | `my-app/docs/release-gate.md`, `my-app/ops/runbook-auth.md` |
| 9 Observability | 5 `auth.*` events in `src/auth.js` |
| 10 Iteration | `my-app/docs/prd.md §6` (CR-001 write-back) |
| Acceptance report | `my-app/docs/eos/walkthrough.md` (full scorecard + reproduction commands) |

**Reproduce** (terminal):
```sh
npx degit niaodian/eos#eos-1.14.0 my-app && cd my-app
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
> advisory-reminded by `eos-doctor` every run and rechecked before release by `/release-gate` (G8). Use **`/eos-init`** for guided execution--
> it does what can be done locally for you (replace handles, copy baseline) and prints the exact server-side branch-protection steps (the template cannot enable them for you).

## D.1 Make 3 CI hard gates "required checks" `【Needs org/GitHub settings】`

GitHub repository → **Settings → Branches → Add branch ruleset** (or Add rule), targeting the default branch:

1. Check **Require a pull request before merging** (forbid direct push to the default branch).
2. Check **Require status checks to pass before merging** → search and select **`verify`** (the job in `eos-ci.yml`).
   -- This step turns validate-config / eos-doctor / secret-scan from "green-light advice" into "red-light block".
3. Check **Require review from Code Owners** (paired with CODEOWNERS in D.2).
4. (Recommended) Check **Do not allow bypassing the above settings**, to avoid casual administrator bypass.

> Server-side enablement cannot be verified locally: please self-check in Settings. Personal namespace repositories have **no** such protection by default.

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
| `gitleaks` deep scan is an **optional enhancement** (opt-in, never required); if absent it silently degrades | Running only zero-dependency built-in regexes is weaker than full gitleaks rules | Built-in `secret-scan.mjs` always runs as a CI hard gate (baseline); installing `gitleaks` in CI/local automatically adds deep scan |
| **Windows**: core hooks are Node (cross-platform); early `quality.json` once used `sh -c` (round-2 N1 changed it to `node .github/hooks/quality.mjs`, native Windows no longer needs WSL/Git-Bash) | Directory fallback traversal without `git` once showed absolute paths on Windows (normalized with `path.relative`); availability of external tools such as `bmad-*` and `act` (requires Docker Desktop) still varies by platform | Three core hooks + `quality.mjs` are implemented cross-platform; **authoritative quality gate is in CI (`ubuntu-latest`)**, independent of local OS |

**Requires organization decision (template does not decide, `【Needs org standard】`)**: CI runner standard (currently `ubuntu-latest`), approved secret store, namespace/repository ownership, model pin/registration strategy, artifact integrity (SBOM/signing/SLSA). These are not violations; they are organization-standard questions.

---

> This manual evolves with the template version. For changes, sync `docs/eos/VERSION` and run `validate-config.mjs`.
> For design rationale (why it is designed this way), see `docs/eos/blueprint.md`; this manual only covers "how to use it".
