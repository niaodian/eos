---
name: 'Testing'
description: 'Test conventions and spec-to-test traceability'
applyTo: "**/*.{test,spec}.*"
---
# Testing Rules

- Pyramid: many unit, fewer integration, few E2E. No network in unit tests.
- Each PRD acceptance criterion maps to >=1 test (traceability). Name: `describe(<criterion id>)`.
- No flaky patterns: no real timers (use fakes), no order-dependent tests.
- Coverage gate: changed lines >= 80% (enforced locally; see hooks/quality.json).
- For test design/automation, invoke `bmad-testarch-test-design` / `bmad-testarch-automate`.
- Verify NFR targets from `docs/checklists/C-nfr.md` (latency/throughput, SLO/RTO/RPO, etc.)
  with `bmad-testarch-nfr`; each adopted NFR needs a check or an explicitly-deferred trigger.
