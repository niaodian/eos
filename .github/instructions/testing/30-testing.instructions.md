---
name: 'Testing'
description: 'Test conventions and spec-to-test traceability'
applyTo: "**/*.{test,spec}.*"
---
# Testing Rules

- Pyramid: many unit, fewer integration, few E2E. No network in unit tests.
- Each PRD acceptance criterion maps to >=1 test (traceability). Name: `describe(<criterion id>)`.
- Stateful/SaaS modules: assert the **API contract** against `api/openapi.yaml` and the **DB state**
  (transactions commit/rollback, constraints, idempotency) in integration tests — determinism gets the
  same rigor the eval set gives the probabilistic side.
- Dual-track: deterministic code → exact-assert unit/integration tests; LLM/agent code → the eval set
  (graders + baseline, see `ai/10-ai-llm` + `/eval-spec`). Never exact-assert probabilistic output.
- No flaky patterns: no real timers (use fakes), no order-dependent tests.
- Coverage gate: changed lines >= 80% (enforced locally; see hooks/quality.json).
- For test design/automation, invoke `bmad-testarch-test-design` / `bmad-testarch-automate`.
- E2E/browser: Playwright is the engine (init via `bmad-testarch-framework`); author flows with
  `/e2e`. Deterministic Playwright specs are the only thing CI runs. Dev-time only and **opt-in at
  Phase 7**, the agent may drive the local dev server through the sandboxed **Playwright MCP**
  (activate via `cp .vscode/mcp.json.example .vscode/mcp.json`, localhost) for exploration/triage —
  never as a substitute for a spec, never in CI. It ships **inert** (`.example`) because MCP servers
  eager-start at session start and can't be phase-gated.
- Verify NFR targets from `docs/checklists/C-nfr.md` (latency/throughput, SLO/RTO/RPO, etc.)
  with `bmad-testarch-nfr`; each adopted NFR needs a check or an explicitly-deferred trigger.
- Local CI (no cloud runner): `.github/workflows/eos-ci.yml` runs the aggregate gate
  (validate-config + eos-doctor + tests + evals) via `act push` (needs Docker). Scaffold richer
  pipelines with `bmad-testarch-ci`.
