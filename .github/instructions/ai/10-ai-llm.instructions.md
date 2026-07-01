---
name: 'AI / LLM & Agentic'
description: 'Conventions for LLM/agent/RAG product code (prompts, tools, evals, safety)'
applyTo: "**/{ai,llm,rag}/**"
---
# AI / LLM & Agentic Rules

> Scope note: targets LLM/agent/RAG product code under `ai/`, `llm/`, or `rag/` dirs.
> This is ADDITIVE — a file at `src/llm/foo.py` also gets the Python backend rules.
> Adjust the glob to your layout (e.g. `**/agents/**`) if you organize differently.
> This governs the *product's* AI code — not EOS's own `.github/agents` or `.github/prompts`.

## Prompts are versioned artifacts
- Store prompts as files (not inline string literals). One prompt per file, with an id/version.
- Every prompt change goes through code review (G6) AND re-runs its eval set (G7).
- Externalize model params next to the prompt: model, temperature, top_p, max_tokens, stop.

## Agent & tool architecture
- Define tools with an explicit, typed schema (name, description, params, return). Validate tool
  I/O at the boundary just like any external input.
- Keep orchestration explicit (a graph/state machine), not implicit prompt chains. One responsibility
  per agent/node. Bound loops and recursion depth; never allow unbounded agent self-invocation.
- Manage context deliberately: cap context-window assembly, summarize/trim, and record what went
  into each call. Treat memory/state stores as first-class (define read/write/evict policy).

## Determinism & reproducibility
- Pin model version/provider explicitly; do not float on "latest". Record it with outputs.
- Default temperature=0 (or a fixed seed where supported) for testable paths. Any creative,
  higher-temperature path must be behind an eval with tolerance thresholds, not exact-match.

## Testing = evaluation (non-deterministic)
- LLM/agent outputs are NOT unit-tested by exact equality. Use an eval set + graders
  (rule-based, embedding-similarity, or LLM-as-judge) with pass thresholds. See `docs/eval-plan.md`.
- Keep a regression eval: no prompt/model/tool change ships if it regresses the baseline (G7).
- For RAG: measure retrieval quality (recall@k, context precision) and answer quality
  (faithfulness/groundedness, relevance) — not just end-to-end vibes.

## Safety (treat model output as untrusted)
- Defend against prompt injection: never let retrieved/user content silently become instructions;
  keep system/developer prompts separate from user data; constrain tool use with allow-lists.
- Never place secrets or PII in prompts or logs. Redact before sending to the provider.
- Moderate/validate outputs before acting on them (especially tool calls, code exec, SQL, shell).
- Ground answers in retrieved context; require citations where factual accuracy matters.

## Observability & cost
- Trace every chain/agent run (spans for each model/tool call). Log prompt id + version, model,
  tokens in/out, cost, latency, and outcome. Capture user feedback → eval/data flywheel.
- Enforce token/cost budgets and per-call timeouts; add retry/fallback for provider errors.

## Tooling (local)
- Evals run locally (no cloud eval backend required): `pytest` over an eval dataset with graders,
  or a small eval runner script. Wire the eval command into `docs/eval-plan.md`.
