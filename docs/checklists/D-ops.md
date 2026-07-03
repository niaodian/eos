# D. Operational Pre-Flight Checklist
> decision per item: adopt / do not adopt + reason / defer + trigger condition
- [ ] Key-event telemetry ↔ success metrics closed loop
- [ ] Permission matrix (role × resource × operation)
- [ ] Audit scope
- [ ] Rollback plan is executable
- [ ] Canary/gradual-rollout dimension + rollback threshold
- [ ] Quota/rate-limit thresholds
- [ ] Multi-tenant isolation level (if applicable)
- [ ] i18n/multi-region (if applicable)
- [ ] Capacity model + alert thresholds
- [ ] Data lifecycle (retention period/archive/delete; GDPR export and deletion for PII)
- [ ] High availability/disaster recovery (redundancy, failover, backup + restore drill; as required by SLO)
- [ ] Runbook owner/escalation path
