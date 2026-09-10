---
name: eos-operational-readiness
description: Use during requirement/architecture stages to force operational pre-flight decisions (telemetry, authz, audit, rollback, canary, quota, i18n, multi-tenancy, capacity, DR). Ensures 1-N concerns are decided early, not after launch.
---

# Operational Readiness

**Goal:** Prevent post-launch rework by forcing explicit decisions on operational and
non-functional concerns during the requirement and architecture stages.

## When to use
- During `/requirements` (Stage 2) and architecture (Stage 4).
- Whenever a feature spec lacks telemetry, authz, or rollback considerations.

## Procedure
For each concern below, require one explicit decision: **ADOPT** (write requirement),
**SKIP** (write reason), or **DEFER** (write trigger condition). No blanks allowed.

| Concern | Requirement-stage output | Architecture landing point |
|---|---|---|
| telemetry | key events ↔ success metric | event schema, ingestion path |
| authz | role × resource × action matrix | auth middleware / policy points |
| audit | operations to audit | append-only/audit store |
| rollback | rollback method per risky change | reversible migrations / flags |
| canary | rollout dimension (user/region/%) | feature flags / traffic split |
| rate-limit/quota | limits & abuse thresholds | limiter / quota metering |
| i18n/l10n | target locales | externalized strings / locale routing |
| multi-tenancy | isolation level (row/db/instance) | tenant context propagation |
| capacity/SLO | latency/throughput targets | capacity model, caching/sharding |
| DR | RTO/RPO targets | backup / failover |
| data lifecycle | retention/archive/deletion per data class; GDPR erasure/export | retention jobs, archival store, soft/hard-delete + audit |
| regulatory compliance (if regulated) | named regime + per-control decision — walk `docs/checklists/F-compliance.md` | data residency, audit retention, consent/DSAR, vendor BAA/DPA, redaction gateway for the AI path |
| high availability | redundancy / failover target (if the SLO needs it) | multi-instance, health checks, no single point of failure |
| LLM/agentic (if applicable) | eval set + cost/token budget + safety (injection/PII) | model pinning, eval harness, tracing, output moderation |

## Output
A decision table embedded at the top of `docs/requirements.md`, plus NFR entries in
`docs/checklists/C-nfr.md`.

> Reuse note: this composes with `bmad-prd` and `bmad-architecture`; it does not
> replace them — it adds the operational pre-flight gate they lack.
