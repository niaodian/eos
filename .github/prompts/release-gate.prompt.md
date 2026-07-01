---
name: release-gate
description: Run the EOS release gate (quality + security + rollback + canary + NFR)
agent: agent
tools: ['search', 'runCommands']
---
# Release Gate (EOS) — Gate G8

Verify and report PASS/FAIL for each:
- [ ] Quality gate green (lint + typecheck + tests). Run locally.
- [ ] Dependency audit clean (`npm audit` / `pip-audit`).
- [ ] NFR targets from `docs/checklists/C-nfr.md` verified (perf P95/throughput,
      availability SLO/RTO/RPO) — via `bmad-testarch-nfr` at G7; any deferral carries an
      explicit trigger, never silent.
- [ ] Rollback plan exists and is executable (link `ops/runbook-*.md`).
- [ ] Canary/gradual rollout strategy documented.
- [ ] Health/readiness endpoints present.
- [ ] Config validation passes: `node .github/hooks/validate-config.mjs`.

Any FAIL blocks release. Summarize as a gate report.
