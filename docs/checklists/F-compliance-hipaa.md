# F-HIPAA. HIPAA control → EOS landing-point map

> **配套附录**（companion to `F-compliance.md`）。医疗行业选中 HIPAA 后，逐条把 Security Rule /
> Privacy Rule 的控制映射到 EOS 里的**真实落点**（规则文件 / 门 / hook），或明确标为"项目自建"或
> "流程·非代码"。走查时在首列 `☐` 打勾；未决的 🟢/🟡 项在 **G2 = BLOCKER**。
>
> **⚠ Not legal advice.** EOS 是工程脚手架，不是 HIPAA 认证；映射帮你把控制**落到工程**，
> 仍需合规官/法务/隐私官签核。条款号按 HIPAA Security Rule **45 CFR §164.3xx** 组织，以官方最新版本为准。`【新建补强】`
>
> **Legend（落点三档，诚实分级）：**
> - 🟢 **EOS rule/gate exists** — EOS 已有规则或门可直接依据（给出真实路径）
> - 🟡 **project must build** — 工程可落地，但 EOS 无专规，需项目自建（给方向）
> - ⚪ **process / external** — 流程或外部机构完成，**非代码**（EOS 无法强制，只提醒）

## Scope first（先缩小 ePHI 范围，最省事）
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | ePHI inventory | 明确哪些字段是 PHI、存在哪、经过哪些服务/第三方 | 🟢 record in `docs/compliance-profile.md` (via `/compliance`); data class in `data-api` rule |
| ☐ | Minimize PHI surface | 能不收就不收；能去标识就去标识；PHI 不进日志/埋点/前端 | 🟢 `backend/*` "No PII in logs" · `frontend` "secrets/PII not in client bundle" · `secret-scan.mjs` |

## Technical Safeguards (§164.312) — 工程最相关，EOS 落点最多
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Access control · unique user ID (a)(2)(i) | 每个访问 PHI 的主体有唯一身份 | 🟡 project auth/user model + 🟢 `security` rule "deny-by-default authz on every state-changing op" |
| ☐ | Access control · emergency access (a)(2)(ii) | break-glass 应急访问流程，且**本身被审计** | 🟡 project break-glass path + 🟢 `data-api` "every deletion/sensitive op audited" |
| ☐ | Access control · automatic logoff (a)(2)(iii) | 空闲自动登出 / 会话超时 | 🟡 project session policy (session TTL / idle timeout) |
| ☐ | Access control · encryption at rest (a)(2)(iv) | ePHI 静态加密 | 🟢 `security` rule "encrypt PII at rest & in transit" · `C-nfr` 加密目标 · 🟡 infra KMS/rotation owner |
| ☐ | Audit controls (b) | 记录对 ePHI 的访问/改动（who/when/what），日志内不含 PHI | 🟢 `backend/*` structured JSON logs + request/correlation id, "No PII" · `D-ops` 审计范围 |
| ☐ | Integrity (c)(1) | 防 ePHI 被非法篡改/销毁；可检测 | 🟡 project checksums/versioning + 🟢 `data-api` soft-delete `deleted_at` + reversible migrations |
| ☐ | Authentication (d) | 验证主体身份（强认证/MFA 建议） | 🟡 project authN (MFA) + 🟢 `security` least-privilege creds |
| ☐ | Transmission security · encryption in transit (e)(2)(ii) | 传输层加密（TLS） | 🟢 `security` "encrypt … in transit" · `release-ops` health/readiness on TLS endpoints |

## Administrative Safeguards (§164.308) — 半工程半流程
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Risk analysis & management (a)(1) | 定期风险评估 + 缓解 | ⚪ process (security officer) — 结论回填 `docs/compliance-profile.md` |
| ☐ | Information access management · minimum necessary (a)(4) | 角色只拿完成职责所需的最小 PHI | 🟡 project RBAC + 🟢 `security` multi-tenant/authz deny-by-default · `D-ops` 权限矩阵 |
| ☐ | Security incident procedures (a)(6) | 检测/响应/上报安全事件 | 🟢 `/runbook <service>` incident+rollback steps · `release-ops` runbook 约定 |
| ☐ | Contingency plan (a)(7) | 数据备份 + 灾难恢复 + 应急运行 | 🟢 `C-nfr` SLO/RTO/RPO · `data-api` "backups: cadence + restore test, encrypted" · `/release-gate` rollback |
| ☐ | Workforce training / sanction (a)(5)/(a)(1)(ii)(C) | 员工培训 + 违规处置 | ⚪ process (HR/security) — non-code |
| ☐ | Business Associate Agreement (b)(1) | 任何触及 PHI 的第三方（云/分析/**LLM**）**先签 BAA** | ⚪ process/legal + 🟢 enforced early by `eos-doctor` **D5** data-boundary + `F-compliance` Agentic 段 |

## Physical Safeguards (§164.310) — 多为基建/流程
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Facility / workstation access (a)/(b)/(c) | 机房/工作站物理访问控制 | ⚪ cloud provider (BAA-covered) + org policy — non-code |
| ☐ | Device & media controls (d) | 介质处置/复用/移动时保护 ePHI；安全擦除 | ⚪ process + 🟡 project data-disposal job |

## Privacy Rule — minimum necessary & de-identification
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Minimum necessary (§164.502(b)) | 使用/披露限于最小必要 | 🟡 project field-level access + query scoping |
| ☐ | De-identification (§164.514(a)-(b)) | 二次使用/分析前去标识（Safe Harbor 18 标识符 / Expert Determination） | 🟡 project de-id pipeline + 🟢 `ai/llm` "redact before sending to provider" (analytics/LLM 路径) |

## Breach Notification & documentation
| ✔ | Control (§) | Requirement | Landing point |
|---|---|---|---|
| ☐ | Breach notification (§164.404/408) | 未合理拖延、**≤60 天**通知个人 + HHS | ⚪ process — 触发条件/通道写进 `/runbook` incident 段 |
| ☐ | Documentation retention (§164.316(b)(2)) | 政策与记录（含审计日志）**保留 ≥ 6 年** | 🟡 project log-retention job (≥6y) + 🟢 `data-api` retention-per-class 约定 |

---
**Agentic 特别提醒**：任何把 PHI 送第三方 LLM 的路径，若无 BAA 即为 HIPAA 违规——必须走
`F-compliance.md` 的 *Agentic data-boundary*（签 BAA · 自托管 · 脱敏网关 · 排除 PHI）；`eos-doctor` **D5**
会在"声明 HIPAA + 有 LLM 代码 + 无边界决策"时 WARN。任何未决 🟢/🟡 项在 **G2 = BLOCKER**，G8 复验。
