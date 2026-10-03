# ADR-020 — An existing system adopts EOS at the delivery gates (`delivery-only`)

- Status: Accepted
- Date: 2026-10-03
- Depends on: ADR-014 (no gate gets weaker without a reason and a second person), ADR-016 (the
  verified gate's machine results)
- Governs: the `delivery-only` workflow profile and its `baseline: "existing-system"`, `eos init
  --brownfield`, the `document-existing-system` action, spec-align's acceptance-criteria source

## Context

EOS's product spine assumes a new product: discovery → requirements → PRD → UX → architecture, each
gated, before the first story. A system that already runs in production has all of those — as code,
as operations, as people's knowledge — but not as EOS records. Asked to start at discovery, a team
with a live system either writes fiction to satisfy G1–G4 or does not adopt EOS at all. Both are
worse than adopting it where it pays off first: at the change.

Options considered:

1. **Require the baseline anyway, reverse-engineered.** Honest in shape, but weeks of documents
   before the first verified change, and the documents describe intent nobody had.
2. **Waive G1–G4.** Waivers expire and name a risk owner; a permanent "we already exist" is not a
   risk to accept, it is a different starting point.
3. **A profile whose baseline is the existing system.** The spine gates do not apply; the
   delivery gates apply unchanged.

## Decision

**Option 3: the `delivery-only` profile.**

1. **The baseline is the system that runs, documented as it is** (`baseline: "existing-system"`):
   `eos next` asks for `bmad-document-project`'s as-is documentation (`docs/index.md`), not for
   discovery. Nothing is re-specified.
2. **The delivery gates are unchanged.** Every change is a story that must be ready (G5), verified
   against the code it changes (G7) and released through G8 under Standard's rules.
3. **What is not gated:** discovery, requirements, the PRD, UX, architecture, and the post-release
   telemetry and write-back gates (G9, G10), which build on a written baseline.
4. **Until a PRD exists, a story's acceptance criteria stand on their own** (FEATURE's `prd-ready`
   is `not_applicable`, so `ac-references-resolve` is too), and the release gate aligns the trace
   matrix with the stories the release ships instead of a PRD; a row no story declares is still an
   orphan. Once `docs/prd.md` exists, every story's criteria must resolve against it.
5. **Standard track only.** `eos init <pack> --brownfield` refuses the Regulated track, whose
   assurance rests on the baseline.
6. **It is a policy choice, and the lock says so.** Adopting it on a new project is a declaration
   like any other. Moving an existing Standard project onto it is a WEAKENING that the policy lock
   records with a reason and a second person; graduating back to `standard-product` only
   strengthens the policy.

## Consequences

- A team with a live system gets verified, traced, releasable changes from the first story, without
  inventing a past.
- The product state is derived through `not_applicable` gates, so `eos status` shows the product
  baselined; the as-is documentation, not a gate, is what stands behind that.
- The quality of the as-is documentation is not gated. It is input for people and agents, and the
  delivery gates do not depend on it.
