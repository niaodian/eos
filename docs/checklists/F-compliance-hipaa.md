# F-HIPAA. HIPAA control → EOS landing-point map

> **Companion appendix** (companion to `F-compliance.md`). After selecting HIPAA for a healthcare project, map the Security Rule /
> Privacy Rule controls item-by-item to the **real landing points** in EOS (rule files / gates / hooks), or explicitly mark them as "project-built" or
> "process · non-code". During walkthrough, tick `☐` in the first column; unresolved 🟢/🟡 items are **G2 = BLOCKER**.
>
> **⚠ Not legal advice.** EOS is an engineering scaffold, not HIPAA certification; the mapping helps you land controls **in engineering**,
> but still requires compliance officer / legal / privacy officer sign-off. Clause numbers are organized by HIPAA Security Rule **45 CFR §164.3xx**; use the latest official version as authoritative. `【New-build】`
>
> **Legend (three landing-point tiers, honest grading):**
> - 🟢 **EOS rule/gate exists** — EOS already has a rule or gate that can be used directly (real path provided)
> - 🟡 **project must build** — engineering can implement it, but EOS has no dedicated rule; the project must build it (direction provided)
> - ⚪ **process / external** — completed by process or an external body, **non-code** (EOS cannot enforce it, only remind)

## Scope first (narrow the ePHI scope first; this saves the most effort)
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | ePHI inventory | Identify which fields are PHI, where they are stored, and which services/third parties they pass through | 🟢 record in `docs/compliance-profile.md` (via `/compliance`); data class in `data-api` rule |
| ☐ | Minimize PHI surface | Do not collect it if avoidable; de-identify it if possible; PHI must not enter logs/telemetry/frontend | 🟢 `backend/*` "No PII in logs" · `frontend` "secrets/PII not in client bundle" · `secret-scan.mjs` |

## Technical Safeguards (§164.312) — most relevant to engineering; EOS has the most landing points here
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Access control · unique user ID (a)(2)(i) | Every subject that accesses PHI has a unique identity | 🟡 project auth/user model + 🟢 `security` rule "deny-by-default authz on every state-changing op" |
| ☐ | Access control · emergency access (a)(2)(ii) | break-glass emergency access process, and **it is itself audited** | 🟡 project break-glass path + 🟢 `data-api` "every deletion/sensitive op audited" |
| ☐ | Access control · automatic logoff (a)(2)(iii) | Automatic idle logout / session timeout | 🟡 project session policy (session TTL / idle timeout) |
| ☐ | Access control · encryption at rest (a)(2)(iv) | ePHI encrypted at rest | 🟢 `security` rule "encrypt PII at rest & in transit" · `C-nfr` encryption target · 🟡 infra KMS/rotation owner |
| ☐ | Audit controls (b) | Record access/changes to ePHI (who/when/what); logs contain no PHI | 🟢 `backend/*` structured JSON logs + request/correlation id, "No PII" · `D-ops` audit scope |
| ☐ | Integrity (c)(1) | Prevent ePHI from being illegally altered/destroyed; detectable | 🟡 project checksums/versioning + 🟢 `data-api` soft-delete `deleted_at` + reversible migrations |
| ☐ | Authentication (d) | Verify subject identity (strong authentication/MFA recommended) | 🟡 project authN (MFA) + 🟢 `security` least-privilege creds |
| ☐ | Transmission security · encryption in transit (e)(2)(ii) | Transport-layer encryption (TLS) | 🟢 `security` "encrypt … in transit" · `release-ops` health/readiness on TLS endpoints |

## Administrative Safeguards (§164.308) — partly engineering, partly process
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Risk analysis & management (a)(1) | Periodic risk assessment + mitigation | ⚪ process (security officer) — conclusions backfilled into `docs/compliance-profile.md` |
| ☐ | Information access management · minimum necessary (a)(4) | Roles receive only the minimum PHI needed to perform their duties | 🟡 project RBAC + 🟢 `security` multi-tenant/authz deny-by-default · `D-ops` permission matrix |
| ☐ | Security incident procedures (a)(6) | Detect/respond/report security incidents | 🟢 `/runbook <service>` incident+rollback steps · `release-ops` runbook conventions |
| ☐ | Contingency plan (a)(7) | Data backup + disaster recovery + emergency operations | 🟢 `C-nfr` SLO/RTO/RPO · `data-api` "backups: cadence + restore test, encrypted" · `/release-gate` rollback |
| ☐ | Workforce training / sanction (a)(5)/(a)(1)(ii)(C) | Workforce training + sanction handling for violations | ⚪ process (HR/security) — non-code |
| ☐ | Business Associate Agreement (b)(1) | Any third party that touches PHI (cloud/analytics/**LLM**) **signs a BAA first** | ⚪ process/legal + 🟢 enforced early by `eos-doctor` **D5** data-boundary + `F-compliance` Agentic section |

## Physical Safeguards (§164.310) — mostly infrastructure/process
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Facility / workstation access (a)/(b)/(c) | Physical access control for facilities/workstations | ⚪ cloud provider (BAA-covered) + org policy — non-code |
| ☐ | Device & media controls (d) | Protect ePHI during media disposal/reuse/movement; secure erase | ⚪ process + 🟡 project data-disposal job |

## Privacy Rule — minimum necessary & de-identification
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Minimum necessary (§164.502(b)) | Use/disclosure limited to minimum necessary | 🟡 project field-level access + query scoping |
| ☐ | De-identification (§164.514(a)-(b)) | De-identification before secondary use/analytics (Safe Harbor 18 identifiers / Expert Determination) | 🟡 project de-id pipeline + 🟢 `ai/llm` "redact before sending to provider" (analytics/LLM path) |

## Breach Notification & documentation
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Breach notification (§164.404/408) | Notify individuals + HHS without unreasonable delay, **≤60 days** | ⚪ process — trigger conditions/channels written into `/runbook` incident section |
| ☐ | Documentation retention (§164.316(b)(2)) | Policies and records (including audit logs) **retained ≥ 6 years** | 🟡 project log-retention job (≥6y) + 🟢 `data-api` retention-per-class convention |

---
**Agentic special reminder**: Any path that sends PHI to a third-party LLM without a BAA is a HIPAA violation — it must follow
`F-compliance.md`'s *Agentic data-boundary* (sign BAA · self-host · redaction gateway · exclude PHI); `eos-doctor` **D5**
will WARN when "HIPAA declared + LLM code exists + no boundary decision". Any unresolved 🟢/🟡 item is **G2 = BLOCKER**; re-verify at G8.
