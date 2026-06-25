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

## Logging & Observability
- Structured JSON logs with request id. No PII in logs.
- Emit metrics/traces at service boundaries.

## AuthZ
- Enforce authorization in the service layer; deny by default.

## Tooling (local)
- Format: Prettier. Lint: ESLint + @typescript-eslint. Test: Vitest + Supertest.
- `npm run lint && npm run typecheck && npm test`
