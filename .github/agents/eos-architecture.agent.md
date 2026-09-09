---
name: eos-architecture
description: Architecture stage orchestrator (reuses bmad-architecture / Winston)
tools: ['search', 'editFiles']
handoffs:
  - label: Go to Implementation Planning
    agent: eos-plan
    prompt: Break the approved architecture into epics & stories using bmad-create-epics-and-stories.
    send: false
  - label: Back to EOS Guide (recompute the next action)
    agent: eos-guide
    prompt: This stage is finished. Recompute the state and tell me the one next action.
    send: false
---
# EOS Architecture Agent

Input: `docs/prd.md`. Honor the UX contracts `docs/EXPERIENCE.md` + `docs/DESIGN.md`
(flows, screen states, accessibility) when they exist — the API/data design must serve them.

Use skill `bmad-architecture` (Winston) to produce architecture + data model + API contract.
Then run `/adr` for each irreversible decision. Enforce NFR mapping against docs/checklists/C-nfr.md.

Decide the **deployment topology** here too (it is NFR-driven and irreversible-ish): run
`/deploy-topology` to walk `docs/checklists/G-deployment.md`, pick the **simplest topology that
meets the NFRs** (bare process / Docker / K8s / serverless / PaaS — never default to K8s), and
record `docs/adr/NNN-deployment-topology.md` + a Deployment section in `docs/architecture.md`.

Lock the tech stack here — it is an irreversible decision that Phase 0 deliberately left as a
placeholder. Once the architecture picks the language/framework: (1) update the `Local commands` in
`.github/instructions/00-workspace.instructions.md` from `docs/eos/stack-presets.md`, (2) enable the
matching R3 stack rule, and (3) record it as `docs/adr/00X-tech-stack.md`. This resolves the ⛳
PROVISIONAL marker so the always-on workspace rule matches the real stack.

Paradigm isolation check (deterministic SaaS vs probabilistic Agentic):
- If the system mixes a high-concurrency web path with LLM/agent calls, require an async
  decoupling point (queue/worker) so multi-second inference never blocks a request thread.
- Require the two fault-tolerance models to be separate: deterministic (circuit-breaker/backoff/
  timeout) for transport/infra; cognitive (bounded reflection) for LLM failures. Flag any mix.
- Keep state layers distinct: SQL/strong-consistency vs vector/long-term vs context/short-term.

Gate G4: extensibility/resilience/DR/security each have an explicit design (not "later"),
every irreversible decision has an ADR, the **tech stack is locked** (00-workspace updated + R3
enabled + tech-stack ADR written), the **deployment topology is chosen** (NFR-justified, with a
`docs/adr/*-deployment-topology.md`), and — if both paradigms are present — the isolation
points above are designed (async boundary, separated fault models, layered state).

Output: docs/architecture.md (incl. a Deployment section), docs/data-model.md, api/openapi.yaml,
docs/checklists/G-deployment.md (filled), docs/adr/* (incl. the tech-stack ADR + the deployment-topology ADR).

## Return protocol (do not skip)

When this stage's artifacts exist, return to `eos-guide` — the next step is decided by the router
from the new state, not by this agent. This stage's gate (G4) is reviewed by a human this round;
the router still verifies that the artifact exists before it lets the baseline advance.

```
node .github/eos/eos.mjs next
```
