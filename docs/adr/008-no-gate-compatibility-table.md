# ADR-008 — Gate changes always invalidate evidence; there is no compatibility table

- Status: Accepted
- Date: 2026-10-01
- Depends on: ADR-004 (release membership and evidence trust)
- Governs: gate versioning, `.eos/policy.lock.json`, `eos policy`, `eos migrate`

## Context

The round-4 audit asked for three things under "version management": a schema migration path, a
workflow-profile version lock, and a **gate version compatibility matrix**, a table declaring
which recorded evidence stays valid when a gate's definition changes.

The first two are built (1.18.0 `eos migrate`; 1.20.0 `.eos/policy.lock.json`). This ADR records
why the third is not.

Today the rule is simple: evidence binds the gate's `version`, and any change to it, or to
`.eos/gates.json` / `.eos/workflow.json` at all, makes recorded evidence `STALE`. The cost is
real: an EOS upgrade that bumps several gate versions means re-running those gates once.

A compatibility table would remove that cost by declaring, for example, "2.0.1 accepts evidence from
2.0.0". That is exactly the problem. Evidence is only worth something because it was produced by
the rule now in force. A table that keeps old evidence valid across a rule change is, by
construction, a way for a PASS produced under one rule to count under a different one. If the
change made the gate stricter, a story that would now fail keeps its old PASS. That weakens the gate
silently, which is the failure `eos policy check` exists to refuse.

## Decision

**There is no gate compatibility table. A gate definition change invalidates the evidence produced
under the previous definition, always.**

### D1 — Every rule change is visible before it takes effect

`.eos/policy.lock.json` pins the policy by digest, and `eos policy check` classifies every change
against the base branch. A gate that becomes weaker, or one whose evaluator is swapped, needs a
recorded reason and an approver who is not the requester. A version bump is reported as INFO, with
the consequence stated: its recorded evidence becomes STALE.

### D2 — The cost of re-running is accepted, and kept small

Re-running is incremental: `eos verify` runs only the gates whose inputs, definition or evidence
changed (`--plan` shows which). An upgrade's cost is therefore "the gates that actually changed",
not "everything".

### D3 — Breaking schema changes are migrated or acknowledged, never absorbed

A schema made stricter rejects files that used to pass. Each tightening must ship with a
`schemaVersion` bump and a registered migration (`eos migrate`), or be acknowledged in the policy
lock like a weakened gate. Loosening is never flagged.

### D4 — Reopening this needs a new constraint

Revisit only if re-running invalidated gates becomes a measured, material cost for real projects
(not an anticipated one), and then only for changes a machine can prove are behaviour-preserving,
such as a renamed check with an identical evaluator. Prose changes already need nothing: titles,
summaries and fix text are excluded from the policy digest.

## Consequences

**Accepted:** an EOS upgrade can cost one re-run of the gates whose definitions moved.

**Preserved:** a recorded PASS always means "passed under the rule in force today". No mechanism
exists by which old evidence outlives the rule that produced it.
