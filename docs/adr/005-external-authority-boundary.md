# ADR-005 — The external-authority boundary

- Status: Accepted
- Date: 2026-09-10
- Depends on: ADR-004 (release membership and evidence trust)
- Governs: any future provider adapter (GitHub governance, attestation, deployment)

## Context

Two gates cannot be closed by a program running on your laptop:

- `activation-authority` — EOS cannot see server-side branch protection, so it is permanently
  `BLOCKED`. It reports "I cannot know", forever.
- evidence provenance — `producer: "ci"` is a string a person can type. Without an external
  authority, the trust ladder tops out at "we believe you".

Closing them means talking to something outside the repository. That is a positioning decision, not
a feature: EOS's distinguishing claim is that the whole governance loop runs with no network and no
account. This ADR records the five decisions that keep that claim true while allowing the two gaps
to be closed.

## Decisions

### D1 — Network is an optional enhancement. It is never required.

EOS Core reaches a verdict offline for every gate. An adapter may consult an external authority when
one is configured and reachable; nothing in the daily loop ever depends on it.

Enforced by `offline-boundary.test.mjs`: Core may not import a network module, call `fetch`, or
invoke a network-capable CLI. An adapter lives outside Core, is absent by default, and the offline
suite exercises it through a deterministic mock.

### D2 — A regulated project must STATE its evidence policy. EOS does not choose for it.

`eos-1.14.0` blocked a regulated release on locally-produced evidence. That was wrong: **air-gapped
environments cannot produce cloud attestation at all**, and defence and parts of healthcare are both
the most regulated and the most likely to be disconnected. The rule excluded precisely the users who
need governance most.

`.eos/project.json` gains `evidencePolicy`:

| Value | Meaning |
|---|---|
| `local` | locally-produced evidence is acceptable — legitimate, and requires a stated reason |
| `ci` | evidence must come from a CI producer |
| `attested` | evidence must carry provenance an adapter can verify |

A regulated project **must** set it; leaving it unset fails. It may legitimately choose `local` — for
example "air-gapped; no external attestation authority is reachable" — because that is a decision
somebody made and wrote down. This is the same shape as SKIP / DEFER everywhere else in EOS:
**a blank is refused; a stated decision is respected.**

### D3 — EOS never handles a credential.

Stronger than handling secrets carefully is never seeing one. In order of preference:

1. **Delegate to an already-authenticated CLI** (`gh`, `aws`, `gcloud`). The token lives in that
   tool's own store; EOS passes none and sees none.
2. **CI only: read a well-known environment variable**, use it in memory for a single request, never
   persist or log it.
3. **Prohibited**: a token in `.eos/*`, a `--token` flag, an interactive prompt, or any credential
   store of EOS's own.

Invariant: **no credential may ever appear in evidence, the ledger, a handoff, or any EOS output.**

Combined with D5, the access an adapter needs is read-only and minimal — and it is held by the CLI,
not by EOS.

### D4 — An adapter is monotonic: it can only ever improve a verdict.

**The absence, failure or timeout of a provider must leave the verdict no worse than it is today.**

- Providers are consulted only at the release gate (G8). The development loop (G1–G7) never asks
  one, so no provider problem can ever block day-to-day work.
- `activation-authority` today: `BLOCKED`. Adapter unavailable: still `BLOCKED` — no worse. Adapter
  available and protection is on: it can finally `PASS` — better.
- Default when a provider is unreachable: `DEFERRED` (visible, owned, time-bound), not `BLOCKED`,
  unless the project raised the bar itself.

A network failure, a permission error or an API outage may never become a `PASS`. It may also never
become a **new** blocker that did not exist before the adapter was introduced.

### D5 — EOS is read-only against every external system. Always.

EOS will not set branch protection, create a release or tag, open a pull request, post a status
check, or upload anything.

1. **A tool that can grant itself enforcement authority can also remove it.** If EOS could set branch
   protection, compromising EOS would disable the gates. EOS's value depends on being *subject to*
   enforcement, not the owner of it.
2. Write access needs far broader scopes, multiplying the D3 risk surface.
3. It breaks the separation the whole system rests on: **EOS records and reports; humans and CI act.**

The convenience case is real — `/eos-init` tells you to configure branch protection and could just
do it. The door is closed deliberately, so that a future "while we're here" change has to argue with
this ADR rather than slip past it.

## Consequences

- Round B can proceed: the GitHub governance and attestation adapters have a contract to satisfy.
- EOS keeps working on a plane, in an air-gapped network, and with no accounts — which is the reason
  to choose it.
- The two permanent gaps become closable *for projects that opt in*, without becoming requirements
  for projects that do not.
- `evidencePolicy` is a small migration for regulated projects: state the policy you were already
  operating under.

## What this ADR does not decide

Which adapters get built, and in what order. Those are ADR-006 (GitHub governance) and ADR-007
(attestation verification), each of which must show how it satisfies D1–D5 — in particular how the
offline suite exercises it without a network.
