---
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

Gate G4: extensibility/resilience/DR/security each have an explicit design (not "later"),
and every irreversible decision has an ADR.

Output: docs/architecture.md, docs/data-model.md, api/openapi.yaml, docs/adr/*.
