# ADR-010 — One diagnostic contract: hooks report their verdict as data, in the gates' vocabulary

- Status: Accepted
- Date: 2026-10-01
- Depends on: the 1.18.0 diagnostic context on gate results (`rerunCommand`, `policySource`, `affectedArtifacts`, `waiverEligible`)
- Governs: `.eos/schemas/diagnostic.schema.json`, `project-gate.mjs --json`, `eos-doctor.mjs --json`, `problems[]` in `eos check --json` and `eos verify-release --json`

## Context

Since 1.18.0 a gate result has carried a machine-readable diagnostic: the policy that made the gate
apply, the files the verdict is about, and the command that reproduces it. The validators the gates
call — `project-gate.mjs` and `eos-doctor.mjs` — still printed English only, so everything that
consumed them had to read prose.

The engine was one of those consumers, and it read the prose wrongly. The `verified` and
`release-ready` evaluators decided BLOCKED vs FAIL by searching project-gate's output for the word
`BLOCKED`. That output includes the product's own test output, so a failing test that printed
"BLOCKED" was reported as a missing toolchain: the developer was sent to install something instead
of fixing a test. The same evaluators captured that output with Node's default 1 MB buffer, so a
verbose but passing test suite was killed mid-run (`ENOBUFS`) and reported as ERROR.

The audit asked for a diagnostic schema with `status`, `problems`, `level`, `gate`, `scope`,
`message` and `rerunCommand`. A schema with new names beside the gate result's existing ones would
have created two vocabularies for the same thing, which is the drift the policy work (#10) removes.

## Decision

**One report envelope for tools, one problem item for everything, and the gate engine's status
order.**

- `.eos/schemas/diagnostic.schema.json` defines the envelope a tool writes with `--json`
  (`schemaVersion`, `tool`, `status`, `exitCode`, `summary`, `scope`, `problems`, `notes`,
  `rerunCommand`, open `details`) and the problem item (`level`, `code`, `message`, and, where they
  apply, `status`, `gate`, `scope`, `artifact`, `fix`, `rerunCommand`). The item reuses the names a
  gate check already has: the check id is the `code`, its `fix` the minimum corrective action, its
  `artifact` the file.
- `eos check --json` and `eos verify-release --json` add `problems[]`: the gate's failing checks as
  problem items. Everything they emitted before is unchanged.
- With `--json`, stdout carries exactly one document and every human line moves to stderr, including
  the product's test output (the child's stdout is redirected to fd 2). The process ends through
  `exitAfterFlush`, so a pipe receives the whole document.
- The status order is the engine's: ERROR > BLOCKED > FAIL. `hooks/lib` cannot import the engine
  (hooks are copied into projects and test sandboxes on their own), so a contract test keeps the
  two orders equal.
- The evaluators run `project-gate --skip-install --json`, validate the report against the schema
  and act on its `status`. A report that is missing or invalid is ERROR, never a pass: a hook too
  old to speak the contract is told apart from a passing one. Hook output is buffered up to 64 MB.

## Declined

- **Changing hook exit codes** to the CLI's 0/1/2/3. CI steps and the evaluators branch on 0 vs.
  non-zero; turning BLOCKED into 2 would silently change every caller. The JSON `status` carries
  the distinction instead.
- **Changing the human output.** Without `--json` both hooks print exactly what they printed
  before. The legacy verdict word for an invalid declaration stays `FAIL:`; its JSON status is
  `ERROR`, which is the precise one.
- **A `gate` field on the tool envelope.** A hook is not a gate; its findings feed several. `gate`
  and `scope` are set on problems that come from a gate, where they identify the check.

## Consequences

**Accepted:** `details` is open. What a consumer must act on is in the closed fields; tool-specific
facts (project-gate's step list) can grow without a schema version bump.

**Preserved:** a hook run without `--json` is byte-for-byte what it was. A project that upgrades
`.github/eos/` without `.github/hooks/` gets a named ERROR from the gates, not a silent pass.
