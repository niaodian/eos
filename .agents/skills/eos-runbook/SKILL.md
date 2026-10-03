---
name: eos-runbook
description: Write an operational runbook with exact rollback steps, gradual rollout and health/readiness checks. Use before a release, or when the release gate reports the runbook incomplete.
---
# Runbook (EOS)

Usage: `/eos-runbook <service name>`

Create `ops/runbook-<service>.md` with:
- Overview & ownership / escalation path
- Health checks & key dashboards
- Common incidents → diagnosis → mitigation
- Rollback procedure (exact, executable steps)
- Feature-flag toggles relevant to this service

> **Next:** return to `/eos-release-gate` (G8) — this runbook satisfies its rollback/canary line items.
