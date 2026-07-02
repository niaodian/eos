---
name: e2e
description: Author browser/E2E tests (Playwright) and drive dev-time browser verification via the Playwright MCP
agent: agent
tools: ['search', 'editFiles', 'runCommands']
---
# Browser / E2E Testing (EOS) — Gate G7

Orchestrates the installed BMAD test-architecture skills for deterministic E2E, plus an
optional agent-driven browser-verification loop (Playwright MCP) for dev-time triage.
Deterministic Playwright specs are the source of truth and the only thing CI runs; the MCP
loop is exploratory only.

## 1. Ensure a framework (once per repo)
If there is no Playwright config yet, invoke **`bmad-testarch-framework`** to initialize
Playwright (config, fixtures, helpers). It is the BMAD-blessed E2E engine.

## 2. Author / expand the E2E suite (deterministic — this is what gates)
- Generate flows from acceptance criteria with **`bmad-qa-generate-e2e-tests`**.
- Expand coverage on an existing codebase with **`bmad-testarch-automate`**.
- Name each spec `describe(<criterion id>)` so it maps back to a PRD AC.
- Map AC -> E2E in the trace matrix with **`bmad-testarch-trace`** (feeds G7).

## 3. (Optional) Agent-driven browser verification — dev-time only
Prereq: `.vscode/mcp.json` ships a sandboxed **Playwright MCP** server (localhost-only).
First run once, online: `npx playwright install chromium`. Then, in **agent mode**, the
Playwright MCP tools appear in the tools picker and let the agent drive your **local dev
server** (`http://localhost:...`): navigate, act on the accessibility tree, snapshot, read
console/network. Use this to reproduce a bug or explore a flow, then **codify the finding as
a deterministic spec in step 2**.

> This loop is **non-deterministic** — never let it stand in for the deterministic suite and
> never wire it into CI. It is the "verify-as-you-build" convenience, not the gate.

## 4. Run + report
Run the deterministic suite locally (e.g. `npx playwright test`). Report per-AC pass/fail and
confirm the trace matrix has no uncovered user-facing AC.

Output: Playwright specs under the repo's test dir + an updated `docs/trace-matrix.md`.

> **Next (after G7):** run `/release-gate` (G8) — "E2E green (user-facing flows)" is one of its
> quality-gate line items.
