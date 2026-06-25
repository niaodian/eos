---
name: requirements
description: Requirement analysis with operational pre-flight (reuses bmad-create-prd)
argument-hint: <feature name, or path to docs/discovery.md>
agent: agent
tools: ['search', 'editFiles']
---
# Requirement Analysis (EOS)

Input: read `docs/discovery.md`. If missing, first invoke skill `bmad-agent-analyst`
(or `bmad-brainstorming`) to produce it.

## Step 1 — Functional requirements
Draft functional requirements using skill `bmad-create-prd`.

## Step 2 — Operational & non-functional pre-flight (EOS reinforcement; no blanks)
For EACH item, output one of [ADOPT / SKIP+reason / DEFER+trigger] plus an architecture landing point:
telemetry, authz, audit, rollback/flag, monitoring/alerting, canary,
rate-limit/quota, i18n/l10n, multi-tenancy, capacity/SLO, DR (RTO/RPO).

## Step 3 — Gate G2: walk the four checklists
Check every item in docs/checklists/{A-gap,B-rework,C-nfr,D-ops}.md.
Any unresolved item => mark BLOCKER. Do not proceed to Spec until cleared.

## Output
Write `docs/requirements.md` with an "Operational Pre-Flight Decision Table" at the top.
