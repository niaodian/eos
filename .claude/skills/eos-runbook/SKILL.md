---
name: eos-runbook
description: Write an operational runbook with exact rollback steps, gradual rollout and health/readiness checks. Use before a release, or when the release gate reports the runbook incomplete.
---
# Runbook (EOS)

Usage: `/eos-runbook <service name>`

Write `ops/runbook.md` — the file the release gate (G8) reads (`docs/runbook.md` also counts) — with
one section per service when there are several, each covering:
- Overview & ownership / escalation path
- Health checks (health / readiness endpoints) & key dashboards
- Common incidents → diagnosis → mitigation
- Rollback procedure (exact, executable steps)
- Gradual rollout (canary, percentage or blue-green) — how the change reaches users incrementally
- Feature-flag toggles relevant to this service

> **Next:** return to `/eos-release-gate` (G8) — this runbook satisfies its rollback/canary line items.
