---
name: 'Release & Ops'
description: 'Release gating and operational conventions'
applyTo: "**/{Dockerfile,*.yml,*.yaml}"
---
# Release & Ops Rules

- The deployment topology is an architecture-phase (G4) decision — see `docs/checklists/G-deployment.md`
  + its `docs/adr/*-deployment-topology.md`. These manifests (Dockerfile / compose / k8s yaml /
  serverless) must honor the chosen topology's rollback/canary/health contract. Pick the simplest
  topology that meets the NFRs; never default to Kubernetes.
- Builds must be reproducible & pinned (lockfiles committed).
- No release without: passing quality gate, rollback plan, canary strategy.
- Every service exposes health/readiness endpoints.
- Document operational steps in `ops/runbook-<service>.md`.
