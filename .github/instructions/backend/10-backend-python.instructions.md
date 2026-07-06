---
name: 'Backend (Python/FastAPI)'
description: 'Parallel backend reference stack conventions'
applyTo: "**/*.py"
---
# Backend Rules — Python + FastAPI (parallel reference stack)

## Architecture
- FastAPI routers → services → repositories. Pydantic models for all I/O.
- Async by default for I/O-bound paths. Type hints mandatory.

## Validation & Errors
- Pydantic v2 validation at boundaries. Custom exception handlers → consistent error envelope.
- Never return raw tracebacks to clients.
- Time in UTC (aware datetimes); money as integer minor units or `Decimal` + ISO currency (never float).

## Resilience & state (deterministic — not the AI reflection model)
- External calls (DB, cache, HTTP, queue): explicit timeout + retry with exponential backoff & jitter,
  wrapped in a circuit breaker. Idempotent retries only (idempotency keys for mutations).
- Transactions for multi-step writes; keep them short. Define the atomic consistency boundary. Prefer
  outbox/saga over distributed transactions. Long/blocking work (incl. LLM calls) goes to Celery/RQ, off the request path.
- This deterministic mechanism handles transport/infra faults; it is NOT the cognitive retry for LLM
  failures (see `ai/10-ai-llm`). Don't cross the two failure classes.

## Logging & Observability
- structlog / std logging in JSON. Correlation-id middleware. No PII in logs.
- Instrument with OpenTelemetry (vendor-neutral): traces + RED/golden signals (rate, errors, duration);
  export QPS / 5xx / p95-p99 latency.

## AuthZ
- Dependency-injected auth guards on every state-changing route; deny by default.

## Tooling (local)
- Format: `ruff format`. Lint: `ruff`. Types: `mypy --strict`. Test: `pytest` + `httpx`.
- `ruff check . && mypy . && pytest`
