---
name: 'Backend (Node.js/TypeScript)'
description: 'Default backend reference stack conventions'
applyTo: "**/*.ts"
---
# Backend Rules — Node.js + TypeScript (default reference stack)

> Scope note: matches .ts (not .tsx). If frontend also ships plain .ts,
> change applyTo to "apps/api/**/*.ts" to avoid overlap with frontend rules.

## Layering
- Routes → Controllers → Services → Repositories. No business logic in routes.
- Dependency injection for testability; no module-level singletons holding mutable state.

## Validation & Errors
- Validate all input at the boundary with zod. Reject invalid early.
- Typed error hierarchy; map to HTTP status in one place. Never leak stack traces to clients.
- Time in UTC across the wire/DB (convert at edges); money as integer minor units or a decimal type + ISO currency (never float).

## Resilience & state (deterministic — not the AI reflection model)
- External calls (DB, cache, HTTP, queue): explicit timeout + retry with exponential backoff & jitter,
  wrapped in a circuit breaker. Idempotent retries only (use idempotency keys for mutations).
- Transactions for multi-step writes; keep them short. Define the consistency boundary explicitly
  (what must be atomic). No cross-service distributed transaction — use outbox/saga if needed.
- This deterministic mechanism is for transport/infra faults; it is NOT the cognitive retry used for
  LLM failures (see `ai/10-ai-llm`). Don't apply one to the other's failure class.

## Logging & Observability
- Structured JSON logs with request id. No PII in logs.
- Instrument with OpenTelemetry (vendor-neutral): traces + RED/golden signals (request rate, error
  rate, duration) at service boundaries; export QPS / 5xx / p95-p99 latency.

## AuthZ
- Enforce authorization in the service layer; deny by default.

## Tooling (local)
- Format: Prettier. Lint: ESLint + @typescript-eslint. Test: Vitest + Supertest.
- `npm run lint && npm run typecheck && npm test`
