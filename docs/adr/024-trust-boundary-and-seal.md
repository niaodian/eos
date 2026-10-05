# ADR-024 — The trust boundary is stated, not implied; EOS is sealed as a reference implementation

- Status: Accepted
- Date: 2026-10-06
- Depends on: ADR-005 (external authority boundary), ADR-014 (the trust chain)
- Governs: the README "Trust boundary" section, the quickstart's Known limitations, `eos approve`'s
  output, the ledger hash scheme (`lib/ledger.mjs`), scope checks in `lib/transitions.mjs`

## Context

An independent audit of eos-2.6.0 found that EOS describes itself in stronger terms than its
architecture supports. The engine, the evidence, the ledger, the workflow files and the identity an
approval is recorded under (`EOS_ACTOR`, `USER`) all live in the repository the gates judge. Anything
that can write that repository — a person or an AI agent — can write all of them. CI runs on
`pull_request` with the pull request's own copy of the engine and workflow, so the judge is inside the
defendant's workspace too.

Local mechanisms in that position are guidance and records. They cannot be a security boundary
against the actor they govern. Making them one would need trust roots outside the repository:
platform-authenticated approvals, a pinned external judge, CI evidence signed by an identity the
repository's writers do not hold. That is a different product shape (a service, or a pinned
reusable workflow in a separate repository), not an increment on this one.

## Decision

1. **State the boundary.** EOS is a delivery discipline and an evidence record. It is not a boundary
   against an actor who can write the repository. What actually stops a bypass is platform controls:
   branch protection, CODEOWNERS, platform-authenticated reviews, an agent that does not hold the
   owner's admin credentials, and CI that is not editable by the change it judges.
2. **Self-asserted fields are labelled as such.** An approver's name, a policy-lock `approver`, a
   waiver's `approver` and a `producer.type: ci` claim are assertions. `independent` means "recorded
   under a different name than the preparer", not "verified to be a different person".
3. **The Regulated track cannot prove separation of duties** until the trust roots are outside the
   repository. Until then EOS output is supporting evidence, not sole audit evidence.
4. **Seal EOS as a reference implementation.** No new features and no new tracks. Allowed: security
   fixes, defects in what already ships, and a single change the maintainer asks for. A future
   version that moves the trust roots out is a new project with real external users, scoped to
   evidence rules, an external judge and a local preview — not 2.x.
5. **Fix the four audit defects that make the record itself wrong** (A07–A10), because a record that
   can be silently incomplete cannot be honest even about what it does claim:
   - A07: ledger events hash every field (`hv: 2`); events written before `hv` still verify, and the chain may
     not step back to the old scheme.
   - A08: a transition for a story or release that does not exist is refused, not recorded.
   - A09: `verify` re-reads state after each recorded run, so a story's own evidence is no longer
     judged against a stale ledger.
   - A10: the coverage exclude globs now match files under `.github/`; the thresholds are re-based to
     the corrected measurement.

## Consequences

- Readers are told, first thing, what EOS does not defend against. Some will find that less
  attractive; the alternative was a claim the audit showed to be false.
- Existing ledgers verify unchanged. A ledger written by this engine does not verify under an engine
  that predates `hv`.
- The coverage floor went down on paper (97 / 79 / 96 → 96 / 75 / 94) because the old figure counted
  test files as covered code; the tests did not get weaker.
- The remaining audit findings (A22 and the S/T/U batches) are recorded in the audit report and are
  not scheduled.
