---
name: 'Backend (Java/Spring Boot)'
description: 'Java + Spring Boot service conventions (optional reference stack)'
applyTo: "**/*.java"
---
# Backend Rules — Java + Spring Boot (optional reference stack)

> Scope note: matches .java. Mutually exclusive with the .ts / .py / .go backend rules.

## Layering
- Controller → Service → Repository. Constructor injection only; no field injection.
- DTOs at the boundary; never expose JPA entities directly in the API.

## Validation & Errors
- Bean Validation (`@Valid` + constraints) at controllers.
- Centralize handling in `@RestControllerAdvice` → consistent error envelope. Never leak stack traces.
- Time in UTC (`Instant`/`OffsetDateTime`); money as `BigDecimal` or minor units + ISO currency (never float/double).

## Transactions & Persistence
- `@Transactional` at the service layer, not repositories. Mark read-only where applicable.
- Explicit fetch strategy; avoid N+1 (fetch joins / entity graphs).

## Logging & Observability
- SLF4J + JSON encoder, MDC request id. No PII. Micrometer metrics at boundaries.

## AuthZ
- Method/endpoint security; deny by default. Authorize in the service layer.

## Tooling (local)
- Format/lint: Spotless + Checkstyle. Test: JUnit 5 + Spring Boot Test.
- Maven: `mvn -q spotless:check && mvn -q test` · Gradle: `./gradlew spotlessCheck test`
