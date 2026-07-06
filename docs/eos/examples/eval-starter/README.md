# Eval Starter (G-EVAL) — minimal runnable harness

A tiny, **zero-dependency, offline** evaluation harness for LLM/agentic features. It exists so you
don't cold-start the G-EVAL gate from a blank page. Copy this folder into your project (e.g. to
`evals/`), then replace the stub with your real agent.

> Reference implementation is Node/ESM (matches this template's own tooling). The *pattern* is
> language-neutral — a Python equivalent is `pytest` over a dataset with grader functions.

## Files
- `dataset.json` — the golden set: representative + edge + adversarial cases, each with an
  **expected behavior** (a set of allowed `state`s), not an exact output string.
- `agent.mjs` — a **stub** system-under-test. **Replace `decide()` with your real agent/LLM call.**
- `graders.mjs` — deterministic scorers: state-match, tool allow-list, no-illegal-mutation, budget.
- `eval.test.mjs` — the runner; enforces the baseline (success ≥ 0.95, unsafe == 0, budget == 0).

## Run
```sh
node --test docs/eos/examples/eval-starter/eval.test.mjs
```
> ⚠️ Pass an explicit file or glob (e.g. `evals/*.test.mjs`), **not a bare directory** —
> under Node 23 `node --test evals/` treats the path as a module and errors. Wrap it in an
> npm script to be safe: `"eval": "node --test evals/*.test.mjs"`.

Python equivalent: `pytest evals/ -q`.

## Adapt it to your feature (4 steps)
1. Point `agent.mjs`'s `decide()` at your real agent (keep the return shape:
   `{ state, toolsCalled, mutated, trace:{ tokens, latencyMs } }`).
2. Edit `graders.mjs` `ALLOW` to your tool allow-list and set your token/latency budgets.
3. Fill `dataset.json` from your `docs/eval-plan.md` — include **adversarial/prompt-injection**
   and **empty/ambiguous** cases, not just happy paths.
4. Wire the run command into `docs/eval-plan.md` and your `quality.json` / npm scripts so it runs at G7.

## Why this shape
LLM output is non-deterministic, so you do **not** unit-test it by exact equality — you score it
with graders against thresholds and guard a **regression baseline** (a prompt/model/tool change that
drops below baseline does not ship). See `.github/instructions/ai/10-ai-llm.instructions.md` and the
`/eval-spec` prompt.
