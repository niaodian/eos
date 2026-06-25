---
name: 'Release & Ops'
description: 'Release gating and operational conventions'
applyTo: "**/{Dockerfile,*.yml,*.yaml}"
---
# Release & Ops Rules

- Builds must be reproducible & pinned (lockfiles committed).
- No release without: passing quality gate, rollback plan, canary strategy.
- Every service exposes health/readiness endpoints.
- Document operational steps in `ops/runbook-<service>.md`.
