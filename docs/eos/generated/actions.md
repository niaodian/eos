<!-- GENERATED FILE — DO NOT EDIT.
     Source of truth: .eos/agent-map.json
     Regenerate:      node .github/eos/eos.mjs docs --write
     CI check:        node .github/eos/eos.mjs docs --check

     Editing this file by hand is pointless: the next --write overwrites it, and --check fails
     the build in the meantime. Change the policy instead; the prose follows. -->

# Action map

28 actions. `eos next` names one of them and hands it to the agent or prompt below. This page is a projection of `.eos/agent-map.json` — the file the router reads — so it cannot disagree with what `eos next` recommends. The curated, phase-by-phase overview is [agent-map.md](../agent-map.md).

| Action | Copilot agent | Prompt | Skills | Handoff |
|---|---|---|---|---|
| `fix-eos-configuration` | — | `/validate-config` | — | EOS's own configuration does not load. Fix only the reported file(s); change nothing else. |
| `complete-local-activation` | — | `/eos-init` | — | Walk the one-time activation: declare .eos/project.json, branch protection, CODEOWNERS, approval baseline. |
| `declare-project` | — | — | — | Run `eos init` to see the tracks and starter packs, pick the pack closest to this product, then `eos init <pack> --track standard\|regulated --write`. Edit stacks and commands to what CI really runs; change nothing else. |
| `frame-the-problem` | `eos-discovery` | — | `bmad-brainstorming`, `bmad-agent-analyst` | Converge the idea into one falsifiable problem statement with a measurable success metric, and record it in docs/discovery.md + docs/discovery.json. |
| `expand-requirements` | — | `/requirements` | `bmad-agent-pm`, `eos-operational-readiness` | Expand the approved problem into functional + NFR + operational-readiness requirements in docs/requirements.md + docs/requirements.json. Every operational concern is ADOPT / SKIP+reason / DEFER+owner+trigger. |
| `write-prd` | — | `/spec` | `bmad-prd` | Turn docs/requirements.md into docs/prd.md; every requirement gets addressable AC<n>.<n> ids that the PRD DEFINES, not merely mentions. |
| `repair-prd` | — | `/spec` | `bmad-prd` | Repair only the listed PRD defects (undefined/duplicate AC ids, uncovered requirements, unresolved blockers). Do not restructure the PRD. |
| `design-ux` | `eos-design` | `/ux-spec` | `bmad-ux` | Produce docs/DESIGN.md + docs/EXPERIENCE.md and docs/design.json, or record { "userInterface": false, "skipReason": "..." } for a non-user-facing product. |
| `design-architecture` | `eos-architecture` | — | `bmad-architecture` | Design the architecture, lock the tech stack and the deployment topology in ADRs, and record every decision in docs/architecture.json. |
| `plan-stories` | `eos-plan` | — | `bmad-create-epics-and-stories`, `bmad-create-story` | Slice the approved architecture into context-self-contained stories under docs/stories/. |
| `design-acceptance-tests` | `eos-plan` | — | `bmad-testarch-atdd` | Create the missing acceptance-test intent for the listed acceptance criteria only. |
| `design-eval-cases` | — | `/eval-spec` | — | Add an eval case (EVAL-<n>) for each LLM-backed acceptance criterion listed; do not touch the others. |
| `complete-story-readiness` | `eos-plan` | — | `bmad-check-implementation-readiness` | Close the listed story-readiness gaps (telemetry / authorization / rollback / dependencies) only. |
| `justify-classification` | — | — | — | This change type turns verification gates off. Record in the story front matter why that is legitimate — EOS records the decision, it does not make it. |
| `refresh-stale-evidence` | — | — | — | Nothing is wrong with the work — an input moved, so the recorded proof no longer describes it. Re-run the gates in order. |
| `promote-story` | — | — | — | Everything the gate requires is in place; record the evidence and promote the story. |
| `implement-story` | `agent` (built-in) | — | `bmad-dev-story` | Implement the ready story exactly to its acceptance criteria; do not widen scope. |
| `verify-story` | `agent` (built-in) | — | `bmad-tea` | Run the declared quality commands, then produce the trace-matrix rows AND the machine test-run summary (docs/evidence/test-run.json) for this story's acceptance criteria. |
| `repair-verification` | `agent` (built-in) | — | `bmad-dev-story`, `bmad-code-review` | Fix the failing checks listed by the verified gate. Do not edit tests to make failures green. |
| `build-trace-matrix` | — | `/spec-align` | `bmad-testarch-trace` | Map every listed acceptance criterion to a real test in docs/trace-matrix.md, and make the runner emit docs/evidence/test-run.json so the result is executed, not asserted. |
| `record-spike-outcome` | — | `/adr` | — | Write the spike's decision record; a spike never merges product code without a follow-up story. |
| `prepare-release` | — | `/release-gate` | — | Walk the release gate for the candidate; record evidence, do not approve anything yourself. |
| `repair-release` | — | `/release-gate` | — | Close the listed release blockers only, then re-run the release-ready gate. |
| `land-telemetry` | — | `/telemetry-plan` | — | The change is live. Land the observability that makes it judgeable: the success metric as a real signal, dashboards, routed alerts, and a rollback trigger. |
| `repair-telemetry` | — | `/telemetry-plan` | — | Close only the listed observability gaps in docs/telemetry.json, then re-run the telemetry-ready gate. |
| `review-incident` | `eos-review` | — | `bmad-correct-course`, `bmad-retrospective` | This release was rolled back. Establish what happened before anything ships again, and write the correction back into the requirements, the PRD and (for an agentic product) the eval dataset. |
| `close-the-loop` | `eos-review` | — | `bmad-correct-course`, `bmad-retrospective` | Write the change back to the spec source of truth and open the next iteration. |
| `start-next-change` | — | `/requirements` | — | Nothing is blocked. Start the next change from a requirement, not from code. |
