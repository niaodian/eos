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
- Memory layering (do not conflate with SaaS persistence): keep three kinds distinct —
  **short-term** (the context window / conversation scratch — ephemeral, rebuildable),
  **long-term** (a vector store / retrieved knowledge — eventually-consistent, approximate recall),
  and **strong-consistency** business state (that still belongs in SQL, not in a vector DB).
  Never treat a vector store as a source of truth for transactional data.
- Memory & self-improvement (be explicit, not magical): decide the scope of any persistent memory
  (session-only vs cross-session vs per-user), where it lives, its TTL/eviction, and PII rules —
  never silently accumulate user data. "Self-improvement" here means a bounded data flywheel:
  telemetry + user feedback → new eval cases → re-baseline (G-EVAL); model/prompt changes are
  reviewed and versioned (ADR + prompt file), never auto-applied without passing the eval gate.

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
  Runnable starter: `docs/eos/examples/compliance-starter/redaction.mjs` (`assertClean()` before any provider call) — skill `eos-compliance-skeletons`.
- Moderate/validate outputs before acting on them (especially tool calls, code exec, SQL, shell).
- Ground answers in retrieved context; require citations where factual accuracy matters.

## Fault tolerance (cognitive — distinct from deterministic retry)
- Two failure classes, two mechanisms — never mix them:
  - **Transport/provider errors** (timeout, 429, 5xx): deterministic retry with exponential backoff +
    jitter + a per-call timeout and a circuit breaker, exactly like any network call. This does NOT
    involve the model "thinking".
  - **Cognitive failures** (hallucination, invalid tool args, schema-invalid output, failed grader):
    a bounded **reflection** loop — capture the concrete error, inject it back into the prompt as
    feedback, let the model correct, retry ≤ N times (small, e.g. 1–2), then **degrade** (fallback
    answer / human handoff). Never loop unbounded; never "reflect" on a plain network timeout, and
    never exponential-backoff-spam a model to fix a logic error (it burns tokens and rarely converges).
- Validate tool output against its schema; a schema failure feeds the reflection loop, not a raw retry.

## Execution model (don't block the request thread)
- Any LLM/agent/tool call that can exceed ~1s must run OFF the web request path: enqueue to an async
  worker/queue (e.g. Celery, BullMQ, a task runner) and return a job id; stream/poll results. A
  high-concurrency web framework calling a synchronous multi-second LLM inline will exhaust the pool.
- Bound concurrency to the provider's rate limits; apply the circuit breaker at the queue/worker layer.

## Observability & cost
- Trace every chain/agent run (spans for each model/tool call). Log prompt id + version, model,
  tokens in/out, cost, latency, and outcome. Capture user feedback → eval/data flywheel.
- Enforce token/cost budgets and per-call timeouts; add retry/fallback for provider errors (transport
  class above). Emit spans in OpenTelemetry format so agent traces sit alongside service traces
  (LangSmith/Phoenix/Langfuse can consume OTel); watch tokens, context-window occupancy, tool-use chains.

## Tooling (local)
- Evals run locally (no cloud eval backend required): `pytest` over an eval dataset with graders,
  or a small eval runner script. Wire the eval command into `docs/eval-plan.md`.
- Node's test runner needs an explicit file/glob, not a bare dir (`node --test evals/*.test.mjs`,
  not `node --test evals/`). A minimal runnable harness to copy: `docs/eos/examples/eval-starter/`.
