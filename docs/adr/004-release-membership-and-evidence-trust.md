# ADR-004 — Release membership, and how much a piece of evidence is worth

- Status: Accepted
- Date: 2026-09-10
- Relates to: ADR-003 (BMAD runtime boundary)
- Closes: the "release membership" limit recorded in `developer-experience.md` §5.3

## Context

Two limits were documented rather than fixed in `eos-1.13.x`.

**1. A release had no membership.** `release-ready` reasoned about *every* story under `docs/stories/`
that was not a SPIKE or DOC_ONLY. That is a stand-in for membership, not membership:

- a story finished months ago was re-verified against every future candidate;
- two release trains could not exist at once, because each saw the other's work;
- a hotfix dragged unrelated in-flight stories along with it;
- and an approval, being scoped only to a release id, survived any change to what that release
  actually contained.

**2. All evidence was worth the same.** `docs/evidence/*.json` is bytes on disk. A file emitted by a
verified CI run and one typed by a person are indistinguishable, yet the release gate treated them
identically. For a regulated product that is the difference between proof and assertion.

## Decision

### Release manifests

`.eos/releases/<release-id>.json` states exactly what a release ships. Every story must be
**included**, **excluded with a reason**, or unshippable by classification — silence about a story
is rejected, because a finished-but-forgotten story shipping unnoticed is precisely the failure this
closes.

- `eos release init` **proposes** a manifest from the current state (only already-verified stories
  are proposed for inclusion; the rest become exclusions carrying a `TODO` reason the author must
  replace). It never decides.
- The manifest is bound to the **product tree**, not the commit. Committing the manifest advances
  the commit while changing nothing about the product, so binding to the commit would be
  self-reference. `.eos/releases/` is therefore excluded from the product-tree identity, exactly as
  evidence, the ledger and machine summaries are — and is bound as a gate *input* instead, so
  editing what ships still invalidates the recorded result.
- Approvals carry the **manifest digest** (over the decisions, not the bytes: reformatting or
  reordering does not invalidate consent; changing what ships does). Widening a release after it was
  approved is refused, with the two digests named.

### Evidence trust

Every machine summary carries a `producer` envelope (`local` | `ci`, plus optional `commandDigest`,
`toolchainDigest` and an `attestation` reference). EOS reports the level honestly:

| Level | Meaning |
|---|---|
| `UNATTESTED_LOCAL` | indistinguishable from a hand-written file — honest, and fine for development |
| `SELF_REPORTED_CI` | claims to come from CI; nothing attests it |
| `ATTESTED` | carries a provenance reference **that only an adapter can verify** |

**EOS Core verifies no attestation itself, deliberately.** Shipping a trust mechanism that cannot be
exercised by the offline test suite would be worse than shipping none: it would look like a control
and behave like a decoration. Core defines the shape and the verification *interface*; a
github/sigstore/SLSA adapter is a separate, opt-in decision (Round B).

**Strictness is opt-in.** By default an unattested local summary reports its level and passes. EOS is
local-first; a release gate that can never be green on a developer's machine would fail the tool's
own premise and quietly make a cloud service mandatory. A project raises the bar deliberately, via
`complianceProfile: "regulated"` (which BLOCKS on local evidence) or `requiredEvidence` in the
manifest.

### Project context

Project-root resolution is explicit and ordered:
`--project-root` → `EOS_PROJECT_ROOT` → git top level → cwd. `doctor --deep` prints which one won,
which runtime and config files were used, and where each skill resolved from — because the failure
this prevents (a skill reading another project's configuration and writing to its paths) is silent
unless someone looks. A project-level skill now takes precedence over a user-level one of the same
name, and a runtime config naming a different project is reported (DEGRADED normally, BLOCKED for a
regulated product).

## Consequences

- **Existing projects must author a manifest.** The release gate FAILs with the exact command rather
  than guessing membership; guessing is the behaviour being removed. See the migration guide.
- Parallel release trains, hotfixes and re-cut candidates work, because membership is stated.
- An approval is now consent to a specific set of changes and cannot be transferred.
- The `uniqueItems` and `maxLength` keywords were added to the bundled validator. It had been
  failing closed on the unknown keyword — correct, but unusable; silently ignoring it would have let
  the same story be listed twice, counted twice and verified once.

## What is deliberately NOT decided here

Whether a regulated release must come from trusted CI is a **product-positioning** decision, not a
robustness fix: it trades EOS's offline self-sufficiency for provenance. The mechanism is in place
(`requiredEvidence`, `complianceProfile`, the attestation envelope) and the default is honest
reporting. Choosing the stricter default belongs in its own ADR, with the offline story answered.
