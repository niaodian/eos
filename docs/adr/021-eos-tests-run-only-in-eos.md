# ADR-021 — EOS's own tests run only in EOS itself; a project's CI is the governance gate

- Status: Accepted
- Date: 2026-10-04
- Depends on: ADR-012 (the workflow reads the engine, never a copy of its rules), ADR-014 (`verify` is
  the required check that makes the gates authoritative)
- Governs: `.github/workflows/eos-ci.yml` (the `scope` step of `verify`, the `plan` job, `coverage`,
  `cross-platform`), `.github/eos/ci-plan.mjs`

## Context

`eos-ci.yml` is copied into every project that starts from the template — by `degit`, by "Use this
template", and again by `eos upgrade`. It is two things at once: the governance gate every project
needs (configuration, docs drift, SBOM, secrets, ledger, policy, doctor, the project's own declared
commands) and EOS's own test suite (five layers, a coverage ratchet, a Linux/macOS/Windows matrix).
Until 2.5.0 it ran both, unconditionally.

EOS's suites test EOS. They assert the template's own declaration (`"templateDefault": true`), its
default agent platforms, that `.agents/skills` holds only `eos-*`, that the policy lock describes the
template. In the first adopter-style copy — `eos init <pack> --write`, then a team skill — one contract
case and fifteen integration cases failed. Every new project's first CI would have been red for
reasons that are not its defects, after spending Windows and macOS runner minutes (billed at two and
ten times the Linux rate on a private repository) on tests of software it did not write. On a copy
that has not declared itself yet the suites pass: the tree is still the template's.

## Options

- **A. One workflow, a plan that reads the declaration.** EOS's suites run only while
  `.eos/project.json` is the template's own declaration.
- **B. A separate workflow for EOS's own tests** (`eos-self-test.yml`).
- **C. A repository-name condition** (`github.repository == 'niaodian/eos'`).

## Decision

**A** — recommended in the batch brief and confirmed as the pragmatic choice when the decision was
put to the maintainer in their absence. B does not remove the guard: every copy and every upgrade
would still bring the second file, so it would need the same check on the declaration (or `init` to
delete it and `upgrade` to exclude it), add a second workflow run to every push and pull request of
every project, and a second set of required checks to EOS's own branch protection. C hard-codes one
repository: a fork pushing, or an organization's own distribution of EOS (manual §10.3), would
silently stop testing EOS. The declaration is already how EOS tells itself apart from a project —
`eos next`, the product-quality gate and the release preview all read it.

1. **`.github/eos/ci-plan.mjs` decides**, the way `release-plan.mjs` decides the release track: it
   reads `.eos/project.json` and prints `self=true` only for the template's own declaration. A missing
   or unreadable declaration is not EOS's either — EOS always ships one — and validate-config fails
   that run on its own. The workflow holds no second copy of the rule.
2. **`verify` asks in its own step** and gates only its five "EOS tests ·" steps. It does not depend on
   the `plan` job: GitHub reports a job that was skipped because a job it needs failed as a *passing*
   required check, and `verify` is the required check. A broken plan turns `verify` red; it can never
   skip it green.
3. **`coverage` and `cross-platform` need the `plan` job** and are skipped as whole jobs in a project:
   no runner starts, on any platform.
4. **Every governance step runs in every repository**: validate-config, doc parity, SBOM, governance
   versions, generated docs, agent platforms, doctor `--deep`, gitleaks and the secret scan,
   spec-align, the ledger, the policy lock, `eos doctor`, and the product-quality gate — which is
   where a project's own tests run.
5. **Tested from both ends.** `ci-workflow.test.mjs` checks the structure statically.
   `adopter-ci.test.mjs` copies the template as `degit` does, follows Day-1, and runs every command of
   the project path with an empty HOME, on the first push and on the first pull request. It reads the
   list from the workflow's own text, so a step added to the project path is a step the suite runs.

## Consequences

- After `eos init`, a project's CI runs the governance gate and the project's own declared commands.
  EOS's suites show as skipped steps, `coverage` and `cross-platform` as skipped jobs.
- A copy that has not declared itself still runs EOS's suites when it is pushed. They pass, and
  `eos next` asks for `eos init` before anything else; declaring before the first push avoids the
  minutes.
- The workflow a project carries still contains EOS's test steps. They cost nothing but reading, and
  keeping them in one file is what lets `eos upgrade` treat the workflow like any other template file.
- **Residual risk: the declaration is the only signal.** In EOS's own repository, a pull request that
  removes `templateDefault` stops the five layers, coverage and the matrix from running in its own CI
  (the product-quality gate still runs the declared test command unless the declaration changes too).
  The control is review: `.eos/project.json` is under CODEOWNERS, and that diff is not subtle.
