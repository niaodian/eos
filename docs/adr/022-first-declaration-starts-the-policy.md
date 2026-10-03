# ADR-022 — A project's first declaration starts its policy; it is not a weakening of EOS's

- Status: Accepted
- Date: 2026-10-04
- Depends on: ADR-014 (no gate gets weaker without a reason and a second person), ADR-021 (what a
  project's CI runs)
- Governs: `eos init <pack> --write` and `eos new` on a template copy, the `templateDefault` marker in
  the policy snapshot and diff (`lib/policy.mjs`), `baselineLock`, the SBOM refresh on a declaration

## Context

The template ships three files that describe EOS, not the project that copies it: `.eos/project.json`
(an application whose test command is EOS's own suite, marked `"templateDefault": true`),
`.eos/policy.lock.json` (the digest of that policy) and `.eos/sbom.json` (EOS's stacks). Following the
Day-1 documentation — commit the scaffold, then `eos init config-only --write` — the first push failed
CI three times over:

- `policy check`: `project:projectType:application->config-only` and `project:command-removed:test`
  were WEAKENINGs (a stack pack added REVIEWs for the changed test command and evidence), and the lock
  no longer matched. Recording them needs a second person to fill in the approver, so a developer
  starting a project alone could not make the first run green honestly.
- `sbom --check`: the declared stacks changed what the SBOM describes.
- `eos doctor`: the lock no longer matched the policy.

The one honest workaround was to declare before the first commit, delete the template's lock, re-lock
and regenerate the SBOM by hand — steps no document named.

## Decision

1. **A base whose declaration is the template's own has no project policy.** When a change replaces
   it with a project's declaration, the policy diff records one INFO,
   `project:first-declaration:<projectType>`, instead of comparing the two declarations — as it already
   did when the base had no declaration at all. Gates, profiles, state machines and schemas are still
   compared with the template's: what the template ships is the floor the project starts from.
2. **A declaration that stays the template's own is compared like any other.** In EOS's own
   repository, removing EOS's test command is still a weakening.
3. **`eos init <pack> --write` on a template copy starts this project's lock** (`baselineLock`): the
   digest of its policy, nothing acknowledged. If a gate or profile was already weakened against the
   base, `init` says so; `policy check` still fails on it until a second person approves.
4. **Every declaration write refreshes `.eos/sbom.json`** when it no longer describes the tree — the
   declared stacks are one of its inputs, an SBOM needs no approval, and `sbom --check` would fail CI
   otherwise. This includes a declared project that gains a stack when code lands.
5. **The template marker is in the policy snapshot only where it is set**, so every project that has
   declared itself keeps the digest it was locked with. EOS's own lock was re-recorded once.

## Why this is not a bypass

- **It approves nothing.** The new lock pins a digest; its acknowledgement list is empty. CI's
  `policy check` compares the change with its base exactly as before, and a lock cannot make a
  weakening against the base pass.
- **It keys on the base, not on the working tree.** Only a change whose *base* declaration is the
  template's own is a first declaration. A base that holds a project's declaration is compared field
  by field, whatever the head claims.
- **A declared project cannot get back to "template".** `init` refuses to replace a declared project's
  declaration without `--force`, and with `--force` it leaves the lock as it was: re-declaring is a
  policy change, recorded with `eos policy lock`, and a weakening still needs a second person. Marking
  a declaration as the template's own again is itself a WEAKENING,
  `project:templateDefault:declared->template`, so the two-step route — mark it first, re-declare
  against a "template" base next — needs a second person at its first step.
- **With no history there is nothing to compare, as before.** On a repository's first commit,
  `policy check` can only compare the lock with the tree, and `eos policy lock --write` on a repository
  without history has always pinned whatever was there. The first commit is the project's first policy.
- **In EOS's own repository**, replacing the template's declaration looks exactly like a project's
  first declaration. Review catches it — `.eos/project.json` is under CODEOWNERS — as ADR-021 states
  for EOS's own tests.

## Consequences

- Both Day-1 orders — scaffold first then declare, or declare first then commit — pass `policy check`,
  `sbom --check` and the doctors on the first push and on the first pull request
  (`adopter-ci.test.mjs`, `policy.test.mjs`).
- A stack pack's commands are meant to be edited: edited before the declaration is committed,
  `eos policy lock --write` records them with no approver, because it is still the first declaration.
  Once the declaration is committed, a changed command is a REVIEW, as before.
- A template copy that upgrades from 2.4.x before declaring sees `policy check` fail on the digest
  until it runs `eos init`, which `eos next` asks for first; declared projects are unaffected.
