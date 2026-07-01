---
name: 'Data & API'
description: 'Database modeling, migrations, and API contract conventions'
applyTo: "**/*.{sql,prisma}"
---
# Data & API Rules — PostgreSQL + OpenAPI/REST

> Scope note: this file targets DB artifacts (.sql/.prisma). The OpenAPI contract
> under api/ is governed by review + the release gate; if you want auto-rules on
> api/**, add a sibling file api-contract.instructions.md with applyTo: "api/**".

## Data Modeling
- snake_case tables/columns. Surrogate `id` PK + natural unique constraints.
- Every table: created_at, updated_at. Soft-delete via deleted_at where audit needed.
- Index foreign keys and frequent query predicates. Justify each index.

## Migrations
- Every migration must be reversible (up/down). No destructive change without a rollback path.
- Backfill large changes in batches; never lock critical tables at peak.

## Data lifecycle & compliance
- Define retention per data class (how long, then archive or purge). Don't keep PII "forever" by default.
- Support subject deletion / export where PII is stored (GDPR/CCPA-style "right to erasure/access").
- Archive cold data instead of unbounded growth; document the archival + restore path.
- Backups: state cadence + restore test; encrypt backups; backups inherit the same PII rules.
- Every deletion of user data is audited (who/when/what), without logging the data itself.

## API Contract (contract-first)
- Define `api/openapi.yaml` BEFORE implementation. Version with `/v1` path prefix.
- Breaking changes require a new version; deprecate, don't mutate.
- Standard error envelope: { code, message, details, traceId }.

## Tooling (local)
- Lint OpenAPI: `spectral lint api/openapi.yaml` (optional install: `npm i -D @stoplight/spectral-cli`). Migrations: Prisma Migrate / Alembic.
