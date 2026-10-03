---
name: eos-spec-align
description: Quantify how well the code matches the spec — acceptance-criterion coverage, first-pass rate, drift — from docs/prd.md and docs/trace-matrix.md (a G7 metric). Use when building the trace matrix or before a release.
---
# Spec-Alignment Metric (EOS) — Gate G7 measure

Usage: `/eos-spec-align <none — reads docs/prd.md + docs/trace-matrix.md>`

EOS exists to make Agent output stable, controllable, and measurable. This quantifies it.

1. Ensure `docs/prd.md` (ACs) and `docs/trace-matrix.md` (AC ↔ test/eval) exist (produced by G3/G7).
2. Run the metric:
   ```sh
   node .github/hooks/spec-align.mjs          # advisory — gaps report but exit 0
   node .github/hooks/spec-align.mjs --strict # gate: exit 1 on any gap (incl. MISSING evidence)
   ```
   > **`--strict` is fail-closed.** If `docs/prd.md` or `docs/trace-matrix.md` is absent, strict mode
   > FAILS (a release gate must never pass on absent proof). Advisory mode prints `ADVISORY / SKIP`
   > and exits 0 so every-push CI stays non-blocking before G7.
3. Report three numbers and act on them:
   - **AC coverage %** — PRD ACs that have a trace row. < 100% ⇒ spec drift (built less than specced,
     or forgot to trace). List the missing ACs and add tests or mark explicitly deferred.
   - **Traced-pass %** — trace rows passing (✅). This is the **first-pass rate** proxy: high ⇒ the
     Agent produced spec-aligned code on the first go; low ⇒ rework. Track the `RECORD …` line over
     time to see the rate trend per feature/iteration.
   - **Drift / orphan** — ACs in the PRD with no test (drift) or tests with no PRD AC (orphan/scope creep).

## How to read it
- **Spec-alignment** = coverage% (did we build exactly what the spec says, nothing more/less).
- **First-pass rate** = traced-pass% at the first G7 run, before any rework. Log it; a rising trend
  means the rules/context are steering the Agent better; a falling trend is an early warning.

## Where it fits
- Run at **G7** (after tests exist). Use `--strict` as a release-gate (G8) check for zero drift.
- Feed the numbers into the **retrospective** (bmad-retrospective) as the epic's quality signal.

Output: the metric printout (and optionally append the `RECORD` line to a trend log you keep in the repo).

> **Next:** clean at G7 → proceed to `/eos-release-gate` (G8); run this with `--strict` there as the
> zero-drift release check.
