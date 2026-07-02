# F. Regulatory Compliance Checklist (decision per item: 采纳 / 不适用+理由 / 延后+触发条件)

> Walk at **G2 (requirements)** and re-verify at **G8 (release)**. This gate forces *engineering*
> decisions early so regulated constraints shape the architecture instead of triggering a rewrite later.
>
> **⚠ Not legal advice.** EOS is an engineering scaffold, not a compliance certification. It cannot
> replace a compliance officer / legal counsel / auditor. Treat every ADOPT below as an engineering
> commitment that still needs human sign-off. `【新建补强】`

## Step 0 — Regime selection (do this first, at Discovery/Requirements)
Tick every regime that applies, then record the result in `docs/compliance-profile.md`
(one file per project) and one line in `docs/requirements.md`. If none apply, say so explicitly —
"Regulatory regime: none (generic PII handling per the security rule)" — and skip the packs below.

- [ ] **none / generic PII only** (default; still follow `E-security.md` + the data-api rule)
- [ ] **HIPAA** — US healthcare / PHI
- [ ] **PCI-DSS** — payment card data (PAN/CVV)
- [ ] **SOC 2** — service-org trust controls (security/availability/confidentiality)
- [ ] **SOX** — financial reporting controls (public-company finance)
- [ ] **GDPR** — EU personal data
- [ ] **CCPA/CPRA** — California personal data
- [ ] **PIPL / 个人信息保护法** — China personal information
- [ ] **other** (name it: ____; find the equivalent controls)

## Cross-cutting controls (any regulated regime)
- [ ] **Data classification** extended with the regulated class (PHI / PAN / sensitive-personal), not just public/internal/PII
- [ ] **Data residency / localization**: where regulated data may physically live; cross-border transfer mechanism named
- [ ] **Audit trail**: append-only + tamper-evident; **retention period stated** (regime-specific); no secret/PII in the log itself
- [ ] **Access control**: least-privilege + **minimum-necessary**; break-glass path is itself audited
- [ ] **Encryption**: at rest + in transit + **key management/rotation** owner named
- [ ] **Data lifecycle**: retention → archive → deletion per class; subject **erasure/export** path (see data-api rule)
- [ ] **Vendor / subprocessor boundary**: a **BAA/DPA is signed *before*** any third party (cloud, analytics, **LLM provider**) touches regulated data
- [ ] **Non-production data**: no real regulated data in tests/fixtures/seed; use synthetic or de-identified data
- [ ] **Incident / breach path**: who is notified, within what window, through which channel

## HIPAA pack (healthcare / PHI)
> **详细控制→落点映射见配套附录 [`F-compliance-hipaa.md`](./F-compliance-hipaa.md)**（Security Rule 技术/管理/物理保障 + 最小必要 + 去标识 + 泄露通知 + 6 年留存，逐条对到 EOS 真实落点）。
- [ ] PHI inventory + **minimum-necessary** access per role
- [ ] **BAA with every subprocessor** (incl. cloud + any LLM/API) *before* PHI flows to it
- [ ] Audit logs retained **≥ 6 years**; access to PHI is itself logged
- [ ] De-identification (Safe Harbor / Expert Determination) before analytics/secondary use
- [ ] **No PHI in third-party LLM prompts/logs without a BAA** (see Agentic data-boundary below)

## PCI-DSS pack (payment cards)
> **详细 12 项要求→落点映射见配套附录 [`F-compliance-pci-dss.md`](./F-compliance-pci-dss.md)**（含 scope-reduction 战略 + Requirement 3 存储卡数据专表）。
- [ ] **Never store PAN/CVV/track data**; use tokenization or a hosted-fields / payment-iframe provider
- [ ] Scope minimization + network segmentation (keep card data out of general app/DB where possible)
- [ ] **No card data in logs, telemetry, error reports, or analytics**
- [ ] ASV scan / SAQ path identified as a *process* (external; not a local dependency) `【可选扩展·需外部机构】`

## SOC 2 / SOX pack (finance / enterprise trust)
- [ ] **Immutable audit trail** + change-management evidence (who changed what, approved by whom)
- [ ] **Segregation of duties** (author ≠ approver ≠ deployer for sensitive changes)
- [ ] Periodic **access review**; deprovisioning path on role change/offboarding
- [ ] Named **control owner** per control (accountability, not just implementation)

## GDPR / CCPA / PIPL pack (privacy)
> **详细控制→落点映射见配套附录 [`F-compliance-gdpr-pipl.md`](./F-compliance-gdpr-pipl.md)**（合法性/同意、DSAR 访问/删除/可携、跨境传输 SCCs vs PIPL 安全评估、ROPA/DPIA、72h 泄露通知，逐条对 EOS 落点；含 GDPR vs PIPL 差异表）。
- [ ] **Lawful basis / consent** captured and revocable; consent state is queryable
- [ ] **DSAR**: access / erasure / portability request handling path exists
- [ ] **Cross-border transfer** mechanism (SCCs / adequacy / localization) named
- [ ] **ROPA** (record of processing) or equivalent kept up to date

## Agentic data-boundary (fires when there is LLM/agent code **and** a regulated regime)
> **The #1 late-stage rework landmine.** Sending PHI/PAN/regulated personal data to a third-party model
> is often prohibited or requires a signed BAA/DPA. Decide **before** building the agent, and land it in
> the architecture — retrofitting this forces a model/architecture swap.

Choose and implement one (not "decide later"):
- [ ] (a) **BAA/DPA signed** with the model provider covering the regulated data, **or**
- [ ] (b) **Self-hosted / on-prem model** so regulated data never leaves the boundary, **or**
- [ ] (c) **Redaction / tokenization gateway** strips regulated fields before any provider call, **or**
  > Runnable starter: `docs/eos/examples/compliance-starter/redaction.mjs` (`assertClean()` boundary guard) — skill `eos-compliance-skeletons`.
- [ ] (d) **Exclude regulated data** from the AI path entirely (design the feature around it)

---
Any unresolved regulated item at G2 is a **BLOCKER** (do not proceed to Spec). Re-verify at G8 release.
