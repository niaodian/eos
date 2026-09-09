# EOS ↔ BMAD Reuse Map

> **You do not need this table to work.** `.eos/agent-map.json` is the machine-readable version the
> router reads: it maps one action to one primary agent (or prompt) plus the minimal skill chain, and
> `eos next` hands you that mapping already resolved. This page is the human-readable projection —
> read it when you want the whole landscape, not to pick a skill for the step you are on.

| Phase | Use (skills / agents) |
|---|---|
| Navigation (any phase) | EOS agent `eos-guide`; prompts `/eos-next`, `/eos-resume`, `/eos-status`; CLI `node .github/eos/eos.mjs next` |
| Discovery | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea |
| Requirements | bmad-agent-pm, bmad-create-prd, bmad-product-brief, eos-operational-readiness |
| Spec | bmad-create-prd, bmad-validate-prd |
| UX/Design | bmad-ux, bmad-agent-ux-designer (Sally), bmad-cis-design-thinking (Maya) |
| Architecture | bmad-architecture / bmad-create-architecture (Winston); EOS `/adr`, `/deploy-topology` (topology decision → docs/checklists/G-deployment.md + deployment-topology ADR) |
| Planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd, bmad-check-implementation-readiness |
| Development | bmad-dev-story, bmad-agent-dev (Amelia), bmad-quick-dev, bmad-code-review; EOS skill `eos-compliance-skeletons` (privacy scaffolds) |
| Testing | bmad-tea (Murat), bmad-testarch-*, bmad-qa-generate-e2e-tests; EOS `/e2e` (Playwright framework+gen+trace; dev-time browser verify via sandboxed **Playwright MCP** — opt-in at Phase 7 via `cp .vscode/mcp.json.example .vscode/mcp.json`, ships inert), `/spec-align` (AC coverage / first-pass rate) |
| LLM Eval (if agentic) | EOS `/eval-spec` → docs/eval-plan.md; bmad-eval-runner (pattern ref only) |
| Release/Ops | EOS prompts: /release-gate (honors the Phase-4 deployment topology), /runbook |
| Observability | EOS prompt: /telemetry-plan |
| Iteration | bmad-correct-course, bmad-retrospective, bmad-document-project, bmad-sprint-status |
| CI (local, via act) | bmad-testarch-ci (scaffold); `.github/workflows/eos-ci.yml` runs validate-config + eos-doctor + secret-scan + tests + evals |
| Security review | bmad-review-adversarial-general, bmad-code-review; EOS secret-scan.mjs + E-security checklist + guardrail |

> 73 `bmad-*` skills are installed at `~/.agents/skills/` and `~/.claude/skills/` (user-level, shared across projects).
> EOS never loads them all: the router names at most a couple per action, and reports a skill that is
> not installed as BLOCKED with an alternative path rather than recommending something unusable.
