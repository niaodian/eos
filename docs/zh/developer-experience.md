# EOS 开发者体验 — 引导式工作流与机器契约

> 英文为参照语言 · English is the reference language：本文是引导式工作流的**契约**文档，规定状态模型、
> 迁移表、Next-Best-Action JSON 契约、Agent/Skill 映射契约以及 CLI 输出与退出码契约。它具有规范性 ——
> `.github/eos/` 中的实现与 `.github/eos/*.test.mjs` 中的测试都被锁定到本文。

**核心目的：** 你不应该为了知道"下一步做什么"而去读 EOS 文档。一个入口、一个当前工作对象、一个推荐动作，
以及一台拒绝让未经验证的工作被晋级的机器。

```
Resume / Next  →  完成那一个推荐动作  →  Verify  →  Next
```

## 1. 唯一循环（开发者真正敲的命令）

```sh
node .github/eos/eos.mjs resume     # 我上次在做什么？什么卡住了？
node .github/eos/eos.mjs next       # 唯一的推荐下一步
node .github/eos/eos.mjs check --gate story-ready --scope STORY-012
node .github/eos/eos.mjs transition --scope story --id STORY-012 --to READY_FOR_DEV
```

在 Copilot Chat 中，同一循环是 `eos-guide` → `/eos-next` → `/eos-resume` → `/eos-status`；
在 VS Code 中则是 **EOS: Next / Resume / Verify Current Gate / Release Status** 任务
（`cp .vscode/tasks.json.example .vscode/tasks.json`，或执行 `eos init --write`）。

以上全部不需要网络、云服务、VS Code 扩展或包管理器。
想先看一遍完整循环再决定是否相信它？`node .github/eos/journey.demo.mjs` 会在本仓库的一份临时副本里
重放一个完整功能——Story 被阻断 → 修复 → 验证 → 输入改动（STALE）→ 恢复 → 合并 → 发布判定——
并打印每一步的真实输出。

## 2. 设计原则（为什么它是这样运转的）

| # | 原则 | 在实现中的后果 |
|---|---|---|
| 1 | 状态优于叙述 | 当前阶段由制品、证据和 Ledger 推导 —— 绝不来自散文摘要或聊天记录 |
| 2 | 推荐优于菜单 | `eos next` 只打印**一个**动作；其余全部折叠到 `--all` 里 |
| 3 | 意图优于框架术语 | 入口是"恢复工作""修一个 Bug""准备发布" —— 而不是"选 G5"或"选某个 BMAD Skill" |
| 4 | 流程可分流，但不能存在未知路径 | 每个 Change Type 都有显式 Gate Policy；跳过是被记录的 `NOT_APPLICABLE`，绝不是疏忽 |
| 5 | 探索自由，晋级受控 | 草稿和 Spike 不受限制；`READY_FOR_DEV` / `MERGED` / 发布晋级必须有证据 |
| 6 | 渐进式披露 | 默认输出是六个短块；细节藏在 `--why`、`--all` 和 `explain` 后面 |
| 7 | 绝不伪造能力 | EOS 无法替你切换 Copilot Agent，因此它诚实地交接，而不是声称已经切换 |

**LLM 可以**：解释推荐、完成工作、起草制品、汇总失败原因。
**LLM 不可以**：把 Gate 标成 PASS、批准 Waiver、修改工作流状态、从散文推断出某个审批已存在、
绕过 Router 直接发布。这些路径只存在于确定性代码中。

## 3. 架构（四个相互分离的组件）

```
项目状态模型        .eos/project.json · workflow.json · gates.json · agent-map.json · ledger
        ↓
Gate 与迁移引擎     确定性 Evaluator + 证据新鲜度 + Waiver
        ↓
Next Best Action 引擎   纯函数：状态 → 恰好一个推荐动作
        ↓
体验层              CLI · eos-guide agent · /eos-next /eos-resume /eos-status · VS Code Tasks
```

磁盘布局：

```
.eos/
  project.json          # 这个项目"是什么"（纳入版本管理，权威）
  workflow.json         # Change Type 门禁策略 + 状态机（纳入版本管理，受 CODEOWNERS 保护）
  gates.json            # Gate 定义与版本（纳入版本管理，受 CODEOWNERS 保护）
  agent-map.json        # 动作 → Agent / Prompt / 最小 BMAD Skill 链（纳入版本管理）
  schemas/              # 上述每个文件的 JSON Schema
  evidence/             # 机器生成的 Gate 证据（纳入版本管理 —— 发布证据必须可共享）
  waivers/              # 受控例外
  ledger/events.jsonl   # append-only、哈希链式的迁移与门禁账本
  handoffs/             # 最小 Agent 交接上下文包（本地缓存，gitignored）
  local/active-work.json# 仅本机当前焦点（gitignored，永不权威）
```

`.eos/local/active-work.json` 只保存 Scope ID，别的都不存：门禁结果、审批、发布状态 —— 以及 Change
Type，因为 Change Type 决定门禁策略，本身就是权威；Story 的分类只从纳入版本管理的 Story 文件读取。

## 4. 状态模型（三层 Scope，而不是一个全局状态机）

### 4.1 Product Baseline

```
UNINITIALIZED → DISCOVERY → REQUIREMENTS_BASELINED → PRD_APPROVED → ARCHITECTURE_APPROVED → ACTIVE
```

Product 状态是**推导**出来的，从不由人声明：引擎从 `UNINITIALIZED` 出发沿这台状态机前进，只要下一条守卫
成立就推进。因此 `eos transition --scope product` 拒绝手工设置它，转而告诉你还差哪一条守卫。

### 4.2 Change / Story

```
DRAFT → IN_REVIEW → READY_FOR_DEV → IN_DEVELOPMENT → READY_FOR_TEST → VERIFIED → MERGED
```

显式回退是合法的（发现缺陷不应该逼人谎报状态）：
`READY_FOR_TEST → IN_DEVELOPMENT`、`VERIFIED → IN_DEVELOPMENT`、`READY_FOR_DEV → DRAFT`、
`IN_REVIEW → DRAFT`。

### 4.3 Release

```
PLANNED → CANDIDATE → VERIFIED → APPROVED → RELEASED       （以及 RELEASED → ROLLED_BACK）
```

### 4.4 迁移表（守卫条件）

只存在下列迁移。其余一律作为非法跳步拒绝 —— 包括"向前跳"到某个前置门禁尚未产生证据的后续状态。

| Scope | 从 | 到 | 守卫条件（必须成立） |
|---|---|---|---|
| product | UNINITIALIZED | DISCOVERY | 门禁 `activation` PASS 且 `docs/discovery.md` 存在 |
| product | DISCOVERY | REQUIREMENTS_BASELINED | `docs/requirements.md` 存在 |
| product | REQUIREMENTS_BASELINED | PRD_APPROVED | 门禁 `prd-ready` PASS |
| product | PRD_APPROVED | ARCHITECTURE_APPROVED | `docs/architecture.md` 存在 |
| product | ARCHITECTURE_APPROVED | ACTIVE | 至少存在一个 Story |
| story | DRAFT | IN_REVIEW | — |
| story | IN_REVIEW | READY_FOR_DEV | 门禁 `story-ready` PASS（按 Change Type 策略） |
| story | READY_FOR_DEV | IN_DEVELOPMENT | — |
| story | IN_DEVELOPMENT | READY_FOR_TEST | — |
| story | READY_FOR_TEST | VERIFIED | 门禁 `verified` PASS |
| story | VERIFIED | MERGED | 门禁 `verified` PASS 且未 STALE |
| story | IN_REVIEW / READY_FOR_DEV | DRAFT | —（回退） |
| story | READY_FOR_TEST / VERIFIED | IN_DEVELOPMENT | —（回退） |
| release | PLANNED | CANDIDATE | — |
| release | CANDIDATE | VERIFIED | 门禁 `release-ready` PASS |
| release | VERIFIED | APPROVED | 存在审批事件，且审批人不是申请人 |
| release | APPROVED | RELEASED | 证据绑定到候选 Commit |
| release | RELEASED | ROLLED_BACK | — |
| release | CANDIDATE | PLANNED | —（回退） |

状态**绝不**从 Markdown 字段读取。若 Story 文件声明了 `state:` 而 Ledger 不同意，这个漂移本身
就是一条 Blocker：手工编辑的状态不是证据。

## 5. 本轮机器化的门禁

一次性机器化 G1–G10 只会产出肤浅的检查。第一轮覆盖"绿但空"危害最大的四个门禁，外加本地激活。

| Gate id | Blueprint 门禁 | Scope | 实际验证什么 |
|---|---|---|---|
| `activation` | G0 | product | `.eos/project.json` 有效、有代码后不再是未改动的模板、`workflowProfile` 可解析、激活账本存在 |
| `prd-ready` | G3 | product | `docs/prd.md` 存在、验收标准 id 可解析且唯一、无未解决的 `BLOCKER` 标记 |
| `story-ready` | G5 | story | Story 引用真实 PRD AC、每条 AC 有测试意图、LLM 支撑的 AC 有 Eval Case、遥测/授权/回滚任务齐备 |
| `verified` | G7 | story | 产品门禁证据存在且新鲜、每条 Story AC 有通过的 trace 行、Agentic 时 Eval 达标 |
| `release-ready` | G8 | release | 必需 Story 已 VERIFIED、密钥扫描干净、合规边界有效、无过期 Waiver、Runbook 与回滚齐备、证据绑定候选 Commit |

`eos explain <gate>` 按需打印某一个门禁的完整规则 —— 这是详细规则唯一需要被阅读的地方。

### 5.1 结果状态

| 状态 | 含义 | 是否允许晋级？ |
|---|---|---|
| `PASS` | 全部检查通过，证据新鲜 | 是 |
| `FAIL` | 至少一项检查失败 | 否 |
| `BLOCKED` | 前置条件缺失（工具未安装、前序门禁不存在） | 否 |
| `PENDING` | 门禁适用但从未运行过 | 否 |
| `WAIVED` | 有未过期且已批准的 Waiver 覆盖 | 是（已记录） |
| `NOT_APPLICABLE` | Change Type 策略判定该门禁不适用 | 是（已记录） |
| `STALE` | 之前 PASS，但输入或定义已改变 | 否 |
| `ERROR` | Evaluator 自身无法运行 | 否 |

工具缺失、Validator 崩溃、文件不可读或"根本没有测试"**绝不**映射为 `PASS`。这条规则就是这一层存在的全部理由。

### 5.2 证据绑定与失效

每次门禁运行都会写入 `.eos/evidence/<gate>__<scopeType>__<scopeId>.json`，绑定：
Commit SHA · Gate 定义版本 · Evaluator 版本 · 每个输入文件的 SHA-256 ·
真实执行的命令及其退出码 · 每一项 Check 结果 · 生成时间。

当任一输入哈希改变、输入文件消失、Gate 定义版本变化，或 `.eos/gates.json` / `.eos/workflow.json`
改变（治理变更规则）时，证据自动变为 `STALE`。此外：记录下来的输入*集合*必须仍与该门禁今天实际读取的
一致，因此一份"声称没有任何输入"的证据是 STALE 而不是永远新鲜；记录为 `WAIVED` 的证据绑定该 Waiver
文件，所以过期、被删除或自批准的 Waiver 会让它失效；而对某个*集合*作断言的门禁（发布就绪对全部 Story）
会记录该集合的摘要，因此事后新增一个 Story 同样会让它失效。发布验证还额外要求证据 Commit 等于候选 Commit。

证据文件本身只是一个普通文件，因此从不被单独信任：它的状态必须等于它自己的 checks 聚合出来的结果，
**并且**必须与哈希链账本一致 —— 账本记录了同一次运行，且改动它就会断链。所以，把一份真实证据文件里的
一个词改掉，只会被拒绝，而不会换来晋级。

**它能证明什么、不能证明什么。** 这些是**可发现篡改**而非**不可篡改**的机制：账本是哈希链式的，并由
`.eos/ledger/head.json` 钉住长度与链尾，因此改写、删除或截断都会被检测到；而且状态读取方拒绝从一条断链
的账本推导任何东西。当某个性质确实无法被检查时，结论是 `UNVERIFIED`（非零退出）—— 绝不是 `PASS`。
拥有写权限的人仍然可以在本地同时伪造多个受版本管理的文件 —— 这正是账本、门禁定义、工作流、
Agent 映射和项目声明都受 CODEOWNERS 保护，以及 CI 会针对本次构建所基于的提交重新校验链的原因。

## 6. Change Type（分流流程，但不留未知路径）

`PRODUCT_BASELINE` · `FEATURE` · `BUGFIX` · `SPIKE` · `HOTFIX` · `DOC_ONLY` · `GOVERNANCE` ·
`RELEASE`。策略存放在 `.eos/workflow.json` 中，是数据而不是代码：

| Change Type | `prd-ready` | `story-ready` | `verified` | `release-ready` |
|---|---|---|---|---|
| PRODUCT_BASELINE | 必需 | 不适用 | 不适用 | 不适用 |
| FEATURE | 必需 | 必需 | 必需 | 不适用 |
| BUGFIX | 不适用 | 必需 | 必需 | 不适用 |
| SPIKE | 不适用 | 不适用 | 不适用 | 不适用 |
| HOTFIX | 不适用 | 可豁免 | 必需 | 不适用 |
| DOC_ONLY | 不适用 | 不适用 | 不适用 | 不适用 |
| GOVERNANCE | 不适用 | 不适用 | 不适用 | 不适用 |
| RELEASE | 不适用 | 不适用 | 不适用 | 必需 |

"不适用"是*被记录进 Ledger 的决定*，而不是静默跳过 —— 而且一个会关掉门禁的分类不能只靠声称。
有两条规则阻止"改个标签"变成一行绕过上面一切的捷径：Change Type 可以声明 `mergeable: false`
（SPIKE 可以自由探索，但永远到不了 `MERGED` —— 要上线就走 FEATURE 或 BUGFIX），并且关掉验证的
Change Type（`SPIKE`、`DOC_ONLY`、`GOVERNANCE`）必须在 Story front matter 里写明
`classificationReason` 才能离开 `DRAFT`。未声明的 Change Type 会被直接拒绝，而不是默认放行。

### 6.1 Waiver

Waiver 是 `.eos/waivers/` 下的一个文件，包含 `gate`、`scope`、`reason`、`riskOwner`、`approver`、
`expiresOn`（或触发条件）和 `compensatingControls`。当审批人等于申请人、已过期，或门禁策略标记该门禁
不可豁免时，一律拒绝。EOS 可以*建议*豁免，但绝不批准豁免。

## 7. Next-Best-Action JSON 契约

`eos next --json` 与 `eos resume --json` 输出的形状严格如下（`schemaVersion: 1`）：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "repo": { "commit": "abc1234", "root": "/path/to/repo" },
  "current": { "scopeType": "story", "scopeId": "STORY-012", "state": "DRAFT", "changeType": "FEATURE" },
  "recommendedAction": {
    "id": "design-acceptance-tests",
    "title": "Design the missing acceptance tests",
    "reason": "AC3.2 has no acceptance-test intent",
    "targetGate": "story-ready",
    "copilotAgent": "eos-plan",
    "prompt": "Create the missing ATDD intent for AC3.2 only.",
    "skills": ["bmad-testarch-atdd"],
    "command": "node .github/eos/eos.mjs check --gate story-ready --scope STORY-012",
    "doneWhen": ["AC3.2 references a test intent", "story-ready check passes"]
  },
  "alternatives": [],
  "blockers": [
    { "gate": "story-ready", "check": "ac-test-intent", "status": "FAIL", "detail": "AC3.2 has no test intent" }
  ],
  "exitCode": 2
}
```

`recommendedAction` 永远不为 null：没有任何阻断时，推荐动作就是下一个向前的步骤（例如
`start-next-change`）。Router 是确定性代码 —— 同样的仓库状态永远得到同样的动作，绝不让 LLM 猜阶段。

## 8. Agent 与 Skill 映射契约

`.eos/agent-map.json` 把一个**动作 id** 映射到至多一个主 Copilot Agent（或一个 Prompt）以及一条最小
BMAD Skill 链。开发者永远不需要从 73 个已安装 Skill 中挑选。

```json
{
  "schemaVersion": 1,
  "actions": {
    "design-acceptance-tests": {
      "agent": "eos-plan",
      "prompt": null,
      "skills": ["bmad-testarch-atdd"],
      "handoff": "Create the missing ATDD intent for the listed AC only."
    }
  }
}
```

规则：一个动作 → 一个主 Agent；Skill 列表保持最小；被引用的 Agent 文件或 Prompt 文件不存在时，该动作
变为 `BLOCKED` 并给出安装/替代路径（由 `eos doctor` 报告），而不是静默推荐一个用不了的东西。这张映射表
面向人类的投影是 [agent-map.md](agent-map.md)；Router 读取的是 JSON。

## 9. 交接上下文包

`eos handoff --scope story --id STORY-012` 写出 `.eos/handoffs/STORY-012.json`：Scope 与状态、
目标、相关 PRD AC、已批准决策、带哈希的文件列表、当前 Blockers、明确的 Non-goals、推荐的
Agent/Prompt/Skills、`doneWhen`，以及返回时执行的命令。它绝不包含整个仓库、凭据、无关历史、
未批准的推测或生产数据。

它是**缓存**而非权威：`eos handoff --verify` 会重新校验绑定的 Commit 与输入哈希，并报告 `STALE`，
而不是让 Agent 基于过期包行动。

## 10. CLI 契约

```
node .github/eos/eos.mjs <command> [flags]

  status [--changed]        项目与当前 Scope 处在哪里
  next [--why] [--all]      唯一的推荐下一步
  resume                    在新 Session 中恢复本机焦点
  check --gate <id> [--scope <id>]      运行一个门禁并写入证据
  transition --scope <type> --id <id> --to <STATE>
  explain <gate>            某个门禁的完整规则
  release-status            聚合的发布就绪度
  verify-release --release <tag>        绑定候选 Commit 的验证
  waive --gate <id> --scope <id> ...    起草 Waiver（绝不批准）
  handoff --scope <type> --id <id> [--verify]
  ledger [--verify] [--against <ref>]   append-only 链校验
  init [--write]            报告/创建本地的、非破坏性的集成文件
  doctor                    EOS 自身接线是否正确

  全局： --json  --why  --all  --no-color
```

默认（面向人类的）输出永远是这六个块，不多不少：

```
EOS · STORY-012

Current
  IN_REVIEW · FEATURE

Blockers
  story-ready/ac-test-intent — AC3.2 has no test intent

Recommended next
  Design the missing acceptance tests

Why
  story-ready is REQUIRED for a FEATURE and one acceptance criterion has no test intent.

Start
  Copilot agent: eos-plan · skills: bmad-testarch-atdd
  node .github/eos/eos.mjs check --gate story-ready --scope STORY-012

Done when
  AC3.2 references a test intent
  story-ready check passes
```

### 10.1 退出码

| 退出码 | 含义 | 由哪些命令产生 |
|---|---|---|
| 0 | PASS / 无阻断 | 任意命令 |
| 1 | FAIL —— 某项检查失败，或迁移被拒绝 | `check`、`transition`、`verify-release` |
| 2 | BLOCKED / PENDING / STALE —— 需要先处理 | `next`、`resume`、`check`、`release-status` |
| 3 | ERROR —— EOS 无法评估（配置损坏、Evaluator 崩溃） | 任意命令 |

`next` 与 `resume` 在存在 Blocker 时刻意退出 2，这样脚本或任务无需解析文本就能区分
"有东西要解除阻断"和"可以继续前进"。

## 11. 诚实的能力边界（VS Code + Copilot）

**不存在**受支持的公开 API 能让终端命令强制 VS Code / GitHub Copilot Chat 切换当前 Custom Agent。
因此 EOS 按以下顺序降级，且绝不假装：

1. 当前 Agent frontmatter 中声明的 Copilot **handoff** 按钮；
2. 由 `eos-guide` Agent 在对话内提供交接；
3. 打印目标 Agent 名称加一段可直接粘贴的 Prompt；
4. 打印一条复制即可执行、完成同样工作的终端命令。

EOS 不使用未公开的内部 API，不修改 VS Code 安装文件，也不模拟 GUI 点击。Hook 保持 advisory
（Preview 特性）：即使 Hook 从未触发，CLI 与 CI 依然能完整验证。

## 12. 与既有门禁和 Validator 的关系

引导式工作流是**包裹**既有 Validator 而不是取代它们 ——
`validate-config.mjs`、`check-doc-parity.mjs`、`eos-doctor.mjs`、`secret-scan.mjs`、`spec-align.mjs`
和 `project-gate.mjs` 全部保持现有契约，并继续在 CI 中充当合并权威。新层只是在其上增加状态、证据和导航：

- `/eos-help` 中的阶段表现在是 `eos status` 的*投影*，不再是第二个真相源；
- [blueprint.md](blueprint.md) 中的 10 阶段流程（G1–G10）依旧描述方法论；上面五个机器门禁是其中
  被按 Scope 机械执行的子集；
- 既有仓库在没有 `.eos/workflow.json` 时照常工作：CLI 会报告 `PENDING` 激活，并告诉你创建缺失文件的那一条命令。
