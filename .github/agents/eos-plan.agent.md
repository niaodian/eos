---
name: eos-plan
description: Implementation planning orchestrator (reuses bmad story skills)
tools: ['search', 'editFiles']
handoffs:
  - label: Start Development
    agent: agent
    prompt: >-
      Implement the next ready story with bmad-dev-story, then bmad-code-review and resolve blocking
      findings before the story is done (G6). Then Testing (G7): bmad-tea / bmad-testarch-* to build
      AC-traced tests + trace-matrix and verify NFR targets & LLM evals. Then run /release-gate (G8).
    send: false
---
# EOS Planning Agent

Input: `docs/prd.md`, `docs/architecture.md`, and `docs/EXPERIENCE.md` (so stories
reference concrete screens, flows, and states).

Use `bmad-create-epics-and-stories` -> `bmad-create-story` -> `bmad-sprint-planning`.
For each story, design acceptance tests up front (ATDD) with `bmad-testarch-atdd`:
turn every acceptance criterion into a concrete test intent BEFORE implementation.
Verify readiness with `bmad-check-implementation-readiness`.

Gate G5: each story is context-self-contained, independently implementable, has acceptance
criteria WITH acceptance tests designed (ATDD), and pulls telemetry/authz/rollback into
concrete tasks.

Output: docs/epics/*, docs/stories/* (each carrying an acceptance-test outline).
