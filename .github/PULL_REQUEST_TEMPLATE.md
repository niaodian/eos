<!-- One story / one concern per PR (see CONTRIBUTING.md). Keep it small and reviewable. -->

## Summary
<!-- What changes and why. Link the spec/decision this implements. -->

Closes #

## Type of change
- [ ] Fix (hook / validator / prompt / agent / rule / doc bug)
- [ ] Feature (new rule, prompt, agent, gate, or capability)
- [ ] Docs only
- [ ] Chore / tooling / CI

## Spec alignment
<!-- EOS is spec-driven: discovery → requirements → PRD → UX → architecture → stories → code.
     Link the doc/gate this change implements, or note "N/A — tooling/docs". -->
- Source spec / decision:

## Verification gates
<!-- Run locally before requesting review. Tick what applies; paste failures in the summary. -->
- [ ] `node .github/hooks/validate-config.mjs` passes
- [ ] `node .github/hooks/eos-doctor.mjs` reviewed (advisory)
- [ ] `git add -A && node .github/hooks/secret-scan.mjs` clean (no secrets/PII)
- [ ] `node --test .github/hooks/deny-dangerous.test.mjs` passes
- [ ] `node docs/eos/tools/check-anchors.mjs docs/eos/user-manual.md` (only if the manual changed)

## Operational awareness
<!-- Required for user-facing behavior (per .github/copilot-instructions.md). -->
- [ ] Telemetry considered — or N/A because:
- [ ] Authz considered — or N/A because:
- [ ] Rollback considered — or N/A because:

## Checklist
- [ ] Conventional Commit message; branch named `feat/<story-id>-slug` (or `fix/…`, `docs/…`)
- [ ] Docs updated (English is canonical; `docs/zh/` is a non-maintained archive)
- [ ] No native rule-priority claims; no hardcoded secrets; no PII in code/logs/fixtures
- [ ] Commit includes the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` (if Copilot-assisted)
