---
name: spec-align
description: Quantify how well the built code matches the spec — AC coverage, first-pass rate, drift (Gate G7 metric)
argument-hint: <none — reads docs/prd.md + docs/trace-matrix.md>
agent: agent
tools: ['search', 'runCommands']
---
# Spec-Alignment Metric (EOS) — Gate G7 measure

EOS exists to make Agent output stable, controllable, and measurable. This quantifies it.

1. Ensure `docs/prd.md` (ACs) and `docs/trace-matrix.md` (AC ↔ test/eval) exist (produced by G3/G7).
2. Run the metric:
   ```sh
   node .github/hooks/spec-align.mjs          # advisory
   node .github/hooks/spec-align.mjs --strict # gate: exit 1 on any gap
   ```
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

> **Next:** clean at G7 → proceed to `/release-gate` (G8); run this with `--strict` there as the
> zero-drift release check.
