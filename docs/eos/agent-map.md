# EOS ↔ BMAD Reuse Map

> **You do not need this table to work.** `.eos/agent-map.json` is the machine-readable version the
> router reads: it maps one action to one primary agent (or prompt) plus the minimal skill chain, and
> `eos next` hands you that mapping already resolved. This page is the human-readable projection —
> read it when you want the whole landscape, not to pick a skill for the step you are on.

| Phase | Use (skills / agents) |
|---|---|
| Navigation (any phase) | EOS agent `eos-guide`; prompts `/eos-next`, `/eos-resume`, `/eos-status`; CLI `node .github/eos/eos.mjs next` |
| Discovery | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea |
| Requirements | bmad-agent-pm, bmad-prd, bmad-product-brief, eos-operational-readiness |
| Spec | bmad-prd |
| UX/Design | bmad-ux, bmad-agent-ux-designer (Sally), bmad-cis-design-thinking (Maya) |
| Architecture | bmad-architecture (Winston); EOS `/adr`, `/deploy-topology` (topology decision → docs/checklists/G-deployment.md + deployment-topology ADR) |
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

## Runtime compatibility — read this before trusting a green doctor

Installed is not the same as **activatable**. Every mapped BMAD skill resolves its customization
through a **project-local** `_bmad/` runtime (`resolve_customization.py`, `memlog.py`,
`bmm`/`core`/`tea` `config.yaml`) that EOS does **not** ship. A directory-name check therefore used
to report PASS for skills that would fail on their first activation step (audit finding EOS-AUD-002).

- `.eos/bmad.lock.json` declares what EOS assumes: required skills, runtime scripts and configs,
  executables, and the deprecated skills EOS refuses to map.
- `node .github/hooks/eos-doctor.mjs --deep` checks it and separates two answers: **BLOCKED** when a
  mapped skill cannot activate at all (and it fails), **DEGRADED** when it activates only on its
  shipped defaults because no project runtime is installed (it warns — that is a working setup, and
  calling it broken would be a false red). CI runs `--deep`.
- **EOS is complete without BMAD.** No gate, evaluator, transition or routing decision calls a
  skill; a missing skill is a NOTE and `eos next` still names the action, the gate and the done-when.
- Design rationale: [ADR-003 — the BMAD runtime boundary](../adr/003-bmad-runtime-boundary.md).

Deprecated upstream and unmapped here: `bmad-create-prd` and `bmad-validate-prd` → **`bmad-prd`**
(it detects create / update / validate intent); `bmad-create-architecture` → **`bmad-architecture`**.
