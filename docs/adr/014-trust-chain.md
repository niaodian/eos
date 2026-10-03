# ADR-014 — The trust chain: who decides what a gate runs

- Status: Accepted
- Date: 2026-10-03
- Depends on: ADR-005 (external-authority boundary), ADR-012 (supply-chain trust model)
- Governs: `commands` in `.eos/project.json`, `eos policy lock` / `eos policy check`, the machine summaries the gates read, the activation checklist and the enforcement authority `eos-doctor` reports

## Context

A gate does not judge code by itself: it runs the commands the project declares (`commands.test`,
`commands.eval`, `commands.audit`, …) and reads what they produce. Whoever can change the declaration
can change what "verified" means — replace the test command with one that always exits 0, say. The
pieces that stop that already existed in `policy.mjs`, the machine-summary readers, the activation
checklist and `eos-doctor`, but no document said how they add up, or where the chain ends. The
eos-2.0.0 audit asked for it to be written down. This ADR records the chain as built; it introduces no
new mechanism.

## Decision — the chain, link by link

1. **The declaration is the anchor.** EOS runs exactly what `.eos/project.json` declares and records
   which command produced a result. It never infers commands from the code.
2. **The policy lock guards the declaration.** `eos policy lock` snapshots the declared commands with
   the gates and the workflow. A removed command is a WEAKENING; a changed one is REVIEW, because EOS
   cannot tell whether the new command checks as much; an added one is a STRENGTHENING. WEAKENING and
   REVIEW need an acknowledgement in the lock with a written reason and an approver who is not the
   requester. `eos policy check` fails CI on an unacknowledged change.
3. **A result is a machine summary bound to the tree, not an exit code.** Test traces, eval results
   and NFR measurements are schema-validated summaries carrying the product-tree digest; the gate
   recomputes each verdict from the observed value and the threshold. A swapped command that writes no
   summary, or writes one about other code, cannot pass.
4. **Server-side protection makes the second person real.** The approver in the lock is a name in a
   file. It becomes a person only when branch protection (a required `verify` check, pull requests)
   and CODEOWNERS on the governance files make someone else review the change — the `/eos-init`
   hardening. EOS cannot verify that from a laptop: until it exists, `eos-doctor` reports the
   enforcement authority as `CONTRACTUAL`, and the chain ends at link 3.
5. **CI re-runs the chain on the merge candidate.** The `verify` job runs validate-config, the
   policy check, the secret scan and the gates' own tests on the pull request, not on the developer's
   machine.

## Consequences

- Before link 4 exists, one person can still weaken a project. EOS makes that visible — a policy diff,
  a lock entry, a ledger event — not impossible. This is listed in the quickstart's *Known limitations*.
- Changing a command is always a reviewed event, even when the change is harmless. That is the price
  of never inferring intent.
- Evidence recorded locally says so (`producer.type: local`, read as `UNATTESTED_LOCAL`); a Regulated
  release requires evidence produced in CI (ADR-005, `evidencePolicy`).
