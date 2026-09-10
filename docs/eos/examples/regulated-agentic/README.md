# Regulated + agentic preset

A vendor-neutral starting point for the hardest shape EOS supports: a **deterministic control
plane** that owns state and authority, plus an **agentic worker plane** that drafts, extracts and
summarises — under a **named regulatory regime**.

> **This preset does not make you compliant.** It is a set of decisions EOS can check, not a legal
> opinion. It does not confer HIPAA, GDPR, PIPL, PCI-DSS, SOC 2 or any enterprise standard, and it
> is not automatic compliance with anything. Your compliance owner decides what applies; EOS records
> the decision and refuses to let it be forgotten. `docs/compliance-profile.json` stays the
> authoritative record — this directory is an example of how to fill it in.

## Files

| File | What it is |
| --- | --- |
| `project.json` | Copy to `.eos/project.json`. Declares both paradigms, the regulated profile, and the eval + audit commands. |
| `requirements.json` | Copy to `docs/requirements.json`. Every operational concern decided, including `compliance`. |
| `architecture.json` | Copy to `docs/architecture.json`. Includes the agentic and regulated decisions G4 requires. |
| `eval-summary.example.json` | The shape `commands.eval` must write. Exit code 0 is not a met threshold. |

## The separation that carries the risk

```
┌──────────────────── control plane (deterministic) ────────────────────┐
│  authz · tenancy · audit · retention · state machine · approvals      │
│  publishes, approves and pays. NOTHING here asks a model anything.    │
└───────────────┬───────────────────────────────────────────────────────┘
                │ queue: a task, a redacted payload, a bounded budget
                ▼
┌──────────────────── worker plane (agentic) ──────────────────────────┐
│  prompt · tools (allow-list) · retrieval · grader                    │
│  PROPOSES. Never publishes, never approves, never moves money.       │
└──────────────────────────────────────────────────────────────────────┘
```

**The model and its tools hold no final authority.** Publication, approval, disbursement and
disclosure are control-plane operations behind ordinary authorization. This is not a prompt
instruction ("do not publish") — prompt instructions are advisory to a system that can be talked
into anything. It is an architectural boundary: the worker plane has no credential that can publish.

Record it in `docs/architecture.json` as `approvalBoundary` and `toolAllowList`; `architecture-ready`
(G4) requires both for a regulated agentic product.

## Data movement and provenance

- **Nothing regulated crosses a third-party boundary without a signed instrument.** Self-host, or
  redact before the call, or hold a BAA/DPA — and record which, in `docs/compliance-profile.json`
  with an `implemented` control and a non-expired approval. `eos-doctor` D5 fails closed on prose.
- **Retention** is a decision, not a default: how long prompts, completions, traces and eval
  transcripts are kept, and where. Model traces are a copy of your data in someone else's system.
- **Source provenance**: every retrieved passage carries where it came from, so a claim can be
  traced back. Without provenance, groundedness cannot be graded and a regulator cannot be answered.
- **PII / PHI / PAN** never enters a prompt, a log or an eval dataset unredacted. See the
  `eos-compliance-skeletons` skill for runnable redaction and DSAR starters.

## What the evals must cover

`commands.eval` must write a schema-valid `docs/evidence/eval-summary.json`
(`.eos/schemas/eval-summary.schema.json`) binding prompt, model, parameters, dataset, grader and
thresholds — and the product-tree digest from `eos product-tree --json`. At minimum:

| Case | Why it is not optional here |
| --- | --- |
| **prompt injection** | Retrieved content is untrusted input. A worker that follows instructions found in a document is an attacker-controlled worker. |
| **PII / PHI leakage** | Output that repeats identifiers the requester is not entitled to is a disclosure, whatever the prompt said. |
| **groundedness** | Every claim traceable to a retrieved source; ungrounded output is a confident guess. |
| **claim drift** | Regulated claims (medical, financial, legal) must not exceed what the source supports. |
| **tool-call accuracy** | Correct tool, correct arguments, refusal when out of scope. |
| **refusal / escalation** | The worker hands off to a human on low confidence, and the human path is reachable. |
| **latency / token / cost** | An unbounded agent is an unbounded invoice and an unbounded incident. |

Deterministic behaviour is still tested deterministically: `commands.test` covers the control plane
and every eval case has a trace-matrix row plus a machine result in `docs/evidence/test-run.json`.

## Operations

- **Bounded orchestration**: a hard cap on loop iterations, tool calls, tokens and wall-clock per
  task. Record it as `boundedOrchestration` in the architecture record.
- **Queue + worker**: the async boundary is explicit (`asyncBoundary`), so a slow or failing model
  degrades a queue depth instead of a user request.
- **Human escalation**: a named path, with an SLA, that a worker can hand a task to.
- **Rollback / canary / health / readiness**: prompts and models are deployable artifacts. A prompt
  change is a release. `ops/runbook.md` must document rollback, gradual rollout and health/readiness
  or the release gate fails.
- **MLR / formal approval**: where a regulated review board must sign off, it is a control-plane
  state with a recorded approval event — never something an agent asserts.

## Getting it green

```sh
cp docs/eos/examples/regulated-agentic/project.json        .eos/project.json
cp docs/eos/examples/regulated-agentic/requirements.json   docs/requirements.json
cp docs/eos/examples/regulated-agentic/architecture.json   docs/architecture.json
# then the narratives + the compliance profile
node .github/eos/eos.mjs next
```

Expect it to be **red at first**, and expect that to be useful: a regulated agentic product that
passes every gate on day one has not been examined.
