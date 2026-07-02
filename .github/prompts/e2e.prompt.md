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

## 3. (Optional) Agent-driven browser verification — dev-time only, OPT-IN
The template ships the browser server **inert** as `.vscode/mcp.json.example` — nothing
auto-starts. **Activate it only here at Phase 7** (MCP servers start eagerly at session
start and are workspace-global, so they can't be phase-gated by config — see manual §7.7):

```
cp .vscode/mcp.json.example .vscode/mcp.json    # opt in (stays local, git-ignored)
npx playwright install chromium                 # first run only, online
```

Reload the window/session so the client picks it up. Then, in **agent mode**, the sandboxed
**Playwright MCP** tools (localhost-only) appear in the tools picker and let the agent drive
your **local dev server** (`http://localhost:...`): navigate, act on the accessibility tree,
snapshot, read console/network. Use this to reproduce a bug or explore a flow, then **codify
the finding as a deterministic spec in step 2**. When done, `rm .vscode/mcp.json` to stop it
auto-starting in later sessions.

> This loop is **non-deterministic** — never let it stand in for the deterministic suite and
> never wire it into CI. It is the "verify-as-you-build" convenience, not the gate.

## 4. Run + report
Run the deterministic suite locally (e.g. `npx playwright test`). Report per-AC pass/fail and
confirm the trace matrix has no uncovered user-facing AC.

Output: Playwright specs under the repo's test dir + an updated `docs/trace-matrix.md`.

> **Next (after G7):** run `/release-gate` (G8) — "E2E green (user-facing flows)" is one of its
> quality-gate line items.
