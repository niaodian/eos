---
name: 'Backend (Rust)'
description: 'Rust service conventions (optional reference stack)'
applyTo: "**/*.rs"
---
# Backend Rules — Rust (optional reference stack)

> Scope note: matches .rs. Mutually exclusive with the .ts / .py / .go / .java / .cs backend rules.

## Layering
- handler/route → service → repository. Keep business logic out of framework handlers.
- Prefer composition over deep trait hierarchies; inject dependencies via generics or trait objects.

## Validation & Errors
- Validate input at the boundary; reject invalid early.
- Propagate with `Result<T, E>` + `?`. Domain errors via `thiserror`; app boundaries may use `anyhow`.
- No `unwrap()`/`expect()` on fallible runtime paths; map errors to HTTP status in one place.

## Concurrency & Safety
- `async`/`.await` for I/O-bound paths (tokio). Pass cancellation via task scoping.
- No `unsafe` without a documented invariant and a focused review.

## Logging & Observability
- Structured logs via `tracing` (JSON subscriber) with request id. No PII. Metrics at boundaries.

## AuthZ
- Enforce authorization in the service layer; deny by default.

## Tooling (local)
- Format: `cargo fmt`. Lint: `cargo clippy -- -D warnings`. Test: `cargo test`. Typecheck: `cargo check`.
- `cargo clippy -- -D warnings && cargo test`
