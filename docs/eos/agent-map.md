# EOS ↔ BMAD Reuse Map

| Stage | Use (skills / agents) |
|---|---|
| Discovery | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea |
| Requirements | bmad-agent-pm, bmad-create-prd, bmad-product-brief, eos-operational-readiness |
| Spec | bmad-create-prd, bmad-validate-prd |
| UX/Design | bmad-ux, bmad-agent-ux-designer (Sally), bmad-cis-design-thinking (Maya) |
| Architecture | bmad-architecture / bmad-create-architecture (Winston) |
| Planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd, bmad-check-implementation-readiness |
| Development | bmad-dev-story, bmad-agent-dev (Amelia), bmad-quick-dev, bmad-code-review |
| Testing | bmad-tea (Murat), bmad-testarch-*, bmad-qa-generate-e2e-tests |
| LLM Eval (if agentic) | EOS `/eval-spec` → docs/eval-plan.md; bmad-eval-runner (pattern ref only) |
| Release/Ops | EOS prompts: /release-gate, /runbook |
| Observability | EOS prompt: /telemetry-plan |
| Iteration | bmad-correct-course, bmad-retrospective, bmad-document-project, bmad-sprint-status |
| CI (local, via act) | bmad-testarch-ci (scaffold); `.github/workflows/eos-ci.yml` runs validate-config + eos-doctor + secret-scan + tests + evals |
| Security review | bmad-review-adversarial-general, bmad-code-review; EOS secret-scan.mjs + E-security checklist + guardrail |

> 73 `bmad-*` skills are installed at `~/.agents/skills/` and `~/.claude/skills/` (user-level, shared across projects).
