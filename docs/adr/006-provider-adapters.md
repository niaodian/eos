# ADR-006 — Provider adapters: GitHub governance and attestation

- Status: Accepted
- Date: 2026-09-10
- Implements: ADR-005 (D1–D5)
- Supersedes: the ADR-005 plan to split this into ADR-006 + ADR-007

## Context

ADR-005 fixed the boundary; two gaps were waiting behind it.

- **`activation-authority` was permanently `BLOCKED`.** EOS runs on your machine and cannot see
  server-side branch protection, so it reported "I cannot know" — correct, and permanent.
- **`attestation` was a claim nobody checked.** A machine summary could say
  `"attestation": { "type": "slsa" }` and EOS carried the string without verifying anything, because
  Core deliberately verifies nothing itself.

Both need an authority EOS cannot be. That is what an adapter is for.

**One ADR, not two.** GitHub governance and attestation share a single contract; splitting them
would duplicate the contract and let the two halves drift.

## Decision

### The contract

`.github/eos/adapters/contract.mjs` defines a verdict — `PASS` / `FAIL` / `BLOCKED` / `DEFERRED` /
`UNVERIFIED` / `ERROR`, each carrying provider, subject, `checkedAt`, detail, `evidenceRef` and
optional expiry. A bare status is not reviewable: you cannot act on "BLOCKED" without knowing who
said so, about what, and when.

Providers are configured in `.eos/providers.json`, which is **absent by default**. No configuration
means no adapters, and every gate still reaches a verdict offline.

### `resolve()` is rule D4, and it is the whole design

> **Only a `PASS` may raise the verdict.**

An earlier draft ranked the statuses and let any "better" one through — which meant a provider that
merely *failed to answer* (`UNVERIFIED`) could still change the outcome. **Not knowing is not
evidence.** Everything except `PASS` is reported alongside the offline verdict and then ignored.

Consequences, all asserted by `adapters.test.mjs`:

- an absent, unreachable, unauthorised, timed-out or crashed provider leaves the verdict **exactly
  as it was before any adapter existed** — configuring one can never make a project worse off;
- a provider cannot veto a conclusion EOS could already justify on its own;
- an adapter that throws becomes an `ERROR` verdict rather than a crashed EOS: a governance tool
  that a broken integration can take down is not a governance tool;
- an unknown status degrades to `ERROR`, never to `PASS`.

### Which gates may consult one

Only `activation` and `release-ready`. The development loop (G1–G7) never asks an external
authority, so **no provider problem can block day-to-day work** — that constraint came from the
repository owner and it turned out to be the cleaner architecture.

### The two adapters

**`github-governance`** reads `repos/{owner}/{repo}/branches/{branch}/protection` through `gh` and
checks what the *project* declared it requires: named status checks, Code Owner review, a minimum
approval count, and whether administrators can bypass. "The branch is not protected" is a verified
negative (`FAIL`). "I could not reach GitHub / I am not authenticated / I lack permission" is
`UNVERIFIED`, which under D4 changes nothing.

**`github-attestation`** runs `gh attestation verify`. "No attestation exists" and "it does not
match" are verified negatives; everything else is `UNVERIFIED`.

Both obey D3 by construction: `gh` is already authenticated and holds the token in its own store, so
**this process passes no credential, reads none, and can leak none**. Both obey D5: every call is a
read, and the tests assert no mutating verb appears in either file.

### `evidencePolicy: "attested"` now means something

Previously the strictest policy was satisfied by the *claim*. It now requires a provider verdict:
with none configured the answer is `BLOCKED` — "you asked for verified provenance and nobody is
verifying it" — rather than a pass on a self-reported string.

## Consequences

- A project that can reach GitHub can finally turn `activation-authority` into a real `PASS`.
- A project that cannot is **exactly where it was**, which is the point.
- `eos providers` shows what is configured and what each authority says right now.
- EOS Core still contains no network path: `offline-boundary.test.mjs` scans Core, and adapters live
  outside it by design.

## What this does not do

- No adapter is enabled by default, and none is required.
- EOS still never writes to an external system (D5), so it cannot configure branch protection for
  you — only tell you the truth about it.
- Sigstore and SLSA verification are reachable through the same contract when someone needs them;
  no adapter was written speculatively.
