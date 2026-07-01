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

## Logging & Observability
- structlog / std logging in JSON. Correlation-id middleware. No PII in logs.

## AuthZ
- Dependency-injected auth guards on every state-changing route; deny by default.

## Tooling (local)
- Format: `ruff format`. Lint: `ruff`. Types: `mypy --strict`. Test: `pytest` + `httpx`.
- `ruff check . && mypy . && pytest`
