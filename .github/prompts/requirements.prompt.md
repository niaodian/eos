---
name: requirements
description: Requirement analysis with operational pre-flight (reuses bmad-agent-pm / bmad-prd)
argument-hint: <feature name, or path to docs/discovery.md>
agent: agent
tools: ['search', 'editFiles']
---
# Requirement Analysis (EOS)

Input: read `docs/discovery.md`. If missing, first invoke skill `bmad-agent-analyst`
(or `bmad-brainstorming`) to produce it.

## Step 1 — Functional requirements
Draft functional requirements using skill `bmad-agent-pm` (talk to John), or `bmad-prd` for a
document-first pass. Give each one a stable `FR<n>` id — the PRD gate later checks that every one of
them carries at least one acceptance criterion.

## Step 2 — Operational & non-functional pre-flight (EOS reinforcement; no blanks)
For EACH item, record one of:

- `ADOPT` + what will be built,
- `SKIP` + **why this product genuinely does not need it** (a bare "SKIP" is an omission, not a decision),
- `DEFER` + **owner** + **trigger** (the condition that ends the deferral).

Items: telemetry, authz, audit, rollback/flag, monitoring/alerting, canary, rate-limit/quota,
i18n/l10n, multi-tenancy, capacity/SLO, DR (RTO/RPO) — plus `compliance` when a regime applies.

## Step 3 — Write BOTH outputs (Gate G2 reads the second one)

| File | Audience |
|---|---|
| `docs/requirements.md` | people: the narrative, the trade-offs, the landing points |
| `docs/requirements.json` | the machine: schema `.eos/schemas/requirements.schema.json` |

The gate reads the JSON, because prose is exactly what a gate must not be able to be talked past.
Every NFR needs a `target` — an unquantified NFR cannot be verified at G8. Check with:

```sh
node .github/eos/eos.mjs check --gate requirements-ready
```

## Step 2.5 — Regulatory regime pre-flight (constrain EARLY, avoid a rewrite)
Decide the regime(s) NOW, not after launch. Run the dedicated **`/compliance`** workflow (or inline it here):
tick what applies in `docs/checklists/F-compliance.md` Step 0 (none / HIPAA / PCI-DSS / SOC2 / SOX /
GDPR / CCPA / PIPL / other) and record it in `docs/compliance-profile.md` + one line in `docs/requirements.md`.
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
