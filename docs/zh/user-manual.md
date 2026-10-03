> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/user-manual.md`](../eos/user-manual.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS 用户手册（Engineering Operating System User Manual）

> 版本：与 `docs/eos/VERSION` 同步（当前 `eos-2.4.0`）
> 适用：较新版本的 VS Code + GitHub Copilot Chat（自定义 agent / hooks 属近版能力，用「关于 VS Code」面板确认版本），或 Claude Code、OpenAI Codex、Google Antigravity（[第 6.6 章](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)）+ 已安装 73 个 `bmad-*` skill（用户级）
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
| 用 Claude Code、Codex 或 Antigravity 代替 VS Code + Copilot | [第 6.6 章 在 Claude Code、Codex 和 Antigravity 中使用 EOS](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos) |
| 想查某个斜杠命令 / agent / 规则 | [第 7 章 完整参考](#第-7-章-完整参考（速查）) |
| 配置坏了 / Agent 不按预期工作 | [第 9 章 故障定位](#第-9-章-故障定位与排错) |
| 想把这套搬到别的项目/团队 | [第 10 章 跨项目复用与分发](#第-10-章-跨项目复用与分发) |
| 升级到 `eos-2.0.0`、选择治理轨道或为发布签名 | [§10.5 升级](#105-从-eos-122x-升级到-eos-200) · [§10.6 轨道与签名发布](#106-治理轨道、签名发布与中心策略) · [§10.7 2.0.1 安全补丁](#107-从-eos-200-升级到-eos-201) · [§10.8 `eos upgrade` 与 2.1.0](#108-从-eos-20x-升级到-eos-210) · [§10.9 2.2.0](#109-从-eos-21x-升级到-eos-220) · [§10.10 2.3.0](#1010-从-eos-22x-升级到-eos-230) · [§10.11 2.4.0](#1011-从-eos-23x-升级到-eos-240) |

---

## 目录

- [第 1 章 快速上手（10 分钟）](#第-1-章-快速上手（10-分钟）)
- [第 2 章 一次性环境准备](#第-2-章-一次性环境准备)
- [第 3 章 新项目 Day-1 Bootstrap](#第-3-章-新项目-day-1-bootstrap)
- [第 4 章 核心概念（五种机制）](#第-4-章-核心概念（五种机制）)
- [第 5 章 心智模型：分层规则 + 决策门](#第-5-章-心智模型：分层规则--决策门)
- [第 6 章 全生命周期实操（idea → 迭代）](#第-6-章-全生命周期实操（idea-→-迭代）)
- [第 6.5 章 两条上手路径（SaaS vs Agentic · 小白友好）](#第-65-章-两条上手路径（saas-vs-agentic-·-小白友好）)
- [第 6.6 章 在 Claude Code、Codex 和 Antigravity 中使用 EOS](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)
- [第 7 章 完整参考（速查）](#第-7-章-完整参考（速查）)
- [第 8 章 配置质检与验收](#第-8-章-配置质检与验收)
- [第 9 章 故障定位与排错](#第-9-章-故障定位与排错)
- [第 10 章 跨项目复用与分发](#第-10-章-跨项目复用与分发)
- [第 11 章 新增技术栈](#第-11-章-新增技术栈)
- [第 12 章 反模式速查](#第-12-章-反模式速查)
- [附录 A 术语表](#附录-a-术语表)
- [附录 B 命令速查卡](#附录-b-命令速查卡)
- [附录 C 端到端样例（my-app）](#附录-c-端到端样例（my-app）)
- [附录 D 实例化后硬化（让门禁具备权威）](#附录-d-实例化后硬化（让门禁具备权威）)

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

在 **Copilot Chat（Agent 模式）** 里——这就是全部循环，也是你唯一需要记住的东西：

```
/eos-resume    # 我刚才在做什么、什么卡住了
/eos-next      # 唯一的推荐下一步、为什么、怎么开始
```

……或者直接跟 **eos-guide** agent 说话。这是 VS Code 里的**主路径**：在这里 router 还能顺手替你
打开文件、跑检查、点名该用哪个 BMAD skill。

在**终端**里，同一循环是同一个引擎——这是 CI 实际运行的那条，也是你需要脚本或退出码时用的那条：

```
node .github/eos/eos.mjs resume
node .github/eos/eos.mjs next
node .github/eos/eos.mjs check --gate <id> --scope <id>   # 证明这一步，并写入证据
```

**更短的写法，同一条命令：** `npx --offline eos next`（npm 10.9+，Node 22 自带）或
`npm run -s eos -- next`（任意 npm）。请保留 `--offline`：公共 npm 仓库里有一个同名但无关的
`eos` 包，这个参数保证只运行当前检出的代码。

**在 Claude Code、Codex 或 Antigravity 中**，循环完全相同，只是在对应 agent 里输入：`/eos-resume`
和 `/eos-next`（Codex：`$eos-resume`、`$eos-next`），或者直接问"下一步做什么？"——agent 会运行同一个
引擎，通过终端或 `eos` MCP 服务。一次性配置见 [第 6.6 章](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)。

Router 会为每一步点名 agent、prompt 和最小
BMAD skill 链，所以你永远不用自己从 73 个已安装 skill 里挑。完整契约（状态模型、门禁、证据、
退出码）见 [developer-experience.md](developer-experience.md)。

## 1.3 Happy Path（从 idea 到代码的最短链路）

> 你不需要背这条链路——`eos next` 会一步一步带你走，并拒绝让你跳过任何证据不存在的门禁。
> 这里把它写出来，只是为了让你看清方法论的形状。

```
（切换 agent）eos-discovery        → docs/discovery.md      (Gate G1)
/eos-requirements "<feature>"          → docs/requirements.md   (Gate G2)
/eos-spec                              → docs/prd.md            (Gate G3)
/eos-ux-spec（面向用户，纯后端跳过）   → docs/DESIGN.md + docs/EXPERIENCE.md (Gate G-UX)
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
| OS | macOS、Windows 10/11 或 Linux —— EOS 跨平台；原生 Windows 跑核心流程无需 WSL | macOS `sw_vers` · Windows `winver` · Linux `uname -sr` |
| VS Code | 较新版本（自定义 agent / hooks 需近版） | 关于面板查看真实版本（`code --version` 可能是 shim，不准） |
| GitHub Copilot | 已登录（企业 license 仅作 license，不作配置依赖） | Chat 面板可用 |
| 或其他 agent | 用 Claude Code、OpenAI Codex 或 Google Antigravity 代替 VS Code + Copilot——配置见 [第 6.6 章](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos) | 在项目文件夹中启动后，`/eos-next`（Codex：`$eos-next`）能给出结果 |
| Node.js | 20.10+（CLI、验证器与 hooks 用）；请使用 22 或 24——Node 20 已于 2026-04-30 停止维护，只作为声明的最低版本保留 | `node -v` |
| BMAD skills | 73 个 `bmad-*`（用户级） | macOS/Linux `ls ~/.agents/skills &#124; grep -c '^bmad-'` · Windows `(Get-ChildItem ~/.agents/skills -Filter 'bmad-*').Count` |

> **在 Windows 或 Linux 上？** 核心流程完全一致 —— 所有 hooks/validators 都是 Node、路径已跨平台归一化，
> 因此**原生 Windows 无需 WSL/Git-Bash**。Windows 专属细节（PowerShell 5.1 的 `&&` 注意事项、
> 用 `.gitattributes` 保证 LF、`act` 需 Docker Desktop、`build-pdf.sh` 走 Git-Bash）见
> quickstart 的 [**Windows** 设置说明](quickstart.md#windows)。

## 2.2 BMAD skills 在哪

```
~/.agents/skills/     # 73 个 bmad-*（+ 其它 gds-/wds-，共 121）
~/.claude/skills/     # 镜像，同上
```
这些是**用户级**、跨所有项目共享的。EOS 通过 prompt/agent 里的 `bmad-*` 名称来调用它们，
**不需要把它们复制进项目**。

其他 agent 从各自的目录读取用户级技能：Claude Code 读 `~/.claude/skills/`（即上面的镜像），Codex 读
`~/.agents/skills/`，Antigravity 读 `~/.gemini/config/skills/`（IDE）或 `~/.gemini/antigravity-cli/skills/`
（CLI）——按 §6.6.3 的方法把 BMAD 链接过去。

`eos next` 和 `eos-doctor --deep` 会在上述每个目录中查找 BMAD——`~/.agents/skills/`、`~/.claude/skills/`、
`~/.copilot/skills/`、`~/.gemini/config/skills/`、`~/.gemini/antigravity-cli/skills/` 以及 Antigravity IDE
的旧目录 `~/.gemini/antigravity/skills/`——也会查找项目中的 `.agents/skills/`（自 eos-2.4.0 起）。
技能在其中任何一个目录中存在即视为已安装；你所用的 agent 是否读取该目录，取决于上面的配置。

## 2.3 用户级 agents 目录（可选）

若你想把某些 `eos-*.agent.md` 提升为"所有项目通用"，放到：
```
~/.copilot/agents/
```
（注意：是 `~/.copilot/agents`，不是 VS Code User 目录；这是实测确认的路径。）

## 2.4 Hooks 成熟度说明

- Hooks 是 VS Code 的 **Preview** 功能：官方明确"配置格式与行为在未来版本可能变化"，请在你的版本核实
  （官方参考：`docs/agent-customization/hooks.md`、`docs/agents/reference/hooks-reference.md`）。
- 工作区 `.github/hooks/*.json` **默认即加载**（官方设置 `chat.hookFilesLocations` 默认包含
  `.github/hooks`），无需额外 Preview 开关。`chat.useCustomAgentHooks` 只管 `.agent.md` 里内嵌的
  agent hooks，与工作区 `.github/hooks/` 无关。
- EOS 的 8 个合法事件（`SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / PreCompact /
  SubagentStart / SubagentStop / Stop`）已核对官方 `hooks-reference.md` 一致；`deny-dangerous.js`
  的 `permissionDecision: allow/deny/ask` 也符合官方 PreToolUse schema。
- **确认 hooks 在你的会话真的生效**（"存在 ≠ 生效"）：在 Copilot Chat（Agent 模式）让它运行
  `echo 'api_key="sk-EXAMPLEprobe1234567"'`。hooks 已加载 → 被 deny（命中密钥字面量规则）；未加载 →
  只会无害地打印这行字符串。若没被拦截，多半是把父目录当成了工作区根（见 §9.3）。
- **诚实边界**：`deny-dangerous.js` 是**本地减速带**（逐机器、Preview、解析失败放行、CI 不调用），
  是纵深防御而非权威。真正的权威门是 CI 三道硬检查 + 分支保护 + 人工评审（见附录 D）。
- **其他 agent** 通过各自的钩子文件运行同一个脚本——`.claude/settings.json`、`.codex/hooks.json`、`.agents/hooks.json`（§7.9、第 6.6 章）。VS Code 的 agent 会话也会运行 `.claude/settings.json` 中的钩子；如果它们以 "hook errored" 拒绝每次工具调用，见 §6.6.7。

---

# 第 3 章 新项目 Day-1 Bootstrap

## 3.1 三种创建方式（任选其一）

**方式 A — degit（推荐，最快）**
```sh
# public 模板 —— 直接 degit（无需鉴权）
npx degit niaodian/eos#eos-2.4.0 my-new-app
cd my-new-app
git init && git add -A && git commit -m "chore: scaffold from eos"
```

**方式 B — gh + GitHub template**
```sh
# 需要该仓库是 GitHub template。请自己验证，而不是相信本页面——这是所有者级设置，随时可能被关掉：
#   gh repo view niaodian/eos --json isTemplate   ->  {"isTemplate": true}
gh repo create my-new-app --template niaodian/eos --private --clone
cd my-new-app
```

**方式 C — VS Code 直接 New Repository from Template**（GitHub 网页 → Use this template）。
与方式 B 依赖同一个 template 设置。

> 方式 B/C 拿到的是最新的默认分支；方式 A 固定在某个 release tag。若希望团队所有人从**同一个**
> EOS 出发，优先用 A。

## 3.2 落地后第一件事：自检

```sh
node .github/hooks/validate-config.mjs      # 期望：PASS
```

看到 `PASS` 表示规则层、prompt、agent、hook 都健康，可以开干。

## 3.3 填项目专属事实

**先声明项目。** `node .github/eos/eos.mjs init` 会列出两条治理轨道与所有起步包。还没定栈（多数
0-1 项目如此）？`init config-only --write`。已定栈？`init <pack> --write`，再用 `stack sync --write`
把它的命令渲染进下面的工作区规则。

`init --write` 同时为本项目建立自己的策略锁（`.eos/policy.lock.json`）与 SBOM（`.eos/sbom.json`），
模板自带的那两份描述的是 EOS。把它们和声明一起提交：无论脚手架是否已先提交，首次推送与首个 PR 都能通过 CI
（[ADR-022](../adr/022-first-declaration-starts-the-policy.md)）。选了起步包？在提交声明之前修改它的命令，
再运行 `eos policy lock --write`：提交之前它仍是首次声明，其中没有任何内容需要审批。

打开 `.github/instructions/00-workspace.instructions.md`，把它改成**你这个项目**的真实情况：
- `Local commands`：**已定栈**就换成你的栈的 install/lint/test/typecheck 命令——**成品行直接抄** `docs/eos/stack-presets.md`（Node/Python/Go/Java/Rust/.NET 全栈配方册，复制对应一块即可）。**还没定栈**（多数 0-1 项目在架构前都没定）就**保留 Node 占位**——这是 ⛳ PROVISIONAL 值，**权威锁定在阶段 4（架构）** 连同 `docs/adr/00X-tech-stack.md`，避免 always-on 规则与将来真实栈打架
- `Layout`：若目录结构不同，更新
- 其它跨项目通用信念**不要**写这里——那属于 R1（`copilot-instructions.md`）

## 3.4 Day-1 完整序列（复制即用）

```sh
npx degit niaodian/eos#eos-2.4.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs
node .github/eos/eos.mjs init config-only --write   # 声明项目：还没有代码（或 init <pack> [--track regulated]）
git add -A && git commit -q -m "chore: declare the project"   # 连同本项目的策略锁与 SBOM
node .github/eos/eos.mjs next                       # 唯一的下一步
# 关键：从项目目录内执行 `code .`，让 my-new-app 成为工作区根（含 .github/）。
# 不要打开它的父目录，否则自定义 agent / instructions / hooks 都不会被发现。
code .
# 一次性硬化（让 CI 门具备"合并阻断"权威）：在 Copilot Chat 里跑 /eos-init，
# 按引导逐项勾掉 docs/eos/activation.md（分支保护 + CODEOWNERS + 审批基线；详见附录 D）。
```

**不用 VS Code？** 不必运行 `code .`，而是在项目文件夹中启动你的 agent——`claude`（Claude Code）、
`codex`（Codex，需先运行 `node .github/eos/eos.mjs agents sync --platform codex --write`），或在 Antigravity
中打开该文件夹——然后在其中运行 `/eos-init`（Codex：`$eos-init`）。各平台的一次性配置见 [第 6.6 章](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)。

## 3.5 已有系统（存量项目）

已经在运行的系统，不必先重写规范才能用上 EOS。用 `delivery-only` 工作流 profile 在**交付门禁**处接入（自 eos-2.3.0 起）：正在运行的系统就是基线，此后的每一项改动都是一个 story，必须就绪（G5）、经过验证（G7）并通过发布门禁（G8）。

```sh
npx degit niaodian/eos#eos-2.4.0 /tmp/eos                      # 模板，放在你的仓库之外
# 复制到你的仓库：.eos/ .agents/ .github/{eos,hooks,agents,instructions}/ docs/eos/
# 已有的文件请手工合并：AGENTS.md、.github/copilot-instructions.md、.github/workflows/eos-ci.yml
node .github/hooks/validate-config.mjs                          # S7 会点名仍缺少的内容
node .github/eos/eos.mjs init <pack> --brownfield --write       # Standard 轨道；pack 对应你的技术栈
node .github/eos/eos.mjs next                                   # → 为现有系统写文档
```

- **先记录现状，不要重写规范。** `eos next` 会把你交给 `eos-discovery` agent 和 `bmad-document-project`，后者把现状文档写进 `docs/`，以 `docs/index.md` 为索引。该文件存在后，`next` 会请你写第一个 story。
- **每项改动都是一个 story。** 它的验收标准写在 story 里（在 PRD 出现之前，它们独立成立），每条都带测试意图；`verified` 运行你的测试，并把每条标准追溯到一个通过的测试；发布门禁按 Standard 轨道检查候选版本，并把 trace matrix 与本次发布包含的 story 对齐。
- **不设门禁的部分：** discovery、requirements、PRD、UX、架构，以及发布后的遥测与回写门禁——它们都建立在成文的基线之上。你随时可以补写 PRD：一旦 `docs/prd.md` 存在，每个 story 的标准都必须能在其中找到。
- **毕业**到完整生命周期，只需在产品重新基线化后把 `"workflowProfile"` 设为 `"standard-product"`——这只会加强策略。反过来，把 Standard 项目改到 `delivery-only` 是一种削弱：`eos policy lock` 会连同理由和第二个人一起记录。Regulated 轨道不提供这条路径，它要求先有基线。

---

# 第 4 章 核心概念（五种机制）

EOS 用 5 种 VS Code + Copilot 原生机制承载规则。**搞懂"何时被加载"是用好 EOS 的关键。**

| 机制 | 文件位置 | 何时进入上下文 | 你怎么触发 | EOS 中的角色 |
|---|---|---|---|---|
| **Instructions（指令）** | `.github/copilot-instructions.md`、`.github/instructions/**/*.instructions.md` | 自动：always-on 或按 `applyTo` glob 匹配文件类型 | 不用手动触发；编辑匹配文件即生效 | 规则层（编码规范、安全红线、栈约定） |
| **斜杠命令（EOS 技能）** | `.agents/skills/eos-*/SKILL.md`（自 eos-2.2.0 起；`.claude/skills/` 是为 Claude Code 生成的副本） | 按需：你输入 `/name` 时（Codex 中为 `$name`） | Chat 里输入 `/eos-requirements` 等 | 工作流（单个可复用任务） |
| **Agents（角色）** | `.github/agents/*.agent.md` | 切换：你选中某 agent 时持续生效 | Chat 的 agent 选择器切换 | 阶段编排者（持久 persona + 工具限制 + handoffs） |
| **Skills（能力）** | `.agents/skills/*/SKILL.md`（项目级；`.github/skills/` 与 `.claude/skills/` 也会被读取）、`~/.agents/skills/bmad-*`（用户级） | 按相关性自动加载，或被 agent 点名调用 | Agent 自动用，或在请求里写 `bmad-xxx` | 可移植能力（复用 BMAD + 新建补强） |
| **Hooks（护栏）** | `.github/hooks/*.json` + 脚本 | 生命周期事件触发（PreToolUse 等） | 自动；无需手动 | 确定性护栏（拦危险操作、跑质量门） |
| **MCP servers（工具扩展）** | `.mcp.json`（EOS 自带的只读与验证服务 `eos mcp`，自 eos-2.3.0 起；各客户端会请你确认信任一次）· `.vscode/mcp.json.example`（顶层 `"servers"`；opt-in 复制成 `.vscode/mcp.json`） | 客户端**会话启动即 eager 连接**、workspace 全局、**不可按阶段门控** | `eos` 很轻量，从阶段 1 起就有用，因此默认声明；Playwright **默认 inert**（`.example`）——阶段 7 手动启用，活动文件留本地不提交 | 为 agent 提供结构化的 `eos next` / `check` / `verify`（[ADR-018](../adr/018-mcp-server.md)）；本地工具扩展（如 Playwright MCP 驱动浏览器自测，见 7.7） |

## 4.1 关键认知：没有"原生优先级"

官方明确：存在多份 instructions 时**会被合并加入上下文，顺序不保证**。
所以 EOS **从不依赖"规则 A 覆盖规则 B"**。控制冲突的唯一可靠手段是：
1. **`applyTo` 作用域**：用互斥 glob 让每条规则只在该类文件生效；
2. **单一职责**：一个文件只管一个主题；
3. **Hooks**：需要"确定性"的约束（如拦 `rm -rf /`）交给 hook，不靠 Agent 自觉。

## 4.2 always-on 是最稀缺资源

`copilot-instructions.md`（R1）会进入**每一次**会话，所以它必须极简（≤40 行，由 `validate-config` S5 强制）：只放
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
| R10 | Workflow | `.agents/skills/eos-*/SKILL.md` | 调用时 |

> 注意 R1 与 R2、R7 都用 `**`：这是**合法共存**（薄、互补、单一职责），不是冲突。
> 验证器 S3 检查会**豁免 `**`**，正因如此。

## 5.2 决策门十关（G1–G10）

| 门 | 阶段 | 机器门禁 id | 通过标准（不过则不进下一阶段） |
|---|---|---|---|
| G0 | Activation | `activation` | 项目声明了自己是什么、如何被验证 |
| G1 | Discovery | `discovery-ready` | 可证伪的问题 + 带目标值**与数据来源**的指标 + 显式的范围内/外 |
| **G2** | Requirements | `requirements-ready` | **每个运营关注点都是 ADOPT / SKIP+理由 / DEFER+负责人+触发条件（硬门）** |
| G3 | Spec | `prd-ready` | 每条需求有 ≥1 条被**定义**（而不仅是被提及）的验收标准 |
| G-UX | UX & Design（条件） | `ux-ready` | 面向用户：DESIGN.md **与** EXPERIENCE.md 都在，且流程/状态/a11y/token/响应式各自被覆盖；非 UI：结构化 SKIP + 理由 |
| G-EVAL | Eval（条件·LLM/agentic） | 属于 `verified` | 每条 LLM 支撑的 AC 的**实测分数达到阈值**，并绑定 prompt/模型/数据集/grader |
| G4 | Architecture | `architecture-ready` | 不可逆决策有 ADR；每条 NFR 落在具名组件上 |
| G5 | Planning | `story-ready` | 每个 story 上下文自包含、可独立实现、含 AC 与已决策的运营任务 |
| G6 | Development | `project-gate.mjs` | lint/typecheck/单测全绿 + 代码审查无阻断项 |
| G7 | Testing | `verified` | 每条 AC 都追溯到一个**真正跑过**、且跑在**这棵**产品树上的测试 |
| **G8** | Release | `release-ready` | **候选本身被重新测试；质量+供应链+NFR+回滚/灰度/健康全部成立（硬门）** |
| G9 | Observability | `telemetry-ready` | 成功指标作为真实信号发出；有接收人的告警 + 回滚触发条件 + 具名负责人 |
| G10 | Iteration | `iteration-ready` | 每个变更回写 Spec 真相源，且有负责人 |

**G2 和 G8 是两道硬门**：前者堵"上线后返工"，后者堵"带病上线"。

> **哪些门可机器强制**：自 `eos-1.13.0` 起——**全部**。用
> `node .github/eos/eos.mjs check --gate <id>` 单跑一道，`eos next` 会替你跑。每个阶段同时保留人读的
> 文档**和**并列的一份结构化记录（`docs/discovery.json`、`docs/requirements.json`、`docs/design.json`、
> `docs/architecture.json`、`docs/telemetry.json`、`docs/iteration.json`）；门禁读记录——因为散文恰恰是
> 门禁绝不能被说服绕过的东西。在 1.13.0 之前，G1/G2/G-UX/G4 只检查文件是否存在，所以四个空文档就能把
> 产品一路带到"架构已批准"。
>
> 机器仍然无法替你决定的是**判断**：这是不是那个该解的问题、阈值定得是否诚实、设计是否够好。
> EOS 记录这些决定，并拒绝替你编造——一次发布仍然需要一位**不是候选准备者本人**的批准。

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
| **怎么启动** | `npx degit niaodian/eos#eos-2.4.0 my-app && cd my-app`，然后声明项目：`node .github/eos/eos.mjs init config-only --write`（未定栈）或 `init <pack> --write` |
| **产出** | 完整 `.github/` + `docs/` 骨架 |
| **门** | `node .github/hooks/validate-config.mjs` → **PASS** |
| **必查** | PASS 0 errors。**栈未定则先别改** `00-workspace`——保留 Node 占位即可；栈是不可逆决策，权威锁定在**阶段 4（ADR）**。已知栈可即抄 `docs/eos/stack-presets.md`（快路径）。 |
| **打开方式** | 从 `my-app/` 内执行 `code .`——让**项目本身**成为工作区根。打开父目录会导致 agent/instructions/hooks 全部不生效（见 7.2）。 |
| **★ 硬化（一次性）** | 跑 `/eos-init`：引导你开分支保护（runbook）+ 替换 CODEOWNERS handle + 固定审批基线，进度记入 `docs/eos/activation.md`。**这一步决定 CI 门是否真能阻断合并**（详见附录 D）；`eos-doctor` 每次会提示还剩几项，`/eos-release-gate` 发布前再核一次——避免"系统性遗忘"。个人试验仓可逐项豁免（`[~] … 原因：…`）。 |
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
| **决策门 G1** | `node .github/eos/eos.mjs check --gate discovery-ready` —— ☑ 问题写明了什么现象能证明它不成立 ☑ 指标有目标值**与数据来源** ☑ 范围内/外都写了 ☑ 无未决的阻塞性问题 |
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
| **怎么启动** | Chat 输入 **`/eos-requirements "<feature>"`**（包裹 `bmad-agent-pm` / `bmad-prd` + skill `eos-operational-readiness`） |
| **输入** | `docs/discovery.md` + `docs/discovery.json` |
| **产出** | `docs/requirements.md`，**顶部带"Operational Pre-Flight Decision Table"** |
| **决策门 G2（硬门）** | `node .github/eos/eos.mjs check --gate requirements-ready`，外加五张清单 A/B/C/D/E 全部走查（**受监管行业再加第六张 F-compliance**），**任何未决项 = BLOCKER，不清零不得进 Spec** |
| **必查项** | 运营前置 11 项（telemetry/authz/audit/rollback/monitoring/canary/quota/i18n/multi-tenancy/capacity-SLO/DR）每项三选一：**`ADOPT`+要建什么 / `SKIP`+理由 / `DEFER`+负责人+触发条件**。禁止留空，也禁止只写 `SKIP`——自 1.13.0 起门禁会拒绝它，连 `-`、`...` 这类占位“理由”也一并拒绝。每条 NFR 都要有目标值，否则 G8 无法验证 |
| **防返工** | 用"反向提问法"逼出隐性需求：谁**无权**做？做错怎么**回滚**？怎么**知道**线上有没有用？×100 用户会怎样？ |
| **样例** | `my-app/docs/requirements.md`（11 项决策表 + authz 矩阵 + A/B/C/D 走查结论无 BLOCKER） |

**五张清单**（完整内容在 `docs/checklists/`；**受监管行业再加第六张 F**）：
- **A-gap**：需求缺口（可证伪、验收可度量、边界/异常/并发、依赖、scope-out、重叠排查）
- **B-rework**：上线后高概率补做（埋点/authz/审计/回滚/告警/灰度/限流/i18n/空错态/迁移可逆）
- **C-nfr**：非功能需求（性能/容量/可用性容灾/安全合规/可观测/可维护/a11y，逐项填目标值）
- **D-ops**：运营前置（埋点↔指标闭合/权限矩阵/审计范围/回滚预案/灰度阈值/配额/多租户/i18n/容量告警/Runbook 责任人）
- **E-security**：安全与机密（密钥不入代码/前端、`.env` 治理、供应链投毒防护、配置权限隔离、密钥轮换）
- **F-compliance**（**仅受监管行业**）：具名制度选择（HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL）→ 级联控制（数据驻留、审计留存期、最小必要、供应商 **BAA/DPA**、**Agentic 数据出境**决策）

> **受监管行业（医疗/金融等）请在需求阶段就定制度**：`/eos-requirements` 的 **Step 2.5 制度前置**逼你先答"是否适用 HIPAA/PCI-DSS/SOC2/SOX/GDPR/CCPA/PIPL"，选中即走 `F-compliance.md`（专用命令 **`/eos-compliance`**：制度选择→数据驻留/审计留存/最小必要/供应商 BAA/DPA/Agentic 数据出境），把这些**在架构定型前**落地——避免上线后推倒重来。**尤其**：LLM/agent 产品若涉 PHI/PAN/受监管个人数据，必须当场定"数据出境"方案（签 BAA/DPA · 自托管模型 · 脱敏网关 · 排除受监管数据），晚决 = 换模型换架构。结果记入 `docs/compliance-profile.md`。
> **非法律意见**：EOS 只强制早期工程决策，**不替代**合规官/法务/审计师签核。`【新建补强】`

> 配套命令：`/eos-nfr` 专门把 C-nfr 逐行填上具体目标值。

---

## 阶段 3 — Spec（PRD = 唯一真相源）

| 项 | 内容 |
|---|---|
| **目标** | 把需求固化成 PRD，成为下游唯一认可的真相源 |
| **何时进入** | G2 通过、`docs/requirements.md` 无 BLOCKER |
| **怎么启动** | Chat 输入 **`/eos-spec`**（用 `bmad-prd` 起草与校验） |
| **输入** | `docs/requirements.md` + `docs/requirements.json` |
| **产出** | `docs/prd.md`：每条 FR 带验收标准 + NFR 段（来自 C-nfr，不留空） |
| **决策门 G3** | `node .github/eos/eos.mjs check --gate prd-ready` —— ☑ 每条需求有 ≥1 条被**定义**的验收标准（其 `AC<n>.<n>` 编号位于列表项、表格行或标题的开头，**且**带有标准正文）。仅在句子里提到某个编号只算引用：自 1.13.0 起 story 不能再声称实现它 |
| **必查项** | 验收标准能写成测试吗？NFR 段有没有照搬 C-nfr 的目标值？scope-out 写了吗？ |
| **防返工** | PRD 即契约。从此下游只认 `docs/prd.md`；任何"我以为"都要回来改 PRD。 |
| **样例** | `my-app/docs/prd.md`（FR1–FR5，每条配 AC1.1…AC5.3） |

---

## 阶段 3.5 — UX & Design（视觉 + 体验契约）★ 条件门

| 项 | 内容 |
|---|---|
| **目标** | 动手架构/实现前定下"长什么样 + 怎么交互"，产出两份对等契约 |
| **何时进入** | G3 通过、`docs/prd.md` 就绪。**面向用户的产品必做**；纯后端/API/CLI 项目可 SKIP |
| **怎么启动** | Chat 输入 **`/eos-ux-spec`**（包裹 `bmad-ux`）或切到 **`（agent）eos-design`**；问题仍模糊用 `bmad-cis-design-thinking`(Maya)，要强主张用 `bmad-agent-ux-designer`(Sally) |
| **输入** | `docs/prd.md` |
| **产出** | `docs/DESIGN.md`（视觉身份：token/字体/色彩/间距）+ `docs/EXPERIENCE.md`（信息架构/用户流/屏幕状态/交互/a11y/旅程） |
| **决策门 G-UX** | `node .github/eos/eos.mjs check --gate ux-ready` —— 面向用户的产品需要**两份文档都在**且有实质内容，且 coverage 的每个维度是 `COVERED`+出处 或 `NOT_APPLICABLE`+理由。1.13.0 之前只检查其中一个文件是否*存在*，所以一个连 `DESIGN.md` 都没有的 UI 产品也能走过去 |
| **必查项** | 每个屏幕的空/错/载入态都定义了吗？关键操作可纯键盘完成吗？颜色/间距是引用 token 还是写死？ |
| **防返工** | UX 契约**先于**架构与实现：架构据此定 API/数据、story 据此引用屏幕、前端规则与埋点据此落地。两份契约对任何后来的 mock/import 有最终解释权。 |
| **可跳过** | 纯后端/CLI：在 `docs/design.json` 记录 `{ "userInterface": false, "skipReason": "…" }`。它必须被**说出来**——沉默不算跳过，光写 SKIP 两个字也不算。 |

> 复用说明【BMAD + 补强】：能力来自 `bmad-ux` / `bmad-agent-ux-designer`(Sally) / `bmad-cis-design-thinking`(Maya)，
> EOS 只新增编排（`/eos-ux-spec` skill + `eos-design` agent + G-UX 门），**不重建设计能力**。

---

## 阶段 4 — Architecture（方案 + 数据模型 + API 契约 + ADR）

| 项 | 内容 |
|---|---|
| **目标** | 技术方案、数据模型、API 契约、NFR 落点、关键决策留痕（ADR） |
| **何时进入** | G3 通过、`docs/prd.md` 就绪 |
| **怎么启动** | Chat 切到 **`（agent）eos-architecture`**（调用 `bmad-architecture`/Winston）；对每个不可逆决策跑 **`/eos-adr`**；跑 **`/eos-deploy-topology`** 选部署拓扑 |
| **输入** | `docs/prd.md`、`docs/requirements.json`（取 NFR 集合）、`docs/EXPERIENCE.md`+`docs/DESIGN.md`（若做了 UX 阶段）、`docs/checklists/C-nfr.md`、`docs/checklists/G-deployment.md` |
| **产出** | `docs/architecture.md`（含 Deployment 段）、`docs/data-model.md`、`api/openapi.yaml`、`docs/adr/NNN-*.md`（含 tech-stack + deployment-topology 两条 ADR）、填好的 `G-deployment.md` |
| **决策门 G4** | `node .github/eos/eos.mjs check --gate architecture-ready` —— ☑ 每个关注点是 `DECIDED`+摘要 或 `NOT_APPLICABLE`+理由 ☑ 技术栈与部署拓扑各自引用一个**真实存在**的 ADR ☑ **`docs/requirements.json` 里的每条 NFR 都落在具名组件与机制上** |
| **必查项** | API 契约**先于**实现写好了吗？ADR 有没有列备选方案和 trade-off？NFR 每项有落点吗？**部署拓扑是不是选了"满足 NFR 的最简项"（而不是跟风上 K8s）**？ |
| **防返工** | "API 先于实现"让前后端可并行、契约可被测试锚定；ADR 防团队失忆。 |
| **样例** | `my-app/docs/adr/0001-session-strategy.md`（3 方案对比 + trade-off）、`my-app/api/openapi.yaml`（先于 src/auth.js 写） |

**ADR 模板要素**（`/eos-adr` 自动生成）：Status / Context / Decision / Consequences（侧重 1-N 扩展与可逆性）/ Alternatives considered。一文件一决策，从 `docs/architecture.md` 链接。

> **在架构阶段锁定技术栈**（不可逆决策，阶段 0 故意只留占位）：选定语言/框架后 ① 从 `docs/eos/stack-presets.md` 更新 `00-workspace` 的 `Local commands` ② 启用对应 R3 栈规则 ③ 写 `docs/adr/00X-tech-stack.md`。**G4 会校验"栈已锁"**——这样 always-on 的 `00-workspace` 才与真实栈一致，消除阶段 0 的 ⛳ 占位与后续栈的矛盾。

> **在架构阶段选定部署拓扑**（同属 NFR 驱动的架构决策）：跑 `/eos-deploy-topology` 走查 `docs/checklists/G-deployment.md`——在**裸进程 / Docker / K8s / serverless / PaaS** 里**选满足 NFR 的最简项**（别默认上 K8s），落 `docs/adr/NNN-deployment-topology.md` + `architecture.md` 的 Deployment 段。EOS **不预设** Docker 或 K8s：拓扑由本阶段按 SLO/RTO/RPO/峰值 QPS 决定；真实 cluster/registry/cloud 属 `【需企业/网络环境】`，本地 dev/CI 不依赖它也能跑。所选拓扑的 manifest（`Dockerfile`/`compose.yml`/`k8s/*.yaml`/`serverless.yml`）自动吃 R8 `release-ops` 规则，G8 发布门再校验回滚/灰度/health 与拓扑一致。

---

## 阶段 5 — Planning（拆 Epics→Stories）

| 项 | 内容 |
|---|---|
| **目标** | 把架构拆成可独立实现、上下文自包含的 story |
| **何时进入** | G4 通过 |
| **怎么启动** | Chat 切到 **`（agent）eos-plan`**（`bmad-create-epics-and-stories` → `bmad-create-story` → `bmad-sprint-planning`），对每条 AC 用 **`bmad-testarch-atdd`** 先设计验收测试；**若含 LLM/agentic 组件,再跑 `/eos-eval-spec` 设计评估集(G-EVAL)**;最后用 `bmad-check-implementation-readiness` 验就绪 |
| **输入** | `docs/prd.md`、`docs/architecture.md`、`docs/EXPERIENCE.md`（若做了 UX 阶段） |
| **产出** | `docs/epics/*`、`docs/stories/*.md`（每个含**验收测试大纲**）**、`docs/eval-plan.md`（LLM 功能）** |
| **决策门 G5** | ☑ 每个 story 上下文自包含 ☑ 可独立实现 ☑ 含 AC **且每条 AC 有验收测试设计（ATDD）** ☑ 把 telemetry/authz/rollback 落成具体任务 **☑ LLM 功能有 eval-plan（G-EVAL）或显式 SKIP** |
| **必查项** | 开发者拿到这个 story，**不回头翻别处**就能开工吗？DoD 写了吗？**每条 AC 的验收测试意图定义了吗**？**LLM 功能的 eval 集/grader/阈值定了吗**？ |
| **防返工** | "就绪门"防开发中途缺上下文；**测试左移**让验收标准在写码前就可测，防"事后补测凑覆盖率"；**eval 左移**让非确定的 LLM 输出在写码前就有可度量基线。 |
| **节奏** | **一次性起草整个 backlog，一次性集中评审，然后逐个提升。** `story-ready` 是按 scope 评估的（`--scope <STORY-ID>`），且路由器只聚焦第一个未完成的 story，因此未提升的草稿不阻塞任何东西。把 20 个草稿作为一张表一起评审，是砍掉/合并/重排范围唯一便宜的时机；逐个发现 backlog 只会把它藏起来。提升刻意保持串行——每个 story 应当先吸收前序故事的真实结论，再进入就绪。 |
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

> **verify-as-you-build（可选·opt-in）**：前端 story 实现后，可在 **agent 模式**用 **Playwright MCP**
> 驱动本地 dev server 自查刚写的交互——类似 Antigravity 的 Chrome 集成。浏览器 MCP **默认不启用**（避免
> 早期阶段被 eager 启动），需先 `cp .vscode/mcp.json.example .vscode/mcp.json`（沙箱锁 localhost）。这是
> **开发期便利**、非确定性；正式验证在阶段 7 用 `/eos-e2e` 固化成 Playwright 规格。详见 7.7。

---

## 阶段 7 — Testing（验证 + 可追溯）

| 项 | 内容 |
|---|---|
| **目标** | 按测试策略验证，建立 spec↔test 可追溯，并**验证 NFR 目标** |
| **何时进入** | G6 通过 |
| **怎么启动** | Chat 输入 **`bmad-tea`**（Murat）/ `bmad-testarch-test-design` / `bmad-testarch-automate` / `bmad-testarch-trace` / **`bmad-testarch-nfr`** / `bmad-qa-generate-e2e-tests`；**面向用户流程用 `/eos-e2e`**（编排 Playwright 框架+E2E 生成+trace，开发期可用 Playwright MCP 驱动浏览器自查，见 7.7）；**LLM 功能:按 `docs/eval-plan.md` 跑 eval 集 + 回归基线** |
| **输入** | `docs/prd.md`（AC 清单）、**`docs/checklists/C-nfr.md`（NFR 目标值）**、**`docs/eval-plan.md`（LLM 功能）**、`src/` 代码 |
| **产出** | 测试套件 + `docs/trace-matrix.md`（AC ↔ 测试映射，是*人*的判断）**+ `docs/evidence/test-run.json`**（*机器*的结果：哪个测试跑了、跑在哪棵产品树上、返回了什么）+ **`docs/evidence/nfr-summary.json`** + **`docs/evidence/eval-summary.json`**（LLM 功能）。自 eos-2.2.0 起，`verified` 门禁会根据你的测试运行器本就会输出的 JUnit XML 自行写出 `test-run.json`——只需声明 `"evidence": {"junit": ["reports/junit/*.xml"]}`；见 [examples/trace-evidence](../eos/examples/trace-evidence/README.md) |
| **生效规则 R6** | 金字塔结构；**每条 AC ≥1 测试**；`describe(<criterion id>)` 命名；无真实计时器/无顺序依赖；改动行覆盖率 ≥80%；**NFR 目标用 `bmad-testarch-nfr` 验证**；**LLM 输出用 eval 集+grader 验(非 exact-match),见 `ai/10-ai-llm` 规则** |
| **决策门 G7** | `node .github/eos/eos.mjs check --gate verified --scope <STORY-ID>` —— ☑ 每条 AC 追溯到一个**存在且真正跑过**的测试 ☑ 该次运行描述的是**这棵**产品树 ☑ **NFR 目标已验证，或延后且带负责人+触发条件** ☑ **LLM 功能：实测分数达阈值，且由 EOS 依据摘要自身的数字重算** ☑ **spec-alignment 量化（`/eos-spec-align`）**。1.13.0 之前，矩阵里手写一个 `PASS` 就够了 |
| **必查项** | 有没有"没被任何测试覆盖的 AC"？**C-nfr 里定的 P95/吞吐/SLO 有没有被验证**（而不是定了就忘）？延后的有没有显式标 trigger？**LLM 的 eval 分达阈值了吗?prompt/模型改动有没有跑回归?** |
| **防返工** | trace 矩阵让"漏测的验收标准"无所遁形；**NFR 验证让"定了目标却没人验"无所遁形**；**eval 回归让"改 prompt 改崩了别处"无所遁形**。 |
| **样例** | `my-app/test/auth.test.js`（10 个 AC-traced 测试全绿）、`my-app/docs/trace-matrix.md`（11/12 AC 有测试，1 个性能项显式 deferred） |

---

## 阶段 8 — Release（发布门禁）★ 硬门

| 项 | 内容 |
|---|---|
| **目标** | 过质量/安全/回滚/灰度/NFR 门后才发布 |
| **何时进入** | G7 通过 |
| **怎么启动** | Chat 输入 **`/eos-release-gate`**；缺 runbook 就先 **`/eos-runbook <service>`** |
| **输入** | 测试结果、NFR 验证结果（`docs/evidence/nfr-summary.json`——逐项测量目标，再用 [examples/nfr-summary](../eos/examples/nfr-summary/README.md) 写出）、`ops/runbook.md`。自项目声明之日起，`eos status` 就一直列着 G8 需要什么 |
| **产出** | 发布门禁报告（逐项 PASS/FAIL）、`ops/runbook.md`（每个服务一节） |
| **决策门 G8（硬门）** | `node .github/eos/eos.mjs verify-release --release <id>` 会跑完提示词列出的全部 13 项：① 候选已提交 ② **质量命令在这个候选上重跑** ③ story 已 VERIFIED ④ **每个 story 的验证描述的就是这棵树** ⑤ 规格对齐 ⑥ 密钥扫描 ⑦ 依赖审计 ⑧ NFR 证据 ⑨ 合规边界 ⑩ Waiver ⑪ Runbook：回滚**+灰度+健康/就绪** ⑫ 部署拓扑 ADR ⑬ 执行权威。**任一 FAIL 阻断发布**；`DEFERRED`（离线审计、带负责人+触发条件的 NFR）可见且绝不算绿 |
| **必查项** | 回滚步骤是"可执行的精确步骤"还是空话？灰度延后的有没有写 trigger？审计 0 漏洞吗？**NFR 目标验了没**？另外 `VERIFIED → APPROVED` 需要一位**不是候选准备者本人**记录的批准——任何模型、任何自动化都无法代劳 |
| **防返工** | 无回滚/无灰度/NFR 未验不得上线——堵"带病上线"。 |
| **样例** | `my-app/docs/release-gate.md`（适用项全过、`npm audit` 0 vulns）、`my-app/docs/trace-matrix.md`（性能 NFR 项显式 deferred+trigger）、`my-app/ops/runbook.md`（`FEATURE_LOGIN=off` 回滚） |

---

## 阶段 9 — Observability（埋点落地 + 运营闭环）★ 自 1.13.0 起为机器门禁

| 项 | 内容 |
|---|---|
| **目标** | 埋点上线、指标可见、形成运营闭环 |
| **何时进入** | G8 通过 / 发布后 |
| **怎么启动** | Chat 输入 **`/eos-telemetry-plan`** |
| **输入** | `docs/discovery.json`（成功指标）、代码中的事件 |
| **产出** | `docs/telemetry-plan.md`：事件清单（名/触发/属性）、事件↔指标映射、告警阈值、审计覆盖 |
| **决策门 G9** | `node .github/eos/eos.mjs check --gate telemetry-ready --scope <release>` —— ☑ **Discovery 的成功指标**作为具名信号发出 ☑ 有仪表盘 ☑ 每条告警都有 `routesTo`（没人接收的告警不是告警）☑ 定义了回滚触发条件 ☑ 有具名负责人。随后 `transition --to OBSERVED` |
| **必查项** | 阶段 1 定的每个成功指标，都有对应埋点事件吗？敏感操作有审计吗？告警阈值定了吗？ |
| **防返工** | 埋点在**需求阶段**就设计（D-ops），这里只做落实校验——避免上线后才发现"没法量化效果"。 |
| **样例** | `my-app/src/auth.js` 发出 5 个 `auth.*` 事件（attempted/succeeded/failed/session.created/destroyed） |

---

## 阶段 10 — Iteration（迭代 / 扩展 / 演进）★ 自 1.13.0 起为机器门禁

| 项 | 内容 |
|---|---|
| **目标** | 指标回流驱动下一轮需求；管理变更与架构演进 |
| **何时进入** | 上线运营后、有数据/反馈 |
| **怎么启动** | Chat 切到 **`（agent）eos-review`**（`bmad-correct-course` 变更管理、`bmad-retrospective` 复盘、`bmad-document-project` 棕地文档、`bmad-sprint-status`） |
| **输入** | `docs/telemetry.json` 的信号、用户反馈 |
| **产出** | 变更提案、下轮 backlog、retro 笔记、更新的 ADR |
| **决策门 G10** | `node .github/eos/eos.mjs check --gate iteration-ready --scope <release>` —— ☑ 每条学习都回写到**真实存在**的文档 ☑ 记录里写的是**这一次**发布（一份写回不能关闭此后所有发布）☑ Agentic 产品把生产反馈送入 eval 数据集，并为变更后的 prompt/模型重建基线 ☑ 决策有负责人。随后 `transition --to ITERATED` |
| **必查项** | 变更只改了代码、忘了回写 PRD 吗？（那就是 spec/code 漂移，反模式 P10） |
| **防返工** | `eos-review` 的 handoff 直接把你带回 `/eos-requirements`，闭环成下一轮 [2]。**被回滚**的发布也走这里：`ROLLED_BACK` 会路由到事故复盘，并经由同一条写回收口——它永远无法重新发布那个刚刚失败的候选。 |
| **样例** | `my-app/docs/prd.md §6 Iteration Log`：由埋点观察触发 CR-001，回写进 PRD |

---

## 6.x 阶段速查表（一页纸）

| 阶段 | 启动方式 | 产物 | 门 | → 下一步 |
|---|---|---|---|---|
| 1 Discovery | `（agent）eos-discovery` | `discovery.md` **+ `discovery.json`** | `discovery-ready` | `/eos-requirements "<f>"` |
| 2 Requirements | `/eos-requirements "<f>"` | `requirements.md` **+ `requirements.json`** | **`requirements-ready`★** | `/eos-spec` |
| 3 Spec | `/eos-spec` | `docs/prd.md` | `prd-ready` | `/eos-ux-spec`（后端可跳→ `eos-architecture`） |
| 3.5 UX & Design | `/eos-ux-spec`（或 `（agent）eos-design`） | `DESIGN.md`+`EXPERIENCE.md` **+ `design.json`** | `ux-ready`（条件） | `（agent）eos-architecture` |
| 4 Architecture | `（agent）eos-architecture` + `/eos-adr` + `/eos-deploy-topology` | `architecture.md` **+ `architecture.json`**+`openapi.yaml`+`adr/*` | `architecture-ready` | `（agent）eos-plan`（先锁栈+ADR+拓扑） |
| 5 Planning | `（agent）eos-plan` | `docs/stories/*` | `story-ready` | `bmad-dev-story` |
| 6 Development | `bmad-dev-story` → `bmad-code-review` | `src/*` + 审查结论 | `project-gate.mjs` | `/eos-e2e`（或 `bmad-tea`/`bmad-testarch-*`） |
| 7 Testing | `/eos-e2e`（或 `bmad-tea`/`bmad-testarch-*`） | 测试 + `trace-matrix.md` **+ `evidence/test-run.json`** | `verified` | `/eos-release-gate` |
| 8 Release | `/eos-release-gate`（+`/eos-runbook`） | 门禁报告 + runbook **+ `evidence/nfr-summary.json`** | **`release-ready`★** | `/eos-telemetry-plan` |
| 9 Observability | `/eos-telemetry-plan` | `telemetry-plan.md` **+ `telemetry.json`** | `telemetry-ready` | `（agent）eos-review` |
| 10 Iteration | `（agent）eos-review` | **`iteration.json`** + PRD 回写 | `iteration-ready` | ⟲ `/eos-requirements`（下一轮） |

> **不跳阶段**：每个 EOS 命令/agent 跑完都会提示"→ 下一步"（prompt 末尾的 **Next** 面包屑 + agent 的 **handoff** 按钮）。阶段 6/7 是纯 BMAD skill，`eos-plan` 的 "Start Development" handoff 已把下游尾链（dev→review G6→test G7→release G8）一次性交代给 agent，跑完不断线。

> **一次性硬化（阶段 0，别忘）**：`/eos-init` 把 CI 门从"契约性存在"变"合并阻断权威"（分支保护 + CODEOWNERS + 审批基线），进度记在 `docs/eos/activation.md`；`eos-doctor` **每次运行**都会 advisory 提示剩余项，`/eos-release-gate`（G8）发布前再核一次——这就是防"系统性遗忘"的三重提示。

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
npx degit niaodian/eos#eos-2.4.0 todo-api && cd todo-api
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs          # 期望 PASS
node .github/eos/eos.mjs init node-service --write   # 声明技术栈（或 python-service、go-service…——`eos init` 会列出全部）
git add -A && git commit -q -m "chore: declare the project"   # 连同策略锁与 SBOM；先按 §3.3 修改命令
```
**已定栈**？`eos init <pack> --write` 声明它；再用 `node .github/eos/eos.mjs stack sync --write` 把它的 `Local commands` 渲染进 `.github/instructions/00-workspace.instructions.md`。
**还没定**？改为声明 `eos init config-only --write`——栈的**权威锁定在第 4 步架构**（连同 ADR），届时 `eos init <pack> --write` 会保留你的轨道。SaaS 项目通常第 0 步就知道栈。

### 第 1–3 步：想清楚要做什么（Chat 里逐条输入）
```
（切到 agent）eos-discovery        → 产出 docs/discovery.md（问题+成功指标）
/eos-requirements "待办事项的增删改查，支持多用户隔离"   → docs/requirements.md（G2 硬门：五张清单）
/eos-compliance "医疗/金融等受监管才需"                → docs/compliance-profile.md（受监管加第六张 F；否则跳过）
/eos-spec                              → docs/prd.md（每条需求带验收标准 AC）
```
> **G2 硬门必过**：五张清单 A/B/C/D/E 无未决项。SaaS 项目尤其注意 **C-nfr 的性能/容灾**、
> **D-ops 的权限矩阵/数据生命周期**、**E-security 的多租户隔离**。

### 🔵 第 4 步：架构（SaaS 专属重点）
```
（切到 agent）eos-architecture     → architecture.md + data-model + api/openapi.yaml
/eos-adr "技术栈选型 / 数据库选型"       → 不可逆决策留 ADR；**在此锁栈**=更新 00-workspace + 启用 R3
/eos-deploy-topology                   → 选部署拓扑（裸进程/Docker/K8s/serverless/PaaS，取满足 NFR 的最简项）+ deployment-topology ADR
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
/eos-e2e                               → 面向用户流程 E2E（Playwright；开发期可用 MCP 自查）
/eos-spec-align                        → 量化：AC 覆盖率 / 一次过率 / 漂移
```
SaaS 的 **G7** 要求：每条 AC ≥1 测试、**API 契约测试**（对 openapi.yaml）、**DB 状态集成测试**
（事务 commit/rollback、约束、幂等）、NFR 目标已验证。
门禁读取的是*机器*结果，而不是手写的 PASS——自 eos-2.2.0 起，这一步不需要你写任何代码。让测试运行器输出 JUnit XML（node:test 用 `--test-reporter=junit --test-reporter-destination=reports/junit/node.xml`，pytest 用 `--junitxml=reports/junit/python.xml`，vitest、Playwright、Maven/Gradle、gotestsum 等同理），并在 `.eos/project.json` 中声明报告位置：`"evidence": {"junit": ["reports/junit/*.xml"]}`。`verified` 门禁会运行 `commands.test`，只读取本次运行写出的报告，据此回答 `docs/trace-matrix.md` 的每一行，并写出绑定产品树的 `docs/evidence/test-run.json`。请把 `/reports/junit/` 保留在 `.gitignore` 中（模板已经加好）。如果测试在 CI 的另一个步骤里运行：`node .github/eos/eos.mjs evidence junit --write`。可运行的 Node + Python 双栈示例见 [examples/trace-evidence](../eos/examples/trace-evidence/README.md)，决策见 ADR-016。

### 第 8–10 步：发布 + 观测 + 迭代
```
/eos-runbook todo-api                  → ops/runbook.md（回滚、灰度、健康检查）
/eos-release-gate                      → G8 五项门禁（质量+审计+NFR+回滚+灰度）
/eos-telemetry-plan                    → 埋点（SaaS 侧：QPS/延迟/5xx 黄金信号）
（切到 agent）eos-review            → 迭代回写 PRD
```

---

## 6.5.2 路径 B — Agentic / LLM 产品（概率性）

**示例目标**：做一个"智能客服 agent"（改订单地址，带工具调用）。与路径 A **主干相同**，
标 🟣 的是 **Agentic 专属**步骤。

### 第 0 步：建项目 + 建 AI 目录
```sh
npx degit niaodian/eos#eos-2.4.0 cs-agent && cd cs-agent
git init && git add -A && git commit -q -m "chore: scaffold from eos"
mkdir -p ai/prompts evals                       # AI 代码放这里，自动叠加 Agentic 规则
node .github/hooks/validate-config.mjs          # 期望 PASS
node .github/eos/eos.mjs init rag-app --write    # Python 的 LLM 包：agentic 范式 + eval 命令
git add -A && git commit -q -m "chore: declare the project"   # 连同策略锁与 SBOM；先按 §3.3 修改命令
```
栈选 Python（LLM 产品最常见）：`rag-app` 就是 Python 的 LLM 包——按你的项目调整它的命令，再从 stack-presets 加上 **AI/LLM 附加层**。

### 第 1–3 步：同路径 A（discovery → requirements → spec）
```
（切到 agent）eos-discovery
/eos-requirements "客服 agent：用户下单后改寄送地址，需鉴权、防越权、防注入"
/eos-compliance "涉 PHI/PAN/受监管个人数据才需"   → 受监管则当场定 Agentic 数据出境方案
/eos-spec
```
> Agentic 项目在 **G2** 尤其要在 requirements 里把 **eval 成功指标**（准确率/一次过率）、
> **成本/token 预算**、**注入防御**写清楚——这些是概率性产品的命脉。

### 🟣 第 4 步：架构（Agentic 专属重点）
```
（切到 agent）eos-architecture     → architecture.md（agent 编排图 + 工具 allow-list）
/eos-adr "编排策略：单趟状态机 vs ReAct 循环"
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
/eos-eval-spec                         → docs/eval-plan.md（G-EVAL 条件门）
```
`/eos-eval-spec` 让你**在写代码前**先定评估集——这是概率性系统的"ATDD"。评估集必须含：
黄金用例、**prompt 注入对抗用例**、RAG 召回率(recall@k)、工具调用准确率、成本/延迟预算。
> **不想从零写评估器？** 拷 `docs/eos/examples/eval-starter/`（零依赖可跑）改改即用。

### 🟣 第 6–7 步：写 AI 代码 + 跑评估
```
bmad-dev-story                     → ai/ 下的 agent/tools/chains + ai/prompts/ 版本化 prompt
bmad-code-review
node --test evals/eval.test.mjs    → 跑评估基线（G-EVAL 机器强制：达标才能过）
```
`evals/` 从 [examples/eval-starter](../eos/examples/eval-starter/README.md) 起步（Node；Python 栈用其中的 `python/`），并把同一条命令声明为 `commands.eval`。starter 会写出 `docs/evidence/eval-summary.json`——数值、阈值、模型、数据集与评分器，并绑定产品树——G-EVAL 读的正是它；仅仅退出码为 0 的评估命令不会通过。要评估你真实的模型而不是桩实现，用 `EVAL_AGENT=llm` 运行：通过 Node 内置 `fetch`（或 Python 标准库）调用任意 OpenAI 兼容端点，key 取自环境变量 / CI secret，并支持录制 / 回放——没有 key 时回放已提交的录制，摘要会标注为未经证明（unattested）（自 eos-2.2.0 起；见 starter 的 *Connect a real model*）。
写 AI 代码时**自动生效**的 Agentic 规则：prompt 存成文件（不内联字符串）、工具 typed schema、
temperature=0 可复现、把模型输出当**不可信**（防注入、输出审核、不放密钥/PII 进 prompt）、
LLM tracing（token/成本/context/tool-span）。

> **关键**：LLM 输出**不能用 exact-match 单测**（它是概率性的）——必须用**评估集 + grader + 回归基线**。
> 改了 prompt/模型跌破基线 = 不许发布。这是 SaaS 与 Agentic 最根本的测试差异。

### 第 8–10 步：发布 + LLM 观测 + 评估飞轮
```
/eos-release-gate                      → G8（含 secret-scan + 评估基线）
/eos-telemetry-plan                    → LLM 侧：token 消耗/context 占用/tool 链路 tracing
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

# 第 6.6 章 在 Claude Code、Codex 和 Antigravity 中使用 EOS

EOS 并不绑定 VS Code。引擎、门禁、证据和工作流在每个 agent 里都完全相同；不同的只是各 agent
从哪里读取配置、怎样调用工作流，以及需要你一次性确认哪些信任提示。自 eos-2.3.0 起，
`eos agents sync` 从同一个源头为每个平台写出各自的配置（[ADR-019](../adr/019-agent-platforms.md)）：
从模板新建的项目在 **Claude Code** 和 **Google Antigravity** 中开箱即用，**OpenAI Codex** 只需一条命令。
本章介绍这三个平台的配置与日常开发流程；所有平台及其文件的完整列表见 §7.9。

> 无论使用哪个 agent，有三件事永远不变：下一步由 `node .github/eos/eos.mjs next` 决定；门禁只凭已记录的
> 证据通过；批准、豁免和状态迁移始终是由人运行的命令。任何 agent、任何 MCP 工具都无法替你完成。

## 6.6.0 相同之处与不同之处

| | VS Code + Copilot | Claude Code | OpenAI Codex | Google Antigravity |
|---|---|---|---|---|
| 默认生成 | 是 | 是 | 否——`eos agents sync --platform codex --write` | 是 |
| 项目指令 | `AGENTS.md`、`.github/copilot-instructions.md`、`.github/instructions/` | `AGENTS.md`（仓库中没有 `CLAUDE.md` 时） | `AGENTS.md` | `AGENTS.md` |
| EOS 工作流（技能） | `.agents/skills/` · `/eos-next` | `.claude/skills/`（生成的副本）· `/eos-next` | `.agents/skills/` · `$eos-next` | `.agents/skills/` · `/eos-next` |
| BMAD 技能（用户级） | `~/.agents/skills/`（§2.2） | `~/.claude/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/`（IDE）· `~/.gemini/antigravity-cli/skills/`（CLI）——见 6.6.3 |
| 阶段编排 agent | `.github/agents/`——agent 选择器与 handoff 按钮 | 无：运行该步骤的技能，或交给它 handoff 包（6.6.4） | `.codex/agents/`——让 Codex 派生（spawn）对应 agent | `.agents/agents/`——选为当前 agent，或作为子 agent 运行 |
| 护栏钩子 | `.github/hooks/guardrails.json` | `.claude/settings.json` | `.codex/hooks.json` | `.agents/hooks.json` |
| EOS MCP 服务 | `.mcp.json` | `.mcp.json` | `.codex/config.toml` | `.agents/mcp_config.json` |
| 需要你一次性授予的信任 | 工作区与 MCP 服务 | 工作区与 MCP 服务 | 项目，以及每个钩子（`/hooks`） | MCP 工具每次调用都会询问，除非你放行 |

## 6.6.1 Claude Code

**配置**

1. 让 BMAD 可见：Claude Code 从 `~/.claude/skills/` 读取个人技能，即 §2.2 中的镜像目录。
   EOS 自己的工作流随仓库提供，位于 `.claude/skills/`。
2. 在项目根目录（包含 `.eos/` 和 `AGENTS.md` 的那一层）启动 Claude Code，并接受工作区信任对话框：
   ```sh
   cd my-app && claude
   ```
3. Claude Code 询问时，批准 `.mcp.json` 中的 `eos` MCP 服务。`/mcp` 显示其状态；
   `claude mcp reset-project-choices` 可以让它重新询问。
4. 输入 `/eos-next`。它会运行 `node .github/eos/eos.mjs next`，并给出唯一的下一步。

**接线情况与位置**

- `.claude/skills/eos-*`——EOS 工作流，是 `.agents/skills/` 的逐字节副本。请修改源头，再运行
  `eos agents sync --write`；手工改动副本会导致 CI 失败。
- `.claude/settings.json`——护栏 `node .github/hooks/deny-dangerous.js --format claude`，在每次
  `Bash`、`PowerShell`、`Write` 和 `Edit` 调用之前运行。该文件中你自己的权限和钩子都会保留；EOS 只拥有自己的条目。
- `.mcp.json`——`eos` 服务。问一句"下一步做什么？"，Claude 就可以调用 `eos_next`，而不必走终端。
- `AGENTS.md`——仓库中没有 `CLAUDE.md` 时会被读取。如果你新增了 `CLAUDE.md`，请在第一行写上
  `@AGENTS.md`。

**推进一个阶段。** Claude Code 不生成 EOS 子 agent：VS Code 也会读取 `.claude/agents/`，每个编排
agent 都会出现两次。当 `eos next` 点名某个 agent（例如 `eos-architecture`）时，运行它点名的
BMAD 技能（`/bmad-architecture`），或者把 handoff 包（6.6.4）交给 Claude，让它按照
`.github/agents/eos-architecture.agent.md` 执行。

## 6.6.2 OpenAI Codex

**配置**

1. 在项目根目录一次性生成 Codex 所需文件，并提交：
   ```sh
   node .github/eos/eos.mjs agents sync --platform codex --write
   node .github/eos/eos.mjs verify
   ```
   这会把 `codex` 加入 `.eos/project.json` 的 `agentPlatforms`——该文件是每个门禁的输入，所以随后要运行
   `verify`——并写出 `.codex/config.toml`（带标记的 `[mcp_servers.eos]` 块）、`.codex/hooks.json`
   和 `.codex/agents/eos-*.toml`。你原有的 `.codex/config.toml` 内容会保留。
2. 在项目根目录启动 Codex（`codex`、IDE 扩展或 ChatGPT 桌面应用），并**信任该项目**：Codex 只在
   受信任的项目中读取 `.codex/`。
3. 运行 `/hooks`，批准 EOS 护栏。钩子每次变化后，Codex 都会再次询问。
4. `/mcp` 会列出 `eos` 服务。`~/.agents/skills/` 中的 BMAD 技能可以直接被找到。
5. 输入 `$eos-next`。Codex 用 `$` 调用技能；`/skills` 可以列出全部技能。

**接线情况与位置**

- `.agents/skills/`——EOS 工作流，Codex 会在从当前目录到仓库根的每一层原生读取。
- `.codex/hooks.json`——在 `Bash` 和 `apply_patch` 之前运行的护栏。
- `.codex/config.toml`——`eos` MCP 服务，位于 EOS 标记并拥有的块中。
- `.codex/agents/eos-*.toml`——六个编排 agent，由 `.github/agents/` 渲染生成。

**推进一个阶段。** 当 `eos next` 点名某个 agent 时，让 Codex 派生它："Spawn the eos-architecture
agent to design the architecture." Codex 按名称查找自定义 agent，`/agent` 可以在运行中的 agent 线程之间切换。
技能写作 `$eos-requirements`、`$bmad-architecture` 等。

## 6.6.3 Google Antigravity

**配置**

1. 在 Antigravity IDE 中打开项目文件夹，或在其中启动 Antigravity CLI。它所需的文件已默认生成：
   `.agents/hooks.json`、`.agents/mcp_config.json` 和 `.agents/agents/`。
2. 让 BMAD 可见。Antigravity 从 `~/.gemini/config/skills/`（IDE 与 Antigravity 2.0）和
   `~/.gemini/antigravity-cli/skills/`（CLI）读取全局技能，而不是 `~/.agents/skills/`。
   在 macOS 和 Linux 上一次性建立链接（CLI 的目录同理）：
   ```sh
   mkdir -p ~/.gemini/config/skills
   ln -s ~/.agents/skills/bmad-* ~/.gemini/config/skills/
   ```
   在 Windows 上，请改为把 `bmad-*` 文件夹复制到 `%USERPROFILE%\.gemini\config\skills\`。
3. 输入 `/eos-next`。MCP 工具默认在每次调用前询问；`/mcp` 打开 MCP 管理器（在 IDE 中：
   **…** › **MCP Servers**）。

**接线情况与位置**

- `.agents/skills/`——EOS 工作流，原生读取。
- `.agents/hooks.json`——在每次 `run_command` 之前运行的护栏。
- `.agents/mcp_config.json`——`eos` 服务。
- `.agents/agents/eos-*.md`——六个编排 agent，由 `.github/agents/` 渲染生成。

**推进一个阶段。** 在对话中把 `eos next` 点名的 agent（例如 `eos-architecture`）选为当前 agent，
或者让主 agent 把它作为子 agent 运行。它遵循的指令与 Copilot 中的 `eos-architecture` 相同；
由于没有 handoff 按钮，它会直接说出下一个 agent。

## 6.6.4 各平台上的完整生命周期

`eos next` 在所有平台上用同一种方式描述每一步：一个斜杠命令、一个 agent、若干 BMAD 技能或一条命令。
阅读它的 **Start** 块，然后按下表换算：

| `eos next` 点名的是…… | VS Code + Copilot | Claude Code | OpenAI Codex | Google Antigravity |
|---|---|---|---|---|
| 斜杠命令 `eos-requirements` | `/eos-requirements` | `/eos-requirements` | `$eos-requirements` | `/eos-requirements` |
| agent `eos-architecture` | 切换到它，或点击它的 handoff 按钮 | 带上 handoff 包，按 `.github/agents/eos-architecture.agent.md` 执行 | "spawn the eos-architecture agent" | 选择 `eos-architecture`，或作为子 agent 运行 |
| 技能 `bmad-architecture` | agent 会自动使用 | `/bmad-architecture` | `$bmad-architecture` | `/bmad-architecture` |
| 一条命令 | 运行它 | 运行它，或让 Claude 运行 | 运行它，或让 Codex 运行 | 运行它，或让 agent 运行 |

**handoff 包在任何 agent 中都适用。** 它写明目标、要使用的 agent 和技能、相关文件（按哈希绑定），
以及完成后返回用的命令：

```sh
node .github/eos/eos.mjs handoff --scope story --id STORY-012   # 写出 .eos/handoffs/STORY-012.json
```

然后对 agent 说："执行 `.eos/handoffs/STORY-012.json`，不要扩大范围。"完成后，由 `eos next`
接手：门禁说了算，而不是 agent。

在 Claude Code 中输入 §1.3 的 Happy Path：

```
/eos-next                      → 第一步：/bmad-brainstorming → docs/discovery.md               (G1)
/eos-requirements "<feature>"  → docs/requirements.md                                         (G2)
/eos-spec                      → docs/prd.md                                                  (G3)
/eos-ux-spec                   → docs/DESIGN.md + docs/EXPERIENCE.md（纯后端可跳过）
/bmad-architecture             → docs/architecture.md + ADR                                   (G4)
/bmad-create-story             → docs/stories/*.md                                            (G5)
/bmad-dev-story                → src/ 代码，然后 /bmad-code-review                             (G6)
```

在 Codex 中把 `/` 换成 `$`。在 Antigravity 中，可以用阶段 agent 代替直接点名技能。

## 6.6.5 检查各项是否接好

| 检查项 | 做法 | 预期结果 |
|---|---|---|
| 护栏在运行 | 让 agent 运行 §2.4 中的探测命令 | 被密钥规则拒绝 |
| 工作流已加载 | `/eos-next`（Codex：`$eos-next`） | 六个块：Current、Blockers、Recommended next、Why、Start、Done when |
| MCP 服务有响应 | 问"下一步做什么？" | 在你一次性批准后，agent 会调用 `eos_next` |
| 生成的文件是最新的 | `node .github/eos/eos.mjs agents sync --check` | `PASS`；CI 运行同一项检查 |

## 6.6.6 Cursor、Gemini CLI 与第二梯队 agent

用同一条命令加入：`node .github/eos/eos.mjs agents sync --platform cursor --write`，或换成
`gemini`、`kiro`、`qwen`、`devin`、`opencode`、`cline`。Gemini CLI 默认不读取 `AGENTS.md`，EOS 会把它
加入 Gemini 的上下文文件列表。第二梯队的文件依据各厂商文档生成，**尚未在真实安装上验证**；
在依赖它们之前请先检查（§7.9）。

## 6.6.7 已知差异

- **handoff 按钮是 Copilot 独有的。** 在其他 agent 中，编排 agent 会直接说出下一个 agent 或斜杠命令，
  `eos next` 也会。
- **按范围生效的编码规则只在 Copilot 中自动加载。** VS Code 按文件 glob 应用
  `.github/instructions/**`。其他 agent 通过 `AGENTS.md` 找到这些规则（它指向规则所在位置）：请让 agent
  先阅读与它即将修改的文件对应的规则。
- **Claude Code 以技能而非 EOS 子 agent 的方式运行工作流**（6.6.1）。
- **BMAD 在每个 agent 中的位置不同**（6.6.0）。`eos-doctor --deep` 和 `eos next` 会检查所有这些目录，
  包括 Antigravity 的目录（自 eos-2.4.0 起，见 §2.2），BMAD 装在其中任何一个都算已安装。它们无法判断你的
  agent 读取哪个目录：只装在 `~/.agents/skills/` 中的 BMAD 能通过检查，但在你按 6.6.3 链接之前，
  Antigravity 仍然看不到它。
- **钩子是本地减速带。** 每个 agent 都会请你确认一次信任。如果钩子本身运行失败，有的 agent 会放行
  （Claude Code），有的会拒绝（VS Code）；CI 始终是最终权威（附录 D）。
- **VS Code 的 agent 会话也会运行 Claude Code 的钩子。** 如果 VS Code agent 会话中的每次工具调用都以
  "hook errored" 被拒绝，请检查 `.claude/settings.json` 运行的是普通命令行
  `node .github/hooks/deny-dangerous.js --format claude`（`eos agents sync --write` 可以恢复它），
  然后完全退出并重新打开 VS Code：重新加载窗口不会重启 agent host。

---

# 第 7 章 完整参考（速查）

## 7.1 斜杠命令（EOS 技能，`.agents/skills/`）

| 命令 | 作用 | 参数 | 产出 |
|---|---|---|---|
| `/eos-requirements` | 需求分析 + 运营前置（包裹 bmad-agent-pm / bmad-prd） | `<feature 或 docs/discovery.md 路径>` | `docs/requirements.md` |
| `/eos-spec` | 产出 PRD 真相源（bmad-prd） | `<docs/requirements.md 路径>` | `docs/prd.md` |
| `/eos-ux-spec` | 设计 UX/UI 视觉+体验契约（包裹 bmad-ux） | `<docs/prd.md 路径>` | `docs/DESIGN.md` + `docs/EXPERIENCE.md` |
| `/eos-eval-spec` | 设计 LLM/agentic 评估计划（条件门 G-EVAL） | `<docs/prd.md 路径>` | `docs/eval-plan.md` |
| `/eos-spec-align` | 量化规范对齐度（AC 覆盖率/一次过率/漂移，G7 度量） | — | 对齐度报告（`spec-align.mjs`） |
| `/eos-e2e` | 编排浏览器/E2E 测试（Playwright 框架+生成+trace）；开发期可用 Playwright MCP 驱动浏览器自查（见 7.7） | — | Playwright 规格 + `docs/trace-matrix.md` |
| `/eos-adr` | 记录一条架构决策 | `<决策标题>` | `docs/adr/NNN-*.md` |
| `/eos-deploy-topology` | 选部署拓扑（裸进程/Docker/K8s/serverless/PaaS）对齐 NFR 并落 ADR | — | 填 `G-deployment.md` + `docs/adr/NNN-deployment-topology.md` + `architecture.md` Deployment 段 |
| `/eos-nfr` | 把 C-nfr 逐行填具体目标值 | — | 更新 `C-nfr.md` + PRD NFR 段 |
| `/eos-compliance` | 受监管行业合规前置（制度选择+边界控制，条件用；走 F-compliance） | `<制度名 或 领域描述>` | `docs/compliance-profile.md` |
| `/eos-telemetry-plan` | 设计埋点并对齐成功指标 | — | `docs/telemetry-plan.md` |
| `/eos-release-gate` | 跑发布门禁（G8） | — | 门禁报告 |
| `/eos-runbook` | 生成运维 runbook（回滚、灰度发布、健康/就绪检查） | `<service 名>` | `ops/runbook.md`（每个服务一节）——G8 读取的文件 |
| `/eos-validate-config` | EOS 配置静态+语义体检 | — | 问题表（不改代码） |

自 eos-2.2.0 起，每个斜杠命令都是 `.agents/skills/eos-*/SKILL.md` 中的一个 **Agent Skill**——这是 Copilot（VS Code、CLI、云端 agent）、Codex、Cursor 与 Antigravity 原生读取的开放格式；VS Code 的 Agent Host 已不再加载 prompt 文件。Claude Code 只读取 `.claude/skills/`，因此 EOS 在那里保留一份逐字节相同的副本：请在 `.agents/skills/` 中修改技能，再运行 `node .github/eos/eos.mjs agents sync --write`（CI 会运行 `agents sync --check`）。在 Codex 中，命令写作 `$eos-spec`、`$eos-next` 等；`/eos-next`、`/eos-resume`、`/eos-status`、`/eos-help` 与 `/eos-init` 见第 1 章与 §3。

## 7.2 EOS CLI（`node .github/eos/eos.mjs <command>`）

以下全部离线、零依赖、跨平台。退出码：`0` 通过 · `1` 失败或迁移被拒 · `2` 阻塞/待执行/失效 · `3` EOS 自身无法求值。
只想查看而不想设卡时（shell 提示符、会话启动钩子、`&&` 串联），请用 `status` 或 `health`——只要 EOS 能够求值，
它们就退出 `0`；或用 `next --exit-zero` / `resume --exit-zero`（自 eos-2.4.0 起），它们以 `0` 代替 `1` 或 `2`，
EOS 无法求值时仍退出 `3`。该参数不会自行生效，`--json` 文档中的 `exitCode` 仍是真实判定。

| 命令 | 用途 |
|---|---|
| `next` | 唯一推荐的下一步动作、为什么、以及怎么开始（`--why`、`--all`、`--exit-zero`） |
| `resume` | 在新会话里恢复本机的关注点（`--exit-zero`） |
| `status` | 产品与当前 scope 处在哪里（`--changed`）；自 eos-2.2.0 起还会列出发布门禁（G8）将需要、但目前还不存在的东西：依赖审计、NFR 测量结果、runbook、部署拓扑 ADR（有了产品代码之后，`next` 也会点名其中缺失的项） |
| `check --gate <id> [--scope <id>]` | 真正跑一道门禁并记录证据 |
| `explain <gate>` | 按需打印某一道门禁的完整规则 |
| `transition --scope <type> --id <id> --to <STATE>` | 迁移一个 scope，由已记录的证据把守 |
| `approve --scope <type> --id <id>` | 记录一次批准——必须是与申请人**不同**的人 |
| `release-status` / `verify-release --release <id>` | 汇总就绪度 / 候选绑定的发布验证（G8） |
| **`product-tree`** | 一次验证所对应的产品树身份。`--json` 打印摘要；如果由你自己的运行器写摘要，必须把它写进去 |
| **`evidence junit [<report.xml>…] [--write]`** | 用 JUnit XML 报告回答 `docs/trace-matrix.md` 的每条引用，并写出 `docs/evidence/test-run.json`——用于测试在 CI 另一个步骤中运行的情形。比任何产品文件更旧的报告一律拒绝（退出码 2）。不带文件时读取 `evidence.junit`；`verified` 门禁每次运行都会做同样的转换 |
| **`providers`** | 本项目咨询哪些外部权威，以及它们此刻怎么说。默认不存在——一个都没配置时，每道门禁依然离线得出结论 |
| `waive --gate … --reason … --risk-owner … --expires …` | 记录一份有期限、有归属的豁免（不可豁免的门禁永远拿不到） |
| `handoff --scope <type> --id <id>` | 把当前步骤交接给另一个 agent/会话 |
| `ledger [--verify] [--against <ref>]` | 校验只追加的哈希链 |
| `focus --scope <type> --id <id>` | 设置本机的本地关注点（不携带任何权威） |
| `init [--write]` | 报告或创建本地的、非破坏性的集成文件 |
| `stage init <stage> [--write] [--interactive]` | 根据 schema 生成某阶段机器记录（`docs/<stage>.json`）及其文档的骨架：每个必填字段都放一个 `TODO(eos)` 占位符——在逐一回答之前，所有门禁都会拒绝这份记录，因此骨架永远不会推进阶段。样例见 [examples/stage-records](../eos/examples/stage-records/README.md)（自 eos-2.3.0 起） |
| `stack sync [--write]` | 依据 `.eos/project.json` 渲染常驻工作区规则的 `Local commands`，使散文不可能与 CI 实际执行的命令不一致。未声明技术栈时阻断而非猜测 |
| `agents sync [--platform <x>] [--write] [--check]` | 从同一个源头生成各 agent 平台读取的内容：技能副本、EOS 的 MCP 条目、以平台自身格式运行的护栏钩子，以及不会冲突的 agent。共享配置文件中不属于 EOS 的内容一律保留；`--platform` 把平台加入 `agentPlatforms`；CI 运行 `--check`（自 eos-2.2.0 起；多平台自 eos-2.3.0 起，见 7.9） |
| `mcp` | 通过 Model Context Protocol（stdio）把读取与验证类命令提供给 agent：`next`、`status`、`resume`、`health`、`explain`、`check`、`verify`、`release-status`、阶段骨架、`product-tree`、`doctor`、`policy check`。批准、豁免、状态迁移、发布签名以及一切改写治理文件的命令都刻意不作为工具提供（[ADR-018](../adr/018-mcp-server.md)）。各平台的客户端配置由 `eos agents sync` 生成（自 eos-2.3.0 起） |
| `doctor` | EOS 自身接线是否正确 |

**门禁 id**（`check --gate <id>`）：`activation` · `discovery-ready` · `requirements-ready` ·
`prd-ready` · `ux-ready` · `architecture-ready` · `story-ready` · `verified` · `release-ready` ·
`telemetry-ready` · `iteration-ready`。

## 7.3 编排 Agents（`.github/agents/`）

| Agent | 阶段 | 复用的 BMAD | handoff 去向 |
|---|---|---|---|
| `eos-discovery` | 1 问题定义 | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea | → `/eos-requirements` |
| `eos-design` | 3.5 UX/设计 | bmad-ux, bmad-agent-ux-designer(Sally), bmad-cis-design-thinking(Maya) | → `eos-architecture` |
| `eos-architecture` | 4 架构 | bmad-architecture（Winston） | → `eos-plan` |
| `eos-plan` | 5 计划 | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd | → `bmad-dev-story` → `bmad-code-review` |
| `eos-review` | 10 迭代 | bmad-correct-course, bmad-retrospective, bmad-document-project | → `/eos-requirements`（下一轮） |

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
> 仍不出现时的**替代路径**：直接用斜杠命令走流程——`/eos-requirements`、`/eos-compliance`、`/eos-spec`、`/eos-ux-spec`、`/eos-eval-spec`、
> `/eos-release-gate` 等 EOS 技能不依赖 agent 选择器，输入 `/` 即可看到。agent 只是"编排 persona"，
> 其能力都能用对应的斜杠命令/skill 手动触发（见 7.1 与 `docs/eos/agent-map.md`）。

Codex 和 Antigravity 会得到同样的六个编排 agent，由这些文件生成（`.codex/agents/`、`.agents/agents/`）；
Claude Code 以技能方式运行它们的步骤。见 [第 6.6 章](#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)。

## 7.4 规则文件（`.github/instructions/`）

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
| `release-ops/50-release-ops.instructions.md` | `**/{Dockerfile,*.yml,*.yaml}` | 部署拓扑（阶段 4/G4 定，见 `G-deployment.md`）、可复现构建、发布前置、health 端点 |

> R1 全局信念在 `.github/copilot-instructions.md`（不在上表，因为它是 always-on 顶层文件）。

## 7.5 项目级 Skill（`.agents/skills/`）

| Skill | 何时用 | 作用 |
|---|---|---|
| `eos-operational-readiness` | 阶段 2/4 | 强制对 10 项运营/NFR 做 ADOPT/SKIP/DEFER 决策，无空白 |
| `eos-compliance-skeletons` | 开发阶段（建 🟡 隐私控制时） | 指向可跑起步骨架（redaction/consent/DSAR/audit，四默认参考栈全实现：Node/ESM · Python/stdlib · Go · Java/JDK），把"该建什么"变成"起步脚手架"；`redactorFromProfile()` 自动读 `/eos-compliance` 的 **Regulatory regime:** 行选档 |

> 73 个用户级 `bmad-*` skill 见 `docs/eos/agent-map.md` 的阶段映射表。

## 7.6 Hooks（`.github/hooks/`）

| 文件 | 事件 | 作用 |
|---|---|---|
| `guardrails.json` + `deny-dangerous.js` | PreToolUse | 拦截危险操作 + **供应链投毒（`curl\|bash`/`--unsafe-perm`）+ 硬编码密钥字面量**（输出 `permissionDecision:"deny"`）。其他 agent 平台用 `--format <平台>` 运行同一个脚本，钩子由 `eos agents sync` 为它们生成（见 7.9） |
| `quality.json` | PostToolUse | 写文件后跑 lint+typecheck+test 质量门（**提示性**，非权威门禁：固定 exit 0；权威门禁是 CI 里的 `project-gate.mjs`） |
| `config-check.json` | PostToolUse | 每次编辑后自动跑 `validate-config.mjs`（配置 S1–S14）**＋ `eos-doctor.mjs`（SDLC 门诊 / G-EVAL 连线 / 密钥扫描）**（同样是提示性的） |
| `validate-config.mjs` | 手动/被 hook 调用 | 零依赖静态验证器（S1–S14：规则/agent/prompt frontmatter、glob、必需路径、hook 事件、**S12 `.eos/project.json` 项目声明有效性**、**S13 `.eos/` 工作流主干及其交叉引用**、**S14 常驻工作区规则不得描述本项目从未声明过的技术栈**） |
| `project-gate.mjs` | 手动 / **被 CI 调用（权威）** | 跨栈产品质量门：按 `.eos/project.json` 真的执行 install/lint/typecheck/test/eval。**fail closed**——`application` 缺 `commands.test`、有栈清单却没声明、工具链没装（BLOCKED）都是 exit 1 |
| `eos-doctor.mjs` | **PostToolUse（逐编辑，经 `config-check.json`）** / 手动 / 被 CI 调用 | 零依赖 SDLC 门诊：**D0 项目声明**、D1/D2 G-EVAL（以 `productParadigms` 声明为准，SDK/目录探测只是补网）、D3 G-UX、**D4 密钥扫描（调 `secret-scan.mjs`）**、**D5 合规数据边界（校验结构化 `docs/compliance-profile.json`，不再靠散文关键词）** |
| `secret-scan.mjs` | 手动 / 被 eos-doctor + CI 调用 | 密钥扫描：内置零依赖正则（硬编码密钥/私钥、误提交 `.env`）**＋ 若装了 `gitleaks` 自动叠加深度扫描**（`.gitleaks.toml` 白名单）；命中 exit 1、输出脱敏 |
| `spec-align.mjs` | 手动（`/eos-spec-align`）/ 被 CI 调用 | 规范对齐量化：解析 `prd.md`+`trace-matrix.md` → AC 覆盖率 / 一次过率 / 漂移——某行是否通过，有 `docs/evidence/test-run.json` 时以它为准，没有时才读 Result 列（自 eos-2.2.0 起）；`--strict` **fail closed**：缺文件、PRD 无 AC、矩阵无行、漂移、孤儿行、失败行均 exit 1 |
| `*.test.mjs` | `node --test` / CI | 门禁自身的回归测试（deny-dangerous / spec-align / project-gate / eos-doctor / check-doc-parity）——防止未来改动把这些语义悄悄改回"绿但空" |

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

## 7.7 六张需求清单（`docs/checklists/`；第六张仅受监管行业）

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

## 7.8 浏览器自动化测试（Playwright MCP）【新建补强·映射 VS Code MCP 原生机制】

想要"agent 亲自开浏览器点一点、截图自查"（类似 Antigravity 的 Chrome 集成）？VS Code + Copilot
的原生做法是 **MCP server + agent 模式**。模板把它做成**纯本地、沙箱化、默认关闭（opt-in）**的
Playwright MCP：

> **为什么默认关闭？**（这是 eos-1.7.1 修正的一个真实设计缺陷）MCP server 由客户端在**会话/对话启动时
> 一次性 eager 启动**，且是 **workspace 全局**的——**无法按 SDLC 阶段门控**。若把活动的 `.vscode/mcp.json`
> 随模板一起 ship，那么从**阶段 1 刚敲下一个 idea** 起，客户端（Copilot CLI / VS Code Chat 皆然）就会
> 弹"Starting MCP servers playwright…"去拉起浏览器——既无必要又浪费。VS Code 的 `chat.mcp.autostart`
> 是 Experimental 且仅 VS Code 生效，救不了 CLI。**唯一稳妥、跨客户端的做法：默认不给活动配置，等阶段 7 再
> opt-in。**

- **配置（inert）**：模板 ship 的是 **`.vscode/mcp.json.example`**——任何 MCP 客户端都**不会读 `.example`**，所以**什么都不会自启**。
- **阶段 7 启用（opt-in）**：`cp .vscode/mcp.json.example .vscode/mcp.json` 然后重载窗口/会话。这个活动的 `mcp.json` 被 `.gitignore` 忽略、**只留在本地**，永不提交回模板。用完 `rm .vscode/mcp.json` 即可停用。
- **配置格式**：顶层 key 是 **`"servers"`**（注意不是通用 README 里的 `"mcpServers"`——那是别的客户端格式）。
- **引擎**：`@playwright/mcp`（Microsoft 官方），走 accessibility tree、确定性强、无遥测；与 BMAD 的 `bmad-testarch-framework` 选定的 Playwright 同源。
- **护栏**：`sandboxEnabled: true` + 顶层 `sandbox` 把**文件写入锁到 workspace、网络锁到 localhost**（macOS/Linux 官方特性）——agent 驱动的浏览器只能打你自己的 dev server，出不了圈。
- **首次使用**：一次性联网 `npx playwright install chromium`（并让 `@playwright/mcp` 首次下载）；VS Code 首启会弹**信任对话框**。之后在 **agent 模式**的 tools 选择器里就能看到 Playwright 工具。

**用法**：跑 `/eos-e2e`（见 7.1）编排 `bmad-testarch-framework`（初始化）→ `bmad-qa-generate-e2e-tests` / `bmad-testarch-automate`（生成/扩展）→ `bmad-testarch-trace`（AC↔E2E 矩阵）。**开发期**若要 agent 用 Playwright MCP 驱动 localhost 复现/探索，先按上面 opt-in 启用，再把结论**固化成确定性 Playwright 规格**。

**诚实边界**：
- 浏览器 MCP **默认不启用**——**只在阶段 7 手动 opt-in**，避免早期阶段被 eager 启动打扰（见上"为什么默认关闭"）。
- MCP 那层是**非确定性**的——只用于开发期自查，**绝不进 CI**、**绝不替代**确定性规格。CI 只跑 Playwright 脚本（`eos-ci.yml` / `bmad-testarch-ci`）。
- `sandbox` 仅 macOS/Linux；网络白名单默认只放 `localhost`/`127.0.0.1`，若被测应用要拉外部资源（CDN 等）再按需加域名。
- 想要**真实 Chrome** 的深度性能/网络排障？`【可选】`换用 Google 的 `chrome-devtools-mcp`——但它**默认开启用量遥测 + 调 CrUX API**，纯本地务必加 `--no-usage-statistics --no-performance-crux`。
- 更进一步的"按需加载"方向：Playwright 官方也提供 **CLI + SKILLS** 形态（供 coding agent 按相关性懒加载，天然规避 eager 启动）——`【需在你的版本中核实】`成熟度，可作后续演进。
- agent 模式 + MCP 的具体 UI 随版本演进，`【需在你的版本中核实】`。

---

## 7.9 Agent 平台（`eos agents sync`）

EOS 只写一次，再为团队使用的每个 agent 平台生成各自的文件（[ADR-019](../adr/019-agent-platforms.md)）。大部分工作由三个开放标准承担——`AGENTS.md`、`.agents/skills/` 中的 Agent Skills，以及 `eos mcp` 服务（[ADR-018](../adr/018-mcp-server.md)）。其余部分由 `eos agents sync` 按各平台自己的格式写出：MCP 条目、工具调用前的钩子（同一个 `deny-dangerous.js`，以 `--format <平台>` 运行），以及在平台只读自家目录时生成的 agent 或技能副本。

| 平台 | 为它生成的内容 | 一次性信任步骤 |
|---|---|---|
| GitHub Copilot *（默认）* | `.mcp.json`——它的 agent、技能和 `.github/hooks/guardrails.json` 是模板自带的 | VS Code 在首次启动 MCP 服务前请你确认信任 |
| Claude Code *（默认）* | `.claude/skills/` 副本、`.claude/settings.json` 中的钩子、`.mcp.json` | Claude Code 会请你批准一次项目的 MCP 服务 |
| Google Antigravity *（默认）* | `.agents/hooks.json`、`.agents/mcp_config.json`、`.agents/agents/` | MCP 工具每次调用都会询问 |
| OpenAI Codex | `.codex/config.toml`（带标记的 `[mcp_servers.eos]` 块）、`.codex/hooks.json`、`.codex/agents/*.toml` | 信任该项目，并逐个批准钩子一次（`/hooks`） |
| Cursor | `.cursor/hooks.json`（shell 命令）、`.cursor/mcp.json` | MCP 每次调用询问（Run Modes） |
| Gemini CLI | `.gemini/settings.json`：把 `AGENTS.md` 加入 `context.fileName`、钩子（`BeforeTool`）、MCP | 信任该文件夹 |
| Kiro · Qwen Code · Windsurf / Devin Desktop · OpenCode · Cline *（第二梯队）* | `.kiro/…` · `.qwen/…` · `.devin/…` · `opencode.json` 与插件 · `.clinerules/hooks/PreToolUse` | 依据各厂商文档生成——**尚未在真实安装上验证** |

- **选择平台**：在 `.eos/project.json` 中设置 `"agentPlatforms"`。未声明时生成默认集合（Copilot、Claude Code、Antigravity）：即 `.agents/`、`.github/`、`.claude/` 和 `.mcp.json` 中的文件；它们同时让 Codex、Cursor 和 Gemini CLI 读到技能与 `AGENTS.md`，并让 Cursor 用上 Claude 的钩子。一条命令即可加入一个平台：`node .github/eos/eos.mjs agents sync --platform codex --write`。它会修改 `agentPlatforms`，而该文件是每个门禁的输入，所以之后请重新运行 `eos verify`。
- **共享文件仍归你所有。** EOS 只拥有自己的条目——`eos` 服务、运行 `deny-dangerous.js` 的钩子处理器、带标记的 TOML 块——从不拥有 `.claude/settings.json` 或 `.mcp.json` 的其余内容，也从不拥有你的钩子：你的钩子在 EOS 的钩子前后保持原有顺序；你自己的、在自有处理器旁运行护栏的 matcher 组，保持你写的样子。移除一个平台只删除 EOS 的条目和处理器；只有文件里不再剩任何其他内容时才删除该文件。EOS 无法安全合并的文件（带注释的 JSON、已经定义了 `eos` 或把 `mcp_servers` 写成内联表的 TOML）会被拒绝，而不是写到一半；也绝不会透过符号链接写入。EOS 写出的整个文件（Cline 钩子脚本、`eos-*` agent ……）只有在仍带有 EOS 标记时才会被替换或删除；该路径上你自己的文件绝不会被改动。
- **CI 运行 `agents sync --check`。** 请修改源头（`.agents/skills/`、`.github/agents/`、`.github/hooks/`），不要修改生成的文件。`eos upgrade` 会为你的平台重新生成这些文件，而不是拿它们与模板的副本比较。
- **不生成的内容：** Claude Code 子代理（VS Code 也读取 `.claude/agents/`，每个编排 agent 会出现两次；Claude Code 用技能运行同样的工作流）；Cline 的 MCP 条目（Cline 只读取全局的 `~/.cline/mcp.json`）；Trae、CodeBuddy 和 Comate——它们的文档无法抓取，在实机验证之前由 `AGENTS.md` 和 CLI 提供支持。

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
| S5 | error/warn | Always-on 预算：`copilot-instructions.md` ≤40 行（error）；每个 `applyTo:"**"` 规则文件 ≤300 词（warn） |
| S6 | warn | 文件名符合 `NN-area[-stack].instructions.md` 规范 |
| S7 | error | 必需路径/文件存在（copilot-instructions.md、instructions/、prompts/、agents/、hooks/、docs/eos/agent-map.md） |
| S9 | error | hook JSON 合法且 event 名有效 |
| S10 | error/warn | 每个 `.agent.md` 有 `name`（error，缺则 Chat 不按名列出）+ `description`（warn） |
| S11 | error | `.agents/skills/` 中每个技能都能加载：`name` 与其目录同名且有 `description`；EOS 自己的技能只带这两个字段。遗留的 `.github/prompts/` 会给出警告 |
| S12 | error/warn | `.eos/project.json` 合法；有技术栈清单却没有声明为 error（仅 Node 仓库为 warn） |
| S13 | error/warn | workflow、gates 与 agent map 能加载且相互引用一致（门禁、状态、Agent、Prompt、门禁 `enforces` 的编码）；要求合规边界的 Profile 必须声明它；文件缺失为 warn |
| S14 | error | always-on 工作区规则中的命令与声明的技术栈一致 |
| S15 | error | Prompt、Agent、Instructions、Skill 与 agent-map 交接说明只能引用真实存在的门禁、门禁编码、命令、状态、迁移、Prompt、Agent 与脚本（[ADR-011](../adr/011-prompts-cite-only-the-policy.md)） |

> 期望输出：`PASS`。任何 **error** 必须先修复再继续；**warn** 视情况处理。
> （以上为当前 `validate-config.mjs` 实际实现的检查项。）

## 8.2 语义验证（定期 / 大改后）

Chat 输入 **`/eos-validate-config`**：让 Agent 读 `.github/` 全量，检测规则矛盾、重复、
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

## 8.4 你的仓库里 CI 运行什么

`.github/workflows/eos-ci.yml` 随模板一起复制过来，它同时承担两件事：每个项目都要运行的治理门禁，以及
EOS 自己的测试套件（[ADR-021](../adr/021-eos-tests-run-only-in-eos.md)）。`.github/eos/ci-plan.mjs`
根据 `.eos/project.json` 区分二者：模板自带的声明标记为 `"templateDefault": true`，`eos init` 会把它
换成你的声明。

| 作业 / 步骤 | 在你的项目中 | 在 EOS 自身中 |
|---|---|---|
| `verify` —— validate-config、文档对齐、SBOM、治理版本、生成文档、agent 平台、doctor `--deep`、gitleaks 与密钥扫描、spec-align、账本、策略锁、`eos doctor` | 运行 | 运行 |
| `verify` —— 产品质量门（`project-gate.mjs`） | 运行**你**声明的 install / lint / typecheck / test / eval | 运行 EOS 声明的测试套件 |
| `verify` —— 五个 `EOS tests ·` 测试层 | 跳过 | 运行 |
| `coverage` 与 `cross-platform` | 跳过，不会启动任何 runner | 运行 |
| `release-candidate`（仅 tag） | 运行 | 运行 |

在你声明项目之前推送，CI 仍会运行 EOS 的测试套件；它们会通过，因为这时的代码树仍是模板本身。必需检查只勾选
`verify`（见[附录 D.1](#附录-d-实例化后硬化（让门禁具备权威）)）。

---

# 第 9 章 故障定位与排错

## 9.1 失败定位决策树

```
Agent 输出不符预期
├─ 某类文件时规则不生效   → 检查该规则的 applyTo glob（validate-config S2/S3）
│                            常见：用了逗号串 "a,b" 而非花括号 "{a,b}"
├─ 规则被覆盖/互相矛盾     → 跑 /eos-validate-config 语义检查；查多个 "**" 文件是否措辞冲突
├─ 斜杠命令不被识别       → 技能缺失，或其 name 与目录名不同（validate-config S11）
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
| 任何文件都错、措辞打架 | **规则**（多 always-on 冲突） | `/eos-validate-config` |
| 输入 `/x` 没反应 | **skill**（命名/frontmatter） | 看 `.agents/skills/x/SKILL.md` 是否存在、`name` 是否为 `x`、是否有 description（validate-config S11）；Claude Code：`eos agents sync --check` |
| 流程跳步、persona 不对 | **agent**（没切/handoff） | 看 Chat 当前 agent；看 handoffs 配置 |
| 危险命令通过 / 质量门没跑 | **hook**（schema/脚本/脚本缺脚本） | 用 7.5 的手动测试命令喂 JSON |

## 9.3 常见坑（实测）

- **VS Code 打开的是父目录而非项目根** → `eos-*` agent、`.github/instructions`、`.github/hooks` 全部静默失效（最常见坑）。从项目目录内 `code .`，Explorer 顶层应能直接看到 `.github/`（见 7.2 的 30 秒自检）。
- `code --version` 返回 `3.0.12` 是 shim，**不是真实版本**；真实版本看 VS Code 关于面板。
- 私有模板 `npx degit user/repo` 会失败 → 必须 `npx degit --mode=git user/repo`。
- PreToolUse 用错 schema（`decision:"block"` 是 PostToolUse 的）→ 拦不住。正确是 `hookSpecificOutput.permissionDecision:"deny"`。
- 多个 `applyTo:"**"` 文件**不是**冲突（薄、互补、单一职责），验证器 S3 已豁免。
- 改 `docs/prd.md` **不会**让所有 story 失效。story 证据只绑定它**自己引用**的那些验收标准，因此新增或改写无关的 `AC` 不会影响 backlog 其余部分；而改写或删除某个 story 引用的标准，才会正确地让该 story 变 `STALE`。验证（G7）同时绑定产品树，所以改 PRD 仍会重新打开它。
- **Claude Code 中看不到 `/eos-next`** → `.claude/skills/` 缺失或已过期：运行 `node .github/eos/eos.mjs agents sync --write`，并确认 `agentPlatforms` 包含 `claude`。
- **Codex 忽略了 `.codex/`** → 项目尚未被信任，或钩子尚未批准：先信任该项目，再运行 `/hooks`（§6.6.2）。
- **Antigravity 找不到某个 BMAD 技能** → 它从 `~/.gemini/config/skills/` 读取全局技能，而不是 `~/.agents/skills/`（§6.6.3）。
- **VS Code agent 会话中的每次工具调用都以 "hook errored" 被拒绝** → `.claude/settings.json` 中的 Claude Code 钩子无法运行；见 §6.6.7。

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
# 方式 A：degit（public 仓库，无需鉴权）
# 固定到 release tag：默认分支会移动，tag 不会。
npx degit niaodian/eos#eos-2.4.0 my-app
cd my-app && git init

# 方式 B：在 tag 上 clone，并开一段全新历史
git clone --depth 1 --branch eos-2.4.0 https://github.com/niaodian/eos.git my-app
cd my-app && git checkout --orphan main && git commit -m "chore: start from eos-2.4.0"

# 两种方式之后都要声明项目：模板自带的声明描述的是 EOS，而不是你的项目
node .github/eos/eos.mjs init                       # 两条轨道、所有起步包，以及当前的声明
node .github/eos/eos.mjs init config-only --write   # 还没有代码——或 <pack>，适用时加 --track regulated
```

## 10.3 分发给团队（纯本地、无企业依赖）

1. 所有人从**同一个 release tag**（`eos-2.4.0`）开始。默认分支会持续变动，
   不固定版本就意味着每个人拿到的都是略有差异的 EOS。
2. `【需组织/GitHub 设置】` GitHub **template repository** 属于所有者级设置：EOS 既无法替你设置，
   也无法在本地验证，所以别信本页面的说法——
   `gh repo view niaodian/eos --json isTemplate` 一行就能得到答案，而且这个答案可能在本仓库
   毫无变化的情况下改变。它为 `true` 时 `gh repo create --template` 可用；
   上面固定版本的 `degit` / `clone` 则始终可用，并且它们才是固定**版本**的手段。
3. 共享的 `bmad-*` 各自在本机用户级安装（一次）。用
   `node .github/hooks/eos-doctor.mjs --deep` 验证：当已映射的技能虽已安装但无法在本项目激活时，
   它报告 BLOCKED 而不是 PASS。
4. **不要**在配置里写任何企业内网/接口/SSO 依赖——保持离线可运行。

> `【可选扩展·需企业/网络环境】`：组织级 instructions 分发、私有 registry、cloud agents——
> 这些不在主路径，按需另行接入，不影响本地自包含。

## 10.4 版本化与升级

- 每次改 EOS 配置：改 `docs/eos/VERSION`（如 `eos-1.4.1`→`eos-1.6.0`），跑 `validate-config.mjs`，Conventional Commits 提交。
- 升级既有项目（2.1.0 起）：`eos upgrade --from <新版模板> --base <你当初起步的模板>`——默认只预览，加 `--write` 才执行。它逐个文件比较两份模板与你的副本：只有 EOS 改过的会更新，只有你改过的会保留，双方都改过的绝不覆盖——新版本放进 `.eos/local/upgrade/` 供手工合并。你的声明、证据、账本、豁免、story 与 README 永远不会被触碰。两份模板由你自己获取（degit 或带证明的发布 tarball），并用**新版本**的 CLI 运行；你自己的 ADR 从 100 起编号（[ADR-015](../adr/015-three-way-upgrades.md)）。用户级 `bmad-*` 独立升级。
- 变了什么：`eos upgrade` 会打印 [CHANGELOG.md](CHANGELOG.md) 中你的版本与新版本之间的条目（自 eos-2.3.0 起）。EOS 按发布火车发版——每周至多一个次版本，补丁版只包含安全修复与回归修复，破坏性变更只出现在次版本中——稳定之选是已发布满一周且没有补丁的最新次版本（[CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence)）。

### 10.4.1 从 `eos-1.12.0` 升级到 `eos-1.13.0`

本次发布关闭了 `eos-1.12.0` 审计的全部发现。它刻意**失败即关闭**：既有仓库会先变红再变绿，
而每一条红色都明确指出要补什么。

| 变了什么 | 你会看到什么 | 该做什么 |
|---|---|---|
| **证据绑定到被测产品树**（EOS-AUD-001） | 此前记录的门禁结果全部 `STALE`（"evaluator version changed"、"predates tested-product-tree binding"） | 重跑门禁：`eos check --gate story-ready --scope <id>`，然后 `eos check --gate verified --scope <id>`。没有任何东西丢失——旧证据仍可读，只是不再*当前*。 |
| **G1 / G2 / G-UX / G4 成为真正的门禁**（EOS-AUD-003） | Product 状态回落到 `UNINITIALIZED` 方向，`eos next` 要求 `docs/discovery.json`、`docs/requirements.json`、`docs/design.json`、`docs/architecture.json` | 在你已有的文档旁写出这四份结构化记录。提示词（`/eos-requirements`、`/eos-ux-spec`）与 Agent 会生成它们；Schema 在 `.eos/schemas/`。 |
| **Product 状态改名** | `PRD_APPROVED` → `PRD_BASELINED`，`ARCHITECTURE_APPROVED` → `ARCHITECTURE_BASELINED`，并新增 `UX_BASELINED` | 无需操作。Product 状态是*推导*出来的，Ledger 不必改写。改名的原因是：机器判定文档完整 ≠ 人批准了它。 |
| **验收标准必须被定义，而不只是被提及**（EOS-AUD-004） | `prd-ready` 报告 "referenced but never defined: AC…" | 把每条标准写成以其 id 开头并带正文的列表项、表格行或标题。 |
| **运营任务必须是决策**（EOS-AUD-005） | `story-ready` 报告 `Telemetry: "SKIP" with no reason` | 使用 `ADOPT — <任务>; owner: <谁>; verify: <如何验证>`、`SKIP — <理由>`，或 `DEFER — owner: <谁>; trigger: <什么条件结束它>`。 |
| **Trace 行需要机器结果**（EOS-AUD-006） | `verified` 报告 "a hand-written PASS … is a claim, not a result" | 从你的测试运行器输出 `docs/evidence/test-run.json`——见 [examples/trace-evidence](../eos/examples/trace-evidence/README.md)。自 eos-2.2.0 起，声明 `evidence.junit` 即可取代这个映射步骤。 |
| **发布门禁检查提示词所要求的一切**（EOS-AUD-007） | `release-ready` 新增候选质量、依赖审计、NFR 证据、灰度、健康/就绪、拓扑与执行权威 | 声明 `commands.audit`，记录 `docs/evidence/nfr-summary.json`，并扩展 `ops/runbook.md`。离线的审计是 `DEFERRED`，绝不是绿。 |
| **RELEASED 继续走向 G9 与 G10**（EOS-AUD-010） | `RELEASED` 之后，`eos next` 要求遥测而不是再发一次版 | 产出 `docs/telemetry.json`（`/eos-telemetry-plan`），再产出 `docs/iteration.json`（`eos-review` Agent）。 |
| **BMAD 运行时会被验证**（EOS-AUD-002） | `eos-doctor --deep` 可能报告 BLOCKED：技能已安装，但 `_bmad/` 运行时缺失 | 用 BMAD 自己的安装器安装项目运行时，或取消这些技能的映射。EOS 本身没有 BMAD 也能工作——见 [ADR-003](../adr/003-bmad-runtime-boundary.md)。 |

**这次升级没有任何一步是静默的。** 若某项无法被证明——没有 git 仓库、没有工具链、依赖审计没有网络——
它报告 BLOCKED 或 DEFERRED。它绝不报告 PASS，也绝不悄悄跳过。

既有仓库的最快路径：

```sh
node .github/eos/eos.mjs next        # 每一次都只告诉你下一件事
node .github/hooks/eos-doctor.mjs --deep
```


### 10.4.2 从 `eos-1.13.x` 升级到 `eos-1.14.0`

只有一件事需要你做决定，其余都是自动的。

**你必须说明每次发布装了什么。** 发布门禁不再假设"所有存在的 story 都属于每次发布"——这个假设会
让已完成的工作对每个未来候选反复重验、让两条发布列车无法并存，并且让审批在"被审批的内容发生变化"
之后依然有效。

```sh
node .github/eos/eos.mjs release init --release <id>   # 依据当前状态提出一份 manifest
$EDITOR .eos/releases/<id>.json                        # 由你决定：替换掉每一个 TODO 理由
node .github/eos/eos.mjs check --gate release-ready --scope <id>
```

`release init` 只会把**已经验证过**的 story 提议为纳入，其余一律列为携带 `TODO` 的排除项，等你替换。
它不替你做决定；而只要还有 story 既不在纳入也不在排除里，门禁就会拒绝这份 manifest。

| 其它变化 | 你会看到 | 该做什么 |
|---|---|---|
| **审批绑定到 manifest** | `what this release ships changed after it was approved` | 重新审批。这正是目的：当初的同意是针对某一组具体变更给出的。 |
| **机器摘要需要 `producer`** | `docs/evidence/*.json … producer is required` | 加上 `"producer": { "type": "local", "name": "<你的运行器>" }`；确实来自 CI 时用 `"type": "ci"`。 |
| **证据可信度会被报告** | `evidence-trust — test-run: UNATTESTED_LOCAL …` | 默认无需处理：本地证据照常通过。**受监管**产品会因此 BLOCKED；任何项目也可通过 manifest 的 `requiredEvidence` 主动提高要求。 |
| **G10 写回绑定内容** | `specWriteBack[0].targetDigest is required` | 记录每份被更新规格在**更新之后**的 SHA-256，这样日后被回退时能被发现。 |
| **项目根目录显式化** | `doctor --deep` 打印 `PROJECT root …（由 … 选定）` | 无需处理。当答案不应靠推断时，用 `--project-root` 或 `EOS_PROJECT_ROOT`。 |
| **项目级技能优先于用户级** | 项目内的副本（`.github/skills/<name>`；自 eos-2.2.0 起为 `.agents/skills/<name>`）现在胜出 | 无需处理，除非你此前依赖用户级技能遮蔽项目级——那从来不是预期行为。 |

来自 1.13.x 的已记录证据会变成 `STALE`（门禁版本已变），重跑门禁即可清除。没有任何东西需要手工编辑，
也没有任何东西被静默重新解释。


### 10.4.3 从 `eos-1.15.x` 升级到 `eos-1.17.0`

不需要你做任何决策，但既有项目上可能有一道门禁会新报失败。

| 变化 | 你会看到 | 怎么处理 |
|---|---|---|
| **锁定的技术栈必须落到常驻规则** | `architecture-ready` 失败，提示 `… still carries the PROVISIONAL placeholder` | 在 `.eos/project.json` 声明技术栈，然后跑 `node .github/eos/eos.mjs stack sync --write`——它会据此渲染 `Local commands` 区块。你的 ADR 从来不是问题：后续没有任何智能体会读它，它们全都读那条常驻规则，残留的 ⛳ 标记会持续让它们在 Python 项目上跑 `npm ci`。 |
| **story 证据跟随它所引用的验收标准** | 大多数 story 证据会 `STALE` 一次（`gate definition version changed`），此后不再因无关的 PRD 改动而失效 | 重跑 `eos check --gate story-ready --scope <id>`。此后，新增或改写一条你的 story **未引用**的标准不会让它失效——这正是"提前铺开整个 backlog"变得划算的原因。 |
| **阶段智能体自己跑门禁** | 每个阶段以预览、请求确认、门禁输出、点名下一阶段结束 | 无需处理。若某个智能体仍把命令丢给你粘贴，说明它没有遵守 `05-stage-closeout`，请当场指出。 |
| **可选的回答语言** | 不设置则无变化 | 在 `.eos/project.json` 加 `"language": "zh-CN"`（任意 BCP-47 标签）即可固定智能体的回答语言。非标签值现在会报错，而不是静默退回英文。 |
| **工作区规则不得与技术栈矛盾**（S14） | `validate-config` 报错：`… describe a node project … but .eos/project.json declares python` | 替换 `Local commands` 区块。S14 比较的是命令**属于哪个栈**，而非措辞，因此 `npm test` 与 `npm run test` 等同；栈无关命令（`make test`）与 `stacks: ["other"]` 永远不会被报告。 |

已记录证据会因门禁版本变动而 `STALE` 一次，重跑门禁即可清除。无需重写台账，也无需手工编辑。


### 10.4.4 从 `eos-1.17.x` 升级到 `eos-1.18.0`

增量升级。已有内容全部照常工作，但有三处行为变化，外加一项你会想要的正确性修复。

| 发生了什么变化 | 你会看到什么 | 你要做什么 |
|---|---|---|
| **账本在并发写入下是安全的** | 没遇到过就不会看到 | `appendEvent` 此前不加锁，两个进程同时写入（两个 Agent、Hook 与终端抢跑、CI 与本地抢跑）会让哈希链分叉，`ledger --verify` 随后报告一次根本没发生过的篡改。证据、Waiver、清单与 head 记录现在也都是原子写入。如果你曾见过莫名其妙的"账本被重写"，原因就在这里。 |
| **没有产品代码的仓库不再报告 PASS** | `project-gate` 以 `NOT_APPLICABLE: no product code was verified` 结束；`status` 与 `doctor` 显示 `NO PRODUCT CODE VERIFIED` | 无需动作 —— 退出码仍然是 0。如果你此前把那个 PASS 读成"代码已验证"，它从来就不是那个意思。代码落地后，请声明 `application`/`library` 并填写 `commands.test`。 |
| **门禁结果自带来源信息** | `check --json` 新增 `policySource`、`affectedArtifacts`、`rerunCommand`、`waiverEligible`；每项 Check 新增 `artifact` | 无需动作。原先解析散文的消费者现在可以直接读字段。 |
| **来自更新版 EOS 的文件现在会 fail closed** | `EOS ERROR — this repository was written by a newer version of EOS` | 升级 EOS。`eos migrate` 会说明版本差距，并且绝不会重写一个它无法完全理解的文件。 |

新增命令均为可选：`verify`（只跑本次改动可能影响到的门禁）、`health`（阻塞项、失效证据、Waiver、
趋势）、`migrate`、`sbom`、`docs`（从策略生成门禁参考、状态图与证据图）、`new`（从 Starter Pack
生成 `.eos/project.json`）。

`standard-product` 之上新增两档工作流 Profile：`controlled` 完全不允许 Waiver，`regulated` 在此
基础上还要求每次变更分类都记录理由。逐档严格不弱于下一档，并有测试强制这一点。通过
`.eos/project.json` 的 `workflowProfile` 切换，然后重新验证：
`node .github/eos/eos.mjs verify --full`。

### 10.4.5 从 `eos-1.18.x` 升级到 `eos-1.19.0`

补上一个缺口。已有内容全部照常工作。

| 发生了什么变化 | 你会看到什么 | 你要做什么 |
|---|---|---|
| **账本有了合并策略** | `git merge` 现在会在 `.eos/ledger/events.jsonl` 上**冲突**，而不是产出一条随后被 `ledger --verify` 拒绝的链 | 先运行 `node .github/eos/eos.mjs ledger --resolve` 查看方案，再加 `--write`。两侧都会按时间戳顺序重放进同一条链，不丢任何事件。 |
| **被合并的账本不再被称作篡改** | 显示 `MERGE DIVERGENCE, not tampering`，而不是 `the ledger was rewritten` | 无需动作。旧信息等于指控执行 `git merge` 的人重写了历史。 |

真正强制产生冲突的是 `.gitattributes` 规则。如果你在 1.19.0 之前拉取过模板，请把这两行复制到自己的
`.gitattributes`；没有它们，git 会按文本合并账本，并对一条已经损坏的链报告成功：

```gitattributes
.eos/ledger/events.jsonl -merge
.eos/ledger/head.json    -merge
```

### 10.4.6 从 `eos-1.19.x` 升级到 `eos-1.20.0`

已有内容全部照常工作。有一个新文件需要提交；另外，原先会指控你篡改的账本信息，现在会说出真实发生了什么。

| 发生了什么变化 | 你会看到什么 | 你要做什么 |
|---|---|---|
| **门禁不会再被悄悄放宽** | 新增 CI 步骤 `eos policy check`，把 `.eos/gates.json`、`.eos/workflow.json`、`.eos/project.json` 与基线分支比较。任何放宽都会失败：门禁改成 `not_applicable`、删掉检查、改成 `config-only`、换成更弱的 Profile、删掉质量命令。 | 运行一次 `node .github/eos/eos.mjs policy lock --write` 并提交 `.eos/policy.lock.json`。在此之前，没有放宽任何东西的变更仍然通过；有放宽的会失败。 |
| **放宽需要第二个人** | `eos policy lock --write --reason "<原因>"` 会起草确认记录，`approver` 留空 | 由请求人以外的人填写 `approver` 并提交。`eos policy diff` 会列出每一项变更及其分类。 |
| **收紧的 Schema 属于破坏性变更** | 一个会拒绝原本能通过的文件的 Schema 会被报告为 `BREAKING` | 提升受管文件的 `schemaVersion` 并注册迁移，或像放宽一样进行确认。 |
| **同一门禁的两次运行不再像篡改** | 证据与其账本条目作为一个整体写入。中途停止的运行会被报告为 `INTERRUPTED`，并给出补完它的命令。 | 无需动作。如果 `doctor` 显示 `INTERRUPTED`，重跑它给出的命令即可。 |
| **合并会重新检查状态历史** | `eos ledger --resolve` 之后，两个分支都改过的 Story 会通过一条 `reconcile` 记录，退回到双方最后一致的状态 | 重跑该 Story 的门禁。如果你曾用 1.19.0 解决过合并，`ledger --verify` 可能会要求你运行一次 `--resolve --write`。它只追加记录，之前的内容一概不变。 |
| **合并之前就会提醒你** | 当基线分支正在改动你也在改动的 Story 时，`status`、`next`、`verify` 会发出提醒 | 提前协调，或接受上面的 reconcile。EOS 只与你本地的 ref 比较，从不 fetch。 |
| **关注点按分支保存** | `eos resume` 不会再把另一个分支的 Story 交还给你 | 无需动作。1.20.0 之前保存的关注点仍然有效。 |
| **测试有时限、有计时** | 每个测试都有时间上限；`run-tests.mjs` 会打印每个文件的耗时；`eos health` 显示本机测试耗时趋势 | 无需动作。若要在自己的 CI 中防止测试逐渐变慢，设置 `EOS_TEST_BASELINE_ENV` 并用 `--record-baseline` 记录基线。 |

同时提交 `.gitignore`：它现在会忽略 `.eos/ledger/pending.json`，这是一个只在门禁运行期间存在的临时记录。

### 10.4.7 从 `eos-1.20.x` 升级到 `eos-1.21.0`

对大多数项目而言没有变化。有一种过去会被接受的声明现在会被拒绝；另外，CLI 的文件位置变了。

| 发生了什么变化 | 你会看到什么 | 你要做什么 |
|---|---|---|
| **`regulated` Profile 必须声明合规边界** | 声明了 `"workflowProfile": "regulated"` 却没有 `"complianceProfile": "regulated"` 时，每个命令都以 3（`ERROR`）退出，`validate-config` 报 `S13` 失败 | 加上 `"complianceProfile": "regulated"` 以及 `"evidencePolicy"`（`ci` 或 `attested`），或改选其他 Profile。面向受监管工作的 Profile，不能放行合规边界会拒绝的证据。 |
| **CLI 拆分为命令模块** | `.github/eos/eos.mjs` 现在只是一个小入口；各命令的处理逻辑位于 `.github/eos/commands/` | 把新版 `.github/` 合并进项目时，务必一并带上 `.github/eos/commands/`——缺了它 `eos.mjs` 无法启动。命令、参数、输出与退出码均不变。 |
| **策略锁记录合规要求** | 从 Profile 中删除 `requiresCompliance` 会在 `eos policy diff` 中被判为 `WEAKENING` | 如果你提交过 `.eos/policy.lock.json`：合并新的 `.eos/workflow.json` 后，`policy check` 会因锁已过期而失败，即使这次变更只是收紧。运行一次 `node .github/eos/eos.mjs policy lock --write` 并提交即可，无需确认。 |
| **未知命令名一律视为未知** | `eos constructor`、`eos toString` 过去会崩溃并以 1 退出；现在它们和任何拼写错误一样，是未知命令（退出码 3） | 无需动作。 |
| **管道输出完整送达** | 在 macOS 和 Windows 上，通过管道交给其他程序的较大 `--json` 文档可能被截断（Node 20 下截在 8 KB 处）：CLI 在管道排空之前就退出了 | 无需动作。若你的脚本曾为无法解析的 EOS 输出做重试或跳过处理，现在可以去掉。 |
| **所有测试层都在 Windows 和 macOS 上运行** | `cross-platform` CI 作业运行全部五层测试，而不只是 unit 和 contract | 无需动作。在比 GitHub 更慢的 runner 上，可用 `EOS_LAYER_TIMEOUT_MS` 放宽每层的兜底时限，就像 `EOS_TEST_TIMEOUT_MS` 放宽单个测试的时限一样。 |

合并 `.eos/workflow.json` 时请连同 `.eos/schemas/` 一起合并：旧的 Schema 不认识
`requiresCompliance`，会把新的 workflow 文件判为无效。

### 10.4.8 从 `eos-1.21.x` 升级到 `eos-1.22.0`

已有内容全部照常工作，除非你的某个 Prompt 引用了策略中不存在的名字——那样 CI 会指出具体文件和行号。

| 发生了什么变化 | 你会看到什么 | 你要做什么 |
|---|---|---|
| **Hook 以数据形式报告判定** | `project-gate.mjs --json` 与 `eos-doctor.mjs --json` 向 stdout 写出一份报告（`.eos/schemas/diagnostic.schema.json`），`eos check --json` 与 `eos verify-release --json` 新增 `problems[]` | 无需动作。不加 `--json` 时 Hook 的输出与之前完全一致，退出码也没有任何变化。 |
| **失败的测试就是 FAIL，即使它打印了 "BLOCKED"** | `verified` 与 `release-ready` 读取 project-gate 的判定，而不再搜索它的输出文本；输出超过 1 MB 的测试套件也不会再变成 `ERROR` | 合并时把 `.github/hooks/` 与 `.github/eos/` 一起合并。若 project-gate 是旧版本，门禁会报告一个有名字的 `ERROR`（"did not produce a valid diagnostic report"），绝不会当作通过。 |
| **Prompt 只能引用真实存在的东西** | 如果 Prompt、Agent、Instructions、Skill 或 agent-map 交接说明引用了策略中不存在的门禁、门禁编码、命令、状态、迁移、`/prompt`、Agent 或脚本，`validate-config` S15 会失败，并指出文件和行号，同时给出最接近的名字 | 修正它指出的引用。如果你的方法论使用某个没有独立门禁的门禁编码，请在执行它的门禁上声明（`.eos/gates.json` 中的 `enforces`），就像 `verified` 为 G6 与 G-EVAL 所做的那样。 |
| **Agent 映射以中英文生成** | `eos docs --write` 新增 `docs/eos/generated/actions.md` 与 `docs/zh/generated/actions.md` | 运行一次 `node .github/eos/eos.mjs docs --write` 并提交这两个文件；`docs --check` 会让它们保持最新。 |
| **Schema 错误会写出实际值** | 长度与边界错误现在写作 "0 is below the minimum 1"、"is 3 character(s), shorter than the minimum 64" | 无需动作，除非你的脚本匹配了旧措辞（"string shorter than"、"< minimum"）。 |

合并 `.eos/gates.json` 时请连同 `.eos/schemas/` 一起合并：旧的门禁 Schema 不认识 `enforces`。
已提交的 `.eos/policy.lock.json` 依然有效，因为 `enforces` 只是说明策略，并不改变策略。

### 10.4.9 `evidencePolicy` —— 你的发布证据需要多强的来源证明

`docs/evidence/*.json` 只是磁盘上的字节。CI 产出的摘要和人手敲的摘要**字节完全一样**，唯一区别是
`producer` 字段 —— 那是一个**声明**，不是证明。因此由项目声明它需要多强的来源证明，EOS 执行*它*：

| `evidencePolicy` | 发布证据必须…… |
|---|---|
| `local`（默认） | 任意来源，包括在笔记本上产生 —— 诚实，且对多数项目足够 |
| `ci` | 由 CI 产出（`"producer": { "type": "ci", … }`） |
| `attested` | 携带可被 adapter 验证的来源证明（Core 自身不验证任何 attestation） |

**受监管项目必须声明它。** 留空即失败，因为"没人决定"不是一种策略。它**可以**合法地选择 `local` ——
**气隙**环境根本无法访问任何 attestation 权威，若因此拒绝发布，就等于把最需要治理的那批用户排除在外 ——
但必须写下理由：

```jsonc
{
  "complianceProfile": "regulated",
  "evidencePolicy": "local",
  "evidencePolicyReason": "气隙网络；不存在可访问的外部 attestation 权威。"
}
```

这与 EOS 各处的 SKIP / DEFER 是同一个形状：**留空会被拒绝；写明决定就被尊重。**
见 [ADR-005](../adr/005-external-authority-boundary.md)。


### 10.4.10 Provider adapter —— 让 EOS 去问一个它自己当不了的权威

有两件事，跑在你笔记本上的程序无从知晓：服务端是否真的在强制分支保护，以及一个构建是否真的来自
它所声称的流水线。EOS 对这两件事都诚实地报告（`BLOCKED` / `UNVERIFIED`）然后止步。adapter 就是让
**够得着**这些权威的项目拿到真实答案的方式。

**默认不存在。** 没有 `.eos/providers.json` 时一切照旧：每道门禁依然离线得出结论。要启用：

```jsonc
{
  "schemaVersion": 1,
  "providers": [
    { "adapter": "github-governance", "subjects": ["enforcement-authority"],
      "options": { "branch": "main", "requiredChecks": ["verify"], "minApprovals": 1 } }
  ]
}
```

```sh
node .github/eos/eos.mjs providers      # 配置了什么，以及它此刻怎么说
```

**让这件事安全的那条规则：只有 `PASS` 能抬高结论。** 一个缺席、不可达、未鉴权、超时或崩溃的 provider，
会让结论**与任何 adapter 存在之前完全一致** —— 所以启用它永远不会让你变得更糟，也永远不会引入新的阻断。
**不知道，不构成证据。**

**只有 `activation` 与 `release-ready` 会咨询 provider。** 日常开发流（G1–G7）从不咨询，
因此任何 provider 故障都无法阻断日常工作。

**EOS 从不接触凭据。** adapter 委托给 `gh` —— 它已鉴权，token 存在它自己的 store 里；EOS 不传、不读、
也就不可能泄漏。而且 EOS 是**只读**的：它会告诉你分支保护缺失，但绝不会替你去设置 ——
因为能给自己授予强制权的工具，也能撤销它。

见 [ADR-005](../adr/005-external-authority-boundary.md) 与
[ADR-006](../adr/006-provider-adapters.md)。

## 10.5 从 `eos-1.22.x` 升级到 `eos-2.0.0`

`eos-2.0.0` 是一个大版本。它新增了两条治理轨道、签名的发布清单、在 CI 中出具证明的发布、中心策略
分发与治理报告（均见 §10.6），并改变了项目的声明方式。其余一切 —— CLI、退出码、证据、账本与豁免
的格式 —— 保持不变。

**对已有项目意味着什么**

1. **模板自己的声明会被标记为模板的。** EOS 自带的 `.eos/project.json` 带有 `"templateDefault": true`。
   合并时请保留你自己的声明 —— 永远不要拿模板的。如果某个项目仍在使用模板的声明，
   `project-declaration` 激活检查会失败，`eos next` 会把你引向 `eos init`。
2. **`eos init` 负责声明项目。** 在 1.x 中，`init` 只创建本地 VS Code 任务。现在 `eos init` 会展示
   当前的声明、两条轨道与所有起步包；`eos init <pack> --write` 写入声明；`eos init --write` 仍然创建
   本地文件。项目已经做出的声明，没有 `--force` 绝不会被替换 —— 唯一的例外是 `config-only`：代码
   落地时它可以直接换成一个包，并保留原来的轨道。`eos new <pack>` 依然可用。
3. **`release-ready` 现在是 4.0.0 版本**，新增两项检查：`manifest-signature` 与 `release-integrity`。
   在 Standard 轨道上，缺少签名或制品清单是 `NOT_APPLICABLE`；在两条轨道上，凡是存在的都必须
   验证通过。release-ready 3.x 记录的发布证据已过期，发布前请重新运行这道门。
4. **Regulated 项目需要一把发布密钥和来源证明。** 在 `complianceProfile: "regulated"` 下，发布门
   要求签名的清单，以及每个交付制品的来源证明（§10.6.2、§10.6.3）。只需生成一次密钥；如果由 CI
   为发布签名，请把私钥存为仓库机密 `EOS_RELEASE_SIGNING_KEY`。
5. **策略锁需要重新记录。** 这次升级加强了 `release-ready`，所以 `eos policy check` 会报告"自锁定
   以来策略已变化"。没有任何东西被放宽，因此不需要理由，也不需要第二位批准者。

**升级步骤**

```sh
# 1. 合并新模板的 .github/ 与 .eos/（gates.json、workflow.json、agent-map.json、
#    schemas/）—— 保留你自己的 .eos/project.json、证据、豁免、账本与发布清单
# 2. 检查声明与轨道
node .github/eos/eos.mjs init
# 3. 查看升级对策略的改动，记录下来，并重新生成派生文档
node .github/eos/eos.mjs policy lock
node .github/eos/eos.mjs policy lock --write
node .github/eos/eos.mjs docs --write
# 4. 重新验证：在旧门版本下记录的证据已过期
node .github/eos/eos.mjs verify --full
```

> 如果模板的 package.json 进入了你的仓库根目录，EOS 会把它当作工具，而不是 Node 项目：一旦它
> 有了依赖、入口文件，或某个脚本运行了 EOS 以外的东西，它就成了产品代码 —— 此时 `eos next` 会把
> 你引向 `eos init` 去声明技术栈。

## 10.6 治理轨道、签名发布与中心策略

### 10.6.1 选择治理轨道

每个项目处在两条轨道之一。轨道由声明推导而来 —— Regulated 轨道恰好等于
`complianceProfile: "regulated"` —— 因此不存在第三个可能与实际执行相矛盾的设置。`eos status` 与
`eos next` 会显示当前轨道，以及该轨道上的发布必须携带什么。

| | Standard（默认） | Regulated |
|---|---|---|
| 如何选择 | `eos init <pack> --write` | `eos init <pack> --track regulated --write` |
| 发布证据 | 可以在本地记录 | 必须来自 CI（`evidencePolicy` 为 `ci` 或 `attested`） |
| 签名的发布清单 | 存在时验证，从不强制 | 必需 |
| 每个制品的来源证明 | 存在时验证，从不强制 | 必需 |
| 发布时缺少签名 | `NOT_APPLICABLE`，并给出补上它的命令 | `FAIL` —— 发布被阻断 |

**第一天，还没有代码：** `eos init config-only --write`（适用时加上 `--track regulated`）。此后产品
质量门报告 `NOT_APPLICABLE`，绝不是 `PASS`。代码落地时，`eos next` 会把你引向 `eos init`，它会
点名与所发现代码相匹配的包；`eos init <pack> --write` 无需 `--force` 即可替换 config-only 声明，
并保留你的轨道。

**日后更换轨道**是一个刻意的动作：`eos init <pack> --track <track> --force`。从 Regulated 降到
Standard 会放宽策略，所以 `eos next` 与 `eos status` 会一直显示它，直到
`eos policy lock --write --reason "<why>"` 记录下这次放宽，并由第二个人在 `.eos/policy.lock.json`
中以批准者身份签认 —— EOS 记录这份批准，但从不替人授予它。

### 10.6.2 签名的发布清单

```sh
node .github/eos/eos.mjs release keygen --write                # 每个项目一次
node .github/eos/eos.mjs release init --release v1.4.0         # 生成清单骨架
node .github/eos/eos.mjs release bind --release v1.4.0         # 绑定制品、SBOM 与账本头
node .github/eos/eos.mjs release sign --release v1.4.0 --key ~/.config/eos/keys/my-app-release.pem
node .github/eos/eos.mjs release verify --release v1.4.0       # 签名、制品摘要、来源证明
```

- `release keygen` 把公钥写到 `.eos/keys/release.pub`，在 `.eos/project.json` →
  `release.signing.publicKey` 中声明它，并把私钥写到仓库之外（`~/.config/eos/keys/<repo>-release.pem`，
  权限 600）。任何位于仓库内的私钥路径都会被拒绝，哪怕是经由符号链接；万一私钥仍被提交，
  `secret-scan` 也会把它拦下。
- `release bind` 记录要交付的东西 —— `release.artifacts` 中列出的文件（例如 `"dist/*.tgz"`）及其
  SHA-256 摘要 —— 外加 SBOM 和已提交的账本头。它不向账本追加任何内容。
- 签名是对清单规范化 JSON 的 Ed25519 签名，因此 CRLF 检出或重新缩进的文件依然验证通过，而内容的
  任何改动都不会。签名绝不会改变批准所绑定的那个摘要。
- 发布门在候选提交上检查这两项：`manifest-signature`（错误的签名永远失败；缺少签名只在 Regulated
  上失败）与 `release-integrity`（每个列出的制品都与其摘要一致，且在 Regulated 上被来源证明覆盖）。

### 10.6.3 在 CI 中出具证明的发布

`.github/workflows/eos-release.yml` 负责构建你的发布并为其出具证明。推送 `v*` 或 `eos-*` 标签会运行
它；修改它的 pull request 会运行一次演练：出具证明，但不发布任何东西。

1. **plan** —— 从 `.eos/project.json` 读取轨道（工作流不保存这条规则的副本）。
2. **build** —— 把这一步换成你真实的构建；`dist/` 中的一切都会被出具证明。默认把仓库本身打成
   源码归档发布，并附带 SBOM 与 `SHA256SUMS`。
3. **attest** —— GitHub 制品证明（SLSA v1 来源证明），两条轨道都有。
4. **slsa** —— 仅限 Regulated：SLSA Build Level 3 生成器，固定在某个发布标签上。
5. **manifest** —— 绑定发布清单；配置了 `EOS_RELEASE_SIGNING_KEY` 机密时还会为它签名。
6. **publish** —— 一个带全部资产的 GitHub 发布草稿；在该轨道要求的每个作业都成功之前，什么都不会
   发布。

只有需要的作业才获得 `id-token: write`；`eos-ci.yml` 一个都没有。用
`gh attestation verify <file> --repo <owner>/<repo>` 验证发布，用
`eos release verify --release <id> --provenance <file>` 离线地把来源证明绑定到清单。想在不发布的
情况下演练 Regulated 路径，请在默认分支上以 `track=regulated` 手动触发该工作流。

### 10.6.4 中心策略分发

组织发布一份策略基线；每个仓库把它纳入仓库（vendor），并离线强制执行。

```sh
# 在组织的策略仓库中
node .github/eos/eos.mjs policy export --name acme-baseline --version 2026.10 --sign --key <private-key>
# 在每个项目中：先在 .eos/project.json 里声明 "policyUpstream"，然后
node .github/eos/eos.mjs policy sync --check    # 会改变什么 —— 不写任何东西
node .github/eos/eos.mjs policy sync            # 纳入 .eos/policy.upstream.json 并固定其摘要
node .github/eos/eos.mjs policy check           # 离线、在 CI 中运行：有没有比基线更弱的地方？
```

- `policyUpstream.source` 是一个 `https://` URL（只有回环地址允许明文 `http`，重定向一律拒绝），
  或指向策略仓库检出的 `file:` 路径；`policyUpstream.publicKey` 是签名基线必须通过验证的那把公钥。
- `policy sync` 是唯一会拉取策略的命令。`policy check` 始终离线：它把你的策略与纳入的基线对比，
  任何更弱之处都是一条带 `upstream:` 标识的 `WEAKENING`，和其他放宽一样需要理由与第二个人。
- 这道底线无法被悄悄移除：重新锁定会保留 `policy sync` 固定的摘要；签名基线在每次 `policy check`
  时都会重新验签；删除 `policyUpstream`（或把它指向别处）本身就是一条 `WEAKENING`。

### 10.6.5 治理报告

```sh
node .github/eos/eos.mjs report --format markdown --out governance.md
node .github/eos/eos.mjs report --org team-a.json team-b.json --format markdown
```

单个仓库的报告涵盖：轨道、每道门的最新结论及其在账本中的通过率、豁免、策略锁、SBOM 及其新鲜度、
发布签名，以及一份 `attention` 清单。`--org` 汇总多个仓库的 JSON 报告。每份报告在写出之前都会按
其公开的 Schema（`governance-report`、`governance-org-report`）校验。

见 [ADR-012](../adr/012-supply-chain-trust-model.md) 与
[ADR-013](../adr/013-central-policy-distribution.md)。

## 10.7 从 `eos-2.0.0` 升级到 `eos-2.0.1`

这是针对两道密钥防线的安全补丁：PreToolUse 钩子（`deny-dangerous.js`）与扫描器（`secret-scan.mjs`，
由 CI 和发布门禁 release-ready 的 `secret-scan` 检查调用）。策略、门禁、CLI、证据、账本与豁免都没有变化，
因此无需重新锁定，也无需重新验证。但扫描器现在会读取它过去跳过的行，所以在 2.0.0 上通过的项目可能在
2.0.1 上失败——一旦失败，就说明那里藏着一个硬编码的值。

| 变化 | 你会看到什么 | 你需要做什么 |
|---|---|---|
| **两道防线共用一套规则** —— `.github/hooks/lib/secret-rules.mjs` | 钩子与扫描器对"什么是密钥、什么是占位符"的判断一致；此前两者已各自漂移 | 无需操作——它随 `.github/hooks/` 一起到来 |
| **读取环境变量的行也会被扫描** | 字面量回退会被报告：`process.env.X \|\| "<LITERAL>"`、`os.environ.get("X", "<LITERAL>")`、`env("X", "<LITERAL>")`、`${X:-<LITERAL>}`，以及注释里提到环境变量的那一行上的密钥 | 删除字面量，把值放在环境变量或密钥管理服务里。开发用的默认值必须是明显的占位符（`change-me`、`<TOKEN>`） |
| **更多凭据写法与密钥格式** | JSON 键（`"password": "<VALUE>"`）、Django 的 `SECRET_KEY`、`.properties` / `.ini` / `.cfg` / `.conf` 中不带引号的 `key=value`、项目级 OpenAI 密钥、Anthropic 密钥、细粒度 GitHub 令牌、Stripe live 密钥，以及加密或 PGP 私钥 | 同上：把值移出代码，或换成占位符 |
| **钩子逐个字段读取工具调用** | 双引号写的凭据会被拦截（过去它被转义成 `\"` 而漏过）；文件里的两行不再被当成一条命令；文档可以提到命令；编辑时被替换掉的旧内容不再参与判断；无法解析的负载会被扫描，而不是直接放行 | 无需操作。过去 agent 写入仅仅提到某条命令的文档会被拦截，现在不会了 |
| **明显的占位符对钩子也不再算密钥** | `.env.example` 中的 `change-me`、`<TOKEN>` 之类的值不再被拦截 | 无需操作 |

**升级步骤**

```sh
# 1. 采用新模板的 .github/hooks/（deny-dangerous.js、secret-scan.mjs 与 lib/secret-rules.mjs）
# 2. 扫描，并把每个被报告的值移出代码
node .github/hooks/secret-scan.mjs
```

## 10.8 从 `eos-2.0.x` 升级到 `eos-2.1.0`

这是第一个可以用 `eos upgrade` 本身完成的升级——用 2.1.0 的 CLI 对你的项目运行它。门禁、策略与证据格式
都没有变化；变化的是 EOS 为满足它们提供给你的东西。

| 变化 | 你会看到什么 | 你需要做什么 |
|---|---|---|
| **`eos upgrade`**（[ADR-015](../adr/015-three-way-upgrades.md)） | 升级是逐文件的三方比较：更新、保留，或放进 `.eos/local/upgrade/` 等待手工合并——绝不覆盖 | 这次升级（见下）以及以后每次升级都用它。你自己的 ADR 从 100 起编号 |
| **eval-starter 会写出 G-EVAL 读取的摘要** | `docs/evidence/eval-summary.json`，绑定产品树；`python/` 中附带仅用标准库的 Python 版 | Agentic 产品：重新复制 starter（或把 `summary.mjs` 及其 `writeSummary` 调用加入你的运行器），并在 story 中引用它的 `EVAL-n` 编号 |
| **`init --write` 生成审批基线** | 从已提交的示例生成 `.vscode/settings.json`；缺失或被放宽时 `eos-doctor` 的 D8 会警告 | 每台机器运行一次 `node .github/eos/eos.mjs init --write` |
| **文档** | 快速开始新增*能力与依赖*与*已知局限*；ADR-014（信任链）；SaaS 第 7 步与 Agentic 第 6–7 步写明门禁读取的机器摘要 | 读一遍已知局限 |

**升级步骤**

```sh
npx degit niaodian/eos#eos-2.0.1 /tmp/eos-base    # 你当前的版本——见 docs/eos/VERSION
npx degit niaodian/eos#eos-2.1.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # 先看计划
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # 再执行
node .github/eos/eos.mjs policy lock && node .github/eos/eos.mjs verify --full
```

---

## 10.9 从 `eos-2.1.x` 升级到 `eos-2.2.0`

对于什么都不改的项目，门禁不会变得更严。变化在于斜杠命令的名称与格式，以及 EOS 现在能替你产出多少证据。

| 变化 | 你会看到 | 你要做什么 |
|---|---|---|
| **斜杠命令改为 Agent Skills**（[ADR-017](../adr/017-workflows-are-agent-skills.md)） | `.github/prompts/` 已移除；每个工作流都是 `.agents/skills/eos-*/SKILL.md`，`/spec` 变为 `/eos-spec`（见下表）。`.claude/skills/` 是为 Claude Code 生成的副本 | 改用新名称。你修改过的 prompt 会被升级命令报告为冲突并原样保留：把改动移植进对应技能，再删除 `.github/prompts/`（它存在期间 validate-config 会给出警告）。每次升级后运行 `eos agents sync --write`；设置 `"agentPlatforms"` 可停止为不用的平台生成文件 |
| **verified 门禁读取 JUnit XML**（[ADR-016](../adr/016-junit-test-evidence.md)） | 声明 `"evidence": {"junit": ["reports/junit/*.xml"]}` 后，G7 会根据本次运行写出的报告生成 `docs/evidence/test-run.json` | 可选——自己写摘要的项目照旧被读取。若要切换：让运行器输出 JUnit（见 [examples/trace-evidence](../eos/examples/trace-evidence/README.md)），声明它，重新锁定策略（REVIEW），并删掉你的映射步骤 |
| **起步包声明审计与证据** | 每个带代码的起步包都声明了 `commands.audit`；多数还声明了 `evidence.junit` | 已有的声明无需改动；若你的声明没有 `commands.audit`，请补上——缺了它 G8 会失败 |
| **`eos status` 预告发布门禁** | *Release gate ahead (G8)*：依赖审计、NFR 测量、runbook、拓扑 ADR（Regulated 轨道还有签名密钥）；`eos next` 会点名缺失项 | 在 story 推进期间就产出它们，而不是等到发布。NFR 测量见 [examples/nfr-summary](../eos/examples/nfr-summary/README.md) |
| **eval-starter 可评估真实模型** | `EVAL_AGENT=llm`：任意 OpenAI 兼容端点、key 取自环境变量、录制 / 回放；回放的结果标注为未经证明 | 可选：用你的模型录制一份 cassette 并提交 |

| 2.2 之前 | 自 2.2 起 |
|---|---|
| `/requirements` · `/spec` · `/ux-spec` · `/nfr` | `/eos-requirements` · `/eos-spec` · `/eos-ux-spec` · `/eos-nfr` |
| `/adr` · `/deploy-topology` · `/compliance` | `/eos-adr` · `/eos-deploy-topology` · `/eos-compliance` |
| `/eval-spec` · `/e2e` · `/spec-align` | `/eos-eval-spec` · `/eos-e2e` · `/eos-spec-align` |
| `/release-gate` · `/runbook` · `/telemetry-plan` · `/validate-config` | `/eos-release-gate` · `/eos-runbook` · `/eos-telemetry-plan` · `/eos-validate-config` |
| `/eos-next` · `/eos-resume` · `/eos-status` · `/eos-help` · `/eos-init` | 不变 |

**升级步骤**

```sh
npx degit niaodian/eos#eos-2.1.0 /tmp/eos-base    # 你当前的版本——见 docs/eos/VERSION
npx degit niaodian/eos#eos-2.2.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # 先审阅计划
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # 再执行
node .github/eos/eos.mjs agents sync --write && node .github/eos/eos.mjs policy lock && node .github/eos/eos.mjs verify --full
```

## 10.10 从 `eos-2.2.x` 升级到 `eos-2.3.0`

对于什么都不改的项目，没有任何东西变得更严。新的是每个 agent 平台能从 EOS 得到多少，以及两条以前没有的接入路径：MCP 服务与存量项目接入。

| 变化 | 你会看到 | 你要做什么 |
|---|---|---|
| **Agent 平台的文件改为生成**（[ADR-019](../adr/019-agent-platforms.md)） | 出现 `.mcp.json`、`.claude/settings.json`、`.agents/hooks.json`、`.agents/mcp_config.json` 和 `.agents/agents/`——默认平台是 Copilot、Claude Code 和 Antigravity。升级会为你的平台重新生成它们，而不是拿它们与模板的副本比较 | 如果你原本就有 `.claude/settings.json` 或 `.mcp.json`，你的内容会保留，EOS 只加入自己的条目。使用 Codex、Cursor 或 Gemini CLI：`eos agents sync --platform <名称> --write`。声明 `"agentPlatforms"` 可以少生成一些（§7.9） |
| **`eos mcp`**（[ADR-018](../adr/018-mcp-server.md)） | 你的 agent 可能会请你确认一次是否信任 `eos` MCP 服务 | 确认，或者拒绝：CLI 照常可用 |
| **新的工作流 profile：`delivery-only`**（[ADR-020](../adr/020-brownfield-delivery-gates.md)） | `eos policy check` 报告策略已变化，所有已记录的门禁结果都变为 STALE（`.eos/workflow.json` 变了） | `eos policy lock` 会显示新增了一个 profile、没有任何削弱；用 `--write` 重新锁定，然后运行 `eos verify --full`。尚未接入 EOS 的已有系统，见 §3.5 |
| **`eos stage init`** | 阶段记录可以从 schema 生成的骨架起步 | 可选；带 `TODO(eos)` 占位符的骨架永远不会通过门禁 |
| **CI 要求 gitleaks** | `eos-ci.yml` 会安装版本固定、校验过 checksum 的 gitleaks，并设置 `EOS_REQUIRE_GITLEAKS=1` | 无需操作，除非你的 CI 无法下载它——那就去掉这个变量，保留内置扫描 |
| **护栏能说各平台的"方言"** | `deny-dangerous.js --format <平台>` | 无需操作：生成的钩子会传入它 |

**升级步骤**

```sh
npx degit niaodian/eos#eos-2.2.0 /tmp/eos-base    # 你当前的版本——见 docs/eos/VERSION
npx degit niaodian/eos#eos-2.3.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # 先审阅计划
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # 再执行，并重新生成各 agent 平台的文件
node .github/eos/eos.mjs policy lock --write && node .github/eos/eos.mjs verify --full
```

## 10.11 从 `eos-2.3.x` 升级到 `eos-2.4.0`

对于什么都不改的项目，没有任何东西变得更严。`.eos/gates.json`、`.eos/workflow.json` 和评估器版本都没有变，所以已记录的门禁结果保持 FRESH——绑定产品树的门禁（`verified`、`release-ready`）除外：EOS 自身的文件属于产品树，所以每次升级后它们都要重跑。

| 变化 | 你会看到 | 你要做什么 |
|---|---|---|
| **CI 加入 Node 24；Node 20 已停止维护** | `eos-ci.yml` 在 Linux、macOS 和 Windows 上运行 Node 20、22 和 24——多了一个作业。`engines` 仍是 `>=20.10.0` | 让开发者和你自己的 CI 改用 Node 22 或 24；只有在不得不用时才保留 20 |
| **Node 24 的 JUnit 报告会记录每个测试所在的文件** | 在 Node 24.11 及以后，`docs/evidence/test-run.json` 中写的是 `"match": "file"`，Node 20 和 22 上是 `"name"`；其中的路径相对于仓库 | 各台机器和 CI 用同一个 Node 主版本做验证：换一个主版本运行会重写 `test-run.json`，而每个 story 的 `verified` 证据都绑定这个文件 |
| **能在 Antigravity 读取的目录中找到 BMAD** | BMAD 只为 Antigravity 安装时，`eos next` 和 `eos-doctor --deep` 不再报告它缺失（§2.2） | 无需操作 |
| **runbook 是 `ops/runbook.md`** | `eos-runbook` 技能和文档写的是 G8 读取的文件；原先写的是 `ops/runbook-<service>.md`，而 G8 从不读取它 | 如果你有 `ops/runbook-<service>.md`，把它合并进 `ops/runbook.md`，每个服务一节 |
| **`eos next --exit-zero`、`eos resume --exit-zero`** | 新的、需显式开启的参数（§7.2） | 在卡片不应让串联失败的地方使用——提示符、钩子、`&&`；`3` 仍表示 EOS 无法评估 |
| **编排 agent 在每种工具中都读得通** | `.agents/agents/`（以及 `.codex/agents/`）说明了在每种工具中如何进入下一个 agent | 无需操作：升级会重新生成它们 |
| **EOS 自身的覆盖率阈值提高** | `.eos/test-budget.json` 为 EOS 自身的测试套件设为 97 / 79 / 96 | 无需操作，除非你改过这个文件——那样升级会暂存一个冲突，留给你合并 |

**升级步骤**

```sh
npx degit niaodian/eos#eos-2.3.0 /tmp/eos-base    # 你当前的版本——见 docs/eos/VERSION
npx degit niaodian/eos#eos-2.4.0 /tmp/eos-next
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base          # 先审阅计划
node /tmp/eos-next/.github/eos/eos.mjs upgrade --from /tmp/eos-next --base /tmp/eos-base --write  # 再执行，并重新生成各 agent 平台的文件
node .github/eos/eos.mjs policy check && node .github/eos/eos.mjs verify --full
```

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
| P3 | 全部规则塞进 copilot-instructions.md | always-on 爆、污染所有会话 | R1≤40 行（S5 门禁）；按 applyTo 分薄片 |
| P4 | 重复造轮子（已有 bmad-* 却新建） | 双维护、漂移 | 交付件标来源；agent-map.md |
| P5 | 以为有原生优先级 | 版本变化后静默错 | 靠 applyTo + Hooks，不靠顺序 |
| P6 | 逗号串多 glob `"a,b"` | 行为未验证 | 用花括号 `{a,b}` + 子文件夹；S2/S3 |
| P7 | PreToolUse 用 `decision:"block"` | 拦不住危险操作 | 用 `permissionDecision:"deny"` |
| P8 | 规则膨胀单文件超长 | token 超预算被截断 | 单一职责拆分 |
| P9 | 无 ADR 做不可逆决策 | 团队失忆 | G4 必须有 ADR；`/eos-adr` |
| P10 | 跳过 Spec 直接出码 | 代码与需求漂移 | G3 是 G5 前置；无 prd.md 不进 Planning |
| P11 | 无回滚/灰度就发布 | 出事无法撤 | G8 五项门禁；`/eos-release-gate` |
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
| 契约性 vs 技术权威 | CI 门"存在"是契约性；只有下游开启**服务端分支保护**要求 `verify` 通过，才变成"合并阻断"的技术权威 |
| activation（实例化后硬化） | 从模板实例化后的一次性动作（分支保护 + CODEOWNERS + 审批基线 [+ 受监管则合规档案]）；台账 `docs/eos/activation.md`，引导 `/eos-init`，详解附录 D |
| keystone | 让门禁具备权威的"拱心石"：CODEOWNERS + settings 基线随仓提供，服务端分支保护由下游启用 |

---

# 附录 B 命令速查卡

```
# ── 终端 —— 唯一循环（日常只需要这些）──
npx degit niaodian/eos#eos-2.4.0 my-app   # 新建项目
node .github/eos/eos.mjs init                       # 当前声明、两条轨道、所有起步包
node .github/eos/eos.mjs init <pack> --write        # 声明项目（未定栈时用 config-only；--track regulated）
node .github/eos/eos.mjs init --write               # 本地 VS Code 任务（绝不覆盖已有文件）
node .github/eos/eos.mjs next                       # 唯一的下一步、为什么、怎么开始
node .github/eos/eos.mjs resume                     # 新会话？接着上次继续
node .github/eos/eos.mjs check --gate <id> --scope <id>   # 证明这一步，并写入证据
node .github/eos/eos.mjs transition --scope story --id <id> --to <STATE>
node .github/eos/eos.mjs explain <gate>             # 按需展开某一个门禁的完整规则
node .github/eos/eos.mjs release keygen --write     # 一次性：发布签名密钥（私钥留在仓库之外）
node .github/eos/eos.mjs release bind|sign|verify --release <id>   # 绑定制品 + SBOM + 账本头；签名；验证
node .github/eos/eos.mjs policy sync --check        # 组织基线会带来哪些改变
node .github/eos/eos.mjs report --format markdown   # 治理报告：门、豁免、SBOM、签名
npx --offline eos <command>                         # 同一个 CLI，更短的写法（npm 10.9+）
node .github/hooks/validate-config.mjs              # 配置自检（期望 PASS）
npm test                                            # 跑测试（质量门同款）
npm audit                                           # 发布前依赖审计

# ── Claude Code · Codex · Antigravity（第 6.6 章）──
/eos-next  /eos-resume  /eos-status     # Claude Code 与 Antigravity：同样的技能
$eos-next  $eos-resume  $eos-status     # Codex 用 $ 调用技能
node .github/eos/eos.mjs agents sync --platform codex --write   # 加入一个平台（一次即可，然后提交）
node .github/eos/eos.mjs handoff --scope story --id <id>        # 某一步的上下文，供任何 agent 使用

# ── Copilot Chat（Agent 模式）──
（agent）eos-guide            # 统一入口：读状态、给一个动作、负责交接
/eos-next  /eos-resume  /eos-status   # 同一循环的 prompt 形式
/eos-help                    # 迷路了？打印记忆卡 + 你在哪个阶段 + 下一步（只读，不改文件）
/eos-init                    # 阶段0：一次性硬化（分支保护 + CODEOWNERS + 审批基线 → activation.md）
（agent）eos-discovery        # 阶段1：问题定义        → G1
/eos-requirements "<feature>"    # 阶段2：需求+运营前置    → G2★
/eos-spec                        # 阶段3：PRD 真相源       → G3
/eos-ux-spec                     # 阶段3.5：UX 视觉+体验契约 → G-UX（面向用户必做，纯后端跳过）
（agent）eos-architecture     # 阶段4：架构            → G4
  /eos-adr "<decision>"          #   └ 每个不可逆决策
  /eos-nfr                       #   └ 填 NFR 目标值
（agent）eos-plan             # 阶段5：拆 story         → G5
bmad-dev-story               # 阶段6：实现            → G6
bmad-code-review             #   └ 完成前代码审查(无阻断项) → G6
bmad-tea / bmad-testarch-*   # 阶段7：测试+追溯        → G7
/eos-runbook <service>           # 阶段8：先备 runbook
/eos-release-gate                # 阶段8：发布门禁         → G8★
/eos-telemetry-plan              # 阶段9：埋点闭环         → G9
（agent）eos-review           # 阶段10：迭代回写        → G10
/eos-validate-config             # 任意时：配置语义体检
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
| 8 Release | `my-app/docs/release-gate.md`、`my-app/ops/runbook.md` |
| 9 Observability | `src/auth.js` 5 个 `auth.*` 事件 |
| 10 Iteration | `my-app/docs/prd.md §6`（CR-001 回写） |
| 验收报告 | `my-app/docs/eos/walkthrough.md`（完整 scorecard + 复现命令） |

**复现**（终端）：
```sh
npx degit niaodian/eos#eos-2.4.0 my-app && cd my-app
node .github/hooks/validate-config.mjs        # PASS
npm test                                       # 10/10 green
echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | node .github/hooks/deny-dangerous.js  # deny
```

---

# 附录 D 实例化后硬化（让门禁具备权威）

> 为什么需要这一步：EOS 的硬强制是**"契约性"**的 —— 3 道 CI 硬门（validate-config / eos-doctor /
> secret-scan）与 hooks 本身**存在，但要变成"合并阻断权威"，取决于你在 GitHub 服务端补齐分支保护**。
> 模板无法替你的组织做这些服务端决定（`【需组织/GitHub 设置】`），但下面是一次性的确切步骤。
> 这直接回应第三方审计的 keystone 项（T1）："先让门具备权威，其余软门/自改风险才有意义去堵。"

> **进度追踪**：本附录是"完整步骤（怎么做）"；随仓的 `docs/eos/activation.md` 是"可勾选台账（做到哪了）"，
> 被 `eos-doctor` 每次 advisory 提示、被 `/eos-release-gate`（G8）发布前再核。引导式执行用 **`/eos-init`**——
> 它会替你做本地能做的（换 handle、拷基线），并把服务端分支保护的确切步骤打印给你（模板无法代开）。

## D.1 让 3 道 CI 硬门成为"必需检查" `【需组织/GitHub 设置】`

GitHub 仓库 → **Settings → Rules → Rulesets → New branch ruleset**，针对默认分支：

1. 先把 **Enforcement status** 设为 **`Active`**。新建的 ruleset 默认是 **Disabled**，处于 Disabled 时无论下面勾选什么都不会生效 —— 这是开发者"以为已受保护、实则毫无保护"的最常见原因。
2. 勾选 **Require a pull request before merging**（禁止直接 push 到默认分支）。
3. 勾选 **Require status checks to pass before merging** → 搜索并选中 **`verify`**（`eos-ci.yml` 的 job）。
   —— 这一步把 validate-config / eos-doctor / secret-scan 从"绿灯建议"变成"红灯阻断"。
   只选 `verify`：`coverage` 与 `cross-platform` 测试的是 EOS 自身，在你的仓库里会被跳过（见 [§8.4](#84-你的仓库里-ci-运行什么)）。
4. 勾选 **Require review from Code Owners**（配合 D.2 的 CODEOWNERS）。
5. （推荐）勾选 **Do not allow bypassing the above settings**，避免管理员随手绕过。

**计划限制 —— 动手前先看这一段。** 在 GitHub Free 下，**私有**仓库根本不会强制执行 ruleset：GitHub 会保存该 ruleset，然后提示 "Your rulesets won't be enforced on this private repository until you upgrade this organization account to GitHub Team"。**Require review from Code Owners** 同样不提供。你只有三个诚实的选择：把仓库改为公开、升级到 Pro/Team，或以该理由豁免台账中的这一项。

请用终端验证，而不是相信设置页面：

```sh
gh api repos/<owner>/<repo>/rules/branches/main        # 返回非空数组 = Active 规则已生效；返回 [] = 无任何强制
gh api repos/<owner>/<repo>/branches/main/protection   # 仅用于经典分支保护；使用 ruleset 时会返回 404
```

> 因为旧的 `/protection` 端点在使用 ruleset 时会返回 404，所以绝不能据此判断"未受保护" —— 请优先查 ruleset 端点。个人命名空间仓库默认**没有**这些保护。

## D.2 启用 CODEOWNERS 治理保护

模板已随仓提供 `.github/CODEOWNERS`（覆盖 `instructions/ agents/ hooks/ workflows/ prompts/`
与 `docs/eos/`、安全/合规清单）。**实例化后**把其中的 `@niaodian` 全部替换为你的团队 handle
（推荐团队而非个人，如 `@your-org/platform-team`）。配合 D.1 的 "Require review from Code Owners"，
即可阻止 agent 或任何写权限者**免评审改动治理文件**（回应审计 E1/H5：agent `editFiles` 自改规则）。

## D.3 固定本地审批基线

```sh
cp .vscode/settings.json.example .vscode/settings.json    # 活跃文件保持本地（git-ignored）
```

关键项：`chat.tools.global.autoApprove` 保持 `false`（`true` 等于 /yolo，关闭关键安全保护）；
`chat.tools.terminal.autoApprove` 内置危险命令 denylist（与 `deny-dangerous.js` 纵深防御）。
设置键均已核对官方 `docs/agents/reference/ai-settings.md`；自动审批演进较快，请在你的版本复核。

## D.4 已知取舍与残余风险（诚实清单）

以下是 EOS **有意的设计取舍**（local-first / opt-in / reuse-first 的固有成本）。不是 bug，但请
显式确认团队接受其残余风险，并知悉缓解手段：

| 取舍 | 残余风险 | 缓解 |
|---|---|---|
| `.vscode/*` 默认 gitignore，`mcp.json` opt-in 后本地留存（审计 F2/C2） | 沙箱/审批基线可被本地私改而无人发现 | 随仓 `settings.json.example`/`mcp.json.example` 安全基线 + 评审；团队约定 |
| `bmad-*` 技能装在**用户级**、未 pin 版本（审计 H4/T6） | 不同机器技能版本/存否不一 → agentic 行为不完全可复现 | 在 `docs/` 记录团队统一的 bmad 版本；关键技能可 vendor/子模块化 |
| Hooks 是 Preview、逐机器、解析失败放行、CI 不调用（审计 G2） | 破坏性操作实时拦截非权威，可绕过 | 权威在 D.1 的 CI 硬门 + 人工评审；hooks 仅作减速带 |
| agent 具 `editFiles`（审计 H5） | 原则上可改自身治理文件 | D.2 CODEOWNERS + D.1 必审（开启后即阻断） |
| `gitleaks` 深扫在**本地是可选增强**，未装即回退到内置规则 | 只跑零依赖内置正则时，覆盖弱于 gitleaks 全量规则 | 内置 `secret-scan.mjs` 始终作为 CI 硬门运行（保底）。自 eos-2.3.0 起，EOS CI 会安装固定版本、校验过校验和的 `gitleaks` 并设置 `EOS_REQUIRE_GITLEAKS=1`，因此在 CI 中缺少 gitleaks 会失败而不是降级 |
| **Windows**：核心 hook 为 Node（跨平台）；早期 `quality.json` 曾用 `sh -c`（round-2 N1 已改为 `node .github/hooks/quality.mjs`，原生 Windows 无需 WSL/Git-Bash） | 无 `git` 时的目录回退遍历在 Windows 上曾显示绝对路径（已用 `path.relative` 归一化）；`bmad-*` 与 `act`（需 Docker Desktop）等外部工具的可用性仍随平台 | 三个核心 hook + `quality.mjs` 已按跨平台实现；**权威质量门在 CI（`ubuntu-latest`）**，与本机 OS 无关 |

**须组织决策（模板不代做，`【需组织标准】`）**：CI runner 标准（现 `ubuntu-latest`）、批准的密钥库、
命名空间/仓库归属、模型 pin/注册策略、制品完整性（SBOM/签名/SLSA）。这些不是违规，是组织标准问题。

---

> 本手册随模板版本演进。改动请同步 `docs/eos/VERSION` 并跑 `validate-config.mjs`。
> 设计原理（为什么这么设计）见 `docs/eos/blueprint.md`；本手册只讲"怎么用"。
