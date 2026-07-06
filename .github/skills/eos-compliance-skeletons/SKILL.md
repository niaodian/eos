---
name: eos-compliance-skeletons
description: Use when implementing privacy/compliance controls in code — consent capture, DSAR (data subject access/erasure/export), PII/PHI/PAN redaction, or before sending personal data to a third-party or LLM. Points at zero-dependency runnable starter skeletons so these are scaffolded, not retrofitted late.
---

# Compliance Skeletons

**Goal:** Turn the high-frequency 🟡 *project must build* rows of the compliance checklists into a
**starting scaffold**, so consent / DSAR / redaction are shaped early instead of retrofitted after
launch (the expensive time). `【New-build】`

## When to use
- Building **consent** capture, a **DSAR** endpoint (access / erasure / portability), or **redaction**
  of regulated fields.
- **Before** wiring any call that sends personal data to a third-party or **LLM** (the `eos-doctor`
  **D5** / Agentic data-boundary moment).
- Right after `/compliance` selects a regime with 🟡 items to build.

## Procedure
1. Copy `docs/eos/examples/compliance-starter/` into the project (e.g. `src/compliance/`). Four
   parallel ports ship, one per EOS default reference stack: **Node/ESM** (`*.mjs`),
   **Python/stdlib** (`*.py`), **Go** (`*.go` + `go.mod`), **Java/JDK** (`*.java`) — take the one
   that matches your stack; all four have the same regime profiles, seams, and 7 tests.
2. Map each control to its skeleton and adapt (swap in-memory stubs for the real DB):

| Need | Skeleton | Adapt |
|---|---|---|
| Strip PII/PHI/PAN before send/log | `redaction.mjs` → `createRedactor([regime])` + `assertClean()` | pick regime preset(s) from `PROFILES` (base+HIPAA/PCI/GDPR_PIPL) or extend a profile; call `assertClean()` before any provider call. Or auto-scope from the `/compliance` output with `redactorFromProfile('docs/compliance-profile.md')` (reads its **Regulatory regime:** line — no hardcoded regime) |
| Consent (versioned, revocable, per-purpose) | `consent.mjs` → `createConsentStore()` | back with `(subject_id, purpose, granted, basis, version, at)`; keep purposes separate (PIPL) |
| DSAR export / erasure | `dsar.mjs` → `exportSubject()` / `eraseSubject()` | register one `source` adapter per table/service |
| Audit trail (who/when/what, no PII) | `audit.mjs` → `audit()` | point `record()` at a WORM / append-only table |

3. Wire the run command into `quality.json` / npm scripts (or `go test` / `javac && java`) so it runs at G7.

## Output
Working `src/compliance/*` modules + the port's passing test (`compliance.test.mjs` /
`test_compliance.py` / `go test` / `ComplianceTest`), referenced from the project's
`docs/compliance-profile.md` 🟡 rows so the gate can see them landed.

> Reuse note: composes with `eos-operational-readiness` (decides *what* to build) and `/compliance`
> (selects the regime). This skill supplies the *code starting point* neither of those ships. The
> `redaction` scaffold is the concrete form of the `eos-doctor` **D5** data-boundary check.
