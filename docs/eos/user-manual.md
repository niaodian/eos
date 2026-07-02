# EOS 用户手册（Engineering Operating System User Manual）

> 版本：与 `docs/eos/VERSION` 同步（当前 `eos-1.5.0`）
> 适用：较新版本的 VS Code + GitHub Copilot Chat（自定义 agent / hooks 属近版能力，用「关于 VS Code」面板确认版本）+ 已安装 73 个 `bmad-*` skill（用户级）
> 定位：本手册是**操作指南（怎么用）**；设计原理与取舍见同目录 `blueprint.md`（为什么这么设计）。
> 约定：正文中文；文件名/路径/命令/配置键保留英文原文。

---

## 如何阅读本手册

| 你是谁 / 你想做什么 | 直接跳到 |
|---|---|
| 第一次接触，想 10 分钟跑起来 | [第 1 章 快速上手](#第-1-章-快速上手（10-分钟）) |
| 要在一台新 Mac 上装环境 | [第 2 章 一次性环境准备](#第-2-章-一次性环境准备) |
| 要开一个新项目 | [第 3 章 新项目 Day-1](#第-3-章-新项目-day-1-bootstrap) |
| 想搞懂"规则/prompt/agent/skill/hook 到底啥区别" | [第 4 章 核心概念](#第-4-章-核心概念（五种机制）) |
| **要从 idea 一路做到上线后迭代** | [第 6 章 全生命周期实操](#第-6-章-全生命周期实操（idea-→-迭代）) ← 手册核心 |
| 想查某个斜杠命令 / agent / 规则 | [第 7 章 完整参考](#第-7-章-完整参考（速查）) |
| 配置坏了 / Agent 不按预期工作 | [第 9 章 故障定位](#第-9-章-故障定位与排错) |
| 想把这套搬到别的项目/团队 | [第 10 章 跨项目复用与分发](#第-10-章-跨项目复用与分发) |

---

## 目录

- [第 1 章 快速上手（10 分钟）](#第-1-章-快速上手（10-分钟）)
- [第 2 章 一次性环境准备](#第-2-章-一次性环境准备)
- [第 3 章 新项目 Day-1 Bootstrap](#第-3-章-新项目-day-1-bootstrap)
- [第 4 章 核心概念（五种机制）](#第-4-章-核心概念（五种机制）)
- [第 5 章 心智模型：分层规则 + 决策门](#第-5-章-心智模型：分层规则--决策门)
- [第 6 章 全生命周期实操（idea → 迭代）](#第-6-章-全生命周期实操（idea-→-迭代）)
- [第 6.5 章 两条上手路径（SaaS vs Agentic · 小白友好）](#第-65-章-两条上手路径（saas-vs-agentic-·-小白友好）)
- [第 7 章 完整参考（速查）](#第-7-章-完整参考（速查）)
- [第 8 章 配置质检与验收](#第-8-章-配置质检与验收)
- [第 9 章 故障定位与排错](#第-9-章-故障定位与排错)
- [第 10 章 跨项目复用与分发](#第-10-章-跨项目复用与分发)
- [第 11 章 新增技术栈](#第-11-章-新增技术栈)
- [第 12 章 反模式速查](#第-12-章-反模式速查)
- [附录 A 术语表](#附录-a-术语表)
- [附录 B 命令速查卡](#附录-b-命令速查卡)
- [附录 C 端到端样例（my-app）](#附录-c-端到端样例（my-app）)

---

# 第 1 章 快速上手（10 分钟）

## 1.1 EOS 是什么（一句话）

EOS = 一套**纯本地、Git 化、可跨项目移植**的工程操作系统。它把"和 AI 结对开发"从
自由对话，变成**带决策门（gate）的标准 SDLC 流水线**：每个阶段有明确输入/输出/通过标准，
并优先复用你已装的 73 个 `bmad-*` skill，而不是重复造轮子。

它解决四个老大难：
1. 需求阶段不完整 → 上线后大规模返工
2. 运营需求（埋点/权限/回滚…）没在需求期前置 → 上线后补补丁
3. 缺治理门禁 → 代码与需求漂移、危险操作无人拦
4. 多语言栈规则混乱 → Agent 输出不稳定

## 1.2 三条你每天都会用的命令

在 VS Code 的 **Copilot Chat（Agent 模式）** 里输入：

```
/requirements "<一句话功能描述>"     # 进入正式开发流的最短入口
/release-gate                        # 上线前过门禁
```

在**终端**里：

```
node .github/hooks/validate-config.mjs   # 配置自检，期望输出 PASS
```

## 1.3 Happy Path（从 idea 到代码的最短链路）

```
（切换 agent）eos-discovery        → docs/discovery.md      (Gate G1)
/requirements "<feature>"          → docs/requirements.md   (Gate G2)
/spec                              → docs/prd.md            (Gate G3)
/ux-spec（面向用户，纯后端跳过）   → docs/DESIGN.md + docs/EXPERIENCE.md (Gate G-UX)
（切换 agent）eos-architecture     → docs/architecture.md + api/openapi.yaml + ADR (Gate G4)
（handoff）eos-plan                → docs/stories/*.md      (Gate G5)
（handoff）bmad-dev-story          → src/ 代码             (Gate G6)
bmad-code-review                   → 审查无阻断项           (Gate G6)
```

> 每个 `→` 都是一道门。**没过门不要进下一阶段**——这正是 EOS 防返工的核心。
>
> **⚠️ 用 agent 前的头号前提**：在 VS Code 里必须把**项目文件夹本身**（含 `.github/` 的那一层）
> 作为工作区根打开——`File > Open Folder…` 选中它，或终端 `cd my-app && code .`。若你打开的是它的
> **父目录**，`eos-*` 自定义 agent 及 `.github/instructions|hooks` 会**全部静默失效**（详见 7.2 排障）。

---

# 第 2 章 一次性环境准备

> 这些步骤每台机器只做一次。已经做过的可跳过（本机已就绪）。

## 2.1 前置清单

| 组件 | 要求 | 自检命令 |
|---|---|---|
| macOS | 任意近期版本（zsh） | `sw_vers` |
| VS Code | 较新版本（自定义 agent / hooks 需近版） | 关于面板查看真实版本（`code --version` 可能是 shim，不准） |
| GitHub Copilot | 已登录（企业 license 仅作 license，不作配置依赖） | Chat 面板可用 |
| Node.js | 18+（验证器与 hooks 用） | `node -v` |
| BMAD skills | 73 个 `bmad-*`（用户级） | `ls ~/.agents/skills | grep -c '^bmad-'` |

## 2.2 BMAD skills 在哪

```
~/.agents/skills/     # 73 个 bmad-*（+ 其它 gds-/wds-，共 121）
~/.claude/skills/     # 镜像，同上
```
这些是**用户级**、跨所有项目共享的。EOS 通过 prompt/agent 里的 `bmad-*` 名称来调用它们，
**不需要把它们复制进项目**。

## 2.3 用户级 agents 目录（可选）

若你想把某些 `eos-*.agent.md` 提升为"所有项目通用"，放到：
```
~/.copilot/agents/
```
（注意：是 `~/.copilot/agents`，不是 VS Code User 目录；这是实测确认的路径。）

## 2.4 Hooks 成熟度说明

- Hooks 是 VS Code 的 **Preview** 功能；`.github/hooks/*.json` **默认即加载**，无需额外开关。
- `chat.useCustomAgentHooks` 只管 `.agent.md` 里内嵌的 hooks，与工作区 `.github/hooks/` 无关。

---

# 第 3 章 新项目 Day-1 Bootstrap

## 3.1 三种创建方式（任选其一）

**方式 A — degit（推荐，最快）**
```sh
# 私有模板必须加 --mode=git
npx degit --mode=git niaodian/eos-template my-new-app
cd my-new-app
git init && git add -A && git commit -m "chore: scaffold from eos-template"
```

**方式 B — gh + GitHub template**
```sh
gh repo create my-new-app --template niaodian/eos-template --private --clone
cd my-new-app
```

**方式 C — VS Code 直接 New Repository from Template**（GitHub 网页 → Use this template）。

## 3.2 落地后第一件事：自检

```sh
node .github/hooks/validate-config.mjs      # 期望：PASS
```

看到 `PASS` 表示规则层、prompt、agent、hook 都健康，可以开干。

## 3.3 填项目专属事实

打开 `.github/instructions/00-workspace.instructions.md`，把它改成**你这个项目**的真实情况：
- `Local commands`：换成你的栈的 install/lint/test/typecheck 命令——**成品行直接抄** `docs/eos/stack-presets.md`（Node/Python/Go/Java/Rust/.NET 全栈配方册，复制对应一块即可）
- `Layout`：若目录结构不同，更新
- 其它跨项目通用信念**不要**写这里——那属于 R1（`copilot-instructions.md`）

## 3.4 Day-1 完整序列（复制即用）

```sh
npx degit --mode=git niaodian/eos-template my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos-template"
node .github/hooks/validate-config.mjs
# 关键：从项目目录内执行 `code .`，让 my-new-app 成为工作区根（含 .github/）。
# 不要打开它的父目录，否则自定义 agent / instructions / hooks 都不会被发现。
code .
```

---

# 第 4 章 核心概念（五种机制）

EOS 用 5 种 VS Code + Copilot 原生机制承载规则。**搞懂"何时被加载"是用好 EOS 的关键。**

| 机制 | 文件位置 | 何时进入上下文 | 你怎么触发 | EOS 中的角色 |
|---|---|---|---|---|
| **Instructions（指令）** | `.github/copilot-instructions.md`、`.github/instructions/**/*.instructions.md` | 自动：always-on 或按 `applyTo` glob 匹配文件类型 | 不用手动触发；编辑匹配文件即生效 | 规则层（编码规范、安全红线、栈约定） |
| **Prompts（斜杠命令）** | `.github/prompts/*.prompt.md` | 按需：你输入 `/name` 时 | Chat 里输入 `/requirements` 等 | 工作流（单个可复用任务） |
| **Agents（角色）** | `.github/agents/*.agent.md` | 切换：你选中某 agent 时持续生效 | Chat 的 agent 选择器切换 | 阶段编排者（持久 persona + 工具限制 + handoffs） |
| **Skills（能力）** | `.github/skills/*/SKILL.md`（项目级）、`~/.agents/skills/bmad-*`（用户级） | 按相关性自动加载，或被 agent 点名调用 | Agent 自动用，或在 prompt 里写 `bmad-xxx` | 可移植能力（复用 BMAD + 新建补强） |
| **Hooks（护栏）** | `.github/hooks/*.json` + 脚本 | 生命周期事件触发（PreToolUse 等） | 自动；无需手动 | 确定性护栏（拦危险操作、跑质量门） |

## 4.1 关键认知：没有"原生优先级"

官方明确：存在多份 instructions 时**会被合并加入上下文，顺序不保证**。
所以 EOS **从不依赖"规则 A 覆盖规则 B"**。控制冲突的唯一可靠手段是：
1. **`applyTo` 作用域**：用互斥 glob 让每条规则只在该类文件生效；
2. **单一职责**：一个文件只管一个主题；
3. **Hooks**：需要"确定性"的约束（如拦 `rm -rf /`）交给 hook，不靠 Agent 自觉。

## 4.2 always-on 是最稀缺资源

`copilot-instructions.md`（R1）会进入**每一次**会话，所以它必须极简（≈40 行）：只放
"跨项目、永远成立"的工程信念（真相源、复用优先、安全红线、运营意识）。
**能用窄作用域（applyTo）就绝不用 always-on。**

---

# 第 5 章 心智模型：分层规则 + 决策门

## 5.1 规则十层（R1–R10）

| 编号 | 名称 | 落地文件 | 作用域 |
|---|---|---|---|
| R1 | Global 全局信念 | `.github/copilot-instructions.md` | always-on（`**`） |
| R2 | Workspace 仓库事实 | `instructions/00-workspace.instructions.md` | `**`（本仓库） |
| R3 | Frontend | `instructions/frontend/10-frontend.instructions.md` | `**/*.{tsx,jsx}` |
| R4 | Backend | `instructions/backend/10-backend-node.instructions.md`（+python） | `**/*.ts`（/ `**/*.py`） |
| R5 | Data & API | `instructions/data-api/20-data-api.instructions.md` | `**/*.{sql,prisma}` |
| R6 | Testing | `instructions/testing/30-testing.instructions.md` | `**/*.{test,spec}.*` |
| R7 | Security | `instructions/security/40-security.instructions.md` | `**`（薄护栏） |
| R8 | Release & Ops | `instructions/release-ops/50-release-ops.instructions.md` | `**/{Dockerfile,*.yml,*.yaml}` |
| R9 | Agent 编排 | `.github/agents/eos-*.agent.md` | 切换时 |
| R10 | Workflow | `.github/prompts/*.prompt.md` | 调用时 |

> 注意 R1 与 R2、R7 都用 `**`：这是**合法共存**（薄、互补、单一职责），不是冲突。
> 验证器 S3 检查会**豁免 `**`**，正因如此。

## 5.2 决策门十关（G1–G10）

| 门 | 阶段 | 通过标准（不过则不进下一阶段） |
|---|---|---|
| G1 | Discovery | 问题是一句可证伪陈述 + 成功指标可度量 |
| **G2** | Requirements | **五张清单无未决 BLOCKER（必过硬门）** |
| G3 | Spec | 每条需求有 ≥1 可度量验收标准 |
| G-UX | UX & Design（条件） | 面向用户：每条需求有屏幕/流程/四态/a11y/视觉token；纯后端 SKIP+理由 |
| G-EVAL | Eval（条件·LLM/agentic） | 每条 LLM 支撑的 AC 有 eval 用例+grader+阈值；含注入/成本用例；纯确定性功能 SKIP+理由 |
| G4 | Architecture | 不可逆决策有 ADR；NFR/扩展/容灾各有显式设计 |
| G5 | Planning | 每个 story 上下文自包含、可独立实现、含 AC |
| G6 | Development | lint/typecheck/单测全绿（hook 质量门）+ 代码审查无阻断项 |
| G7 | Testing | 每条 AC ≥1 测试且全绿；trace 矩阵完整 |
| **G8** | Release | **质量+审计+回滚+灰度+NFR 五项门禁全过（必过硬门）** |
| G9 | Observability | 关键路径埋点在产、指标可见 |
| G10 | Iteration | 每个变更回写 Spec 真相源 |

**G2 和 G8 是两道硬门**：前者堵"上线后返工"，后者堵"带病上线"。

> **哪些门可机器强制**：配置合规（`validate-config.mjs`，S1–S11）、G-EVAL（`eos-doctor.mjs`：有 `ai/llm/rag` 代码却无 `docs/eval-plan.md` → 报错）、G6 质量与 G7 测试/评估（`npm test`/evals）——这些都由本地 CI `.github/workflows/eos-ci.yml`（`act push`，需 Docker）在合并/发布前批量跑。其余偏内容/判断的门（G1/G3/G4/G5/G-UX/G10）靠 prompt+清单+人审。

---

# 第 6 章 全生命周期实操（idea → 迭代）

> 这是手册核心。10 个阶段，每个都给：**目标 / 何时进入 / 怎么启动（精确命令）/ 输入 / 产出 /
> 决策门 / 必查项 / 防返工要点 / 样例**。
> 样例统一引用 `my-app`（功能：用户登录）的真实产物，路径见每节"样例"。
> 约定：`（agent）xxx` = 在 Chat 切换到该 agent；`/xxx` = 在 Chat 输入斜杠命令；
> `` `cmd` `` = 在终端执行。

## 全景图

```
 idea
  │
  ▼
[1] Discovery ─G1→ [2] Requirements ─G2→ [3] Spec ─G3→ [3.5] UX&Design ─G-UX→
[4] Architecture ─G4→ [5] Planning ─G5→ [6] Development ─G6→ [7] Testing ─G7→
[8] Release ─G8→ [9] Observability ─G9→ [10] Iteration ─G10→（回流驱动下一轮 [2]）⟲
```

---

## 阶段 0 — 项目初始化（一次性）

| 项 | 内容 |
|---|---|
| **目标** | 从模板得到一个配置健康的空项目 |
| **怎么启动** | `npx degit --mode=git niaodian/eos-template my-app && cd my-app` |
| **产出** | 完整 `.github/` + `docs/` 骨架 |
| **门** | `node .github/hooks/validate-config.mjs` → **PASS** |
| **必查** | PASS 0 errors；改 `00-workspace` 填本项目 install/lint/test 命令 |
| **打开方式** | 从 `my-app/` 内执行 `code .`——让**项目本身**成为工作区根。打开父目录会导致 agent/instructions/hooks 全部不生效（见 7.2）。 |
| **样例** | `my-app/` 全树（44 文件，validate PASS） |

---

## 阶段 1 — Discovery（问题定义）

| 项 | 内容 |
|---|---|
| **目标** | 把"模糊的 idea"收敛成**一句可证伪的问题 + 可度量成功指标 + 已知约束** |
| **何时进入** | 你有一个想法但还说不清"成功长什么样" |
| **怎么启动** | Chat 切到 **`（agent）eos-discovery`**；它会调用 `bmad-brainstorming` + `bmad-agent-analyst`（Mary），可选用 `bmad-forge-idea` 压力测试 |
| **输入** | 原始想法（口述即可） |
| **产出** | `docs/discovery.md`：问题陈述、证伪条件、成功指标表、scope-in/out |
| **决策门 G1** | ☑ 问题是一句可证伪陈述 ☑ 成功指标可度量 |
| **必查项** | 写得出"失败长什么样"吗？指标有数值和数据来源吗？范围外（不做什么）写了吗？ |
| **防返工** | 这是最廉价的纠错点。问题没锁定就往下做，后面每一步都在放大偏差。 |
| **样例** | `my-app/docs/discovery.md`（登录成功率≥98%、p95≤300ms 等 4 个可度量指标） |

**完成判据**：能向同事用一句话讲清"我们在解决什么问题、怎么知道解决了"。

---

## 阶段 2 — Requirements（需求分析 + 运营前置）★ 硬门

| 项 | 内容 |
|---|---|
| **目标** | 展开功能需求 + NFR + **把运营需求前置**（埋点/权限/回滚…），堵死"上线后返工" |
| **何时进入** | G1 通过、`docs/discovery.md` 就绪 |
| **怎么启动** | Chat 输入 **`/requirements "<feature>"`**（包裹 `bmad-create-prd` + skill `eos-operational-readiness`） |
| **输入** | `docs/discovery.md` |
| **产出** | `docs/requirements.md`，**顶部带"Operational Pre-Flight Decision Table"** |
| **决策门 G2（硬门）** | 五张清单 A/B/C/D/E 全部走查（**受监管行业再加第六张 F-compliance**），**任何未决项 = BLOCKER，不清零不得进 Spec** |
| **必查项** | 运营前置 11 项（telemetry/authz/audit/rollback/monitoring/canary/quota/i18n/multi-tenancy/capacity-SLO/DR）每项三选一：**ADOPT / SKIP+理由 / DEFER+触发条件**，禁止留空 |
| **防返工** | 用"反向提问法"逼出隐性需求：谁**无权**做？做错怎么**回滚**？怎么**知道**线上有没有用？×100 用户会怎样？ |
| **样例** | `my-app/docs/requirements.md`（11 项决策表 + authz 矩阵 + A/B/C/D 走查结论无 BLOCKER） |

**五张清单**（完整内容在 `docs/checklists/`；**受监管行业再加第六张 F**）：
- **A-gap**：需求缺口（可证伪、验收可度量、边界/异常/并发、依赖、scope-out、重叠排查）
- **B-rework**：上线后高概率补做（埋点/authz/审计/回滚/告警/灰度/限流/i18n/空错态/迁移可逆）
- **C-nfr**：非功能需求（性能/容量/可用性容灾/安全合规/可观测/可维护/a11y，逐项填目标值）
- **D-ops**：运营前置（埋点↔指标闭合/权限矩阵/审计范围/回滚预案/灰度阈值/配额/多租户/i18n/容量告警/Runbook 责任人）
- **E-security**：安全与机密（密钥不入代码/前端、`.env` 治理、供应链投毒防护、配置权限隔离、密钥轮换）
- **F-compliance**（**仅受监管行业**）：具名制度选择（HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL）→ 级联控制（数据驻留、审计留存期、最小必要、供应商 **BAA/DPA**、**Agentic 数据出境**决策）

> **受监管行业（医疗/金融等）请在需求阶段就定制度**：`/requirements` 的 **Step 2.5 制度前置**逼你先答"是否适用 HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL"，选中即走 `F-compliance.md`（专用命令 **`/compliance`**：制度选择→数据驻留/审计留存/最小必要/供应商 BAA/DPA/Agentic 数据出境），把这些**在架构定型前**落地——避免上线后推倒重来。**尤其**：LLM/agent 产品若涉 PHI/PAN/受监管个人数据，必须当场定"数据出境"方案（签 BAA/DPA · 自托管模型 · 脱敏网关 · 排除受监管数据），晚决 = 换模型换架构。结果记入 `docs/compliance-profile.md`。
> **非法律意见**：EOS 只强制早期工程决策，**不替代**合规官/法务/审计师签核。`【新建补强】`

> 配套命令：`/nfr` 专门把 C-nfr 逐行填上具体目标值。

---

## 阶段 3 — Spec（PRD = 唯一真相源）

| 项 | 内容 |
|---|---|
| **目标** | 把需求固化成 PRD，成为下游唯一认可的真相源 |
| **何时进入** | G2 通过、`docs/requirements.md` 无 BLOCKER |
| **怎么启动** | Chat 输入 **`/spec`**（用 `bmad-create-prd` 起草，用 `bmad-validate-prd` 校验） |
| **输入** | `docs/requirements.md` |
| **产出** | `docs/prd.md`：每条 FR 带验收标准 + NFR 段（来自 C-nfr，不留空） |
| **决策门 G3** | ☑ 每条需求有 ≥1 可度量验收标准 |
| **必查项** | 验收标准能写成测试吗？NFR 段有没有照搬 C-nfr 的目标值？scope-out 写了吗？ |
| **防返工** | PRD 即契约。从此下游只认 `docs/prd.md`；任何"我以为"都要回来改 PRD。 |
| **样例** | `my-app/docs/prd.md`（FR1–FR5，每条配 AC1.1…AC5.3） |

---

## 阶段 3.5 — UX & Design（视觉 + 体验契约）★ 条件门

| 项 | 内容 |
|---|---|
| **目标** | 动手架构/实现前定下"长什么样 + 怎么交互"，产出两份对等契约 |
| **何时进入** | G3 通过、`docs/prd.md` 就绪。**面向用户的产品必做**；纯后端/API/CLI 项目可 SKIP |
| **怎么启动** | Chat 输入 **`/ux-spec`**（包裹 `bmad-ux`）或切到 **`（agent）eos-design`**；问题仍模糊用 `bmad-cis-design-thinking`(Maya)，要强主张用 `bmad-agent-ux-designer`(Sally) |
| **输入** | `docs/prd.md` |
| **产出** | `docs/DESIGN.md`（视觉身份：token/字体/色彩/间距）+ `docs/EXPERIENCE.md`（信息架构/用户流/屏幕状态/交互/a11y/旅程） |
| **决策门 G-UX** | ☑ 每条面向用户需求有屏幕/流程 ☑ loading/empty/error/success 四态齐全 ☑ a11y 基线（键盘/焦点/标签/对比度）☑ 用 DESIGN.md 命名 token、不硬编码；纯后端 → 在 `EXPERIENCE.md` 写 `SKIP — 无用户界面（理由）` |
| **必查项** | 每个屏幕的空/错/载入态都定义了吗？关键操作可纯键盘完成吗？颜色/间距是引用 token 还是写死？ |
| **防返工** | UX 契约**先于**架构与实现：架构据此定 API/数据、story 据此引用屏幕、前端规则与埋点据此落地。两份契约对任何后来的 mock/import 有最终解释权。 |
| **可跳过** | 纯后端/CLI：一行 `SKIP + 理由` 即过门，不阻塞。 |

> 复用说明【BMAD + 补强】：能力来自 `bmad-ux` / `bmad-agent-ux-designer`(Sally) / `bmad-cis-design-thinking`(Maya)，
> EOS 只新增编排（`/ux-spec` prompt + `eos-design` agent + G-UX 门），**不重建设计能力**。

---

## 阶段 4 — Architecture（方案 + 数据模型 + API 契约 + ADR）

| 项 | 内容 |
|---|---|
| **目标** | 技术方案、数据模型、API 契约、NFR 落点、关键决策留痕（ADR） |
| **何时进入** | G3 通过、`docs/prd.md` 就绪 |
| **怎么启动** | Chat 切到 **`（agent）eos-architecture`**（调用 `bmad-architecture`/Winston）；对每个不可逆决策跑 **`/adr`** |
| **输入** | `docs/prd.md`、`docs/EXPERIENCE.md`+`docs/DESIGN.md`（若做了 UX 阶段）、`docs/checklists/C-nfr.md` |
| **产出** | `docs/architecture.md`、`docs/data-model.md`、`api/openapi.yaml`、`docs/adr/NNN-*.md` |
| **决策门 G4** | ☑ 扩展性/弹性/容灾/安全各有显式设计（不是"以后再说"）☑ 每个不可逆决策有 ADR |
| **必查项** | API 契约**先于**实现写好了吗？ADR 有没有列备选方案和 trade-off？NFR 每项有落点吗？ |
| **防返工** | "API 先于实现"让前后端可并行、契约可被测试锚定；ADR 防团队失忆。 |
| **样例** | `my-app/docs/adr/0001-session-strategy.md`（3 方案对比 + trade-off）、`my-app/api/openapi.yaml`（先于 src/auth.js 写） |

**ADR 模板要素**（`/adr` 自动生成）：Status / Context / Decision / Consequences（侧重 1-N 扩展与可逆性）/ Alternatives considered。一文件一决策，从 `docs/architecture.md` 链接。

---

## 阶段 5 — Planning（拆 Epics→Stories）

| 项 | 内容 |
|---|---|
| **目标** | 把架构拆成可独立实现、上下文自包含的 story |
| **何时进入** | G4 通过 |
| **怎么启动** | Chat 切到 **`（agent）eos-plan`**（`bmad-create-epics-and-stories` → `bmad-create-story` → `bmad-sprint-planning`），对每条 AC 用 **`bmad-testarch-atdd`** 先设计验收测试；**若含 LLM/agentic 组件,再跑 `/eval-spec` 设计评估集(G-EVAL)**;最后用 `bmad-check-implementation-readiness` 验就绪 |
| **输入** | `docs/prd.md`、`docs/architecture.md`、`docs/EXPERIENCE.md`（若做了 UX 阶段） |
| **产出** | `docs/epics/*`、`docs/stories/*.md`（每个含**验收测试大纲**）**、`docs/eval-plan.md`（LLM 功能）** |
| **决策门 G5** | ☑ 每个 story 上下文自包含 ☑ 可独立实现 ☑ 含 AC **且每条 AC 有验收测试设计（ATDD）** ☑ 把 telemetry/authz/rollback 落成具体任务 **☑ LLM 功能有 eval-plan（G-EVAL）或显式 SKIP** |
| **必查项** | 开发者拿到这个 story，**不回头翻别处**就能开工吗？DoD 写了吗？**每条 AC 的验收测试意图定义了吗**？**LLM 功能的 eval 集/grader/阈值定了吗**？ |
| **防返工** | "就绪门"防开发中途缺上下文；**测试左移**让验收标准在写码前就可测，防"事后补测凑覆盖率"；**eval 左移**让非确定的 LLM 输出在写码前就有可度量基线。 |
| **样例** | `my-app/docs/stories/story-001-auth.md`（AC + 自包含 context + DoD = Ready） |

---

## 阶段 6 — Development（按 story 实现）

| 项 | 内容 |
|---|---|
| **目标** | 实现 story，受栈规则 + 护栏约束，**完成前过代码审查** |
| **何时进入** | G5 通过、story = Ready |
| **怎么启动** | Chat 输入 **`bmad-dev-story`** 实现（快速场景用 `bmad-quick-dev`）；实现后跑 **`bmad-code-review`**（三路对抗审查：Blind Hunter / Edge Case Hunter / Acceptance Auditor），解掉阻断项再进 G7 |
| **输入** | `docs/stories/story-XXX.md` |
| **产出** | `src/` 代码 + 对应测试 + **代码审查结论（阻断项已解）** |
| **自动生效的规则** | 编辑 `.tsx/.jsx`→R3 前端规则；`.ts`→R4 后端；`.sql/.prisma`→R5；`.test.*`→R6；**全部** `**`→R1+R2+R7（按 applyTo 自动注入，你无需手动加载） |
| **护栏（自动）** | **PreToolUse** `deny-dangerous.js` 拦截 `rm -rf /`、`DROP TABLE`、`git push --force` 等；**PostToolUse** `quality.json` 跑 lint+typecheck+test |
| **决策门 G6** | ☑ lint/typecheck/单测全绿（质量门 hook 放行）☑ **代码审查无阻断项（`bmad-code-review`）** |
| **必查项** | 危险操作真的被拦了吗？质量门是不是因为缺 `package.json` test 脚本而空跑？**代码审查跑了吗？阻断项都解了还是被无声跳过**？ |
| **防返工** | Hooks 把约束从"靠 Agent 自觉"变成"确定性拦截"；**代码审查补上自动化查不出的设计/逻辑/边界/安全盲区**——两者互补，缺一不可。 |
| **样例** | `my-app/src/auth.js`（零依赖 `node:crypto`）；质量门模拟 exit 0、10/10 测试通过 |

> 质量门要真正生效，项目 `package.json` 需有 `test`（及可选 `lint`/`typecheck`）脚本，
> 否则 hook 会 `--if-present` 空跑。my-app 的最小 `package.json`：`{"scripts":{"test":"node --test"}}`。

---

## 阶段 7 — Testing（验证 + 可追溯）

| 项 | 内容 |
|---|---|
| **目标** | 按测试策略验证，建立 spec↔test 可追溯，并**验证 NFR 目标** |
| **何时进入** | G6 通过 |
| **怎么启动** | Chat 输入 **`bmad-tea`**（Murat）/ `bmad-testarch-test-design` / `bmad-testarch-automate` / `bmad-testarch-trace` / **`bmad-testarch-nfr`** / `bmad-qa-generate-e2e-tests`；**LLM 功能:按 `docs/eval-plan.md` 跑 eval 集 + 回归基线** |
| **输入** | `docs/prd.md`（AC 清单）、**`docs/checklists/C-nfr.md`（NFR 目标值）**、**`docs/eval-plan.md`（LLM 功能）**、`src/` 代码 |
| **产出** | 测试套件 + `docs/trace-matrix.md`（AC ↔ 测试映射）+ **NFR 验证结果** + **eval 结果（LLM 功能）** |
| **生效规则 R6** | 金字塔结构；**每条 AC ≥1 测试**；`describe(<criterion id>)` 命名；无真实计时器/无顺序依赖；改动行覆盖率 ≥80%；**NFR 目标用 `bmad-testarch-nfr` 验证**；**LLM 输出用 eval 集+grader 验(非 exact-match),见 `ai/10-ai-llm` 规则** |
| **决策门 G7** | ☑ 每条 AC ≥1 测试 ☑ 全绿 ☑ trace 矩阵完整 ☑ **NFR 目标已验证或显式标 deferred+trigger** ☑ **LLM 功能:eval 达基线阈值、无回归(G-EVAL)** ☑ **spec-alignment 量化（`/spec-align`：AC 覆盖率/一次过率/无漂移）** |
| **必查项** | 有没有"没被任何测试覆盖的 AC"？**C-nfr 里定的 P95/吞吐/SLO 有没有被验证**（而不是定了就忘）？延后的有没有显式标 trigger？**LLM 的 eval 分达阈值了吗?prompt/模型改动有没有跑回归?** |
| **防返工** | trace 矩阵让"漏测的验收标准"无所遁形；**NFR 验证让"定了目标却没人验"无所遁形**；**eval 回归让"改 prompt 改崩了别处"无所遁形**。 |
| **样例** | `my-app/test/auth.test.js`（10 个 AC-traced 测试全绿）、`my-app/docs/trace-matrix.md`（11/12 AC 有测试，1 个性能项显式 deferred） |

---

## 阶段 8 — Release（发布门禁）★ 硬门

| 项 | 内容 |
|---|---|
| **目标** | 过质量/安全/回滚/灰度/NFR 门后才发布 |
| **何时进入** | G7 通过 |
| **怎么启动** | Chat 输入 **`/release-gate`**；缺 runbook 就先 **`/runbook <service>`** |
| **输入** | 测试结果、NFR 验证结果、`ops/runbook-*.md` |
| **产出** | 发布门禁报告（逐项 PASS/FAIL）、`ops/runbook-<service>.md` |
| **决策门 G8（硬门）** | 逐项核验：① 质量门绿（lint+typecheck+test）② 依赖审计干净（`npm audit`/`pip-audit`）③ **NFR 目标已验证（G7 的 `bmad-testarch-nfr`，延后项带 trigger）** ④ 回滚预案可执行 ⑤ 灰度策略有文档 ⑥ health/readiness 端点 ⑦ `validate-config.mjs` PASS。**任一 FAIL 阻断发布** |
| **必查项** | 回滚步骤是"可执行的精确步骤"还是空话？灰度延后的有没有写 trigger？审计 0 漏洞吗？**NFR 目标验了没**？ |
| **防返工** | 无回滚/无灰度/NFR 未验不得上线——堵"带病上线"。 |
| **样例** | `my-app/docs/release-gate.md`（适用项全过、`npm audit` 0 vulns）、`my-app/docs/trace-matrix.md`（性能 NFR 项显式 deferred+trigger）、`my-app/ops/runbook-auth.md`（`FEATURE_LOGIN=off` 回滚） |

---

## 阶段 9 — Observability（埋点落地 + 运营闭环）

| 项 | 内容 |
|---|---|
| **目标** | 埋点上线、指标可见、形成运营闭环 |
| **何时进入** | G8 通过 / 发布后 |
| **怎么启动** | Chat 输入 **`/telemetry-plan`** |
| **输入** | `docs/discovery.md`（成功指标）、代码中的事件 |
| **产出** | `docs/telemetry-plan.md`：事件清单（名/触发/属性）、事件↔指标映射、告警阈值、审计覆盖 |
| **决策门 G9** | ☑ 关键路径埋点在产 ☑ **每个成功指标 ≥1 backing event** |
| **必查项** | 阶段 1 定的每个成功指标，都有对应埋点事件吗？敏感操作有审计吗？告警阈值定了吗？ |
| **防返工** | 埋点在**需求阶段**就设计（D-ops），这里只做落实校验——避免上线后才发现"没法量化效果"。 |
| **样例** | `my-app/src/auth.js` 发出 5 个 `auth.*` 事件（attempted/succeeded/failed/session.created/destroyed） |

---

## 阶段 10 — Iteration（迭代 / 扩展 / 演进）

| 项 | 内容 |
|---|---|
| **目标** | 指标回流驱动下一轮需求；管理变更与架构演进 |
| **何时进入** | 上线运营后、有数据/反馈 |
| **怎么启动** | Chat 切到 **`（agent）eos-review`**（`bmad-correct-course` 变更管理、`bmad-retrospective` 复盘、`bmad-document-project` 棕地文档、`bmad-sprint-status`） |
| **输入** | `docs/telemetry-plan.md` 的指标、用户反馈 |
| **产出** | 变更提案、下轮 backlog、retro 笔记、更新的 ADR |
| **决策门 G10** | ☑ 每个变更经影响分析 ☑ **回写 Spec 真相源**（改 `docs/prd.md` 等） |
| **必查项** | 变更只改了代码、忘了回写 PRD 吗？（那就是 spec/code 漂移，反模式 P10） |
| **防返工** | `eos-review` 的 handoff 直接把你带回 `/requirements`，闭环成下一轮 [2]。 |
| **样例** | `my-app/docs/prd.md §6 Iteration Log`：由埋点观察触发 CR-001，回写进 PRD |

---

## 6.x 阶段速查表（一页纸）

| 阶段 | 启动方式 | 产物 | 门 |
|---|---|---|---|
| 1 Discovery | `（agent）eos-discovery` | `docs/discovery.md` | G1 |
| 2 Requirements | `/requirements "<f>"` | `docs/requirements.md` | **G2★** |
| 3 Spec | `/spec` | `docs/prd.md` | G3 |
| 3.5 UX & Design | `/ux-spec`（或 `（agent）eos-design`） | `DESIGN.md`+`EXPERIENCE.md` | G-UX（条件） |
| 4 Architecture | `（agent）eos-architecture` + `/adr` | `architecture.md`+`openapi.yaml`+`adr/*` | G4 |
| 5 Planning | `（agent）eos-plan` | `docs/stories/*` | G5 |
| 6 Development | `bmad-dev-story` → `bmad-code-review` | `src/*` + 审查结论 | G6 |
| 7 Testing | `bmad-tea`/`bmad-testarch-*` | tests + `trace-matrix.md` | G7 |
| 8 Release | `/release-gate`（+`/runbook`） | 门禁报告 + runbook | **G8★** |
| 9 Observability | `/telemetry-plan` | `docs/telemetry-plan.md` | G9 |
| 10 Iteration | `（agent）eos-review` | 变更提案 + 回写 PRD | G10 |

---

# 第 6.5 章 两条上手路径（SaaS vs Agentic · 小白友好）

> 前面第 6 章讲了完整的 10 阶段。这一章把它落成**两条可照抄的具体路径**：一条做**传统 SaaS 软件**
> （确定性），一条做 **Agentic/LLM 产品**（概率性）。两条路径**主干相同**（都走 G1→G10），只在
> 少数阶段有专属动作。**你不需要背这些——照着抄命令即可。**

## 6.5.0 先搞清：我这个项目是哪一类？

| 问自己 | 传统 SaaS | Agentic/LLM |
|---|---|---|
| 核心逻辑是确定的吗？（同样输入→同样输出） | ✅ 是 | ❌ 否（LLM 有随机性） |
| 有没有"调用大模型/RAG/agent"？ | 否 | ✅ 有 |
| 例子 | 电商后台、CRM、订单系统、管理面板 | 智能客服、RAG 问答、AI 助手、多 agent 工作流 |
| 关键难点 | 事务一致性、并发、权限 | 幻觉、评估、成本、prompt 注入 |

> **混合项目**（如"SaaS 后台 + 一个 AI 客服模块"）：主体走 SaaS 路径，AI 模块那部分**额外**走
> Agentic 路径的专属步骤（下面标 🟣 的）。EOS 的规则是**按目录自动生效**的——AI 代码放 `ai/`/`llm/`/`rag/`
> 目录，就会自动叠加 Agentic 规则，其余代码走后端栈规则。两套机制**不会打架**（见第 6.5.3）。

---

## 6.5.1 路径 A — 传统 SaaS 软件（确定性）

**示例目标**：做一个"待办事项 API"（增删改查 + 用户隔离）。全程复制命令即可。

### 第 0 步：建项目 + 选栈（5 分钟）
```sh
npx degit --mode=git niaodian/eos-template todo-api && cd todo-api
node .github/hooks/validate-config.mjs          # 期望 PASS
```
打开 `.github/instructions/00-workspace.instructions.md`，把 `Local commands` 换成你的栈。
后端选 Node？从 `docs/eos/stack-presets.md` 抄 Node 那块。（Python/Go/Java/Rust/.NET 同理。）

### 第 1–3 步：想清楚要做什么（Chat 里逐条输入）
```
（切到 agent）eos-discovery        → 产出 docs/discovery.md（问题+成功指标）
/requirements "待办事项的增删改查，支持多用户隔离"   → docs/requirements.md（G2 硬门：五张清单）
/compliance "医疗/金融等受监管才需"                → docs/compliance-profile.md（受监管加第六张 F；否则跳过）
/spec                              → docs/prd.md（每条需求带验收标准 AC）
```
> **G2 硬门必过**：五张清单 A/B/C/D/E 无未决项。SaaS 项目尤其注意 **C-nfr 的性能/容灾**、
> **D-ops 的权限矩阵/数据生命周期**、**E-security 的多租户隔离**。

### 🔵 第 4 步：架构（SaaS 专属重点）
```
（切到 agent）eos-architecture     → architecture.md + data-model + api/openapi.yaml
/adr "数据库选型"                   → 每个不可逆决策留一份 ADR
```
架构 agent 在 **G4** 会强制你的 SaaS 设计包含：
- **事务边界**（哪些写操作必须原子）、**幂等键**（重试安全）
- **确定性容错**：外部调用要有超时 + 指数退避 + 断路器（**不是** AI 那种反思重试）
- **API 契约先行**：`openapi.yaml` 先于实现；破坏性变更走新版本 + 弃用政策
- **多租户隔离**（若多租户）：每个查询按租户作用域，默认拒绝跨租户

### 第 5–6 步：拆 story + 写代码
```
（切到 agent）eos-plan             → docs/stories/*（每个 story 含验收测试设计 ATDD）
bmad-dev-story                     → src/ 代码（自动受后端栈规则约束）
bmad-code-review                   → 代码审查，解掉阻断项（G6 完成定义）
```
写代码时**自动生效**的 SaaS 规则（你无需手动加载，编辑对应文件就触发）：分层（Routes→Services→Repos）、
输入校验、事务/幂等、UTC 时间 + 货币用整数分/Decimal、OTel 可观测。

### 🔵 第 7 步：测试（SaaS 专属：契约 + DB 状态）
```
bmad-tea / bmad-testarch-*         → 单元 + 集成测试
/spec-align                        → 量化：AC 覆盖率 / 一次过率 / 漂移
```
SaaS 的 **G7** 要求：每条 AC ≥1 测试、**API 契约测试**（对 openapi.yaml）、**DB 状态集成测试**
（事务 commit/rollback、约束、幂等）、NFR 目标已验证。

### 第 8–10 步：发布 + 观测 + 迭代
```
/runbook todo-api                  → ops/runbook-todo-api.md（含回滚步骤）
/release-gate                      → G8 五项门禁（质量+审计+NFR+回滚+灰度）
/telemetry-plan                    → 埋点（SaaS 侧：QPS/延迟/5xx 黄金信号）
（切到 agent）eos-review            → 迭代回写 PRD
```

---

## 6.5.2 路径 B — Agentic / LLM 产品（概率性）

**示例目标**：做一个"智能客服 agent"（改订单地址，带工具调用）。与路径 A **主干相同**，
标 🟣 的是 **Agentic 专属**步骤。

### 第 0 步：建项目 + 建 AI 目录
```sh
npx degit --mode=git niaodian/eos-template cs-agent && cd cs-agent
mkdir -p ai/prompts evals                       # AI 代码放这里，自动叠加 Agentic 规则
node .github/hooks/validate-config.mjs          # 期望 PASS
```
栈选 Python（LLM 产品最常见）：从 stack-presets 抄 **Python + AI/LLM 附加层**那两块。

### 第 1–3 步：同路径 A（discovery → requirements → spec）
```
（切到 agent）eos-discovery
/requirements "客服 agent：用户下单后改寄送地址，需鉴权、防越权、防注入"
/compliance "涉 PHI/PAN/受监管个人数据才需"   → 受监管则当场定 Agentic 数据出境方案
/spec
```
> Agentic 项目在 **G2** 尤其要在 requirements 里把 **eval 成功指标**（准确率/一次过率）、
> **成本/token 预算**、**注入防御**写清楚——这些是概率性产品的命脉。

### 🟣 第 4 步：架构（Agentic 专属重点）
```
（切到 agent）eos-architecture     → architecture.md（agent 编排图 + 工具 allow-list）
/adr "编排策略：单趟状态机 vs ReAct 循环"
```
架构 agent 在 **G4** 会强制 Agentic 设计包含：
- **工具 allow-list**（typed schema，agent 只能调白名单内的工具）
- **有界编排**（状态机/图，禁止无界 self-invocation）
- **记忆分层**：短期（上下文窗口）/ 长期（向量库，最终一致）/ 强一致（仍归 SQL，**别拿向量库当真相源**）
- **异步解耦**：>1s 的 LLM 调用**不得**卡在 Web 请求线程里，走异步队列（Celery/BullMQ）
- **认知容错**（**不是** SaaS 那种退避）：工具/LLM 失败 → 捕获错误 → 注入 prompt → 有界反思重试 ≤N 次 → 降级

### 🟣 第 5 步：拆 story + **设计评估集（G-EVAL）**
```
（切到 agent）eos-plan
/eval-spec                         → docs/eval-plan.md（G-EVAL 条件门）
```
`/eval-spec` 让你**在写代码前**先定评估集——这是概率性系统的"ATDD"。评估集必须含：
黄金用例、**prompt 注入对抗用例**、RAG 召回率(recall@k)、工具调用准确率、成本/延迟预算。
> **不想从零写评估器？** 拷 `docs/eos/examples/eval-starter/`（零依赖可跑）改改即用。

### 🟣 第 6–7 步：写 AI 代码 + 跑评估
```
bmad-dev-story                     → ai/ 下的 agent/tools/chains + ai/prompts/ 版本化 prompt
bmad-code-review
node --test evals/*.test.mjs       → 跑评估基线（G-EVAL 机器强制：达标才能过）
```
写 AI 代码时**自动生效**的 Agentic 规则：prompt 存成文件（不内联字符串）、工具 typed schema、
temperature=0 可复现、把模型输出当**不可信**（防注入、输出审核、不放密钥/PII 进 prompt）、
LLM tracing（token/成本/context/tool-span）。

> **关键**：LLM 输出**不能用 exact-match 单测**（它是概率性的）——必须用**评估集 + grader + 回归基线**。
> 改了 prompt/模型跌破基线 = 不许发布。这是 SaaS 与 Agentic 最根本的测试差异。

### 第 8–10 步：发布 + LLM 观测 + 评估飞轮
```
/release-gate                      → G8（含 secret-scan + 评估基线）
/telemetry-plan                    → LLM 侧：token 消耗/context 占用/tool 链路 tracing
（切到 agent）eos-review            → 用户反馈 → 新评估用例 → 重定基线（评估飞轮）
```

---

## 6.5.3 两条路径的关键差异（一表看懂 · 避免范式污染）

| 维度 | 🔵 SaaS（确定性） | 🟣 Agentic（概率性） |
|---|---|---|
| **状态** | SQL 事务 + 幂等，强一致 | 短期上下文 / 长期向量库 / 强一致仍归 SQL |
| **容错** | 超时 + 指数退避 + 断路器 | 捕获错误 → 注入 prompt → 有界反思 → 降级 |
| **测试** | 单元 + **契约测试 + DB 状态集成测试**（exact-assert） | **评估集 + grader + 回归基线**（禁 exact-match） |
| **专属门** | G4 事务/韧性 | **G-EVAL**（评估）+ G4 异步解耦 |
| **可观测** | OTel + QPS/延迟/5xx | token/成本/context/tool-span |
| **执行模型** | 请求-响应即可 | >1s 调用走异步队列，别卡请求线程 |
| **命脉风险** | 事务不一致、并发、越权 | 幻觉、评估缺失、成本失控、prompt 注入 |

> ⚠️ **严禁互换**：别拿 SaaS 的指数退避去反复刷模型改逻辑错（烧 token 且不收敛）；也别拿 AI 的
> 反思去处理一个纯网络超时（那该用断路器）。EOS 的规则已把两套机制显式隔离，混合项目在 G4
> 由 `eos-architecture` 检查隔离点——但**你照抄上面的路径就不会错**。

---

# 第 7 章 完整参考（速查）

## 7.1 斜杠命令（`.github/prompts/`）

| 命令 | 作用 | 参数 | 产出 |
|---|---|---|---|
| `/requirements` | 需求分析 + 运营前置（包裹 bmad-create-prd） | `<feature 或 docs/discovery.md 路径>` | `docs/requirements.md` |
| `/spec` | 产出 PRD 真相源（bmad-create-prd + bmad-validate-prd） | `<docs/requirements.md 路径>` | `docs/prd.md` |
| `/ux-spec` | 设计 UX/UI 视觉+体验契约（包裹 bmad-ux） | `<docs/prd.md 路径>` | `docs/DESIGN.md` + `docs/EXPERIENCE.md` |
| `/eval-spec` | 设计 LLM/agentic 评估计划（条件门 G-EVAL） | `<docs/prd.md 路径>` | `docs/eval-plan.md` |
| `/spec-align` | 量化规范对齐度（AC 覆盖率/一次过率/漂移，G7 度量） | — | 对齐度报告（`spec-align.mjs`） |
| `/adr` | 记录一条架构决策 | `<决策标题>` | `docs/adr/NNN-*.md` |
| `/nfr` | 把 C-nfr 逐行填具体目标值 | — | 更新 `C-nfr.md` + PRD NFR 段 |
| `/compliance` | 受监管行业合规前置（制度选择+边界控制，条件用；走 F-compliance） | `<制度名 或 领域描述>` | `docs/compliance-profile.md` |
| `/telemetry-plan` | 设计埋点并对齐成功指标 | — | `docs/telemetry-plan.md` |
| `/release-gate` | 跑发布门禁（G8） | — | 门禁报告 |
| `/runbook` | 生成运维 runbook（含回滚步骤） | `<service 名>` | `ops/runbook-<service>.md` |
| `/validate-config` | EOS 配置静态+语义体检 | — | 问题表（不改代码） |

## 7.2 编排 Agents（`.github/agents/`）

| Agent | 阶段 | 复用的 BMAD | handoff 去向 |
|---|---|---|---|
| `eos-discovery` | 1 问题定义 | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea | → `/requirements` |
| `eos-design` | 3.5 UX/设计 | bmad-ux, bmad-agent-ux-designer(Sally), bmad-cis-design-thinking(Maya) | → `eos-architecture` |
| `eos-architecture` | 4 架构 | bmad-architecture（Winston） | → `eos-plan` |
| `eos-plan` | 5 计划 | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd | → `bmad-dev-story` → `bmad-code-review` |
| `eos-review` | 10 迭代 | bmad-correct-course, bmad-retrospective, bmad-document-project | → `/requirements`（下一轮） |

> **如何切换 agent**：Copilot Chat 输入框的 mode/agent 选择器 → 选中目标 agent（如 `eos-discovery`）。
> 切换后该 persona 持续生效（含其 `tools` 限制与 `handoffs`），直到你再次切换。
>
> **⚠️ 只看到 "Agent / Ask / Plan" + 「Configure Custom Agents…」，找不到 eos-* 自定义 agent？**
> **头号原因（90% 是这个）：你在 VS Code 里打开的不是项目根，而是它的父目录。** VS Code 只在**已打开的
> 工作区根**下扫描 `.github/agents/`（单层、非递归）。如果你打开的是一个「包含很多项目」的父文件夹
> （例如 `~/Developer/Projects/`，而项目在其子目录 `my-app/`），那么 `.github/` 不在根上 →
> **自定义 agent、`.github/instructions/`、`.github/hooks/` 会全部静默失效**（状态栏可能仍显示某个子仓库的
> git 分支名，很有迷惑性）。
>
> **30 秒自检（最重要）**：
> 1. VS Code 左侧 Explorer **顶层第一屏**能直接看到 `.github/`、`README.md` 吗？能 → 根正确；
>    看到的是一堆项目文件夹（`my-app/`、`other-app/` …）→ 你打开错了父目录。
> 2. 打开集成终端跑 `ls .github/agents`：若列出 5 个 `eos-*.agent.md` 但选择器仍空，几乎可断定是根打开错了。
> 3. **修复**：`File > Open Folder…` 选中**项目文件夹本身**（含 `.github/` 的那一层），或终端 `cd my-app && code .`。
>
> 排除"根"因素后，再按下面顺序排查（**不需要**把 `.github/agents/` 复制到用户级目录——
> `.github/agents/*.agent.md` 就是官方默认识别位置）：
>
> | 排查 | 做法 |
> |---|---|
> | ① 确认在**工作区根**打开 | 见上方 30 秒自检——这是最常见原因，务必先排除。 |
> | ② agent 文件有合法 `name` 吗 | 每个 `.agent.md` 的 frontmatter 必须有 `name:`，且只含小写字母/数字/连字符（`^[a-z0-9-]+$`）。跑 `node .github/hooks/validate-config.mjs`，S10 会报缺失/非法/重名。 |
> | ③ 重载窗口 | 新建/degit 项目后：命令面板 `Developer: Reload Window`，让 VS Code 重新扫描 agent 文件。 |
> | ④ 版本 | 自定义 agent 需较新的 VS Code + Copilot Chat。用「关于 VS Code」看真实版本（`code --version` 是 shim，不准）。`【需在你的版本中核实】` UI 入口位置随版本略有差异。 |
> | ⑤ 设置未被覆盖 | 检查 user/workspace `settings.json` 没有把 `chat.agentFilesLocations` 改成不含 `.github/agents`（默认即含，一般无需设置）。 |
>
> 仍不出现时的**替代路径**：直接用斜杠命令走流程——`/requirements`、`/compliance`、`/spec`、`/ux-spec`、`/eval-spec`、
> `/release-gate` 等 prompt 文件不依赖 agent 选择器，输入 `/` 即可看到。agent 只是"编排 persona"，
> 其能力都能用对应 prompt/skill 手动触发（见 7.1 与 `docs/eos/agent-map.md`）。

## 7.3 规则文件（`.github/instructions/`）

| 文件 | `applyTo` | 管什么 |
|---|---|---|
| `00-workspace.instructions.md` | `**` | 本仓库事实：目录布局、本地命令、Git 约定 |
| `frontend/10-frontend.instructions.md` | `**/*.{tsx,jsx}` | React/Next.js 组件规范、响应式/多端、a11y(WCAG AA)、i18n、性能预算/CWV |
| `backend/10-backend-node.instructions.md` | `**/*.ts` | Node/TS 分层、确定性韧性(断路器/退避)、事务/幂等、UTC/货币、OTel |
| `backend/10-backend-python.instructions.md` | `**/*.py` | FastAPI 路由→服务→仓储、Pydantic、韧性、事务、OTel |
| `backend/10-backend-go.instructions.md` | `**/*.go` | Go 分层、并发、韧性、OTel |
| `backend/10-backend-java.instructions.md` | `**/*.java` | Spring Boot 分层、事务、Resilience4j、Micrometer/OTel |
| `backend/10-backend-rust.instructions.md` | `**/*.rs` | Rust 分层、并发安全、韧性、tracing/OTel |
| `backend/10-backend-dotnet.instructions.md` | `**/*.cs` | .NET 分层、async/持久化、Polly、OTel |
| `ai/10-ai-llm.instructions.md` | `**/{ai,llm,rag}/**` | **Agentic 附加层**：prompt 即制品、tool/agent 架构、认知反思容错、记忆分层、异步解耦、评估、LLM 安全、tracing |
| `data-api/20-data-api.instructions.md` | `**/*.{sql,prisma}` | 数据建模、迁移、数据生命周期、多租户隔离、API 契约/弃用、时区/货币存储 |
| `testing/30-testing.instructions.md` | `**/*.{test,spec}.*` | 测试金字塔、AC 可追溯、契约+DB 状态集成测试、覆盖率门、NFR/eval 双轨 |
| `security/40-security.instructions.md` | `**` | 输入校验、deny-by-default、多租户、密钥、供应链、数据分级（薄护栏） |
| `release-ops/50-release-ops.instructions.md` | `**/{Dockerfile,*.yml,*.yaml}` | 可复现构建、发布前置、health 端点 |

> R1 全局信念在 `.github/copilot-instructions.md`（不在上表，因为它是 always-on 顶层文件）。

## 7.4 项目级 Skill（`.github/skills/`）

| Skill | 何时用 | 作用 |
|---|---|---|
| `eos-operational-readiness` | 阶段 2/4 | 强制对 10 项运营/NFR 做 ADOPT/SKIP/DEFER 决策，无空白 |
| `eos-compliance-skeletons` | 开发阶段（建 🟡 隐私控制时） | 指向可跑起步骨架（redaction/consent/DSAR/audit，Node/ESM + Python/stdlib 双实现），把"该建什么"变成"起步脚手架" |

> 73 个用户级 `bmad-*` skill 见 `docs/eos/agent-map.md` 的阶段映射表。

## 7.5 Hooks（`.github/hooks/`）

| 文件 | 事件 | 作用 |
|---|---|---|
| `guardrails.json` + `deny-dangerous.js` | PreToolUse | 拦截危险操作 + **供应链投毒（`curl\|bash`/`--unsafe-perm`）+ 硬编码密钥字面量**（输出 `permissionDecision:"deny"`） |
| `quality.json` | PostToolUse | 写文件后跑 lint+typecheck+test 质量门 |
| `config-check.json` | PostToolUse | 每次编辑后自动跑 `validate-config.mjs`（配置 S1–S11）**＋ `eos-doctor.mjs`（SDLC 门诊 / G-EVAL 连线 / 密钥扫描）** |
| `validate-config.mjs` | 手动/被 hook 调用 | 零依赖静态验证器（S1–S11：规则/agent/prompt frontmatter、glob、必需路径、hook 事件） |
| `eos-doctor.mjs` | **PostToolUse（逐编辑，经 `config-check.json`）** / 手动 / 被 CI 调用 | 零依赖 SDLC 门诊：G-EVAL、G-UX、**D4 密钥扫描（调 `secret-scan.mjs`）** |
| `secret-scan.mjs` | 手动 / 被 eos-doctor + CI 调用 | 密钥扫描：内置零依赖正则（硬编码密钥/私钥、误提交 `.env`）**＋ 若装了 `gitleaks` 自动叠加深度扫描**（`.gitleaks.toml` 白名单）；命中 exit 1、输出脱敏 |
| `spec-align.mjs` | 手动（`/spec-align`）/ 被 CI 调用 | 规范对齐量化：解析 `prd.md`+`trace-matrix.md` → AC 覆盖率 / 一次过率 / 漂移；`--strict` 命中即 exit 1 |

**手动测试护栏**（终端）：
```sh
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | node .github/hooks/deny-dangerous.js
# → {"hookSpecificOutput":{...,"permissionDecision":"deny",...}}
echo '{"tool_input":{"command":"ls"}}' | node .github/hooks/deny-dangerous.js
# → {}
```

**本地 CI（第三道强制层，需 Docker）**：EOS 除"实时 Hook + 配置静态校验"外，还提供 `act` 跑的全仓批量门。
```sh
act push -j verify            # 跑 .github/workflows/eos-ci.yml：validate-config + eos-doctor + tests + evals
act push --pull=false --action-offline-mode   # 首次拉过镜像后可完全离线
```
> 三道强制层各司其职：**Hook（逐编辑实时）**=`config-check.json` 每次编辑跑 `validate-config.mjs`+`eos-doctor.mjs`（配置合规 + G-EVAL 连线）、`quality.json` 跑质量门、`guardrails.json` 拦危险操作 · **静态校验（手动/按需）**=同两个脚本可随时手跑 · **act CI（合并/发布前全仓批量）**=`eos-ci.yml` 跑 validate-config+eos-doctor+tests+evals。同一门（如 G-EVAL）在逐编辑与 CI 两处都强制，早发现也防漏网。

## 7.6 六张需求清单（`docs/checklists/`；第六张仅受监管行业）

| 文件 | 名称 | 用途 | 在哪个门用 |
|---|---|---|---|
| `A-gap.md` | 需求缺口 | 可证伪/可度量/边界/依赖/scope-out/重叠 | G2 |
| `B-rework.md` | 上线后高概率补做 | 埋点/authz/审计/回滚/告警/灰度/限流/i18n/空错态/迁移可逆 | G2 |
| `C-nfr.md` | 非功能需求 | 性能/容量/容灾/安全/可观测/可维护/a11y 逐项填目标 | G2 + G4 |
| `D-ops.md` | 运营前置 | 埋点↔指标/权限矩阵/审计/回滚/灰度/配额/多租户/i18n/容量告警/Runbook | G2 |
| `E-security.md` | 安全与机密 | 密钥不入代码/前端/`.env` 治理、供应链投毒防护、配置权限隔离、密钥轮换 | G2 + G8 |
| `F-compliance.md` | 受监管行业合规（**仅受监管**） | 制度选择(HIPAA/PCI/SOC2/SOX/GDPR/CCPA/PIPL)→数据驻留/审计留存/最小必要/BAA·DPA/Agentic 数据出境 | G2 + G8 |
| `F-compliance-hipaa.md` | HIPAA 控制→落点映射（配套附录） | Security Rule 技术/管理/物理保障 + 最小必要/去标识 + 泄露通知 + 6 年留存，逐条对 EOS 真实落点（🟢/🟡/⚪ 三档） | G2 + G8 |
| `F-compliance-pci-dss.md` | PCI-DSS 控制→落点映射（配套附录） | v4.0 十二项 + Requirement 3 存储卡数据专表 + scope-reduction 战略（SAQ A） | G2 + G8 |
| `F-compliance-gdpr-pipl.md` | GDPR/PIPL 隐私控制→落点映射（配套附录） | 合法性/同意、DSAR（访问/删除/可携）、跨境传输（SCCs vs PIPL 安全评估）、ROPA/DPIA、72h 通知；含 GDPR↔PIPL 差异表 | G2 + G8 |

---

# 第 8 章 配置质检与验收

## 8.1 静态验证（每次改配置后必跑）

```sh
node .github/hooks/validate-config.mjs
```

| 检查 | 级别 | 含义 |
|---|---|---|
| S1 | error | 每个 `.instructions.md` 有合法 YAML frontmatter |
| S2 | warn | 每个 `.instructions.md` 有 `applyTo`（否则只能手动挂载） |
| S3 | error | 非 `**` 文件无重复 glob（`**` 合法共存，被豁免） |
| S4 | warn | 常见源码类型（如 .ts/.tsx/.py/.sql）都有规则覆盖 |
| S6 | warn | 文件名符合 `NN-area[-stack].instructions.md` 规范 |
| S7 | error | 必需路径/文件存在（copilot-instructions.md、instructions/、prompts/、agents/、hooks/、docs/eos/agent-map.md） |
| S9 | error | hook JSON 合法且 event 名有效 |
| S10 | error/warn | 每个 `.agent.md` 有 `name`（error，缺则 Chat 不按名列出）+ `description`（warn） |
| S11 | warn | 每个 `.prompt.md` 有 `description` |

> 期望输出：`PASS`。任何 **error** 必须先修复再继续；**warn** 视情况处理。
> （以上为当前 `validate-config.mjs` 实际实现的检查项。）

## 8.2 语义验证（定期 / 大改后）

Chat 输入 **`/validate-config`**：让 Agent 读 `.github/` 全量，检测规则矛盾、重复、
作用域过宽、失效链接，输出 `[文件][问题类型][严重度][建议]` 表，**不改代码**。

## 8.3 行为验收 Rubric（冒烟）

用一个最小 dry-run 功能（如"用户登录"）端到端跑 10 阶段，逐项打勾：

| 阶段 | 期望产出 | 通过标准 |
|---|---|---|
| Discovery | 单句问题+指标 | ☐ 可证伪 ☐ 有度量 |
| Requirements | PRD draft + 四清单 | ☐ 无未决 BLOCKER |
| Spec | `docs/prd.md` | ☐ 每条需求有 AC |
| Architecture | ADR + API 契约 | ☐ ADR 有 trade-off ☐ API 先于实现 |
| Planning | story 列表 | ☐ 每 story 含 AC+context |
| Development | 代码 + 过 hook | ☐ 合规代码不被拦 ☐ 危险指令被拦 |
| Testing | 测试 + trace | ☐ 每 AC ≥1 测试 ☐ 全绿 |
| Release | 门禁报告 | ☐ 五项门禁全过 |
| Observability | 埋点在产 | ☐ 关键路径可见 |
| Iteration | 回写 Spec | ☐ `docs/prd.md` 已更新 |

> 完整真实样例见**附录 C**（`my-app` 12/12 通过，报告在 `my-app/docs/eos/walkthrough.md`）。

---

# 第 9 章 故障定位与排错

## 9.1 失败定位决策树

```
Agent 输出不符预期
├─ 某类文件时规则不生效   → 检查该规则的 applyTo glob（validate-config S2/S3）
│                            常见：用了逗号串 "a,b" 而非花括号 "{a,b}"
├─ 规则被覆盖/互相矛盾     → 跑 /validate-config 语义检查；查多个 "**" 文件是否措辞冲突
├─ 斜杠命令不被识别       → prompt 缺 description frontmatter；文件名须 *.prompt.md
├─ 切了 agent 但没生效     → 确认在 Chat agent 选择器真正选中；查 *.agent.md 的 tools 是否过窄
├─ 危险操作没被拦         → deny-dangerous.js 的 schema；grep hookSpecificOutput.permissionDecision
├─ 质量门空跑/没拦        → package.json 缺 test/lint/typecheck 脚本（hook 用 --if-present）
├─ bmad-* 调不到          → 确认 ~/.agents/skills/ 下该 skill 存在；名称拼写
└─ 全局规则不生效         → 确认路径正好是 .github/copilot-instructions.md（S1）
```

## 9.2 "到底是规则、prompt、agent 还是 hook 的问题？"

| 症状 | 大概率根因 | 验证方法 |
|---|---|---|
| 只在某类文件错 | **规则**（applyTo） | 改个别的文件类型看是否复现 |
| 任何文件都错、措辞打架 | **规则**（多 always-on 冲突） | `/validate-config` |
| 输入 `/x` 没反应 | **prompt**（命名/frontmatter） | 看 `.github/prompts/x.prompt.md` 是否存在且有 description |
| 流程跳步、persona 不对 | **agent**（没切/handoff） | 看 Chat 当前 agent；看 handoffs 配置 |
| 危险命令通过 / 质量门没跑 | **hook**（schema/脚本/脚本缺脚本） | 用 7.5 的手动测试命令喂 JSON |

## 9.3 常见坑（实测）

- **VS Code 打开的是父目录而非项目根** → `eos-*` agent、`.github/instructions`、`.github/hooks` 全部静默失效（最常见坑）。从项目目录内 `code .`，Explorer 顶层应能直接看到 `.github/`（见 7.2 的 30 秒自检）。
- `code --version` 返回 `3.0.12` 是 shim，**不是真实版本**；真实版本看 VS Code 关于面板。
- 私有模板 `npx degit user/repo` 会失败 → 必须 `npx degit --mode=git user/repo`。
- PreToolUse 用错 schema（`decision:"block"` 是 PostToolUse 的）→ 拦不住。正确是 `hookSpecificOutput.permissionDecision:"deny"`。
- 多个 `applyTo:"**"` 文件**不是**冲突（薄、互补、单一职责），验证器 S3 已豁免。

---

# 第 10 章 跨项目复用与分发

## 10.1 什么放哪里（关键分层）

| 层级 | 位置 | 放什么 | 特性 |
|---|---|---|---|
| **用户级（跨所有项目共享）** | `~/.agents/skills/`、`~/.claude/skills/` | 73 个 `bmad-*` 通用能力 | 已装，不随项目走 |
| 用户级 agents（可选） | `~/.copilot/agents/` | 你想全局通用的 `eos-*.agent.md` | 所有项目可见 |
| **工作区级（随项目走）** | 项目 `.github/` + `docs/` | EOS 规则/prompt/agent/skill/hook + 文档 | 跟着 repo 走，团队共享 |

> 原则：**通用能力放用户级，项目专属放 `.github/`**。把项目专属塞进用户级 = 跨项目污染（反模式 P13）。

## 10.2 一键初始化新项目

```sh
# 方式 A：degit（私有库加 --mode=git）
npx degit --mode=git niaodian/eos-template my-app

# 方式 B：gh + template
gh repo create my-app --template niaodian/eos-template --private --clone
```

## 10.3 分发给团队（纯本地、无企业依赖）

1. 把 `eos-template` 设为 GitHub **template repo**（已设 `isTemplate:true`）。
2. 团队成员各自 `--mode=git` degit 或 `gh ... --template` 初始化。
3. 共享的 `bmad-*` 各自在本机用户级安装（一次）。
4. **不要**在配置里写任何企业内网/接口/SSO 依赖——保持离线可运行。

> `【可选扩展·需企业/网络环境】`：组织级 instructions 分发、私有 registry、cloud agents——
> 这些不在主路径，按需另行接入，不影响本地自包含。

## 10.4 版本化与升级

- 每次改 EOS 配置：改 `docs/eos/VERSION`（如 `eos-1.4.1`→`eos-1.5.0`），跑 `validate-config.mjs`，Conventional Commits 提交。
- 升级既有项目：从新版模板 diff `.github/`，挑选合并；用户级 `bmad-*` 独立升级。

---

# 第 11 章 新增技术栈

EOS 的栈规则是**可插拔**的。新增一个栈 = 加一个 `*.instructions.md` + 对应 `applyTo`：

1. 在 `.github/instructions/` 下建子文件夹（如 `backend/`）。
2. 新建 `NN-backend-go.instructions.md`，frontmatter：
   ```yaml
   ---
   name: 'Backend (Go)'
   description: 'Go service conventions'
   applyTo: "**/*.go"
   ---
   ```
3. 写该栈的分层/校验/错误处理/lint-format-test 约定。
4. **确保 glob 与现有规则互斥**（避免和 `**/*.ts` 等重叠）；跑 `validate-config.mjs` 验 S3。
5. 若新栈的 test/lint 命令不同，同步更新 `00-workspace.instructions.md` 的 Local commands。

> 默认参考栈：前端 TS+Next.js、后端 Node/TS 或 Python/FastAPI、数据 PostgreSQL+OpenAPI。
> 全部可替换——换栈只是换 `applyTo` 和正文，不动 EOS 骨架。
>
> **省事**：Node/Python/Go/Java/Rust/.NET 六大后端栈 + React 前端的 R3 规则均已随模板发布；
> 各栈成品命令行 + frontmatter 见 `docs/eos/stack-presets.md`（配方册），复制对应块即可，不用手写。

---

# 第 12 章 反模式速查

| # | 反模式 | 后果 | EOS 防御 |
|---|---|---|---|
| P1 | 只写功能 Spec 不写 NFR | SLO 上线爆 | C-nfr 是 G2 必过项 |
| P2 | 运营需求不前置 | 上线后返工×3 | D-ops + `eos-operational-readiness` + G2 |
| P3 | 全部规则塞进 copilot-instructions.md | always-on 爆、污染所有会话 | R1≤40 行；按 applyTo 分薄片 |
| P4 | 重复造轮子（已有 bmad-* 却新建） | 双维护、漂移 | 交付件标来源；agent-map.md |
| P5 | 以为有原生优先级 | 版本变化后静默错 | 靠 applyTo + Hooks，不靠顺序 |
| P6 | 逗号串多 glob `"a,b"` | 行为未验证 | 用花括号 `{a,b}` + 子文件夹；S2/S3 |
| P7 | PreToolUse 用 `decision:"block"` | 拦不住危险操作 | 用 `permissionDecision:"deny"` |
| P8 | 规则膨胀单文件超长 | token 超预算被截断 | 单一职责拆分 |
| P9 | 无 ADR 做不可逆决策 | 团队失忆 | G4 必须有 ADR；`/adr` |
| P10 | 跳过 Spec 直接出码 | 代码与需求漂移 | G3 是 G5 前置；无 prd.md 不进 Planning |
| P11 | 无回滚/灰度就发布 | 出事无法撤 | G8 五项门禁；`/release-gate` |
| P12 | 本地配置硬编码企业接口 | 离开内网即损坏 | 纯本地约束；只写可本地验证内容 |
| P13 | 用户级放项目专属配置 | 跨项目污染 | 通用放用户级，专属放 `.github/` |
| P14 | 改规则不验证就发布 | 静默失效 | 每次改完跑 `validate-config.mjs` + rubric |

---

# 附录 A 术语表

| 术语 | 含义 |
|---|---|
| EOS | Engineering Operating System，本套工程操作系统 |
| Gate（G1–G10） | 决策门；未过门不进下一阶段 |
| 硬门 | G2（需求）、G8（发布），有 BLOCKER 即阻断 |
| applyTo | instructions frontmatter 字段，用 glob 限定规则生效的文件范围 |
| always-on | 进入每次会话的规则（R1/R2/R7），最稀缺资源 |
| handoff | agent frontmatter 里定义的"交棒"到下一 agent/prompt |
| BMAD | 已装的 73 个 `bmad-*` skill 体系，EOS 优先复用 |
| ADR | Architecture Decision Record，一文件一决策 |
| AC | Acceptance Criteria，验收标准，须可度量、可测试 |
| NFR | 非功能需求（性能/容量/容灾/安全/可观测…） |
| trace 矩阵 | AC ↔ 测试的映射表，确保无漏测 |
| Hook | `.github/hooks/` 下的生命周期事件脚本（Preview） |

---

# 附录 B 命令速查卡

```
# ── 终端 ──
npx degit --mode=git niaodian/eos-template my-app   # 新建项目
node .github/hooks/validate-config.mjs              # 配置自检（期望 PASS）
npm test                                            # 跑测试（质量门同款）
npm audit                                           # 发布前依赖审计

# ── Copilot Chat（Agent 模式）──
（agent）eos-discovery        # 阶段1：问题定义        → G1
/requirements "<feature>"    # 阶段2：需求+运营前置    → G2★
/spec                        # 阶段3：PRD 真相源       → G3
/ux-spec                     # 阶段3.5：UX 视觉+体验契约 → G-UX（面向用户必做，纯后端跳过）
（agent）eos-architecture     # 阶段4：架构            → G4
  /adr "<decision>"          #   └ 每个不可逆决策
  /nfr                       #   └ 填 NFR 目标值
（agent）eos-plan             # 阶段5：拆 story         → G5
bmad-dev-story               # 阶段6：实现            → G6
bmad-code-review             #   └ 完成前代码审查(无阻断项) → G6
bmad-tea / bmad-testarch-*   # 阶段7：测试+追溯        → G7
/runbook <service>           # 阶段8：先备 runbook
/release-gate                # 阶段8：发布门禁         → G8★
/telemetry-plan              # 阶段9：埋点闭环         → G9
（agent）eos-review           # 阶段10：迭代回写        → G10
/validate-config             # 任意时：配置语义体检
```

---

# 附录 C 端到端样例（my-app）

真实跑通的 dry-run（功能：用户登录），**12/12 门全过**，可作为"标准答案"对照。

| 阶段 | 样例产物 |
|---|---|
| 1 Discovery | `my-app/docs/discovery.md` |
| 2 Requirements | `my-app/docs/requirements.md`（11 项运营决策表 + authz 矩阵） |
| 3 Spec | `my-app/docs/prd.md`（FR1–5 + AC + 迭代日志） |
| 4 Architecture | `my-app/docs/adr/0001-session-strategy.md`、`my-app/api/openapi.yaml` |
| 5 Planning | `my-app/docs/stories/story-001-auth.md` |
| 6 Development | `my-app/src/auth.js`（零依赖 node:crypto） |
| 7 Testing | `my-app/test/auth.test.js`（10 AC-traced，全绿）、`my-app/docs/trace-matrix.md` |
| 8 Release | `my-app/docs/release-gate.md`、`my-app/ops/runbook-auth.md` |
| 9 Observability | `src/auth.js` 5 个 `auth.*` 事件 |
| 10 Iteration | `my-app/docs/prd.md §6`（CR-001 回写） |
| 验收报告 | `my-app/docs/eos/walkthrough.md`（完整 scorecard + 复现命令） |

**复现**（终端）：
```sh
npx degit --mode=git niaodian/eos-template my-app && cd my-app
node .github/hooks/validate-config.mjs        # PASS
npm test                                       # 10/10 green
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | node .github/hooks/deny-dangerous.js  # deny
```

---

> 本手册随模板版本演进。改动请同步 `docs/eos/VERSION` 并跑 `validate-config.mjs`。
> 设计原理（为什么这么设计）见 `docs/eos/blueprint.md`；本手册只讲"怎么用"。
