# F-PCI. PCI-DSS control → EOS landing-point map

> **Companion appendix** (companion to `F-compliance.md`). Once PCI-DSS is selected for a finance/payments
> scenario, map each of the 12 requirements to a **real landing point** in EOS (rule file / gate / hook),
> or mark it "project-built" or "process · external body". During walkthrough, tick `☐` in the first
> column; unresolved 🟢/🟡 items are **G2 = BLOCKER**.
>
> **⚠ Not legal advice / not a QSA assessment.** EOS helps you land controls **in engineering**; it does
> not replace a QSA audit, SAQ, or ASV scan. Requirements are organized by the 12 items of
> **PCI-DSS v4.0**; the authoritative sub-items are the latest official standard. `【New-build】`
>
> **Legend (three landing-point tiers, honest grading):**
> - 🟢 **EOS rule/gate exists** — a rule or gate you can use directly (real path provided)
> - 🟡 **project must build** — engineering can implement it, but EOS has no dedicated rule (direction provided)
> - ⚪ **process / external** — done by process or an external body, **non-code** (EOS can only remind)

## ⭐ Scope reduction first (the cheapest, safest compliance path)
> **Not touching card data = not carrying most of the PCI burden.** Prefer handing PAN entry to a
> **PCI-validated payment provider**'s hosted fields / iframe / redirect, so PAN **never flows through**
> your frontend/backend/DB → landing on the smallest **SAQ A**.
> Building your own card-data store (SAQ D) is extremely expensive — avoid it unless you have a strong reason.

| ✔ | Strategy | Landing point |
|---|---|---|
| ☐ | Use hosted fields / iframe / redirect (PAN never enters your system) | 🟡 project payment integration + 🟢 `frontend` "no secrets/sensitive in client bundle" |
| ☐ | Tokenization (use a token instead of the PAN for downstream business) | 🟡 project + 🟢 `data-api` "never store raw sensitive; surrogate keys" |
| ☐ | Record chosen SAQ type + CDE boundary | 🟢 `docs/compliance-profile.md` (via `/compliance`) |

## The 12 requirements (v4.0)
| ✔ | Req | Requirement | Landing point |
|---|---|---|---|
| ☐ | 1 | Network security controls (firewall/segmentation, isolate the CDE) | ⚪ infra/network + 🟡 project segmentation |
| ☐ | 2 | Secure configurations (disable vendor defaults/weak config) | 🟢 `release-ops` "reproducible & pinned builds" · `security` config isolation per env |
| ☐ | **3** | **Protect stored account data** — see the dedicated table below (the PCI engineering core) | 🟢🟡 see §Requirement 3 |
| ☐ | 4 | Strong cryptography in transit (TLS over open networks) | 🟢 `security` "encrypt … in transit" |
| ☐ | 5 | Protect against malware | ⚪ infra/endpoint — non-code |
| ☐ | 6 | Secure systems & software (secure SDLC, patching, vulnerability management, change control) | 🟢 `E-security` supply-chain (lockfile/pin/`npm ci`/audit) · `eos-ci.yml` `npm audit`/`pip-audit` · `testing` rule · code-review G6 |
| ☐ | 7 | Restrict access by business need-to-know | 🟢 `security` deny-by-default authz · `data-api` tenant-scoping/RLS · `D-ops` permission matrix |
| ☐ | 8 | Identify & authenticate (unique ID + **MFA**) | 🟡 project authN (MFA) + 🟢 `security` least-privilege creds, key rotation |
| ☐ | 9 | Restrict physical access | ⚪ cloud provider / facility — non-code |
| ☐ | 10 | Log & monitor all access (audit logs, **retain ≥12 months**, ≥3 months instantly queryable) | 🟢 `backend/*` structured logs + request id, "No PII/card data" · 🟡 project log-retention (≥12m) · `/telemetry-plan` |
| ☐ | 11 | Test security regularly (**quarterly ASV external scan**, penetration testing, change detection) | ⚪ external ASV/pentest `【Optional · needs external body】` + 🟢 `secret-scan.mjs`/`gitleaks` as a partial local aid |
| ☐ | 12 | Organizational security policy (risk assessment, awareness training, incident response) | ⚪ process + 🟢 incident/rollback in `/runbook` |

## Requirement 3 — Protect stored account data (**easiest to trip on, broken out**)
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | **SAD never stored after auth** | after authorization, **never store** CVV/CVC2/CVV2/CID, full track, or PIN — **not even encrypted** | 🟢 `E-security` "no secret in code/logs/fixtures" · `secret-scan.mjs` · 🟡 project: assert not persisted / not logged |
| ☐ | **PAN rendered unreadable** | stored PAN must be unreadable: truncation / tokenization / hashing / strong crypto | 🟢 `security` encrypt-at-rest · `data-api` "no raw sensitive; surrogate keys" · 🟡 project tokenization |
| ☐ | **Mask PAN on display** | on display show at most first-6/last-4, mask the rest | 🟡 project display masking + 🟢 `frontend` explicit states / no sensitive in bundle |
| ☐ | **No card data in logs/telemetry/errors** | card data must not enter logs, telemetry, error reports, or analytics | 🟢 `backend/*` "No PII in logs" · `ai/llm` "redact before provider" · `secret-scan.mjs` |
| ☐ | Key management | storage/rotation/least-privilege for encryption keys; keep keys separate from data | 🟢 `security` "secrets via env/secret store; rotate keys" · 🟡 infra KMS |

---
**Agentic note**: sending card data/PAN to a third-party LLM usually **violates PCI** — follow the
*Agentic data-boundary* in `F-compliance.md` (self-hosted · redaction/tokenization gateway · exclude card
data; a BAA/DPA does not change PCI's hard "never store SAD" line). `eos-doctor` **D5** WARNs when
"PCI-DSS declared + LLM code present + no boundary decision". Any unresolved 🟢/🟡 item is a
**G2 = BLOCKER**, re-verified at G8 by `/release-gate`.
