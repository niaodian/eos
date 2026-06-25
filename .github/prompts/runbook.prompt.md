---
name: runbook
description: Generate an operational runbook with rollback steps
argument-hint: <service name>
agent: agent
tools: ['editFiles']
---
# Runbook (EOS)

Create `ops/runbook-<service>.md` with:
- Overview & ownership / escalation path
- Health checks & key dashboards
- Common incidents → diagnosis → mitigation
- Rollback procedure (exact, executable steps)
- Feature-flag toggles relevant to this service
