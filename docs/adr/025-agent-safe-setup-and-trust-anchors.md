# ADR-025 — Agent-safe setup: the agent's own identity, one-command hardening, and the trust anchors in the policy

- Status: Accepted
- Date: 2026-11-01
- Depends on: ADR-024 (the trust boundary is stated; EOS is sealed), ADR-005 (the external-authority
  boundary — D5 in particular), ADR-014 (the trust chain), ADR-012 (signed releases)
- Governs: `.github/eos/harden-github.mjs`, `adapters/github-governance.mjs`,
  `adapters/github-attestation.mjs`, `lib/policy.mjs` (trust anchors and providers in the snapshot),
  `hooks/lib/governance-rules.mjs` and the PreToolUse guardrail, `release-plan.mjs` and
  `eos-release.yml` (attest only a release, behind the `release` environment), `eos-doctor`'s
  activation line, the user manual's Appendix D

## Context

An audit on 2026-10-31 (eos-2.7.0) reproduced seven ways an agent working in the repository could
make a gate pass without meeting it: approve as a "second person" by setting `EOS_ACTOR`; rewrite a
failing gate's evidence and append a correctly chained ledger event; approve its own waiver or policy
weakening by typing a name; swap the release-signing public key for its own; and edit every
governance file past a guardrail that had no rule for them. ADR-024 had already said why: everything
the gates read lives where the actor can write. The audit added the part that decides the outcome in
practice — the platform. On EOS's own repository the agent's session held the owner's token (admin,
`workflow` scope), and `main` required no approval, no Code Owner review, and exempted administrators.
Every control EOS has rests on that platform layer.

The maintainer asked for this to be fixed with as little left to do by hand as possible: a person
setting up a new project should not have to click through a dozen settings, and should not have to
know what each one means.

Embedding a key in EOS so that "only EOS can write the records" was considered and rejected: a key in
a program the agent can run is a key the agent can use (call the program), read (it is in the source
of an open template) or route around (edit the verifier). A signature only means something when the
key, the decision and the check are all out of the agent's reach.

## Decision

1. **The agent works as its own account.** The manual's Appendix D.5 sets up a GitHub machine account
   for the agent, with a classic token limited to `public_repo` (or `repo`) and never `workflow`, in a
   separate computer user. GitHub's own rules then hold the agent: it cannot change CI, cannot change
   settings, cannot approve as a Code Owner, cannot merge into the default branch.

2. **One command per repository, run by its owner: `node .github/eos/harden-github.mjs`.** By default
   it only reads and says what is missing; `--apply` asks, then creates the default-branch ruleset
   (pull request, one Code Owner approval, the latest push approved by someone else, the `verify` check;
   administrators may merge a pull request around it, never push), the release-tag ruleset, the
   `release` environment with the owner as reviewer, and the agent's collaborator invitation; `--check`
   verifies, read-only, and anyone may run it.

   **This argues with ADR-005 D5, as D5 asked any such change to.** D5 still holds for EOS's engine:
   nothing in `lib/`, `commands/` or `adapters/`, no MCP tool and no skill runs this file — a test
   asserts it — and the guardrail refuses an agent that runs `--apply`. The tool is a script the
   template ships for a person to run with their own credentials, the way the manual used to print the
   steps for them to click. D5's reason — "a tool that can grant itself enforcement authority can also
   remove it" — is about EOS's engine acting on its own; here a person acts, after reading the plan,
   and EOS's engine only ever reads the result. The alternative, by-hand configuration, is what failed:
   the audited repository had the steps documented and not done.

3. **The governance adapter reads what the server enforces.** It now asks for the rules that apply to
   the branch (rulesets at any level) as well as classic protection, names the repository in the path
   (`gh api` has no `-R`; `options.repo` never worked), tells a 404 from "not allowed to read", and
   reports who can get around the rules — including whether the credentials that ran the check can.
   A ruleset-protected branch no longer reads as unprotected.

4. **Trust anchors and providers are policy.** `policySnapshot` records the release-signing and
   baseline-signing keys (declared path and the key in the file) and `.eos/providers.json`, each only
   when present so no other project's digest moves. Replacing or removing a key is a WEAKENING whose id
   carries the new key's id, so an acknowledgement for one key never covers the next; consulting a new
   authority is a REVIEW; the `mock` adapter, which answers whatever its configuration says, is a
   WEAKENING.

5. **A release is signed only as a release, and only after a person approves.** `release-plan.mjs`
   attests a tag push only — a dry run's attestation would be a genuine signature on nothing released.
   The attest job uses the `release` environment, and the SLSA job waits for it. The attestation
   adapter pins the signing workflow (the project's release workflow unless declared otherwise) and
   refuses self-hosted runners; an owner-only configuration is UNVERIFIED, never PASS.

6. **The guardrail covers the governance surface.** Records only EOS's commands write (ledger,
   evidence, waivers, the policy lock) are refused everywhere, and the hook fails closed for them even
   when its rules cannot load. A person's decisions (`activation.md`, CODEOWNERS) are refused in a
   project. The judge (engine, hooks, workflows, policy, keys, agent configuration) needs a person's
   confirmation in a project, where the platform has an "ask"; in EOS's own repository it is the product
   and stays editable. Forging an identity, approving, merging, changing protection or credentials,
   pushing to the default branch or a release tag, git plumbing and `harden-github.mjs --apply` are
   refused everywhere. It remains a speed bump: the authority is decision 1 and 2.

7. **A ticked activation ledger is a claim.** `eos-doctor` reports it as CLAIMED and points at
   `harden-github.mjs --check`, which asks GitHub.

## Consequences

- A person's work per new repository is one command and one invitation to accept; per computer, one
  account and one workspace (Appendix D.0). Every later check is a command anyone can run.
- Projects that declared a signing key or keep `.eos/providers.json` re-lock once (`eos policy lock
  --write`); nothing needs an acknowledgement, because base and head now both carry the anchor.
- An attestation provider configured with `owner` only, or a pipeline that relied on dry-run
  attestations, now reports UNVERIFIED and must name its signing workflow.
- Still open, and recorded as `todo` cases in `audit-tamper.test.mjs`: approvals, waiver approvers and
  policy acknowledgements are still names in files (they need platform-authenticated approval), and CI
  does not yet re-prove the states the ledger claims. Those are iteration 2 of the remediation plan; an
  external judge outside the repository (ADR-024's "new product shape") is iteration 3.
- A newly found gap, also for iteration 2: an acknowledgement is matched by change id and kept in the
  lock, so once given for `project:command-changed:test` it also covers every later change to that
  command.
