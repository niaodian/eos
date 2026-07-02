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

## Step 2.5 — Regulatory regime pre-flight (constrain EARLY, avoid a rewrite)
Decide the regime(s) NOW, not after launch. Tick what applies in `docs/checklists/F-compliance.md`
Step 0 (none / HIPAA / PCI-DSS / SOC2 / SOX / GDPR / CCPA / PIPL / other) and record it in
`docs/compliance-profile.md` + one line in `docs/requirements.md`.
- If a regulated regime applies: walk the matching pack(s) in `F-compliance.md`; each control is
  ADOPT / N/A+reason / DEFER+trigger with an architecture landing point. Unresolved = **BLOCKER**.
- **If this is an LLM/agent product AND regulated data is involved**: resolve the *Agentic data-boundary*
  (BAA/DPA · self-host · redaction gateway · exclude regulated data) here — deciding it late forces a
  model/architecture swap.
- If no regime applies: state "Regulatory regime: none" explicitly and continue.
> Not legal advice — this forces engineering decisions early; human compliance/legal sign-off still required.

## Step 3 — Gate G2: walk the checklists
Check every item in docs/checklists/{A-gap,B-rework,C-nfr,D-ops,E-security}.md, plus
docs/checklists/F-compliance.md **if any regulated regime was selected in Step 2.5**.
Any unresolved item => mark BLOCKER. Do not proceed to Spec until cleared.

## Output
Write `docs/requirements.md` with an "Operational Pre-Flight Decision Table" at the top.

> **Next (after G2 clears):** run `/spec` to turn this into the PRD (Gate G3).
