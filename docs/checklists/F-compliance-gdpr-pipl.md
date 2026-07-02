# F-Privacy. GDPR / PIPL control → EOS landing-point map

> **配套附录**（companion to `F-compliance.md`）。处理 EU 个人数据（GDPR）或中国个人信息（PIPL）时，
> 逐条把控制映射到 EOS 里的**真实落点**（规则文件 / 门 / hook），或标"项目自建"/"流程·非代码"。
> 首列 `☐` 打勾；未决的 🟢/🟡 项在 **G2 = BLOCKER**。CCPA/CPRA 控制与 GDPR 大面积重叠，可复用本表。
>
> **⚠ Not legal advice.** EOS 帮你把控制**落到工程**，不替代 DPO / 法务 / 隐私官，也不替代 DPIA 或
> 监管备案。条款以 **GDPR (EU 2016/679)** 与 **PIPL（中华人民共和国个人信息保护法）** 官方最新版本为准。`【新建补强】`
>
> **Legend：** 🟢 EOS rule/gate exists ｜ 🟡 project must build ｜ ⚪ process / external（非代码）

## ⚠ GDPR vs PIPL：关键差异（别混为一谈）
| 维度 | GDPR (EU) | PIPL (中国) |
|---|---|---|
| 合法性基础 | 6 类 lawful basis（同意仅其一） | 更依赖**同意**；敏感信息/跨境/对外提供需**单独同意 (separate consent)** |
| 跨境传输 | SCCs / adequacy / BCR | **境内存储**为默认预期；出境需**安全评估 / 标准合同 / 认证**之一，量大触发 CAC 安全评估 |
| 违约通知 | **72 小时**内通知监管 | 立即采取补救并**通知**监管与个人（未设统一 72h，但要求及时） |
| 本地实体 | EU 外主体需 EU representative | 境外处理者需在**境内设代表/机构** |
| 未成年人 | ≤16（成员国可下调至 13） | **≤14 视为敏感个人信息**，需监护人单独同意 |

## Lawful basis & consent
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Lawful basis recorded | 每个处理活动记录合法性基础（GDPR 6 类之一；PIPL 优先同意） | 🟢 record in `docs/compliance-profile.md` (via `/compliance`) + ROPA below |
| ☐ | Consent captured & revocable | 同意可获取、可撤回、**撤回与给予一样容易**；consent state 可查询 | 🟡 project consent store (versioned, timestamped, queryable) + 🟢 `data-api` audited state changes |
| ☐ | **Separate consent (PIPL)** | 敏感个人信息 / 跨境提供 / 对外提供 / 公开 需**单独同意**（不能一揽子勾选） | 🟡 project granular consent UI + per-purpose flags |
| ☐ | Minor's consent | GDPR ≤16 需监护人；PIPL **≤14 属敏感信息**需监护人单独同意 | 🟡 project age-gating + guardian consent path |
| ☐ | Purpose limitation & minimization | 只收集声明目的所需的最小数据 | 🟢 `data-api` "don't keep PII forever" + 🟡 project schema review |

> 🟡 起步骨架：`docs/eos/examples/compliance-starter/consent.mjs`（版本化/可撤回/**分目的**同意，可跑）— skill `eos-compliance-skeletons`。

## DSAR / 个人权利（access / erasure / portability / rectification）
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | **Access** (GDPR Art.15 / PIPL 45) | 个人可查询/复制其个人数据 | 🟢 `data-api` "support subject export (right to access)" + 🟡 project export endpoint |
| ☐ | **Erasure / 删除** (GDPR Art.17 / PIPL 47) | "被遗忘权"：删除路径，含备份继承同一规则 | 🟢 `data-api` "subject deletion; every deletion audited; backups inherit PII rules" + 🟡 project soft/hard-delete job |
| ☐ | **Portability** (GDPR Art.20 / PIPL 45) | 结构化、机器可读、可转移格式导出 | 🟡 project export (JSON/CSV) + 🟢 `data-api` export path |
| ☐ | **Rectification** (GDPR Art.16 / PIPL 46) | 更正不准确数据 | 🟡 project update path + 🟢 `data-api` `updated_at` audit |
| ☐ | Response SLA & identity verification | 有时限地响应（GDPR 通常 1 个月）；先核验请求者身份 | 🟡 project DSAR workflow + 🟢 `security` deny-by-default authz（防冒领他人数据） |
| ☐ | Automated-decision / profiling safeguards | 自动化决策/画像的知情与人工复核权 | 🟡 project + 🟢 `ai/llm` "moderate/validate outputs before acting" |

> 🟡 起步骨架：`docs/eos/examples/compliance-starter/dsar.mjs`（export/erase over pluggable sources，含审计）+ `redaction.mjs`（导出前脱敏）— skill `eos-compliance-skeletons`。

## Cross-border transfer（跨境传输 — 最容易返工，尤其 PIPL）
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Transfer mechanism named | GDPR: SCCs / adequacy / BCR｜PIPL: 安全评估 / 标准合同 / 认证 之一 | 🟢 record in `docs/compliance-profile.md`; irreversible → `/adr` |
| ☐ | **Data residency / 境内存储** | PIPL 场景默认数据**存境内**；明确哪些数据可出境、去哪 | 🟡 project region routing / DB placement + 🟢 `C-nfr` "合规域" + data class |
| ☐ | Transfer impact & minimization | 出境前评估必要性、最小化字段、脱敏 | 🟡 project + 🟢 `ai/llm` "redact before sending to provider" |
| ☐ | **Third-party / LLM boundary** | 任何跨境的第三方（云/分析/**LLM**）处理个人数据前，机制到位（DPA + 传输机制） | ⚪ legal (DPA) + 🟢 `eos-doctor` **D5** + `F-compliance` Agentic 段 |

## Retention, ROPA & accountability
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Retention per purpose | 按目的设保留期，到期归档/删除，不默认永久留存 | 🟢 `data-api` "retention per data class; archive or purge" |
| ☐ | **ROPA** (GDPR Art.30) | 处理活动记录：目的/类别/接收方/传输/保留 | 🟡 project register (可从 `compliance-profile.md` 起步) |
| ☐ | **DPIA / PIA** | 高风险处理前做影响评估 | ⚪ process (DPO) — 结论回填 profile + `/adr` |
| ☐ | Security of processing (GDPR Art.32) | 加密、访问控制、可用性/恢复 | 🟢 `security` encrypt at rest/in transit · `C-nfr` RTO/RPO · `data-api` backups |
| ☐ | **DPO / representative** | 需要时任命 DPO；境外主体设 EU rep（GDPR）/ 境内代表（PIPL） | ⚪ org/legal — non-code |

## Breach notification
| ✔ | Control | Requirement | Landing point |
|---|---|---|---|
| ☐ | Breach notification | GDPR **≤72h** 通知监管（高风险再通知个人）；PIPL 及时补救+通知 | ⚪ process — 触发/时限/通道写进 `/runbook` incident 段 |

---
**Agentic 特别提醒**：把个人数据送第三方 LLM = 跨境传输 + 第三方处理，需 DPA + 传输机制（PIPL 还常需
**单独同意**且优先境内/自托管）。走 `F-compliance.md` 的 *Agentic data-boundary*；`eos-doctor` **D5** 会在
"声明 GDPR/PIPL + 有 LLM 代码 + 无边界决策"时 WARN。任何未决 🟢/🟡 项在 **G2 = BLOCKER**，G8 复验。
