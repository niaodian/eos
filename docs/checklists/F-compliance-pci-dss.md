# F-PCI. PCI-DSS control → EOS landing-point map

> **配套附录**（companion to `F-compliance.md`）。金融/支付场景选中 PCI-DSS 后，逐条把 12 项要求映射到
> EOS 里的**真实落点**（规则文件 / 门 / hook），或标为"项目自建"或"流程·外部机构"。首列 `☐` 打勾；
> 未决的 🟢/🟡 项在 **G2 = BLOCKER**。
>
> **⚠ Not legal advice / not a QSA assessment.** EOS 帮你把控制**落到工程**，不替代 QSA 审计、SAQ、
> ASV 扫描。要求按 **PCI-DSS v4.0** 的 12 项组织，具体子项以官方最新标准为准。`【新建补强】`
>
> **Legend：** 🟢 EOS rule/gate exists ｜ 🟡 project must build ｜ ⚪ process / external（非代码）

## ⭐ Scope reduction first（最省事、最安全的合规路径）
> **不接触卡数据 = 不背大部分 PCI 负担。** 首选把 PAN 输入交给 **PCI-validated 支付服务商**的
> hosted fields / iframe / redirect，让 PAN **不流经**你的前端/后端/DB → 落到最小的 **SAQ A**。
> 自建卡数据存储（SAQ D）成本极高，除非有强理由，一律避免。

| ✔ | Strategy | Landing point |
|---|---|---|
| ☐ | Use hosted fields / iframe / redirect（PAN 不进你的系统） | 🟡 project payment integration + 🟢 `frontend` "no secrets/sensitive in client bundle" |
| ☐ | Tokenization（用 token 代替 PAN 做后续业务） | 🟡 project + 🟢 `data-api` "never store raw sensitive; surrogate keys" |
| ☐ | Record chosen SAQ type + CDE boundary | 🟢 `docs/compliance-profile.md` (via `/compliance`) |

## The 12 requirements (v4.0)
| ✔ | Req | Requirement | Landing point |
|---|---|---|---|
| ☐ | 1 | Network security controls（防火墙/网络分段，隔离 CDE） | ⚪ infra/network + 🟡 project segmentation |
| ☐ | 2 | Secure configurations（禁用厂商默认值/弱配置） | 🟢 `release-ops` "reproducible & pinned builds" · `security` config isolation per env |
| ☐ | **3** | **Protect stored account data** — 见下方专表（PCI 工程核心） | 🟢🟡 见 §Requirement 3 |
| ☐ | 4 | Strong cryptography in transit（开放网络传输用 TLS） | 🟢 `security` "encrypt … in transit" |
| ☐ | 5 | Protect against malware | ⚪ infra/endpoint — non-code |
| ☐ | 6 | Secure systems & software（安全 SDLC、补丁、漏洞管理、变更控制） | 🟢 `E-security` supply-chain（lockfile/pin/`npm ci`/audit）· `eos-ci.yml` `npm audit`/`pip-audit` · `testing` rule · code-review G6 |
| ☐ | 7 | Restrict access by business need-to-know | 🟢 `security` deny-by-default authz · `data-api` tenant-scoping/RLS · `D-ops` 权限矩阵 |
| ☐ | 8 | Identify & authenticate（唯一 ID + **MFA**） | 🟡 project authN (MFA) + 🟢 `security` least-privilege creds, key rotation |
| ☐ | 9 | Restrict physical access | ⚪ cloud provider / facility — non-code |
| ☐ | 10 | Log & monitor all access（审计日志，**保留 ≥12 个月**，≥3 个月即时可查） | 🟢 `backend/*` structured logs + request id, "No PII/card data" · 🟡 project log-retention (≥12m) · `/telemetry-plan` |
| ☐ | 11 | Test security regularly（**季度 ASV 外部扫描**、渗透测试、变更检测） | ⚪ external ASV/pentest `【可选扩展·需外部机构】` + 🟢 `secret-scan.mjs`/`gitleaks` as a partial local aid |
| ☐ | 12 | Organizational security policy（风险评估、意识培训、事件响应） | ⚪ process + 🟢 incident/rollback in `/runbook` |

## Requirement 3 — Protect stored account data（**最容易踩雷，单列**）
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | **SAD never stored after auth** | 授权后**禁止存储** CVV/CVC2/CVV2/CID、完整磁道、PIN——**即使加密也不行** | 🟢 `E-security` "no secret in code/logs/fixtures" · `secret-scan.mjs` · 🟡 project: 断言不落库/不落日志 |
| ☐ | **PAN rendered unreadable** | 存储的 PAN 必须不可读：truncation / tokenization / hashing / strong crypto | 🟢 `security` encrypt-at-rest · `data-api` "no raw sensitive; surrogate keys" · 🟡 project tokenization |
| ☐ | **Mask PAN on display** | 展示时最多首6末4，其余遮蔽 | 🟡 project display masking + 🟢 `frontend` explicit states / no sensitive in bundle |
| ☐ | **No card data in logs/telemetry/errors** | 卡数据不得进日志、埋点、错误上报、分析 | 🟢 `backend/*` "No PII in logs" · `ai/llm` "redact before provider" · `secret-scan.mjs` |
| ☐ | Key management | 加密密钥的存储/轮换/最小权限，密钥与数据分离 | 🟢 `security` "secrets via env/secret store; rotate keys" · 🟡 infra KMS |

---
**Agentic 特别提醒**：卡数据/PAN 送第三方 LLM 通常**违反 PCI**——走 `F-compliance.md` 的
*Agentic data-boundary*（自托管 · 脱敏/令牌化网关 · 排除卡数据；BAA/DPA 不改变 PCI 的 SAD 禁存红线）。
`eos-doctor` **D5** 会在"声明 PCI-DSS + 有 LLM 代码 + 无边界决策"时 WARN。任何未决 🟢/🟡 项在
**G2 = BLOCKER**，G8 由 `/release-gate` 复验。
