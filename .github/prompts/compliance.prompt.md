---
name: compliance
description: Assess regulatory regime + set boundary controls early (healthcare/finance/privacy)
argument-hint: <regime e.g. HIPAA|PCI-DSS|GDPR, or a feature/domain description>
agent: agent
tools: ['search', 'editFiles']
---
# Regulatory Compliance Pre-Flight (EOS) — Gate G2 boundary controls

> **Not legal advice.** EOS is an engineering scaffold, not a compliance certification; it cannot
> replace a compliance officer / legal counsel / auditor. Every ADOPT below is an engineering
> commitment that still needs human sign-off. Run this **early** (Discovery/Requirements) so
> regulated constraints shape the architecture instead of forcing a rewrite later. `【新建补强】`

Input: `docs/discovery.md` / `docs/requirements.md` if present, plus the `$ARGUMENTS` hint.
Reference: walk `docs/checklists/F-compliance.md`. For HIPAA or PCI-DSS, use the detailed
control→landing-point appendices `docs/checklists/F-compliance-hipaa.md` /
`docs/checklists/F-compliance-pci-dss.md`; for GDPR/CCPA/PIPL privacy, use
`docs/checklists/F-compliance-gdpr-pipl.md`. Reuse `bmad-testarch-nfr` for NFR landing and
skill `eos-operational-readiness` for the operational overlap.

## Step 1 — Regime selection (F-compliance Step 0)
Determine which named regime(s) apply and WHY (data types, users, geography, industry):
`none` / HIPAA / PCI-DSS / SOC 2 / SOX / GDPR / CCPA-CPRA / PIPL / other.

Record the decision on the **first content line** of `docs/compliance-profile.md` as a canonical,
machine-readable line — the compliance-starter redactors parse it, so keep the exact shape
(comma/`/`-separated regime names, or `none`; rationale goes on the following lines):

```
**Regulatory regime:** HIPAA, PCI-DSS
```

- If **none applies**: the line is `**Regulatory regime:** none` (generic PII handling per the
  security rule + `E-security.md`); record the rationale below it and STOP.
- If **any regime applies**: continue, and keep that line updated with every regime you adopt.

## Step 2 — Walk the controls (decision per item, no blanks)
For the cross-cutting controls AND each selected regime's pack in `F-compliance.md`, emit one of
**ADOPT** (write the requirement) / **N/A + reason** / **DEFER + trigger** — each with an
**architecture landing point** (where it lands in code/infra). Cover at minimum:
- data classification (PHI/PAN/sensitive-personal), residency/localization, audit trail + retention period,
  least-privilege / minimum-necessary access, encryption + key management, data lifecycle (erasure/export),
  vendor/subprocessor **BAA/DPA**, non-production data (synthetic/de-identified), incident/breach path.

## Step 3 — Agentic data-boundary (if LLM/agent code AND regulated data)
This is the #1 late-stage rework landmine: sending PHI/PAN/regulated personal data to a third-party
model is often prohibited or needs a signed BAA/DPA. Choose and record ONE (not "decide later"):
**(a)** BAA/DPA signed with the provider, **(b)** self-hosted / on-prem model, **(c)** redaction /
tokenization gateway before any provider call, or **(d)** exclude regulated data from the AI path.
Land the choice in an ADR (`/adr`) and `docs/architecture.md` so `eos-doctor` D5 can see it.
> **Building the 🟡 items?** Skill `eos-compliance-skeletons` points at runnable, zero-dep starters
> in `docs/eos/examples/compliance-starter/` (redaction/consent/DSAR/audit — a port per default
> reference stack: Node/ESM · Python · Go · Java). Option **(c)** = the `redaction` `assertClean()`
> boundary guard, and `redactorFromProfile('docs/compliance-profile.md')` auto-scopes the redactor
> to the **Regulatory regime:** line this workflow writes (Step 1) — no hardcoded regime list.

## Step 4 — Wire into gates
- **G2 (requirements):** any unresolved regulated item = **BLOCKER**; do not proceed to Spec.
- Feed NFR-shaped items (encryption/audit-retention/residency) into `docs/checklists/C-nfr.md`.
- **G8 (release):** re-verify via `/release-gate`; the data-boundary must be **implemented, not deferred**.
- `node .github/hooks/eos-doctor.mjs` D5 flags regulated + LLM code with no boundary decision.

## Output
Write `docs/compliance-profile.md` — **first content line** is the canonical `**Regulatory regime:**`
line from Step 1 (the anchor the compliance-starter `redactorFromProfile()` reads), followed by the
rationale + control decision table + data-boundary choice — and add one summary line to `docs/requirements.md`.

> **Next:** unresolved BLOCKERs → resolve before `/spec` (G3). Irreversible boundary choice → `/adr`.
> Regulated + LLM/agent → confirm the data-boundary lands in `docs/architecture.md` (checked by eos-doctor D5).
