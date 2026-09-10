---
name: release-gate
description: Run the EOS release gate (quality + security + supply chain + NFR + rollback + canary)
agent: agent
tools: ['search', 'runCommands']
---
# Release Gate (EOS) — Gate G8

**Run the machine gate first. This prompt walks the same list, in the same order, with the same
verdicts — there is no item here that the evaluator does not check.**

```sh
node .github/eos/eos.mjs verify-release --release <candidate-id>
```

Every row below maps 1:1 to a check id in `.eos/gates.json` → `release-ready`. If the machine says
FAIL / BLOCKED / DEFERRED, that is the answer; the job is to close it, not to re-adjudicate it.

| # | Check id | What must hold | Where it is proven |
|---|---|---|---|
| 1 | `candidate-identity` | the candidate is a committed tree with no uncommitted product change | `eos product-tree` |
| 2 | `candidate-quality` | lint + typecheck + tests + evals pass **on this candidate**, not on a past story | `project-gate.mjs --skip-install` |
| 3 | `stories-verified` | every included story is VERIFIED or MERGED | the ledger |
| 4 | `story-evidence-current` | each story's verification describes **this** tree | recorded product-tree identity |
| 5 | `spec-alignment` | no drift, no orphan rows | `spec-align.mjs --strict` |
| 6 | `secret-scan` | nothing hardcoded | `secret-scan.mjs` |
| 7 | `dependency-audit` | the declared `commands.audit` is clean | `npm audit` / `pip-audit` / `cargo audit` … |
| 8 | `nfr-evidence` | measured NFR results, or a deferral with an owner and a trigger | `docs/evidence/nfr-summary.json` |
| 9 | `compliance-boundary` | the structured data-boundary decision is implemented and approved | `docs/compliance-profile.json` |
| 10 | `no-expired-waivers` | no waiver has outlived its expiry | `.eos/waivers/` |
| 11 | `ops-artifacts` | rollback **and** canary/gradual rollout **and** health/readiness are documented | `ops/runbook.md` |
| 12 | `deployment-topology` | those mechanisms are the ones the chosen topology actually uses | `docs/adr/*-deployment-topology.md` |
| 13 | `activation-authority` | every activation item is closed or waived-with-reason | `docs/eos/activation.md` |

## Statuses, and what they are not

- **PASS** — proven here, now, on this candidate.
- **FAIL** — a check failed. Fix it.
- **BLOCKED** — it could not be proven (no toolchain, no git repository, a regulated product with an
  unrunnable audit). Absence of proof is never proof.
- **DEFERRED** — it could not be completed and the reason is recorded: an offline dependency audit,
  an NFR target with an owner and a trigger. **DEFERRED never makes the gate green.** It must carry
  an owner, a reason, an expiry or trigger and an explicit release-policy decision, and it must be
  re-run before the candidate ships.
- A **network failure is DEFERRED, never PASS.** For a `complianceProfile: "regulated"` product it is
  **BLOCKED**: a regulated release may not ship on an unproven supply chain or an unexamined
  compliance boundary.

## The two things a machine cannot decide

1. **Enforcement authority** `【Needs org/GitHub settings】`. EOS runs locally and cannot see
   server-side branch protection, so `activation-authority` reports BLOCKED while items are open —
   it never issues itself a PASS. Close them, or mark each `[~] waived — <reason>` in
   `docs/eos/activation.md`. For a personal or throwaway repository, waive with that reason.
2. **The approval itself.** `VERIFIED → APPROVED` requires an approval event recorded by someone
   **other** than whoever prepared the candidate:
   `node .github/eos/eos.mjs approve --scope release --id <candidate-id>`.
   You are running this prompt. **You do not approve, and neither does any model.**

## After the gate

```sh
node .github/eos/eos.mjs transition --scope release --id <id> --to VERIFIED
# ...a second person records the approval...
node .github/eos/eos.mjs transition --scope release --id <id> --to APPROVED
node .github/eos/eos.mjs transition --scope release --id <id> --to RELEASED
```

> **Next (after G8):** RELEASED is not the end. Run `/telemetry-plan` for Gate **G9**
> (`telemetry-ready`) so the change can be observed, then close the loop at **G10**
> (`iteration-ready`) with the `eos-review` agent. `eos next` will say so on its own.
