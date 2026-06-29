---
name: 'Backend (.NET/C#)'
description: '.NET + ASP.NET Core service conventions (optional reference stack)'
applyTo: "**/*.cs"
---
# Backend Rules — .NET + ASP.NET Core (optional reference stack)

> Scope note: matches .cs. Mutually exclusive with the .ts / .py / .go / .java / .rs backend rules.

## Layering
- Controller (or Minimal API) → Service → Repository. Constructor injection via the built-in DI container.
- DTOs at the boundary; never expose EF Core entities directly in the API.

## Validation & Errors
- Validate input at the boundary (DataAnnotations / FluentValidation). Reject invalid early.
- Centralize handling with exception-handler middleware / `IExceptionHandler` → consistent ProblemDetails.
- Never leak stack traces to clients.

## Async & Persistence
- `async`/`await` end-to-end on I/O paths; pass `CancellationToken`. Avoid `.Result`/`.Wait()` (deadlocks).
- `await using` for `IAsyncDisposable`. Explicit EF Core loading; avoid N+1.

## Logging & Observability
- `ILogger<T>` structured logging with scopes (request id). No PII. Metrics/traces at boundaries.

## AuthZ
- Authorization policies; deny by default. Authorize in the service layer, not just attributes.

## Tooling (local)
- Format: `dotnet format`. Test: xUnit/NUnit via `dotnet test`. Build: `dotnet build`.
- `dotnet format --verify-no-changes && dotnet test`
