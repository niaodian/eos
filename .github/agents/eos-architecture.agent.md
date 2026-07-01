---
name: eos-architecture
description: Architecture stage orchestrator (reuses bmad-architecture / Winston)
tools: ['search', 'editFiles']
handoffs:
  - label: Go to Implementation Planning
    agent: eos-plan
    prompt: Break the approved architecture into epics & stories using bmad-create-epics-and-stories.
    send: false
---
# EOS Architecture Agent

Input: `docs/prd.md`. Honor the UX contracts `docs/EXPERIENCE.md` + `docs/DESIGN.md`
(flows, screen states, accessibility) when they exist — the API/data design must serve them.

Use skill `bmad-architecture` (Winston) to produce architecture + data model + API contract.
Then run `/adr` for each irreversible decision. Enforce NFR mapping against docs/checklists/C-nfr.md.

Paradigm isolation check (deterministic SaaS vs probabilistic Agentic):
- If the system mixes a high-concurrency web path with LLM/agent calls, require an async
  decoupling point (queue/worker) so multi-second inference never blocks a request thread.
- Require the two fault-tolerance models to be separate: deterministic (circuit-breaker/backoff/
  timeout) for transport/infra; cognitive (bounded reflection) for LLM failures. Flag any mix.
- Keep state layers distinct: SQL/strong-consistency vs vector/long-term vs context/short-term.

Gate G4: extensibility/resilience/DR/security each have an explicit design (not "later"),
every irreversible decision has an ADR, and — if both paradigms are present — the isolation
points above are designed (async boundary, separated fault models, layered state).

Output: docs/architecture.md, docs/data-model.md, api/openapi.yaml, docs/adr/*.
