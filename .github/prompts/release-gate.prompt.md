---
name: release-gate
description: Run the EOS release gate (quality + security + rollback + canary + NFR)
agent: agent
tools: ['search', 'runCommands']
---
# Release Gate (EOS) — Gate G8

Verify and report PASS/FAIL for each:
- [ ] Quality gate green (lint + typecheck + tests). Run locally.
- [ ] Spec alignment (no drift): `node .github/hooks/spec-align.mjs --strict` PASS — every PRD
      acceptance criterion has a passing trace-matrix row. This is where the "never implement beyond
      the approved spec" red line is ENFORCED (every-push CI runs it advisory; release runs it strict).
      N/A only if the project tracks specs outside docs/prd.md + docs/trace-matrix.md (state so).
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
- [ ] Deployment topology matches the Phase-4 decision: the rollback / canary / health mechanisms
      above are the ones the chosen topology actually uses (see `docs/checklists/G-deployment.md`
      + `docs/adr/*-deployment-topology.md`). Its real cluster/registry/cloud stays `【需企业环境】`.
- [ ] **Enforcement authority active** (this is what turns the CI gates from advisory into merge-blocking):
      server-side branch protection on the default branch requires the `verify` check + Code Owner review,
      and `docs/eos/activation.md` has no unresolved item (each is `[x]` done or `[~]` waived-with-reason).
      Run `node .github/hooks/eos-doctor.mjs` and read its `ACTIVATION` line. If this is a personal-namespace
      / throwaway repo, mark N/A + reason. `【需组织/GitHub 设置】`
- [ ] Config validation passes: `node .github/hooks/validate-config.mjs`.
- [ ] SDLC gate wiring passes: `node .github/hooks/eos-doctor.mjs` (G-EVAL: LLM code ⇒ eval-plan).
- [ ] Local CI green: `act push -j verify` (validate-config + eos-doctor + tests + evals). Needs Docker.

Any FAIL blocks release. Summarize as a gate report.

> **Next (after G8):** run `/telemetry-plan` to land observability and close the ops loop (Gate G9).
