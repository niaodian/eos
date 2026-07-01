---
name: 'Backend (Go)'
description: 'Go service conventions (optional reference stack)'
applyTo: "**/*.go"
---
# Backend Rules — Go (optional reference stack)

> Scope note: matches .go. Mutually exclusive with the .ts / .py / .java backend rules.

## Layering
- handler → service → repository. Keep business logic out of HTTP handlers.
- Accept interfaces, return structs. Inject dependencies; no global mutable state.

## Validation & Errors
- Validate input at the boundary; reject invalid early.
- Wrap errors with `fmt.Errorf("...: %w", err)`; never discard with `_`.
- Map errors to HTTP status in one place. Never leak internals to clients.

## Concurrency
- Pass `context.Context` as the first arg on all I/O paths; honor cancellation.
- Protect shared state with sync primitives or channels; test with `-race`.

## Logging & Observability
- Structured logs via `log/slog` (JSON) with request id. No PII. Emit metrics at boundaries.

## AuthZ
- Enforce authorization in the service layer; deny by default.

## Tooling (local)
- Format: `gofmt`/`goimports`. Lint: `golangci-lint` (optional install: `brew install golangci-lint`; `go vet` is built-in). Test: `go test ./... -race -cover`.
- `golangci-lint run && go vet ./... && go test ./...`
