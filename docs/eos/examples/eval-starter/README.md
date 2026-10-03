# Eval Starter (G-EVAL) — minimal runnable harness

A tiny, **zero-dependency, offline** evaluation harness for LLM/agentic features. It exists so you
don't cold-start the G-EVAL gate from a blank page. Copy this folder into your project (e.g. to
`evals/`), then replace the stub with your real agent.

> Reference implementation is Node/ESM (matches this template's own tooling), with a stdlib-only
> Python twin in `python/`. The *pattern* is language-neutral: a dataset, deterministic graders,
> thresholds, and a machine summary bound to the product tree.

## Files
- `dataset.json` — the golden set: representative + edge + adversarial cases, each with an
  **expected behavior** (a set of allowed `state`s), not an exact output string.
- `agent.mjs` — a **stub** system-under-test. **Replace `decide()` with your real agent/LLM call.**
  This is *your product's* model call — EOS itself never calls a model and needs no API key.
- `graders.mjs` — deterministic scorers: state-match, tool allow-list, no-illegal-mutation, budget.
- `eval.test.mjs` — the runner; enforces the baseline (success ≥ 0.95, unsafe == 0, budget == 0)
  **and writes the machine summary the gate reads**.
- `summary.mjs` — writes `docs/evidence/eval-summary.json` (schema `.eos/schemas/eval-summary.schema.json`):
  which prompt, model, dataset and grader produced which number against which threshold, bound to
  the product tree via `eos product-tree --json`.
- `python/` — the same harness for Python stacks (stdlib only): `run_eval.py`, `agent.py`,
  `graders.py`, and `test_eval.py` for `pytest`.

## Run
```sh
# Node: copy this folder to evals/ in your project, then
node --test evals/eval.test.mjs          # or "eval": "node --test evals/*.test.mjs" in package.json
# Python: copy python/*.py and dataset.json to evals/, then
pytest evals/ -q                          # or: python evals/run_eval.py
```
Declare the same command as `commands.eval` in `.eos/project.json`: the `verified` gate runs it and
then reads `docs/evidence/eval-summary.json`. Exit code 0 alone is **not** a met threshold.

Run **in place** inside the EOS template (`node --test docs/eos/examples/eval-starter/eval.test.mjs`),
the starter is a demo: it grades and prints, but writes no summary.

> ⚠️ Pass an explicit file or glob (e.g. `evals/*.test.mjs`), **not a bare directory** —
> under Node 23 `node --test evals/` treats the path as a module and errors.

## The summary contract
The runner writes three cases. Their ids are what your stories cite in an AC's eval case
(`EVAL-1 …`); the gate requires **every** EVAL id a story declares, and recomputes each verdict from
`observed` and `threshold`:

| id | metric | threshold |
|---|---|---|
| `EVAL-1` | task success rate | `>= 0.95` |
| `EVAL-2` | unsafe outcomes | `<= 0` |
| `EVAL-3` | budget violations | `<= 0` |

Editing the prompt, the dataset or a grader changes the product tree, so the recorded result goes
`STALE` until the evals run again — by design.

## Adapt it to your feature (5 steps)
1. Point `decide()` at your real agent (keep the return shape:
   `{ state, toolsCalled, mutated, trace:{ tokens, latencyMs } }`).
2. In the runner's `writeSummary(...)` call, set `files.prompt` to your prompt file and `model`,
   `modelVersion`, `parameters` to what you actually call.
3. Edit `graders.mjs` `ALLOW` to your tool allow-list and set your token/latency budgets.
4. Fill `dataset.json` from your `docs/eval-plan.md` — include **adversarial/prompt-injection**
   and **empty/ambiguous** cases, not just happy paths.
5. Rename / add the `EVAL-n` cases to match the eval plan, and cite them in your stories.

## Why this shape
LLM output is non-deterministic, so you do **not** unit-test it by exact equality — you score it
with graders against thresholds and guard a **regression baseline** (a prompt/model/tool change that
drops below baseline does not ship). See `.github/instructions/ai/10-ai-llm.instructions.md` and the
`/eval-spec` prompt.
