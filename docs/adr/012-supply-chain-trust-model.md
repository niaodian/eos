# ADR-012 — Supply-chain trust: two tracks, signed release manifests, attested builds

- Status: Accepted
- Date: 2026-10-01
- Depends on: ADR-004 (release membership and evidence trust), ADR-005 (external authority boundary), ADR-006 (provider adapters)
- Governs: `.github/eos/lib/track.mjs`, `lib/signing.mjs`, `lib/canonical.mjs`, `lib/provenance.mjs`, `lib/release-integrity.mjs`, `eos release keygen|sign|verify|bind`, the `manifest-signature` and `release-integrity` checks of `release-ready` 4.0.0, `.github/workflows/eos-release.yml`, `.github/eos/release-plan.mjs`

## Context

Backlog items #7 and #17 asked for npm provenance, OIDC, SLSA provenance, signed release manifests
and a clear split between a frictionless open-source path and a strict regulated one. Checking each
request against the repository changed several of them:

1. **EOS is not an npm package.** `package.json` is `private` (`eos-template`); EOS ships as a
   template that is copied into a product. `npm publish --provenance` has nothing to publish, and the
   registry name `eos` belongs to an unrelated package — so `npx eos …` without `--offline` would
   fetch it. What EOS ships is a source archive, and that is what has to be attested.
2. **Release manifests already existed.** Since ADR-004 every release has
   `.eos/releases/<id>.json`, and approvals bind to its digest. A second, repository-wide
   `release-manifest.json` would be a competing record of the same thing.
3. **A track already existed in all but name.** `complianceProfile: "regulated"` — required by the
   `regulated` workflow profile since 1.21 — is what makes a project regulated. A new `track` field
   would be a third declaration that could disagree with the two that decide enforcement.
4. **ADR-005 D3 says EOS never handles a credential.** Signing needs a private key, so signing is
   an explicit, bounded exception or it is not done at all.

## Decisions

### D1 — Two tracks, derived from the declaration

`trackOf(project)` is Regulated exactly when `complianceProfile === "regulated"`, and Standard
otherwise; no declaration is Standard, so nothing is regulated by accident. `eos init <pack> --track`
sets the fields; `status`, `next` and `--json` output show the track and what its release requires.
A move from Regulated to Standard is a policy WEAKENING and is surfaced by `next` and `status` with
the exact `eos policy lock --write --reason` that acknowledges it.

### D2 — Present must verify on both tracks; absence blocks only Regulated

`manifest-signature` and `release-integrity` are checks of `release-ready` (4.0.0). A signature or a
provenance file that is present but wrong FAILS on both tracks — tampering is never optional. Absent,
they are `NOT_APPLICABLE` on Standard (with the command that adds them) and `FAIL` on Regulated.
This is what lets Standard stay zero-cost without ever accepting a forged artifact.

### D3 — Ed25519 over canonical JSON, with a domain

Signatures use Ed25519 from `node:crypto` (zero dependencies). The signed bytes are a domain string
(`eos-release-manifest-v1`, `eos-policy-baseline-v1`) followed by the canonical JSON of the document
without `signature` and `$schema` — so a CRLF checkout or re-indentation still verifies, any content
change does not, and a signature can never be replayed from one document kind to another. `keyId` is
the SHA-256 of the public key's SPKI DER. The signature is excluded from the manifest digest that
approvals bind to, so signing never invalidates an approval.

### D4 — Key custody, and the one exception to ADR-005 D3

`eos release keygen` writes the public key into the repository (`.eos/keys/release.pub`, declared in
`release.signing.publicKey`) and the private key outside it (`~/.config/eos/keys/<repo>-release.pem`,
mode 600). A private-key path inside the repository is refused, compared by real path so a symlink or
junction cannot smuggle it in, and `secret-scan` recognises a committed PKCS#8 key. EOS reads a
private key only when it is handed a file (`--key`), in exactly one function (`privateKeyFromFile`),
called only by `release sign` and `policy export --sign` — never from the environment, never logged.
A test pins all three.

### D5 — Provenance is produced by CI and bound offline

Provenance comes from GitHub artifact attestations (`actions/attest`, SLSA v1) on both tracks and,
on Regulated, from the SLSA Build Level 3 generic generator. EOS parses Sigstore bundles and in-toto
statements offline and checks that every shipped artifact is named by digest
(`eos release verify --provenance`). It does not embed a Sigstore client: verifying the certificate
chain and transparency log is delegated to `gh attestation verify`, the same delegation ADR-006 uses.

### D6 — The release workflow is least-privilege and fails before it publishes

`eos-release.yml` runs `plan → build → attest → slsa → manifest → publish`. The track comes from
`release-plan.mjs`, which reads the declaration through the engine, so the workflow holds no copy of
the rule. Only `attest` and `slsa` get `id-token: write`; only `slsa` and `publish` get
`contents: write`; `eos-ci.yml` gets neither. Actions are pinned by commit SHA, except the SLSA
generator, which must be referenced by its release tag for its own provenance to identify the builder
— the one documented exception. `upload-assets` is off, so the generator cannot publish ahead of
verification, and `publish` creates a draft only when every job the track requires has succeeded (a
job skipped because something upstream failed does not count as "not needed").

### D7 — Binding records; it does not append

`eos release bind` records the artifacts and their digests, the SBOM and the committed ledger head.
It appends no ledger event, so binding the same release twice yields the same manifest.

## Declined

- **`npm publish --provenance`.** EOS is not a published package (Context 1). If it ever becomes
  one, the attest job already produces the provenance npm would carry.
- **GPG.** A second key infrastructure with no dependency-free implementation in Node; Ed25519 in
  `node:crypto` covers the same need.
- **An in-process Sigstore verifier.** A dependency, network access to the transparency log, and a
  second implementation of what `gh attestation verify` already does.
- **A repository-wide `.eos/release-manifest.json` and a `release-manifest` command.** Per-release
  manifests and `eos release` already exist (Context 2); they were extended instead.
- **A `track` field.** Context 3.

## Consequences

- Standard projects change nothing: unsigned releases report `NOT_APPLICABLE`, and existing release
  evidence only needs re-running because `release-ready` moved to 4.0.0.
- Regulated projects need a release key (`eos release keygen --write`, private half stored as the
  `EOS_RELEASE_SIGNING_KEY` secret when CI signs) and provenance for every artifact.
- EOS's own releases run through `eos-release.yml`, and `gh attestation verify` checks them.
