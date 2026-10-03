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
- `llm-agent.mjs` + `prompt.md` + `model.mjs` — the **same agent backed by a real model**
  (any OpenAI-compatible endpoint, Node's built-in `fetch`, no dependency), with record / replay.
  See *Connect a real model* below.
- `cassettes/llm-agent.json` — a recording the LLM agent replays without a key. The shipped one is
  **hand-written to show the format**; record your own.
- `python/` — the same harness for Python stacks (stdlib only): `run_eval.py`, `agent.py`,
  `graders.py`, `test_eval.py` for `pytest`, and `model.py` + `llm_agent.py` for the real-model path.

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

## Connect a real model

`decide(req)` keeps one contract — `{ state, toolsCalled, mutated, trace:{ tokens, latencyMs } }` — so
switching from the stub to a model changes nothing the graders, the dataset or the thresholds see:

```sh
EVAL_AGENT=llm node --test evals/eval.test.mjs          # Python: EVAL_AGENT=llm pytest evals/ -q
```

`model.mjs` (`python/model.py`) talks to any **OpenAI-compatible** chat-completions endpoint —
OpenAI, Azure OpenAI's v1 surface, OpenRouter, DeepSeek, DashScope compatible mode, or a local
Ollama / vLLM / LM Studio — and nothing else depends on the vendor. `EVAL_MODE` decides where the
answers come from:

| `EVAL_MODE` | Calls the provider | Notes |
|---|---|---|
| `auto` (default) | with a key: yes · without: no | live when the key is set, replay otherwise |
| `live` | yes | needs `EVAL_MODEL` and the key |
| `record` | yes | also writes `cassettes/llm-agent.json` — commit it |
| `replay` | no | answers from the cassette; a request it has not seen **fails** |

Configuration is environment only: `EVAL_MODEL` (the model or deployment name — it is recorded in the
summary), `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), and the key in `OPENAI_API_KEY` —
a repository **secret** in CI, never a file. The key goes only into the `Authorization` header: it is
never logged and never written to a cassette.

**Replay is honest about what it proves.** It re-grades recorded answers, not today's model: the
summary records `"mode": "replay"` and the cassette version, and its producer is **local even in CI**,
so it reads `UNATTESTED_LOCAL` — a release whose `evidencePolicy` requires CI evidence cannot rest on
it. Record in CI with the secret when that matters. Changing the prompt, the model or the parameters
makes replay fail until you record again — by design, the same way the product tree makes the summary
stale. A cassette stores prompts and answers: record with the dataset, **never with production data**.

The model's output is untrusted: `llm-agent.mjs` parses and validates it, and anything outside the
allowed shape is graded as a failure (`invalid-output`), never passed through. The Node and Python
twins compute the same request key, so one recording replays in both.

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
