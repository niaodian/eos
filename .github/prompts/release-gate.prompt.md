---
name: release-gate
description: Run the EOS release gate (quality + security + rollback + canary + NFR)
agent: agent
tools: ['search', 'runCommands']
---
# Release Gate (EOS) — Gate G8

Verify and report PASS/FAIL for each:
- [ ] Quality gate green (lint + typecheck + tests). Run locally.
- [ ] No leaked secrets: `node .github/hooks/secret-scan.mjs` PASS (no hardcoded creds/keys/`.env`).
- [ ] Supply chain: lockfile committed, versions pinned, deps vetted (no typosquat / remote-script-to-shell).
- [ ] Dependency audit clean (`npm audit` / `pip-audit`). Needs a lockfile: if missing, run
      `npm i --package-lock-only` first. Offline: `npm audit` returns clean for zero-dep projects;
      with deps it needs the registry, so treat a network failure as "deferred, re-run when online"
      (not a hard block on a local-only machine).
- [ ] NFR targets from `docs/checklists/C-nfr.md` verified (perf P95/throughput,
      availability SLO/RTO/RPO) — via `bmad-testarch-nfr` at G7; any deferral carries an
      explicit trigger, never silent.
- [ ] Regulatory controls verified: if a regime was selected (see `docs/compliance-profile.md`),
      every item in `docs/checklists/F-compliance.md` is ADOPT / N/A+reason (no unresolved BLOCKER).
      For regulated + LLM/agent: the data-boundary (BAA/DPA · self-host · redaction) is **implemented,
      not deferred**. If regime = none, state so.
- [ ] Rollback plan exists and is executable (link `ops/runbook-*.md`).
- [ ] Canary/gradual rollout strategy documented.
- [ ] Health/readiness endpoints present.
- [ ] Config validation passes: `node .github/hooks/validate-config.mjs`.
- [ ] SDLC gate wiring passes: `node .github/hooks/eos-doctor.mjs` (G-EVAL: LLM code ⇒ eval-plan).
- [ ] Local CI green: `act push -j verify` (validate-config + eos-doctor + tests + evals). Needs Docker.

Any FAIL blocks release. Summarize as a gate report.
