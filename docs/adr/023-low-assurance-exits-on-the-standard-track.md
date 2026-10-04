# ADR-023 — Low-assurance exits on the Standard track: bounded deferral, solo approval, confirmed one-way doors

- Status: Accepted
- Date: 2026-10-04
- Depends on: ADR-014 (the trust chain: no gate gets weaker without a second person), ADR-005
  (evidence trust is declared, not assumed), ADR-022 (a project's first declaration starts its policy)
- Governs: `eos approve` and the release state machine (`lib/transitions.mjs`, `lib/deferrals.mjs`),
  `approvalMode` in `.eos/project.json`, `release-ready`'s `nfr-evidence` and `one-way-doors-confirmed`,
  the ADR front matter (`Status`, `Confirmed by`, `Confirmed at`), `eos policy lock --self`, waivers,
  the PreToolUse guardrail (`--self`)

## Context

A pilot took one product through EOS from discovery to the release gate with one person and one agent.
Three things stopped it, each at the latest possible moment, and each had no honest way out:

1. **A release that carries a deferral could not be promoted.** The documentation treats "deferred, with an
   owner and a trigger" as a legitimate result (the NFR evidence example, `eos explain release-ready`,
   the manual's G7 and G8 rows). The state machine did not: `DEFERRED` is not a promotable status and
   `release-ready` is not waivable. Targets that cannot be measured before shipping — monthly availability,
   LCP on real networks, a real vendor's latency and cost — left only one way through: write them as
   `SKIP`, which says "not applicable", which is false.
2. **A single maintainer could not finish.** The first declaration's policy review, `VERIFIED → APPROVED`
   and every waiver assume a second person. The rule exists so that *an AI cannot approve*; read as "two
   humans are required" it made the core promise — walk the whole loop — false for a one-person project,
   and said so only at the release.
3. **Nothing distinguished "decided" from "a person confirmed it".** An unattended agent writes the ADR for
   an irreversible decision (stack, topology, data model) itself, and `proposed` changed no gate.

## Decision

### D1 — A bounded `DEFERRED` may be promoted (Standard track only)

`CANDIDATE → VERIFIED` accepts a `release-ready` whose status is `DEFERRED`, under four guardrails:

1. **Only `nfr-evidence` (and `evidence-trust`, for a non-regulated release) may be deferred.**
   `dependency-audit` and every other `DEFERRED` check still block promotion.
2. **Every deferred target has an `owner`, a `trigger` and a `dueBy` date in the future.** `dueBy` is a
   precondition of promotion, not a courtesy. Once it has passed, `nfr-evidence` is **FAIL** until the
   target is measured, or deferred again with a new date and a fresh approval.
3. **The approval is bound to the deferred list.** `eos approve` prints the full list (id, owner, trigger,
   `dueBy`) first and records its digest and the list in the approval event; a changed list voids the
   approval, as a changed manifest already does.
4. **Standard track only.** A regulated or controlled release is never promoted with a deferral.

The status is `DEFERRED` everywhere it is shown, never `PASS`. After `RELEASED` the list is part of the
release record: `status` / `health` show it, and `eos next` lists what is owed — and by when — at
`RELEASED → OBSERVED`. No new gate: G9 is where such targets are collected.

*Rejected:* "measure everything or `SKIP` before shipping" — it needs the same rewrite of examples, schema
and manual, and leaves no way out except lying with `SKIP`.

### D2 — A declared, visible, Standard-track-only solo path

`.eos/project.json` gets `approvalMode`: `independent` (default) or `solo`. `eos init <pack> --solo`
declares it on Day 1.

- `solo` lets one person record a **labelled self-approval**: `eos approve --self --reason "<why>"`,
  `eos policy lock --self`, and a waiver whose approver is written `<name> (self)`. Records carry
  `assurance: "self"`; `status`, `next` and the release record say "self-approval (solo)".
- With `independent`, `--self` is refused. With `regulated` or `controlled`, `solo` is a configuration
  error. Declaring `solo` after `independent` is a **WEAKENING**, and the one change a self-approval can
  never stand behind: it needs an independent approver.
- **An agent never runs `--self`.** The PreToolUse guardrail refuses it on any `eos` command, and the MCP
  server still exposes no approving tool. The person types it.
- CI accepts `(self)` approvers (only solo + Standard), and a failing policy check no longer skips the
  product quality gate: the two are reported separately.

*Rejected:* "document that a second person is needed" (solves nothing) and "a second git identity" (turns
forgery into a habit). Low assurance is a labelled, track-limited, agent-blocked state — the same idea as
`evidence-trust` (local / CI / attested).

### D3 — One-way doors are confirmed by a person, at release

An ADR carries `Status: proposed | accepted | superseded`, `Confirmed by` and `Confirmed at`, written by a
person. G4 passes with a `proposed` one-way ADR and says so (it must not stop an unattended run in the
architecture stage); `release-ready` gains `one-way-doors-confirmed`: every `DECIDED` decision in
`architecture.json` that cites an ADR needs that ADR accepted and signed by name, or the release FAILs.
Not waivable. The close-out rule gets the unattended exit: decide provisionally, write `Status: proposed`,
list the decision in the final report for a person to confirm.

## Consequences

- `gates.json`'s `release-ready` goes to 5.0.0 (a new check, a changed promotion rule), `architecture-ready`,
  `story-ready` and `verified` to a new minor: recorded PASS evidence reads `STALE` once and is re-run.
- The approval event gains `assurance`, `deferredDigest` and `deferred`; the policy lock and waivers gain
  `assurance`; the project declaration gains `approvalMode` and `productTree.exclude`. All are absent where
  they are not used, so every project keeps the digest it was locked with.
- A deleted `.eos/project.json` is now a WEAKENING (`project:declaration-removed`) instead of "nothing to
  compare".

## Known limitations

- **`solo` and `DEFERRED` are low-assurance by design.** A self-approval shows that the maintainer chose to
  ship; it does not show that anyone else looked. A deferral shows that someone owns a target and a date;
  it does not show the target will be met. Both are labelled everywhere they appear, and both end where the
  Regulated and Controlled tracks begin. Anyone who needs more than a label uses `independent`.
- **Symlinks in the product-tree fingerprint (P3-2).** The digest records a link's target string, not what
  it points at, and a checkout without symlink support turns a link into a plain file. Closing this needs a
  cross-platform fixture and a Windows round trip; there is no pilot evidence it matters, so it is recorded,
  not fixed.
- **Node 26 is not in the CI matrix.** It passed locally (26.10) and becomes an LTS on 2026-10-28. Adding it
  means re-recording the `ci-linux` timing baseline and a JUnit fixture, and nothing depends on it today;
  it joins when development resumes. Node 20 was removed in eos-2.6.0 (`engines` is `>=22.10.0`).
