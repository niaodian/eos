<!-- GENERATED FILE — DO NOT EDIT.
     Source of truth: .eos/gates.json
     Regenerate:      node .github/eos/eos.mjs docs --write
     CI check:        node .github/eos/eos.mjs docs --check

     Editing this file by hand is pointless: the next --write overwrites it, and --check fails
     the build in the meantime. Change the policy instead; the prose follows. -->

# Gate reference

11 gates, 58 checks. This is a projection of the gate definitions the engine executes — if a rule is here, it runs.

## Summary

| Gate | Code | Scope | Version | Waivable | Checks |
|---|---|---|---|---|---|
| `activation` | G0 | product | 1.0.0 | no | 4 |
| `discovery-ready` | G1 | product | 1.0.0 | no | 5 |
| `requirements-ready` | G2 | product | 1.0.0 | no | 5 |
| `prd-ready` | G3 | product | 2.0.0 | no | 5 |
| `ux-ready` | G-UX | product | 1.0.0 | no | 3 |
| `architecture-ready` | G4 | product | 1.1.0 | no | 4 |
| `story-ready` | G5 | story | 2.0.0 | yes | 6 |
| `verified` | G7 | story | 2.0.0 | no | 5 |
| `release-ready` | G8 | release | 3.0.0 | no | 15 |
| `telemetry-ready` | G9 | release | 1.0.0 | no | 3 |
| `iteration-ready` | G10 | release | 2.0.0 | no | 3 |

## G0 · `activation`

**EOS is locally activated**

The project declares what it is and how it is verified, and the workflow profile resolves. Everything downstream reads these files, so a broken declaration is an ERROR, never a skip.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `project-declaration` | .eos/project.json exists and validates | Copy your stack's block from docs/eos/stack-presets.md into .eos/project.json (projectType + stacks + commands.test). |
| `declaration-matches-repo` | the declaration is not the untouched template once code exists | Change projectType from "config-only" to "application" (or "library") and declare commands.test. |
| `workflow-profile` | workflowProfile resolves in .eos/workflow.json | Set "workflowProfile" to a profile that exists in .eos/workflow.json (default: standard-product). |
| `activation-ledger` | docs/eos/activation.md tracks the one-time hardening items | Run /eos-init in Copilot Chat; it creates and maintains docs/eos/activation.md. |

## G1 · `discovery-ready`

**The problem is framed, not merely filed**

docs/discovery.md is written and docs/discovery.json records ONE falsifiable problem, a measurable success metric with a target and a data source, an explicit scope boundary, and no unresolved blocking question. An empty file used to pass this stage.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `discovery-written` | docs/discovery.md is written and docs/discovery.json validates | Run the eos-discovery agent (bmad-brainstorming, bmad-agent-analyst); it produces both the narrative and the record. |
| `problem-falsifiable` | the problem statement can be proven wrong | Add problem.falsifiableBy: the observation that would show this problem does not exist. |
| `metric-measurable` | the success metric has a target and a data source | Give successMetric a target value and the data source the number will come from. |
| `scope-bounded` | scope in and scope out are both stated | List at least one item in scope.in and one in scope.out — a scope with no boundary is not a scope. |
| `no-open-blockers` | no unresolved blocking question | Resolve every openQuestions entry with severity BLOCKER, or downgrade it with a resolution. |

## G2 · `requirements-ready`

**Requirements and operational pre-flight are decided**

Functional requirements, quantified NFRs, and a decision for every operational concern (telemetry, authz, audit, rollback, monitoring, canary, quota, i18n, multi-tenancy, capacity/SLO, DR, and compliance when regulated). Each is ADOPT, SKIP with a reason, or DEFER with an owner and a trigger.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `requirements-written` | docs/requirements.md is written and docs/requirements.json validates | Run /requirements (bmad-agent-pm + eos-operational-readiness). |
| `functional-requirements` | functional requirements exist and are uniquely identified | Give every functional requirement a unique FR<n> id and a statement. |
| `nfr-quantified` | every NFR carries a target | Quantify each NFR — an unquantified NFR cannot be verified at the release gate. |
| `operational-preflight` | every operational concern is decided, not skipped | For each concern record ADOPT + note, SKIP + reason, or DEFER + owner + trigger. A bare "SKIP" is not a decision. |
| `no-open-blockers` | no unresolved blocking question | Resolve every openQuestions entry with severity BLOCKER. |

## G3 · `prd-ready`

**PRD is the single source of truth**

The PRD exists, its acceptance criteria are DEFINED (not merely mentioned), each is individually addressable, every requirement carries at least one, and nothing is still marked as an unresolved blocker.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `prd-present` | docs/prd.md exists | Run /spec to produce docs/prd.md (bmad-prd — it detects create / update / validate intent). |
| `ac-parseable` | the PRD DEFINES its AC<n>.<n> ids, it does not merely mention them | State every criterion as a list item, table row or heading that opens with its id and carries the criterion text. |
| `ac-unique` | no acceptance-criterion id is defined twice | Renumber the duplicated AC ids so each one addresses exactly one statement. |
| `ac-covers-requirements` | every requirement has at least one acceptance criterion | Cite the FR id beside its acceptance criteria (or in the heading section that defines them) so no requirement ships unspecified. |
| `no-open-blockers` | no unresolved BLOCKER / TBD marker remains | Resolve every line marked BLOCKER or TBD, or move it out of the PRD into the backlog. |

## G-UX · `ux-ready`

**The interaction contract exists (or is explicitly not needed)**

A user-facing product has BOTH docs/DESIGN.md and docs/EXPERIENCE.md with real content, and records coverage of flows, loading/empty/error/success states, accessibility, tokens and responsive behaviour. A non-UI product records a structured SKIP with a reason.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `ux-applicability` | the product states whether it has a user-facing surface | Create docs/design.json: { "userInterface": true } or { "userInterface": false, "skipReason": "…" }. Run /ux-spec. |
| `ux-documents` | a user-facing product has both a design and an experience contract | Produce docs/DESIGN.md AND docs/EXPERIENCE.md (eos-design agent / bmad-ux). |
| `ux-coverage` | flows, states, a11y, tokens and responsive behaviour are covered | Record each coverage dimension as COVERED + ref, or NOT_APPLICABLE + reason. |

## G4 · `architecture-ready`

**The architecture decides what stories will assume**

docs/architecture.md is written, docs/architecture.json records a decision (or a reasoned N/A) for stack, topology, authz, security, audit, rollback, DR, data/API/event contracts — plus tool allow-list, bounded orchestration, memory layering, async boundary and eval architecture for an agentic product, and the data/approval boundary for a regulated one — and every NFR lands on a named component.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `architecture-written` | docs/architecture.md is written and docs/architecture.json validates | Run the eos-architecture agent (bmad-architecture); it produces the narrative and the decision record. |
| `architecture-decisions` | every architectural concern is decided or reasoned N/A | Record each decision as DECIDED + summary (+ ADR for the irreversible ones) or NOT_APPLICABLE + reason. |
| `nfr-landing-points` | every NFR lands on a named component and mechanism | Add an nfrLandingPoints entry for each NFR in docs/requirements.json. |
| `stack-landed-in-workspace-rule` | the locked stack reached the always-on workspace rule | Declare the stack in .eos/project.json, then run `node .github/eos/eos.mjs stack sync --write` — it renders the "Local commands" block from that declaration, so the always-on rule cannot disagree with what CI runs. |

## G5 · `story-ready`

**Story is ready for development**

The story is context-self-contained: it references real PRD acceptance criteria, every one of them has a designed test intent (ATDD), LLM-backed criteria carry an eval case, and telemetry / authorization / rollback are decided — adopted with an owner and a verification, or skipped/deferred with a reason.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `story-present` | the story file exists and parses | Create docs/stories/<STORY-ID>.md with an "Acceptance criteria" table (see docs/eos/developer-experience.md). |
| `state-not-hand-edited` | the story does not claim a state the ledger disagrees with | Remove the state: field from the story front matter and use `eos transition` — hand-edited state is not evidence. |
| `ac-references-resolve` | every referenced AC exists in the PRD | Reference AC ids that exist in docs/prd.md, or add the criterion to the PRD first. |
| `ac-test-intent` | every acceptance criterion has a test intent | Use bmad-testarch-atdd to design one concrete test intent per AC before implementation. |
| `agentic-eval-case` | LLM-backed acceptance criteria have an eval case | Add an eval case id (EVAL-<n>) for every AC whose behaviour depends on model output; see docs/eos/examples/eval-starter/. |
| `ops-tasks` | telemetry, authorization and rollback are decided, not skipped | Under "## Operational tasks" write `ADOPT — <task>; owner: <who>; verify: <how>`, `SKIP — <reason>` or `DEFER — owner: <who>; trigger: <what ends it>`. A bare "SKIP" is not a decision. |

## G7 · `verified`

**Story is verified by executed tests**

Tests really ran for the declared stack against a recorded product tree, every story acceptance criterion has a trace row backed by a real test file and a real run, evals meet their threshold for agentic products, and the evidence belongs to the current inputs.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `product-tree-bound` | the evidence records the product tree it was produced from | Run this gate inside a git repository — EOS binds a verification to the source, tests, prompts and eval data it actually ran against. |
| `tests-executed` | the declared test command ran and passed | Run `node .github/hooks/project-gate.mjs` and fix failures; a missing toolchain is BLOCKED, never a pass. |
| `trace-complete` | every story AC has a trace row bound to a real, executed test | Produce docs/trace-matrix.md at G7 (bmad-testarch-trace): each row needs the AC id, an existing test path, the command/run that executed it, and its machine result. |
| `eval-threshold` | eval baseline met (agentic products only) | Run the declared commands.eval so it writes a schema-valid summary to docs/evidence/eval-summary.json; see docs/eval-plan.md. |
| `evidence-current` | the evidence matches the current inputs | An input moved after the prerequisite gate ran: re-run `eos check --gate story-ready --scope <STORY-ID>` first, then `eos check --gate verified --scope <STORY-ID>`. |

## G8 · `release-ready`

**Release candidate is shippable**

The manifest states exactly which stories this release ships, and the candidate itself is re-tested here — not merely trusted because stories once passed. Every included story was verified against THIS tree, security, supply-chain, NFR, compliance and operational readiness hold, and the human/organisational items are recorded rather than assumed.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `release-manifest` | the release states which stories it ships | Run `node .github/eos/eos.mjs release init --release <id>` to propose a manifest, then decide what is in it. Every story must be included or excluded with a reason. |
| `candidate-identity` | the candidate is a committed, identifiable tree | Commit the outstanding product changes; a release must name a tree that exists in history. |
| `candidate-quality` | the declared quality commands pass ON THIS candidate | Run `node .github/hooks/project-gate.mjs` on the candidate and fix what fails — story state is not a substitute for testing the thing you are shipping. |
| `stories-verified` | all stories in the release are VERIFIED or MERGED | Finish or drop the unverified stories; `eos release-status` lists them. |
| `story-evidence-current` | each story's verification describes THIS candidate | Re-run `eos check --gate verified --scope <STORY-ID>` for the stories whose verification predates the candidate tree. |
| `spec-alignment` | spec-align --strict passes (no drift, no orphans) | Run `node .github/hooks/spec-align.mjs --strict` and close drift/orphans/failing rows. |
| `secret-scan` | secret scan is clean | Run `node .github/hooks/secret-scan.mjs` and remove or rotate anything it finds. |
| `dependency-audit` | the dependency / supply-chain audit is clean | Run the declared commands.audit (npm audit / pip-audit / cargo audit …) and resolve findings; offline it is DEFERRED, never PASS — and for a regulated product it BLOCKS. |
| `evidence-trust` | the release states how trustworthy its evidence is | Evidence produced locally is honest but indistinguishable from a hand-written file. Produce it from CI (producer.type = ci), or record an attestation, or accept DEFERRED for a non-regulated release. |
| `nfr-evidence` | NFR targets have recorded evidence | Record measured NFR results in docs/evidence/nfr-summary.json (bmad-testarch-nfr); a deferral needs an owner and a trigger. |
| `compliance-boundary` | the compliance data boundary holds | Run /compliance to record docs/compliance-profile.json; eos-doctor D5 explains what is missing. |
| `no-expired-waivers` | no waiver in this release has expired | Renew the waiver with a new expiry and approver, or close the gap it was covering. |
| `ops-artifacts` | runbook, rollback, canary and health/readiness are documented | Run /runbook and /deploy-topology so rollback, gradual rollout and health/readiness are written down before shipping. |
| `deployment-topology` | the operational mechanisms match the recorded topology decision | Record the deployment topology in an ADR (docs/adr/*-deployment-topology.md) so rollback/canary/health are the ones that topology actually uses. |
| `activation-authority` | enforcement authority is recorded, not assumed | Close or explicitly waive every item in docs/eos/activation.md; EOS cannot verify server-side branch protection, so an unresolved item is UNVERIFIED, never PASS. |

## G9 · `telemetry-ready`

**The shipped change can be observed**

RELEASED is not the end of the loop. The discovery success metric is emitted as a real signal, dashboards and routed alerts exist, sensitive operations are audited, a rollback trigger is defined, and a named owner reads the result.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `telemetry-plan` | docs/telemetry-plan.md is written and docs/telemetry.json validates | Run /telemetry-plan; it produces the plan and the record. |
| `signals-land` | the success metric is actually emitted | Add a signals entry mapping the discovery success metric to the event/metric that carries it. |
| `observability` | dashboards, routed alerts, audit and a rollback trigger exist | Record dashboards, alerts with routesTo, the sensitive-operation audit decision, and rolloutMetrics.rollbackTrigger. |

## G10 · `iteration-ready`

**Production learning is written back to the source of truth**

What the release taught lands in the specs, user feedback reaches the eval dataset for an agentic product, a changed prompt/model/tool surface gets a new baseline, and a named owner records CONTINUE / CORRECT_COURSE / STOP.

| Check | What it verifies | How to satisfy it |
|---|---|---|
| `spec-write-back` | learnings are written back, bound to the content that was written | Create docs/iteration.json naming each spec you updated AND its post-write-back SHA-256 (`targetDigest`), so a later revert is visible. |
| `agentic-feedback` | feedback reaches the eval dataset (agentic products) | Record evalDatasetUpdate and baselineRebaselined — an agentic product that never learns from production is a fixed system with a random component. |
| `iteration-decision` | the next-step decision has a named owner | Record decision.outcome and decision.owner. |
