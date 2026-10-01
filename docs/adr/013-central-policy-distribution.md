# ADR-013 — Central policy distribution: a signed baseline, vendored and enforced offline

- Status: Accepted
- Date: 2026-10-01
- Depends on: ADR-005 (external authority boundary), ADR-008 (no gate compatibility table), ADR-012 (signing)
- Governs: `eos policy export`, `eos policy sync [--check]`, `.github/eos/adapters/policy-upstream.mjs`, `.eos/policy.upstream.json`, the `upstream` block of `.eos/policy.lock.json`, `policyUpstream` in `.eos/project.json`, `eos report --org`

## Context

Backlog item #17 asked for central policy distribution with local enforcement, an organisation-level
compliance report, and "Policy-as-Code integration". EOS already had the local half: the policy is
machine-readable JSON (`.eos/gates.json`, `.eos/workflow.json`), `eos policy lock` pins it, and
`eos policy check` fails CI when a gate gets weaker without a reason and a second person (1.20).
What was missing was a way for an organisation to say "no repository may be weaker than this" —
without a policy server, without a credential, and without making any verification command depend
on the network.

## Decisions

### D1 — A baseline is a signed snapshot of the policy

`eos policy export --name <org-policy> --version <v>` produces a bundle containing the policy
snapshot (gates and workflow; the project declaration is deliberately `null`, because a baseline
says what every project must enforce, not what any one project is). With `--sign --key` it carries
an Ed25519 signature under the `eos-policy-baseline-v1` domain (ADR-012 D3). Its identity is the
SHA-256 of the canonical bundle, signature included.

### D2 — Distribution is an explicit pull, vendored into the repository

A project declares `policyUpstream: { source, publicKey? }`. `eos policy sync` fetches the baseline,
verifies its signature when a key is declared, writes it to `.eos/policy.upstream.json` and pins its
digest in `.eos/policy.lock.json` → `upstream`. The change arrives as a reviewable diff. `--check`
reports what would change (old → new version) and writes nothing. A source that cannot be reached is
exit 2 (try again); a misconfiguration is exit 1.

### D3 — One network call site, on narrow terms

`fetchBaseline` in `adapters/policy-upstream.mjs` is imported only by `commands/maintenance.mjs` and
called only inside `policy sync`; a test pins both. It accepts `https://`, plain `http://` only on
loopback, and `file:` paths (an air-gapped or monorepo checkout of the policy repository). Redirects
are refused, so a `302` can never move the source to plain http, and nothing reads a credential: a
private policy repository is reached through a local checkout whose access is git's business.
Declared providers (ADR-006) are the other, separate way EOS consults a remote authority; they are
opt-in and monotonic, and this ADR does not change them.

### D4 — The baseline is a floor, enforced with the existing weakening rule

`eos policy check` stays offline. It compares the local policy with the vendored baseline through
the same diff that compares two commits, and gives every difference an `upstream:` id. A local
policy may be stricter than the baseline; anything weaker is a `WEAKENING` that needs a reason and a
second person, exactly like a local weakening. Three rules keep the floor from being removed quietly:

- **The pin moves only with `policy sync`.** If `.eos/policy.upstream.json` no longer matches the
  digest pinned in the lock, the check fails, and `eos policy lock --write` keeps the existing pin
  rather than re-pinning whatever the file now says — re-locking cannot launder an edited copy. (Only
  a first lock, when `sync` found no lock to write into, pins the vendored copy.)
- **A signed baseline is re-verified on every check.** With `policyUpstream.publicKey` declared,
  `policy check` verifies the vendored copy's signature offline, so an edit fails even if someone
  also forges the pinned digest. An unsigned baseline rests on the transport and the pin, and
  `policy sync` says so.
- **Leaving is a weakening.** The policy snapshot records which baseline a project follows: removing
  `policyUpstream`, or pointing it at another source, is a `WEAKENING` that needs a reason and a
  second person; adopting one is a `STRENGTHENING`.

### D5 — Organisation reporting aggregates files, not servers

`eos report` produces a schema-validated governance report for one repository (track, gates and their
pass rates, waivers, policy lock, SBOM, release signatures, an `attention` list). `eos report --org`
aggregates those JSON reports into an organisation report. Collecting the files is left to whatever
the organisation already uses (CI artifacts, a scheduled job); EOS needs no central service.

## Declined

- **A policy server or API.** A runtime dependency and a credential for every repository, to deliver
  a JSON file that a pull, a vendored copy and a pinned digest deliver offline.
- **Syncing on `check`.** Verification would depend on the network, and the policy a commit was
  verified against would be whatever the server returned that minute instead of what the commit
  contains.
- **OPA / Rego as the policy language.** EOS policy is already policy-as-code in JSON with a
  published schema. A second language would be a second authority and a dependency; an
  organisation that runs OPA can evaluate the exported baseline and the governance report — both
  plain, schema-valid JSON — with it.
- **Overriding the local policy with the baseline.** A baseline that silently rewrote a repository's
  gates would be the invisible governance change EOS exists to prevent. It is a floor that is checked,
  never a copy that is applied.

## Consequences

- A project with no `policyUpstream` is unaffected.
- An organisation publishes `policy export` output where its repositories can fetch it, signed with
  a key whose public half each repository commits.
- Raising the baseline is a `policy sync` in each repository: a reviewed diff, after which any
  repository that is weaker fails `policy check` until it is brought up or the gap is acknowledged.
