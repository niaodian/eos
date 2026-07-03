# F-Privacy. GDPR / PIPL control → EOS landing-point map

> **Companion appendix** (companion to `F-compliance.md`). When handling EU personal data (GDPR) or
> PRC personal information (PIPL), map each control item-by-item to a **real landing point** in EOS
> (rule file / gate / hook), or mark it "project-built" or "process · non-code". During walkthrough,
> tick `☐` in the first column; unresolved 🟢/🟡 items are **G2 = BLOCKER**. CCPA/CPRA overlaps heavily
> with GDPR — reuse this table.
>
> **⚠ Not legal advice.** EOS helps you land controls **in engineering**; it does not replace a DPO /
> legal counsel / privacy officer, nor a DPIA or regulatory filing. The authoritative text is the latest
> official **GDPR (EU 2016/679)** and **PIPL (Personal Information Protection Law of the PRC)**. `【New-build】`
>
> **Legend (three landing-point tiers, honest grading):**
> - 🟢 **EOS rule/gate exists** — a rule or gate you can use directly (real path provided)
> - 🟡 **project must build** — engineering can implement it, but EOS has no dedicated rule (direction provided)
> - ⚪ **process / external** — done by process or an external body, **non-code** (EOS can only remind)

## ⚠ GDPR vs PIPL: key differences (don't conflate them)
| Dimension | GDPR (EU) | PIPL (China) |
|---|---|---|
| Lawful basis | 6 lawful bases (consent is only one) | leans more on **consent**; sensitive info / cross-border / external provision need **separate consent** |
| Cross-border transfer | SCCs / adequacy / BCR | **in-country storage** is the default expectation; export needs one of **security assessment / standard contract / certification**, and large volumes trigger a CAC security assessment |
| Breach notification | notify the regulator within **72 hours** | remediate immediately and **notify** regulator and individuals (no single 72h rule, but "promptly" required) |
| Local entity | non-EU controllers need an EU representative | overseas processors must **appoint a domestic representative/entity** |
| Minors | ≤16 (member states may lower to 13) | **≤14 treated as sensitive personal information**, needs guardian's separate consent |

## Lawful basis & consent
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Lawful basis recorded | record a lawful basis for each processing activity (one of GDPR's 6; PIPL prefers consent) | 🟢 record in `docs/compliance-profile.md` (via `/compliance`) + ROPA below |
| ☐ | Consent captured & revocable | consent is obtainable and revocable, **withdrawal as easy as giving**; consent state is queryable | 🟡 project consent store (versioned, timestamped, queryable) + 🟢 `data-api` audited state changes |
| ☐ | **Separate consent (PIPL)** | sensitive personal info / cross-border provision / external provision / disclosure need **separate consent** (no bundled checkbox) | 🟡 project granular consent UI + per-purpose flags |
| ☐ | Minor's consent | GDPR ≤16 needs a guardian; PIPL **≤14 is sensitive info** needing guardian's separate consent | 🟡 project age-gating + guardian consent path |
| ☐ | Purpose limitation & minimization | collect only the minimum data the stated purpose needs | 🟢 `data-api` "don't keep PII forever" + 🟡 project schema review |

> 🟡 Starter skeleton: `docs/eos/examples/compliance-starter/consent.mjs` (versioned/revocable/**per-purpose** consent, runnable) — skill `eos-compliance-skeletons`.

## DSAR / data-subject rights (access / erasure / portability / rectification)
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | **Access** (GDPR Art.15 / PIPL 45) | individuals can query/copy their personal data | 🟢 `data-api` "support subject export (right to access)" + 🟡 project export endpoint |
| ☐ | **Erasure** (GDPR Art.17 / PIPL 47) | "right to be forgotten": a deletion path, with backups inheriting the same rule | 🟢 `data-api` "subject deletion; every deletion audited; backups inherit PII rules" + 🟡 project soft/hard-delete job |
| ☐ | **Portability** (GDPR Art.20 / PIPL 45) | export in a structured, machine-readable, transferable format | 🟡 project export (JSON/CSV) + 🟢 `data-api` export path |
| ☐ | **Rectification** (GDPR Art.16 / PIPL 46) | correct inaccurate data | 🟡 project update path + 🟢 `data-api` `updated_at` audit |
| ☐ | Response SLA & identity verification | respond within a time limit (GDPR usually 1 month); verify the requester's identity first | 🟡 project DSAR workflow + 🟢 `security` deny-by-default authz (prevents impersonated data claims) |
| ☐ | Automated-decision / profiling safeguards | right to be informed of, and get human review of, automated decisions/profiling | 🟡 project + 🟢 `ai/llm` "moderate/validate outputs before acting" |

> 🟡 Starter skeleton: `docs/eos/examples/compliance-starter/dsar.mjs` (export/erase over pluggable sources, with audit) + `redaction.mjs` (redact before export) — skill `eos-compliance-skeletons`.

## Cross-border transfer (the easiest rework, especially under PIPL)
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Transfer mechanism named | GDPR: SCCs / adequacy / BCR · PIPL: one of security assessment / standard contract / certification | 🟢 record in `docs/compliance-profile.md`; irreversible → `/adr` |
| ☐ | **Data residency / in-country storage** | under PIPL, data is stored **in-country** by default; state which data may leave and where to | 🟡 project region routing / DB placement + 🟢 `C-nfr` "compliance domain" + data class |
| ☐ | Transfer impact & minimization | assess necessity, minimize fields, redact before export | 🟡 project + 🟢 `ai/llm` "redact before sending to provider" |
| ☐ | **Third-party / LLM boundary** | before any cross-border third party (cloud/analytics/**LLM**) processes personal data, the mechanism is in place (DPA + transfer mechanism) | ⚪ legal (DPA) + 🟢 `eos-doctor` **D5** + `F-compliance` Agentic section |

## Retention, ROPA & accountability
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Retention per purpose | set a retention period per purpose; archive/delete on expiry, don't default to keeping forever | 🟢 `data-api` "retention per data class; archive or purge" |
| ☐ | **ROPA** (GDPR Art.30) | record of processing activities: purpose/category/recipients/transfers/retention | 🟡 project register (can start from `compliance-profile.md`) |
| ☐ | **DPIA / PIA** | run an impact assessment before high-risk processing | ⚪ process (DPO) — backfill the conclusion into the profile + `/adr` |
| ☐ | Security of processing (GDPR Art.32) | encryption, access control, availability/recovery | 🟢 `security` encrypt at rest/in transit · `C-nfr` RTO/RPO · `data-api` backups |
| ☐ | **DPO / representative** | appoint a DPO when required; overseas controllers set an EU rep (GDPR) / domestic representative (PIPL) | ⚪ org/legal — non-code |

## Breach notification
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Breach notification | GDPR **≤72h** to the regulator (plus individuals if high-risk); PIPL prompt remediation + notification | ⚪ process — trigger/deadline/channel written into the incident section of `/runbook` |

---
**Agentic note**: sending personal data to a third-party LLM = cross-border transfer + third-party processing,
needing a DPA + transfer mechanism (PIPL often also needs **separate consent** and prefers in-country /
self-hosted). Follow the *Agentic data-boundary* in `F-compliance.md`; `eos-doctor` **D5** WARNs when
"GDPR/PIPL declared + LLM code present + no boundary decision". Any unresolved 🟢/🟡 item is a
**G2 = BLOCKER**, re-verified at G8.
