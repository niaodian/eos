# EOS Blueprint — full design (all 12 Parts)

> Single-file complete Engineering Operating System design blueprint.
> Items marked `【Verified · recent VS Code】` have passed local verification and are no longer paper assumptions.
> Items marked `【Optional · needs enterprise/network env】` are not on the main path and can be extended as needed.
> Officially there is **no native rule priority** (multiple instructions are merged and order is not guaranteed) — all "priority" is team convention.

## Contents
- [Part 0](#part-0-design-decisions) Design decisions
- [Part 1](#part-1-assumptions--boundaries) Assumptions & boundaries
- [Part 2](#part-2-overall-design-principles) Overall design principles
- [Part 3](#part-3-six-layer-architecture) Six-layer architecture
- [Part 4](#part-4-end-to-end-development-flow-10-phases) End-to-end development flow (10 phases)
- [Part 5](#part-5-requirements-phase-hardening-directly-targeting-large-scale-post-launch-rework) Requirements-phase hardening
- [Part 6](#part-6-revised--rule-system-design--per-stack-layering) Rule-system design ✅ revised
- [Part 7](#part-7-revised--key-implementation-step-corrections) Implementation steps ✅ revised
- [Part 8](#part-8-config-qa-and-development-flow-acceptance) Config QA and development-flow acceptance
- [Part 9](#part-9-anti-patterns-14) Anti-patterns (14)
- [Part 10](#part-10-revised--key-cross-project-reuse-corrections) Cross-project reuse ✅ revised
- [Part 11](#part-11-artifact-index-complete) Artifact index

## Verified-corrections ledger (4 changes in this version relative to the initial draft)

| # | Correction point | Initial draft (deprecated) | Current (verified/tested) | Where it lands |
|---|---|---|---|---|
| 1 | User-level agents directory | `~/Library/.../User/agents` | **`~/.copilot/agents`** | Part 10.3.1 |
| 2 | PreToolUse hook output schema | top-level `decision:"block"` | **`hookSpecificOutput.permissionDecision:"deny"`** | Part 7.7 |
| 3 | Multiple-glob syntax | comma string `"a.sql,api/**"` | **subfolder organization + braces `{ts,tsx}`** | Part 6.1 / 6.2 |
| 4 | BMAD skill count | `121+ bmad-*` | **73 bmad-*** (121 total skills) | full document |

Verification basis: ① applyTo braces → chat asked for the secret phrase and returned `BANANA-7731`; ② PreToolUse deny → dangerous command was blocked;
③ `/skills` shows 73; ④ official custom-agents documentation "file locations" table confirms `~/.copilot/agents`.

---

# Part 6 (revised) — Rule-system design + per-stack layering

## 6.1 Rule architecture (ten categories)

The control principle is unchanged: **officially there is no native priority**; multiple instructions are merged and order is not guaranteed. Replace priority with
**scope (`applyTo` glob) + single responsibility + naming convention**, with Hooks as the deterministic fallback.

`【Verified · recent VS Code】` **Subfolder organization is legal and recommended**. Official documentation states clearly that VS Code recursively scans
subdirectories under `.github/instructions/`, so organizing rule files by domain into folders is a supported standard practice:

```
.github/instructions/
├─ 00-workspace.instructions.md          # applyTo: "**"
├─ frontend/10-frontend.instructions.md  # applyTo: "**/*.{tsx,jsx}"
├─ backend/10-backend-node.instructions.md   # applyTo: "**/*.ts"
├─ backend/10-backend-python.instructions.md # applyTo: "**/*.py"
├─ backend/10-backend-go.instructions.md     # applyTo: "**/*.go"
├─ backend/10-backend-java.instructions.md   # applyTo: "**/*.java"
├─ backend/10-backend-rust.instructions.md   # applyTo: "**/*.rs"
├─ backend/10-backend-dotnet.instructions.md # applyTo: "**/*.cs"
├─ ai/10-ai-llm.instructions.md          # applyTo: "**/{ai,llm,rag}/**" (additional layer)
├─ data-api/20-data-api.instructions.md  # applyTo: "**/*.{sql,prisma}"
├─ testing/30-testing.instructions.md    # applyTo: "**/*.{test,spec}.*"
├─ security/40-security.instructions.md  # applyTo: "**"
└─ release-ops/50-release-ops.instructions.md # applyTo: "**/{Dockerfile,*.yml,*.yaml}"
```

> Multiple thin rules with `applyTo: "**"` (such as workspace + security) are **additive rather than conflicting** when they cover **different topics**,
> and are a legal pattern (`validate-config.mjs` exempts `**` from the S3 duplicate check).
>
> **Dual-paradigm isolation** (deterministic SaaS ↔ probabilistic Agentic): backend stack rules govern the deterministic side (transactions/idempotency, circuit breaker + exponential backoff + timeout,
> OTel RED signals); `ai/10-ai-llm` governs the probabilistic side (cognitive reflection retry, memory layering: short-term/long-term vector store/strongly consistent SQL, asynchronous decoupling,
> token/context/tool tracing). **The fault-tolerance and state mechanisms on the two sides are explicitly forbidden from being interchanged**; for hybrid projects, `eos-architecture`
> checks asynchronous-decoupling points and paradigm isolation at G4.

The R1 (Global) template is unchanged: include only project-wide common denominators and reference `docs/eos/agent-map.md` to reuse 73 bmad-*.

## 6.2 Mainstream full-stack sub-rules (revised key points)

`【Verified · recent VS Code】` **Brace multi-extension `**/*.{ts,tsx}` works reliably**. Therefore:

- ✅ **Same extension set** → use braces: `"**/*.{tsx,jsx}"`, `"**/*.{sql,prisma}"`, `"**/*.{test,spec}.*"`.
- ⚠️ **Across different paths/domains** → **do not use comma strings** (official comma multi-glob behavior is undocumented and unverified). Instead,
  **split into multiple rule files under subfolders**, one glob per file (see the 6.1 tree).

**Glob mutual exclusion (prevent AP-11 double injection)**: frontend `{tsx,jsx}` and backend `{ts}` are naturally mutually exclusive — in the same React project,
`.tsx` hits frontend rules and `.ts` hits backend rules. If your frontend contains plain `.ts`, narrow backend to a directory such as
`applyTo: "apps/api/**/*.ts"` and widen frontend to `.ts`.

### 6.2.5 Adding a tech stack (4 steps, revised)
1. Create `NN-<area>-<stack>.instructions.md` under `.github/instructions/<area>/`.
2. Write a **single** `applyTo` (merge extensions in the same set with braces; for cross-path cases create another file, **do not use commas**).
3. Use a three-part body: `Architecture / Validation&Errors / Tooling(lint+format+test+commands)`.
4. Run `node .github/hooks/validate-config.mjs` to confirm glob mutual exclusion (S3) passes.

---

# Part 7 (revised) — Key implementation step corrections

## 7.7 Hooks guardrails (revised · matches official schema)

`【Matches official schema · Preview: official states config format/behavior may change, Verify in your version】`
- **`.github/hooks/*.json` is loaded by default** (official `chat.hookFilesLocations` includes `.github/hooks` by default).
  **Workspace hooks do not require any Preview switch**. (`chat.useCustomAgentHooks` only governs agent-embedded hooks written in
  `.agent.md` frontmatter and is unrelated to workspace hooks.) Official references:
  `docs/agent-customization/hooks.md`, `docs/agents/reference/hooks-reference.md`.
- **Event names and schemas have been checked against official docs**: 8 legal events match `hooks-reference.md`; `permissionDecision:
  allow/deny/ask` matches the official PreToolUse schema. (These event names happen to overlap with Claude Code, but are also an official VS Code set.)
- **PreToolUse deny has been verified in recent VS Code**; because it is Preview, use the "hook loading self-check" in user-manual §2.4
  to confirm your current session has actually loaded hooks ("exists ≠ effective"). `deny-dangerous.js` is a **local speed bump** (per-machine,
  parse-failure allows, CI does not call it), not authoritative — authority is the three CI hard gates + branch protection (see user-manual Appendix D).

The output schemas for PreToolUse and PostToolUse are **different**; this was the key bug in the initial draft:

**PreToolUse (intercepts tool calls)** → use `hookSpecificOutput.permissionDecision`:
```javascript
// .github/hooks/deny-dangerous.js (excerpt/illustration; the repository contains the fully hardened denylist + honest-positioning comments)
let s = ''; process.stdin.on('data', d => (s += d)); process.stdin.on('end', () => {
  let payload = {}; try { payload = JSON.parse(s || '{}'); } catch {}
  const text = JSON.stringify(payload);
  const danger = [/rm\s+(-[a-z]*[rf]|--(?:recursive|force))/i, /DROP\s+TABLE/i, /git\s+push[^
]*\s(-f|--force)(?![\w-])/i, /:\s*>\s*\//];
  if (danger.some(r => r.test(text))) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",                 // ← not decision:"block"
        permissionDecisionReason: "Blocked by EOS guardrail: destructive operation detected."
      }
    }));
  } else { process.stdout.write("{}"); }
});
```
> When multiple hooks run concurrently, the strictest wins: `deny` > `ask` > `allow`.

**PostToolUse (after tool completion)** → only then use top-level `decision:"block"` + `reason` (`quality.json` usage is unchanged).

`guardrails.json` configuration is unchanged:
```json
{ "hooks": { "PreToolUse": [ { "type": "command", "command": "node .github/hooks/deny-dangerous.js" } ] } }
```

---

# Part 10 (revised) — Key cross-project reuse corrections

## 10.3.1 User-level vs workspace-level layering (revised)

`【Verified · official custom-agents docs】` The **exact disk locations** for user-level custom file types:

| Content | User-level location (shared across projects) | Workspace location (with repository) |
|---|---|---|
| Skills (including 73 bmad-*) | `~/.copilot/skills`, `~/.agents/skills`, `~/.claude/skills` | `.github/skills/` |
| **Custom agents** | **`~/.copilot/agents`** | `.github/agents/` |
| Prompts | VS Code user profile (created with `Chat: New Prompt File → User`) | `.github/prompts/` |
| Instructions | `~/.copilot/instructions`, `~/.claude/rules` | `.github/instructions/` |
| Hooks | `~/.copilot/hooks`, `~/.claude/settings.json` | `.github/hooks/*.json` |

> Verified locally: `~/.agents/skills` and `~/.claude/skills` each have 121 skills (including **73 bmad-***,
> plus 48 gds-/wds- and others); `~/.copilot/skills` does not exist (create it on demand if needed).

The decision principle is unchanged: **general and stable → user level; project-specific or repository-reviewed → workspace level.**

## 10.3.2 One-command initialization (public repository)

`niaodian/eos` is a public repository, and the GitHub *template repository* setting is currently on.
That setting is owner-level and can change without anything in this repository changing, so verify
it rather than trusting this page: `gh repo view niaodian/eos --json isTemplate`.
`【Needs org/GitHub settings】`

```bash
# A. degit, pinned to a release tag (recommended — the default branch keeps moving)
npx degit niaodian/eos#eos-1.15.0 my-app
cd my-app && node .github/hooks/validate-config.mjs    # expect PASS

# B. gh CLI (needs the template setting above; gives you the newest default branch, not a tag)
gh repo create my-app --template niaodian/eos --private --clone

# C. git template directory (offline local)
mkdir -p ~/.git-templates/eos && cp -R <golden>/.github ~/.git-templates/eos/
git config --global init.templateDir ~/.git-templates/eos
```

Versioning: `docs/eos/VERSION` (current `eos-1.15.0`). For upgrades, use `degit` to pull the new version to /tmp, merge with `diff -ru`,
then run `validate-config.mjs` + `bmad-code-review`.

---

# Part 0. Design decisions

**Complexity level: Standard is the main path; Enterprise capabilities are pluggable through "local equivalents."**
Single-machine macOS local-first is Standard; the target domain (0-1 + 1-N + cross-project governance) has Enterprise ambition.
The right approach: implement an Enterprise-grade "shape" with locally runnable mechanisms and degrade all enterprise dependencies to optional extensions.

**The three most critical failure risks (ordered by fatality):**
1. **Rule bloat + context pollution**: merge order for multiple instructions is not guaranteed, and conflicting instructions drown the Agent.
2. **Reinventing the wheel**: 73 `bmad-*` skills are already installed; if EOS regenerates these capabilities, it creates drift and double maintenance.
3. **Mistaking "priority" for a native feature**: implicit assumptions that rule A overrides rule B fail silently when versions change.

**The three links that most need priority hardening:**
- Requirements-phase operational readiness (five checklists A–E, plus F for regulated, the main turnstile blocking "large-scale post-launch rework")
- Config QA + behavior acceptance (so you can objectively judge whether EOS works as expected)
- Cross-project migration mechanism (correct user-level vs workspace-level layering + template repo)

**Balancing efficiency, constraints, and maintainability:**
- Efficiency comes from one-command `*.prompt.md` slash commands + handoffs, prioritizing calls to `bmad-*`.
- Constraints come from precise `applyTo` scoping + deterministic Hooks guardrails (not Agent self-discipline).
- Maintainability comes from rule budget + Git versioning + clear user-level/workspace-level layering + reusing BMAD to shrink the self-maintained surface.

---

# Part 1. Assumptions & boundaries

**① Explicitly provided premises (facts)**
- OS: macOS · IDE: VS Code (recent version; custom agent/hooks require recent version) · AI: GitHub Copilot (enterprise license, license only)
- BMAD: 73 `bmad-*` skills installed in `~/.agents/skills/`, `~/.claude/skills/` (121 total)
- Goal: standardize the SDD environment and layer standards for the full Agent lifecycle; cover 0-1 + 1-N + scaling; reusable across projects
- Pain points: insufficient requirements front-loading, operational requirements not front-loaded, insufficient 1-N scalability, missing SDLC governance, missing multi-stack rule layering

**② Reasonable assumptions**
- Starting as a solo/small team; local CI = npm scripts + Hooks + `act` (run GitHub Actions locally; requires Docker)
- Default reference stack (pluggable): frontend TypeScript + Next.js; backend Node.js/TypeScript or Python/FastAPI; data PostgreSQL + OpenAPI/REST
- `~/.agents/skills/` and `~/.claude/skills/` are legal personal skills paths recognized by VS Code

**③ Main path vs optional extensions**
- **Main path**: local-first, Git-based, offline runnable; rules/prompt/agent/skill/hook/**local MCP (such as Playwright MCP driving localhost, Phase 7 opt-in, inert by default)** are all self-contained
- `【Optional · needs enterprise/network env】`: org-level instructions, MCP connected to real services, cloud agents, private model backend

---

# Part 2. Overall design principles

## 2.1 Why three kinds of layering are needed

**Rule layering**: officially there is no native priority; the only reliable control mechanism is `applyTo` scope. Slice thinly by mutually exclusive globs,
so "which rule applies to which file type" is determined by deterministic globs, serving token budget and cross-project reuse.

**Process layering**: the value of SDLC is the decision gate. Each phase has explicit inputs/outputs/pass criteria;
turning a "linear conversation" into a "state machine with checkpoints" is the core of reducing rework.

**Context layering**: four kinds of mechanisms correspond to four loading moments:
- `copilot-instructions.md` / `AGENTS.md` = always-on (project-level invariant truth)
- `*.instructions.md` + `applyTo` = conditional trigger (by file type/path)
- `*.prompt.md` = on-demand invocation (slash command, single task)
- `*.agent.md` = role switch (persistent persona + tool limits + handoffs)
- Agent Skills = relevance-based on-demand loading (portable across tools)

> Principle: **do not use always-on when narrow scope works**. always-on is the scarcest resource.

## 2.2 Relationship among the four (one sentence)

**Agile provides cadence, SDLC provides the skeleton, SDD provides the source of truth, and Agentic Engineering provides executors and guardrails.**
The four are layered rather than replacements: SDD is the source-of-truth upgrade of SDLC in the AI era; Agentic Engineering lets Agents
execute SDD/SDLC reliably; Agile determines how quickly they cycle.

## 2.3 Elements an industry-grade Solution must include across the full lifecycle

Requirements traceability / NFR / operational readiness (telemetry · permissions · audit · rollback · monitoring · canary · quota · i18n · multi-tenancy · capacity · DR) /
architecture evolution governance (ADR) / quality and release gates / observability feedback loop.

## 2.4 BMAD positioning and extensions

- **Strengths**: mature full-chain analyst→pm→architect→dev→review→retro, installed and ready to use
- **Limits**: biased toward 0-1 build; operational readiness, NFR checklist, telemetry, quality/release gates, and config QA are relatively thin
- **Extension method**: EOS only creates new pieces at BMAD gaps (operational-readiness checklist, NFR checklist, Hooks gates, validate-config), and explicitly states "why new / what was built / which BMAD it connects to"

## 2.5 Upgrading from only 0-1 to 0-1 + 1-N + scaling

- **0-1**: `bmad-prd` → `bmad-architecture` → `bmad-create-epics-and-stories` → `bmad-dev-story` → `bmad-code-review`
- **1-N**: add operational readiness + `bmad-correct-course` + `bmad-retrospective` + `bmad-document-project`
- **Scaling**: add NFR gates + observability feedback loop + ADR architecture evolution + deterministic Hooks guardrails

---

# Part 3. Six-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│ L1 Environment layer  macOS · VS Code · Copilot(license only) │
│            BMAD 73 bmad-* skills (user-level, shared by all projects) │
├──────────────────────────────────────────────────────────────┤
│ L2 Rule layer  R1 copilot-instructions.md (always-on, minimal) │
│            R2–R8 *.instructions.md + applyTo (mutually exclusive glob) │
│            R9 *.agent.md (persona+handoffs)                    │
│            R10 *.prompt.md (slash command)                     │
│            ▲ No native priority → control with "scope+convention+Hooks" │
├──────────────────────────────────────────────────────────────┤
│ L3 Standards layer  requirements/architecture/coding/testing/release/ops → encoded into L2 │
├──────────────────────────────────────────────────────────────┤
│ L4 Artifacts  PRD/ADR/data-model/API contract/telemetry plan/test strategy/Runbook │
│            most are【Reuse bmad-*】a few are【New-build】        │
├──────────────────────────────────────────────────────────────┤
│ L5 Governance layer  .github/hooks/guardrails.json (PreToolUse interception) │
│            .github/hooks/quality.json   (PostToolUse quality gate) │
│            .github/hooks/config-check.json (config self-check+doctor) │
│            .github/hooks/secret-scan.mjs (secret scan+optional gitleaks)│
│            .github/workflows/eos-ci.yml (act local CI batch gate) │
│            ▲ Three-layer enforcement: real-time Hook + static config + CI full-repo batch │
├──────────────────────────────────────────────────────────────┤
│ L6 Collaboration layer  bmad-agent-*(Mary/John/Winston/Amelia/Murat) │
│            eos-*.agent.md dispatch entry + handoffs chained into workflow │
└──────────────────────────────────────────────────────────────┘
Data flow: discovery→requirements→prd→ux→architecture→stories→code→test→release→telemetry→iterate ⟲
```

**Mechanism mapping by layer** (officially verified, recent VS Code):

| Sublayer | Real mechanism | Source |
|---|---|---|
| Global (always-on) | `.github/copilot-instructions.md` | New-build |
| Workspace | `00-workspace.instructions.md` (`applyTo:"**"`) | New-build |
| Language-Stack | `*.instructions.md` + precise `applyTo`, organized by subfolder | New-build |
| Workflow | `.github/prompts/*.prompt.md` (`#tool` calls `bmad-*`) | BMAD + extension |
| Agent orchestration | `.github/agents/*.agent.md` (`handoffs[]`) | BMAD + extension |
| Skills | `.github/skills/` + `~/.agents/skills/bmad-*` | Reuse+New-build |
| Guardrails | `.github/hooks/*.json` (8 lifecycle events, Preview) | New-build |


---

# Part 4. End-to-end development flow (10 phases)

> State machine: every `→` is a decision gate; do not enter the next phase until the gate is passed.
> `I:` = instructions · `P:` = prompt · `A:` = agent · `H:` = hook

| Phase | Goal | Main executor | Decision gate | Effective rules | Key rework prevention |
|---|---|---|---|---|---|
| 1 Discovery | Converge to a single falsifiable problem statement + measurable success metrics | `bmad-brainstorming`, `bmad-agent-analyst`(Mary), `bmad-forge-idea` | G1: problem is falsifiable + metrics are measurable | `I:00-workspace` | Cheapest correction point: lock the problem against drift |
| 2 Requirement | Expand functional + NFR + **operational readiness** | `/requirements` (wraps `bmad-agent-pm` / `bmad-prd`) + skill `eos-operational-readiness` | **G2: all five checklists pass review (add F if regulated)** | `P:requirements`, `P:nfr`, `I:security` | Main turnstile: blocks large-scale post-launch rework |
| 3 Spec | PRD becomes the single source of truth | `bmad-prd` (create and validate intents) | G3: every requirement has acceptance criteria | `P:spec` | Spec is the contract; downstream only recognizes `docs/prd.md` |
| 3.5 UX & Design (conditional) | Visual + experience contract (mandatory for user-facing products) | `/ux-spec` (wraps `bmad-ux`), `bmad-agent-ux-designer`(Sally), `bmad-cis-design-thinking`(Maya) | **G-UX: every user-facing requirement has screens/flows/three states/a11y/visual tokens; pure backend SKIP+reason** | `P:ux-spec`, `A:eos-design`, `I:frontend` | UI/UX front-loaded: prevents "discovering interaction/information architecture is wrong only after implementation" |
| 4 Architecture | Technical approach + data model + API contract + NFR where it lands + ADR + **lock tech stack** + **deployment topology** | `eos-architecture` (wraps `bmad-architecture` Winston); `/adr`; `/deploy-topology` | G4: key irreversible decisions have ADRs; NFR has where it lands; **tech stack is locked** (update `00-workspace` + enable corresponding R3 + write tech-stack ADR); **deployment topology selected** (NFR basis + deployment-topology ADR) | `I:data-api`, `A:eos-architecture` | API contract before implementation; scalability explicitly reviewed; **stack is locked here** — Phase 0 only leaves a Node placeholder to avoid conflict between always-on rules and the real stack; **topology selects the simplest option satisfying NFR, not K8s by default** |
| 5 Planning | Epics→Stories, each story self-contained with context + acceptance tests first (ATDD) | `bmad-create-epics-and-stories`→`bmad-create-story`→`bmad-sprint-planning`; `bmad-testarch-atdd`; `bmad-check-implementation-readiness` | G5: story ready + every AC has acceptance-test design | `A:eos-plan` | Readiness gate prevents missing context; shift-left testing prevents "adding tests after the fact" |
| 6 Development | Implement by story, constrained by stack rules + guardrails, **code review before completion** | `bmad-dev-story`, `bmad-agent-dev`(Amelia), **`bmad-code-review`** | G6: lint/typecheck/unit tests all green **and code review has no blocking items** | `I:frontend/backend/data-api` (`applyTo` auto-injection) + `H:guardrails` (PreToolUse) + `H:quality` (PostToolUse) | Hooks deterministic interception + review covers design/logic/boundary/security issues automation cannot find |
| 7 Testing | Validate by test strategy + spec↔test traceability + **NFR validation** + **quantified spec alignment** | `bmad-tea`(Murat), `bmad-testarch-trace`, `bmad-testarch-nfr`, `bmad-qa-generate-e2e-tests`, `/e2e` (Playwright framework+E2E+trace; during development Playwright MCP drives the browser, **Phase 7 opt-in**), `/spec-align` | G7: every acceptance item has ≥1 test and all green; **user-facing flow E2E green**; **NFR validated**; **spec-alignment: AC coverage / first-pass rate / no drift** | `I:testing` | trace matrix ensures no untested AC; **spec-align quantifies Agent output's spec alignment and first-pass rate** |
| 8 Release | Ship after quality/security/rollback/canary/NFR gates pass | `/release-gate`; `/runbook` | **G8: all 5 gate items pass (mandatory items)** | `I:release-ops`, `H:quality` | No rollback/no canary means no release; unvalidated NFR means no release |
| 9 Observability | Telemetry launched, metrics visible, operational loop closed | `/telemetry-plan` | G9: critical-path telemetry is in production | `I:release-ops` | Telemetry is designed in requirements; here only implementation validation is done |
| 10 Iteration | Metrics feedback drives next requirements cycle; manage architecture evolution | `bmad-correct-course`, `bmad-retrospective`, `bmad-document-project`, `bmad-sprint-status` | G10: changes written back to Spec | `A:eos-review` (handoff back to requirements) | Changes must be written back to Spec to prevent "code drifting from the source of truth" |

> The main axis is 10 gates (G1–G10). **3.5 UX & Design is a conditional sub-phase** (mandatory for user-facing products; pure backend/CLI projects SKIP+reason),
> inserted between Spec(G3) and Architecture(G4) — PRD defines *what to build*, UX defines *what it looks like/how it interacts*, and architecture defines *how to implement it*.
> The order cannot be omitted; otherwise stories are sliced without screen/state basis. It fully reuses `bmad-ux` and does not rebuild the capability.
>
> **Another conditional gate, G-EVAL (for LLM/agentic products only)**: `/eval-spec` produces `docs/eval-plan.md`; in Planning(G5), design
> the evaluation set (eval-driven, analogous to ATDD); in Testing(G7), run it. LLM output is nondeterministic and cannot use exact-match unit tests — it must use
> eval set + grader + regression baseline. Pure deterministic features SKIP+reason. Paired with `ai/10-ai-llm` rules + C-nfr cost/latency dimensions +
> security LLM red lines + telemetry LLM tracing. This block is mainly `【New-build】` (BMAD has no product-grade eval capability; it only borrows the `bmad-eval-runner` pattern).
> **G-EVAL is now enforced by the local CI machine**: `eos-doctor.mjs` (has `ai/llm/rag` code but no `docs/eval-plan.md` → error) + `eos-ci.yml` (`act` runs evaluation baseline; regression fails). Starter skeleton: `docs/eos/examples/eval-starter/`.

---

# Part 5. Requirements-phase hardening (directly targeting "large-scale post-launch rework")

## 5.1 Three mechanisms for discovering problems

1. **Falsifiability gate** (G1/G2): every requirement must be able to state "what failure looks like." If it cannot, the requirement is unclear and must be reworked immediately.
2. **Reverse-questioning method**: force the following questions for every functional requirement:
   - Who is **not authorized** to do this? (→ exposes authz gaps)
   - If it is done wrong, how does it **roll back**? (→ exposes rollback gaps)
   - How do we **know** whether it is useful in production? (→ exposes telemetry gaps)
   - What happens when user volume is ×100? (→ exposes scaling gaps)
3. **Five-checklist trigger**: turn implicit requirements that only veterans remember into mandatory questions.

## 5.2 Operational-readiness mapping table

| Operational element | Requirements-phase artifact | Architecture-phase where it lands |
|---|---|---|
| telemetry | Key event checklist + corresponding success metrics | event schema, reporting channel |
| authz | role/resource/action matrix | authorization middleware, policy point |
| audit | checklist of operations requiring audit | audit log table / tamper-resistant storage |
| rollback | rollback method for each high-risk change | migration reversibility, feature flags |
| canary | canary dimensions (user/region/percentage) | feature flags / traffic splitting |
| quota | resource ceilings, abuse thresholds | rate limiter, quota metering |
| i18n | target languages/regions | externalized copy, locale routing |
| multi-tenancy | isolation level (row/database/instance) | tenant context throughout |
| capacity/SLO | SLO/SLA targets | capacity model, cache/sharding |
| DR | RTO/RPO targets | backup/failover |
| regulatory (if regulated) | named regime + per-control decisions (through `F-compliance`) | data residency, audit retention, consent/DSAR, vendor BAA/DPA, AI redaction gateway |

## 5.3 Seven checklists (A–F reviewed at requirements gate G2; G reviewed at architecture gate G4; full versions in docs/checklists/)

**A. Requirements gaps** (`docs/checklists/A-gap.md`): falsifiable problem statement / measurable acceptance criteria /
boundaries/exceptions/concurrency defined / dependencies listed / scope-out explicit / overlap checked.

**B. High-probability post-launch additions** (`docs/checklists/B-rework.md`): telemetry / authz / audit /
rollback-flag / monitoring-alerting / canary / rate-limit-quota / i18n-l10n /
empty/error/loading-state UX / data migration reversibility.

**C. Non-functional requirements** (`docs/checklists/C-nfr.md`): performance (P95 latency/throughput) / capacity & scaling /
availability & DR (SLO/RTO/RPO) / security & compliance / observability (logs/metrics/tracing) / maintainability / a11y.

**D. Operational readiness** (`docs/checklists/D-ops.md`): telemetry↔metric closure / permission matrix / audit scope /
rollback plan / canary dimensions+thresholds / quota/rate limiting / multi-tenant isolation / i18n / capacity model+alerts / Runbook.

**E. Security and secrets** (`docs/checklists/E-security.md`): secrets not in code/frontend / `.env` governance /
supply-chain poisoning protection / least-privilege credentials / secret rotation / sensitive-operation audit.

**F. Regulated-industry compliance** (`docs/checklists/F-compliance.md`, **review only when a named regime is selected**):
regime selection (HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL) → cascade into specific controls (data residency, audit retention period,
minimum-necessary access, vendor **BAA/DPA**, **Agentic data egress** decision: BAA · self-hosting · redaction gateway · exclude regulated data).
> **Not legal advice**: this only enforces early engineering decisions; compliance/legal still requires human sign-off. `【New-build】`

**G. Deployment topology decision** (`docs/checklists/G-deployment.md`, **review during Phase 4 architecture, gate G4**, not G2):
selection matrix (bare process/Docker/K8s/serverless/PaaS) × NFR triggers × rollback/canary/health contract × team-size cost.
Rule: **choose the simplest topology satisfying NFR, do not default to K8s**; paired `/deploy-topology` walkthrough lands a `deployment-topology` ADR.
Real cluster/registry/cloud is `【Needs enterprise/network env】`; local can still run without relying on it. `【New-build · pairs with bmad-architecture】`

> Each item has three choices: **adopt** (write requirement) / **do not adopt + reason** / **defer + trigger condition**. Leaving blank is forbidden.

## 5.4 Hook-in snippet (Step 2 + Step 3 in the `/requirements` prompt)

See `.github/prompts/requirements.prompt.md`:
- Step 2 forces row-by-row decisions against the 5.2 table, with no blanks allowed.
- Step 2.5 **regulated-industry regime front-loading**: select regime → run `F-compliance` (dedicated command `/compliance`); if an LLM product involves regulated data, decide Agentic data egress on the spot.
- Step 3 checks the five checklists (A–E, plus F if regulated) item by item; any unresolved item is marked BLOCKER and mapped to the G2 decision gate.


---

# Part 8. Config QA and development-flow acceptance

## 8.1 Static validation (`validate-config.mjs`)

Script: `.github/hooks/validate-config.mjs`, zero-dependency, `node .github/hooks/validate-config.mjs`.

| Check item | Description | Hooks linkage |
|---|---|---|
| S1 | Every `.instructions.md` has valid YAML frontmatter | — |
| S2 | Every `.instructions.md` has legal `applyTo` (else manual-attach only) | `config-check.json` PostToolUse runs `validate-config` after each write to a rule file |
| S3 | Non-`"**"` files have no duplicate globs (`"**"` may legally coexist) | — |
| S4 | Common source types (`.ts`/`.tsx`/`.py`/`.sql`) have rule coverage | — |
| S5 | Always-on budget: `copilot-instructions.md` ≤40 lines (error); each `applyTo:"**"` rule file ≤300 words (warn) | — |
| S6 | File name matches `NN-area[-stack].instructions.md` | — |
| S7 | Required paths exist (`copilot-instructions.md`, `instructions/`, `prompts/`, `agents/`, `hooks/`, `docs/eos/agent-map.md`, `docs/eos/activation.md`) | — |
| S9 | hook JSON is valid and event names are valid | — |
| S10 | Every `.agent.md` has valid `name` (error) + `description` (warn) | — |
| S11 | Every `.prompt.md` has `description` | — |

**Goal**: 0 errors, 0 warnings (currently passed; see work_done).

## 8.2 Semantic validation prompt

`.github/prompts/validate-config.prompt.md` — lets the Agent read the `.github/` directory and validate:
whether rules have contradictory logic, whether glob coverage has gaps, whether NFR in PRD and Spec has where it lands, and whether hook logic conflicts with rules.

## 8.3 Smoke-acceptance Rubric (10-phase scorecard)

Run the process once with one minimal dry-run feature per phase (such as "user login"):

| Phase | Expected output | Pass criteria |
|---|---|---|
| Discovery | single-sentence problem + success metrics | ☐ falsifiable ☐ measurable |
| Requirements | PRD draft + five checklists | ☐ checklist has no unresolved BLOCKER |
| Spec | standard `docs/prd.md` | ☐ every requirement has acceptance criteria |
| Architecture | ADR + API contract | ☐ ADR decision has trade-off ☐ API before implementation |
| Planning | Story list | ☐ each story has AC + context |
| Development | code + hook pass | ☐ hook does not block compliant code ☐ dangerous instruction is blocked |
| Testing | tests + trace matrix | ☐ every AC has ≥1 test ☐ all green |
| Release | G8 gate checklist | ☐ all 4 items √ |
| Observability | telemetry in production | ☐ critical path visible |
| Iteration | changes written back to Spec | ☐ `docs/prd.md` updated |

**Failure-localization decision tree**:
```
Agent output does not match expectation
├─ Ineffective for a certain file type → check applyTo glob (S2/S3)
├─ Rule overwritten/contradictory → check whether multiple "**" files have conflicting wording (semantic validation prompt)
├─ prompt not recognized → check description field (S11)
├─ dangerous operation not blocked → check deny-dangerous.js schema, grep hookSpecificOutput.permissionDecision
└─ global rule ineffective → confirm .github/copilot-instructions.md path is correct (S1)
```

---

# Part 9. Anti-patterns (14)

| # | Symptom | Consequence | EOS defense |
|---|---|---|---|
| P1 | Only functional Spec is written, no NFR | SLO explodes after launch; there is already heavy coupling when tests are added | C-nfr checklist is mandatory for G2; architecture phase must have NFR where it lands |
| P2 | Operational requirements (telemetry/authz/canary) are not front-loaded | Post-launch patch rework costs × 3 | D-ops checklist + `eos-operational-readiness` skill + G2 | 
| P3 | All rules are stuffed into `copilot-instructions.md` | always-on length explodes and pollutes every session | copilot-instructions.md ≤40 lines, S5 always-on-budget gate |
| P4 | Reinventing the wheel (creating similar prompts when `bmad-*` already exists) | double maintenance, output drift | every artifact must mark source; agent-map.md reference table |
| P5 | Assuming multiple rules have native priority | silent errors after version changes | officially verified: order is not guaranteed; control with applyTo + Hooks |
| P6 | Using comma-separated multiple globs in a single `applyTo` | not verified in official docs, behavior unknown | S2 check; recommendation: use brace expansion `{a,b}` instead |
| P7 | `deny-dangerous.js` uses the PostToolUse schema `decision:"block"` | PreToolUse ineffective, dangerous operation passes | `deny-dangerous.test.mjs` invariants; correct field: `hookSpecificOutput.permissionDecision:"deny"` |
| P8 | Rule bloat, a single file exceeds 300 words | Token exceeds budget and rules are truncated | S5 word-count check (always-on files); split files by "single responsibility" |
| P9 | Irreversible architecture decisions are made without ADR | team memory is lost; no decision context during evolution | G4 must have ADR; `/adr` prompt |
| P10 | Letting Agent generate code directly and skip Spec | code drifts from requirements; tests have no traceable target | G3 is the prerequisite gate for G5; no `docs/prd.md`, no Planning |
| P11 | Releasing without rollback/canary | cannot withdraw when issues occur; all users are affected | G8 five-item gate; `/release-gate` prompt enforces it |
| P12 | Writing enterprise/intranet interfaces into local rules | configuration breaks outside the enterprise environment and is not portable | working convention B; local config only writes locally verifiable content |
| P13 | User-level skills/agents contain project-specific configuration | cross-project pollution; new projects are constrained by old projects | user level holds general capabilities; project-specific content goes under `.github/` |
| P14 | Publishing EOS config updates without validation | rules silently fail with no awareness | after every rule-file change, run `validate-config.mjs` + rubric |

---

# Part 11. Artifact index (complete)

> Complete file contents live at the corresponding paths; this section is an index with source annotations.

| # | Artifact | Path | Source |
|---|---|---|---|
| D1 | Overall architecture diagram (textualized) | `docs/eos/blueprint.md` Part 3 | New-build |
| D2 | Complete rule directory structure | `docs/eos/blueprint.md` Part 7 / `README.md` | New-build |
| D3 | Rule file templates (with real frontmatter) | `.github/instructions/**/*.instructions.md` | New-build |
| D4 | Mainstream tech-stack sub-rule template set + cookbook | `instructions/frontend/`, `backend/` (node/python/go/java/rust/dotnet), `ai/`, `data-api/`; `docs/eos/stack-presets.md` | New-build |
| D5 | Standard development flow diagram (10 phases) | this document Part 4 | New-build |
| D6 | Requirements-phase gap checklist | `docs/checklists/A-gap.md` | New-build |
| D7 | Non-functional requirements checklist | `docs/checklists/C-nfr.md` | New-build |
| D8 | Telemetry and operational-readiness checklist | `docs/checklists/D-ops.md` | New-build |
| D9 | Quality/release gate checklist | `docs/checklists/B-rework.md`; `/release-gate` prompt | New-build + BMAD extension |
| D10 | Config QA checklist + development-flow acceptance rubric | this document Part 8; `validate-config.mjs` | New-build |
| D11 | New-project Quickstart + cross-project migration guide | `docs/eos/quickstart.md` | New-build |
| D12 | End-to-end implementation walkthrough | this document Part 4 × Part 8 rubric (using "user login" dry-run) | New-build |
| D13 | MVP vs Enterprise solution comparison | see table below | New-build |
| — | UX/design planning phase (visual + experience contract) | `/ux-spec`, `A:eos-design`; produces `docs/DESIGN.md`+`docs/EXPERIENCE.md` | Reuse BMAD (bmad-ux/Sally)+extension |
| D14 | Regulated-industry compliance checklist + regime front-loading + Agentic data egress gate | `docs/checklists/F-compliance.md` (+ appendices `F-compliance-hipaa.md`/`F-compliance-pci-dss.md`/`F-compliance-gdpr-pipl.md`); `/compliance` + `/requirements` Step 2.5; `eos-doctor` D5 | New-build |
| D15 | Deployment-topology decision checklist + selection gate (Phase 4/G4) | `docs/checklists/G-deployment.md`; `/deploy-topology`; connected to `eos-architecture`(G4) + `/release-gate`(G8) + R8 `release-ops` rules | New-build extension (pairs with bmad-architecture) |
| D16 | Third-party audit hardening (enforcement authority / portability / detection coverage) | keystone scaffold `.github/CODEOWNERS` + `.vscode/settings.json.example` + user-manual Appendix D; `eos-doctor` D5 warn→error (regulated+LLM+no boundary), D1/D2 dependency-signal directory-name escape elimination; `secret-scan` extension/no-extension coverage + same-line false-negative tightening; `deny-dangerous` denylist gap-fill + honest positioning; if CI has package.json then require test script; `/release-gate` connects to `spec-align --strict`; G1 event names checked against official `hooks-reference.md` (audit false positive) + Preview wording unified | New-build extension (audit-driven) |
| D17 | Second-round review refinements (eos-1.9.1, Low/info) | N2: `agents` directory only counts as an LLM signal when **LLM dependency co-occurs** (`ai/llm/rag` remains OR), eliminating false positives from traditional SaaS `src/agents/` for D1/D5; N1: `quality.json` changed from `sh -c` to `node quality.mjs` (native Windows runnable) + three core hooks use `path.relative` for path normalization; N4: `settings.json.example` adds `autoApproveWorkspaceNpmScripts:false` (official v1.108 verified); `deny-dangerous` allows safer `--force-with-lease`, adds `rm` long flags/`-R`; N3: `secret-scan` PLACEHOLDER generic terms add word boundaries to narrow false-negative surface; Appendix D.4 adds Windows/gitleaks trade-off row | New-build extension (review-driven) |
| D18 | Third-round (final-round) audit closure (eos-1.9.2, nit polish; audit 91/100 "production ready · requires downstream enforcement", no new active defects) | ① added in-repo guardrail regression test `.github/hooks/deny-dangerous.test.mjs` (zero-dep `node:test`) and **wired it into CI**: makes "`--force-with-lease` must be allowed / `rm` long flags+`-R` must be blocked / benign must not false-positive" a **visible and CI-enforced** invariant instead of temporary empirical proof (residual #9/#11) ② `quality.mjs` per-edit narrowed to `lint`+`typecheck` (full `test` stays in CI, avoiding slowing each tool-call agent loop; residual #6) ③ `deny-dangerous` git push regex adds `/i`, unifying case-sensitivity wording with `rm` rules and `settings.json.example` mirror (nit #8). Remaining 9 points are structural ceiling (downstream branch protection + organizational compliance file, both 🅟 not self-solvable by the template) | New-build extension (final-round audit-driven) |
| D19 | Guided Activation: moving the actions that "take back downstream points" into the main flow (eos-1.10.0) | Of the missing 9 points in audit 91/100, "enforcement authority (+4) + organizational compliance (+2)" are **one-time downstream actions**, but before this they passively lived only in Appendix D (manual line 1113), with **zero prompts** in the main flow (Phase 0 / Day-1 / quick-reference table / release gate) → a systemic forgetting vector. Add: ① in-repo **checkable ledger** `docs/eos/activation.md` (`[ ]`/`[x]`/`[~]waived:reason`, human-readable+machine-readable; template intentionally all unchecked = honest self-reporting) ② discoverable `/eos-init` guided command (does what local can do + prints exact server-side steps + stamps ledger) ③ `eos-doctor` A0 **advisory** activation facet (each run/CI shows remaining items, always exit 0 — local cannot verify server side, so it reminds but does not block) ④ `/release-gate` adds "enforcement authority active" check line ⑤ `validate-config` S7 makes ledger required (cannot be silently deleted) + footer NOTE ⑥ main-flow wiring (Phase 0 row / §3.4 / §6.x anti-forgetting note / glossary / Appendix D cross-link / quickstart / README) ⑦ new `/eos-help` targeted command (read-only: detects current phase + prints memory card + next step + activation status; discoverable in `/` menu, beginner-friendly). Triple visibility upgrade: guided-init → continuous-advisory → release-checklist, with waiver available to experts and strong guidance for beginners | New-build extension (final-round DX-driven) |
| D20 | Fourth-round audit closure (eos-1.10.0, consistency nit; audit 94/100 "production ready · main flow now guides downstream hardening", compared with 91 ↑3, no new active defects, no regression) | Only low-risk finding: the `/eos-init` ending "Next" breadcrumb wrote discovery as slash command `/discovery`, but `discovery.prompt.md` does not exist (no such command in `/` menu), contradicting the consistent convention elsewhere in the system: "switch to the **eos-discovery** agent" (quickstart L31 / user-manual L79/L519 / sister command eos-help) — violating the division of labor where "agents manage open-ended exploration, commands manage structured outputs." Fix: that line `/discovery` → "switch to the **eos-discovery** agent" (keep `/requirements` fallback; **do not add** `/discovery` command). Verified as the only dangling slash reference in the repository. After the fix, audit consistency dimension 14→15, total score 94→95. The other two non-blocking audit items are structural ceilings (self-reporting ≠ server-side verification / profile-neutral does not certify organizational compliance), still 🅟 downstream/org actions and outside this scope | New-build extension (fourth-round audit-driven) |
| D21 | Fifth-round audit: fixing the "green but empty" gate defects (eos-1.11.0; 4 bypassable gates confirmed by isolated fault injection) | **EOS-001** `spec-align --strict` exited 0 when `docs/prd.md`/`docs/trace-matrix.md` were missing => the release hard gate could run empty: strict is now **fail closed** (missing files / an AC-less PRD / an empty matrix / drift / **orphan rows** / failing rows all exit 1, each with a named reason), advisory still exits 0 but prints `ADVISORY / SKIP`; new `spec-align.test.mjs` (11 cases) wired into CI. **EOS-002** the CI product-quality step ran only when a root `package.json` existed => **failing tests in Python/Go/Java/Rust/.NET were never executed** ("config green != product tests green", contradicting the documented six-stack support): new structured declaration `.eos/project.json` (`projectType`/`stacks`/`commands`/`productParadigms`) + zero-dep cross-platform runner `project-gate.mjs` (executed **without a shell**, metacharacters rejected at load time => config cannot be an injection vector; a missing toolchain reports **BLOCKED** instead of silently passing); `application` without `commands.test`, `config-only` with a stack manifest or declared commands, and a manifest with no declaration all exit 1; a pure Node repo keeps the legacy npm defaults (compat); `validate-config` gains **S12**. **EOS-003** `llmPresent` was inferred from `ai/llm/rag` dir names + a narrow SDK regex => `litellm` under `src/virtual_employee/` bypassed G-EVAL: the **explicit declaration is now authoritative** (`productParadigms: ["agentic"]`/`evalRequired`), with SDK/dir discovery demoted to a safety net (widened to litellm/langgraph/crewai/autogen/semantic-kernel/bedrock/vertexai/@ai-sdk/dashscope… , manifests collected tree-wide for monorepos, and matched against **extracted dependency identifiers** so `<description>` prose cannot false-trip); declaring deterministic while LLM evidence is discovered requires `evalWaiver{reason,approvedBy}` or exit 1. **EOS-004** D5 only checked whether words like BAA/DPA/redact appeared in prose => **"no redaction is implemented" was read as a recorded boundary and passed**: replaced by validation of the structured `docs/compliance-profile.json` (regimes / data categories / `thirdPartyModelPolicy` / control status / agreements / retention / owner / approval + `reviewBy` expiry / implementationStatus, all enumerated); regulated + LLM with an unapproved, unimplemented or absent profile now fails closed, and an `evalWaiver` can clear the eval gate but never the data boundary; prose remains for humans and no longer constitutes machine authorization. 3 new test files (69 cases total) all wired into CI, covering RED→GREEN for all four defects | New-build extension (fifth-round audit-driven) |
| D22 | Developer-experience iteration: the guided workflow (eos-1.12.0) | Problem: the method was correct but the *navigation* was manual — a developer had to read the manual, remember G1–G10, choose the agent and the BMAD skill, and could hand-edit a Markdown field to claim a stage was finished. Added a four-layer, zero-dependency, offline core: (1) a **structured state model** — `.eos/workflow.json` (change-type gate policy for PRODUCT_BASELINE/FEATURE/BUGFIX/SPIKE/HOTFIX/DOC_ONLY/GOVERNANCE/RELEASE + three state machines), `.eos/gates.json` (5 machine-verified gates with per-check evaluators and versions), `.eos/agent-map.json`, `.eos/schemas/*` and an append-only hash-chained `.eos/ledger/events.jsonl`; (2) a **gate & transition engine** whose evidence binds commit + gate version + evaluator version + every input hash, so a changed input or a changed governance file turns a previous PASS into STALE automatically, and where a missing tool / crashed validator / undeclared product is BLOCKED or ERROR and never PASS; (3) a **deterministic next-best-action router** returning exactly ONE action with its reason, target gate, agent/prompt/minimal skill chain, runnable command and machine-checkable done-when; (4) an **experience layer**: `node .github/eos/eos.mjs` (status/next/resume/check/transition/approve/explain/release-status/verify-release/waive/handoff/ledger/focus/init/doctor), the `eos-guide` agent, `/eos-next` `/eos-resume` `/eos-status`, minimal hash-bound handoff packages and non-destructive VS Code tasks. Story and release state now come only from the ledger (a hand-edited `state:` field is reported as drift), the product state is derived by walking the machine while each guard holds, waivers require a non-requester approver + expiry + compensating controls and EOS drafts but never approves them, and `validate-config` gains **S13** cross-referencing the whole spine. 79 new tests (state model 24 / routing matrix 34 / CLI contract 21) plus 10 S13 tests, all wired into CI along with `eos ledger --verify` (append-only, also against the PR base ref) and a published gate summary | New-build (developer-experience iteration) |
| D23 | Adversarial hardening of the guided workflow (eos-1.12.0) | An independent read-only review, plus self-probing, drove nine bypasses of the new layer as working exploits; each is now closed with a regression test that performs the exploit (`.github/eos/bypass.test.mjs`, 12 cases). **Classification** — relabelling a story `SPIKE`/`DOC_ONLY`/`PRODUCT_BASELINE`/`RELEASE` disabled every gate and walked it to MERGED: a change type may now only classify the scope it declares, `mergeable: false` stops a SPIKE from ever reaching MERGED, and the "must be justified" rule is DERIVED (any type that switches BOTH story-ready and verified off requires a `classificationReason`), so forgetting a flag cannot open the hole. **Authority leak** — the gitignored `.eos/local/active-work.json` could supply a `changeType`, i.e. select the gate policy from an untracked file: that key is now dropped on read and refused by `eos focus`. **Waivers** — a recorded `WAIVED` never expired because the waiver was not an evidence input; the honoring waiver is now bound into the evidence and re-evaluated (expiry / approver / existence) on every read. **Ledger** — the hash chain was only checked by `ledger`/`doctor`, so every other consumer trusted forged lines; `readSnapshot` now verifies it, `status` refuses to render state derived from an unverifiable source, `.eos/ledger/head.json` pins length + tail so truncation is detectable, and an unverifiable ledger reports `UNVERIFIED` (non-zero) instead of `PASS`. **Evidence** — a hand-written or hand-edited evidence file was believed verbatim; evidence is now schema-validated on read, its recorded input SET must match what the gate reads today, set-membership digests catch a story added after a release gate ran, an unrecognised status aggregates to ERROR, and — decisively — the status must equal what its own checks aggregate to AND agree with the hash-chained ledger. `.eos/project.json` and `.eos/ledger/` joined the CODEOWNERS-protected set; CI verifies append-only against the commit the build sits on for pushes as well as pull requests | New-build hardening (adversarial review-driven) |
| D24 | Sixth-round audit closure: verification bound to the product it verified (eos-1.13.0) | The `eos-1.12.0` audit walked a story to `MERGED` after rewriting its implementation, walked four empty documents to "architecture approved", and got a green doctor beside BMAD skills that could not activate. **EOS-AUD-001 (P0)** evidence recorded the commit but never the product's *content*, so a rewrite left every recorded hash matching: a versioned **tested-product-tree identity** now digests every tracked + untracked-not-ignored file **with its git mode** (source, tests, prompts, eval data, manifests, lockfiles, runtime/deployment config; add/delete/rename/`chmod`/symlink-retarget all visible), excluding EOS's own evidence/ledger/handoff/local/machine-summary output **by construction** so recording a result cannot invalidate it; `VERIFIED → MERGED` and G8 recompute and compare, and no git repository is `BLOCKED`, never `PASS`. **EOS-AUD-002 (P0)** the skill check read directory names only: `.eos/bmad.lock.json` + `eos-doctor --deep` now verify the project-local `_bmad/` runtime and the executables the *installed* skills invoke, reporting **BLOCKED** when a skill cannot activate at all and **DEGRADED** when it activates only on shipped defaults (every skill documents that fallback, so calling it BLOCKED would be a false red — the mirror image of the false green being removed); deprecated `bmad-create-prd`/`bmad-validate-prd` migrated to `bmad-prd`; ADR-003. **EOS-AUD-003** G1/G2/G-UX/G4 became evaluators over structured stage records, and `*_APPROVED` → `*_BASELINED` because a machine finding a document complete is not a human approving it. **EOS-AUD-004/005/006** an AC counts only when *defined* (comments and fenced blocks stripped), operational tasks are ADOPT+owner+verification / SKIP+reason / DEFER+owner+trigger with placeholder detection, and a trace row must bind to an existing test file, an agreeing selector and a machine run bound to this tree. **EOS-AUD-007** all 13 items the release prompt asks for are evaluators — including re-running the quality commands **on the candidate** — with a new `DEFERRED` status that is visible and never green (and unavailable to a regulated product). **EOS-AUD-008/009** docs hand the reader the verification command instead of asserting an owner-level GitHub setting; actions pinned to immutable SHAs on `node24`, least-privilege permissions, timeouts, concurrency, candidate-bound release job. **EOS-AUD-010** `RELEASED → OBSERVED → ITERATED`, and `ROLLED_BACK` closes through an incident review instead of reshipping. **EOS-AUD-011** a vendor-neutral regulated+agentic preset that is explicit about not conferring compliance. Adversarial review of the remediation itself found seven more (a release accepting a `FAIL` latest verification, schema absence disabling validation, `../` evidence escapes, self-reported eval/NFR verdicts, CJK prose read as a placeholder, a ledger event shape `verify-release` itself rejected). Tests 181 → 256 | New-build extension (sixth-round audit-driven) |
| D25 | Round B: the external-authority boundary and its first adapters (eos-1.15.0) | Two gates could never be closed by a program on a laptop: `activation-authority` was permanently BLOCKED because EOS cannot see server-side branch protection, and `attestation` was a claim nobody verified. **ADR-005** fixed five decisions first, because code would otherwise have made them silently: network is an optional enhancement, never a requirement (D1); a regulated project must STATE its evidence policy rather than have one imposed — `eos-1.14.0` blocked regulated releases on local evidence, which excluded air-gapped users who are often the most regulated (D2); EOS never handles a credential, delegating to an already-authenticated CLI whose token never enters the process (D3); an adapter is MONOTONIC (D4); and EOS is read-only against every external system, because a tool that can grant itself enforcement authority can also remove it (D5). **ADR-006** then built the contract and two adapters. The design reduces to one sentence — **only a `PASS` may raise a verdict** — after an earlier draft that ranked statuses let a provider which merely FAILED TO ANSWER change the outcome: not knowing is not evidence. An absent, unreachable, unauthorised, timed-out or crashed provider therefore leaves the verdict exactly as it was before any adapter existed, and only `activation`/`release-ready` consult one, so no provider problem can block the development loop. A deterministic mock reproduces every failure mode offline, because an adapter whose failures can only be seen with a network is an adapter whose failures are never tested. 289 tests | New-build extension (robustness round B) |
| — | Agentic Engineering extension pack (LLM/agent products) | `ai/10-ai-llm` rules, `/eval-spec`(G-EVAL), C-nfr/security/telemetry extensions; produces `docs/eval-plan.md`; starter skeleton `docs/eos/examples/eval-starter/` | New-build extension (borrows from bmad-eval-runner) |
| — | BMAD reuse map (73 bmad-*) | `docs/eos/agent-map.md` | Reuse BMAD |
| — | Operational-readiness skill | `.github/skills/eos-operational-readiness/SKILL.md` | New-build |
| — | Compliance-code starter skeleton (🟡→scaffold) | skill `.github/skills/eos-compliance-skeletons/` + `docs/eos/examples/compliance-starter/` (redaction/consent/DSAR/audit, **all four default reference stacks implemented: Node/ESM · Python/stdlib · Go · Java/JDK**, zero-dependency runnable; redaction is the code form of the D5 data-egress gate, tiered by HIPAA/PCI/GDPR-PIPL, and `redactorFromProfile()` automatically reads the **Regulatory regime:** line produced by `/compliance` to select tier, avoiding hardcoding) | New-build extension |
| — | Hooks guardrails | `.github/hooks/guardrails.json` + `deny-dangerous.js` (dangerous operations + supply-chain poisoning + secret leakage) | New-build |
| — | Security gates | `secret-scan.mjs` (secret scan) + `E-security.md` (checklist) + security/frontend red lines; reuse `bmad-review-adversarial-general` human review | New-build extension + Reuse BMAD |
| — | Local CI (`act` runnable) + SDLC doctor | `.github/workflows/eos-ci.yml` + `.github/hooks/eos-doctor.mjs` (validate-config+doctor+tests+evals; G-EVAL machine-enforced) | New-build extension (reuse bmad-testarch-ci) |
| — | Static config validator | `.github/hooks/validate-config.mjs` | New-build |

**D13: MVP vs Enterprise comparison**

| Capability | MVP main path | Enterprise optional extension |
|---|---|---|
| Rule distribution | Git template / degit | `【Needs enterprise env】` org-level instructions |
| AI Agent backend | Copilot (local) | `【Needs enterprise env】` private model backend |
| External integration | **local MCP** (such as Playwright MCP driving localhost, local-first, Phase 7 opt-in, inert by default) / none / mock | `【Needs enterprise env】` MCP servers connected to real enterprise backends |
| Quality gate | npm scripts + Hooks + **act local CI** (`eos-ci.yml`, requires Docker) | `【Needs enterprise env】` hosted runner / org-level pipeline |
| Monitoring | console / local mock | `【Needs enterprise env】` cloud observability platform |
| Rule review | validate-config.mjs (local) | `【Needs enterprise env】` org-level policy scan |

