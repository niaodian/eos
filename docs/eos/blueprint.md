# EOS Blueprint — 完整蓝图（全 12 Part）

> 单文件完整版 Engineering Operating System 设计蓝图。
> 标注 `【已实测 · VS Code 1.120.0】` 的条目在本机验证通过，不再是纸面推断。
> 标注 `【可选扩展·需企业/网络环境】` 的条目不在主路径，按需扩展。
> 官方**无原生规则优先级**（多份 instructions 合并且顺序不保证）——所有"优先级"均为团队约定。

## 目录
- [Part 0](#part-0-设计判断) 设计判断
- [Part 1](#part-1-假设与边界) 假设与边界
- [Part 2](#part-2-总体设计原则) 总体设计原则
- [Part 3](#part-3-六层架构) 六层架构
- [Part 4](#part-4-端到端开发流程（10-阶段）) 端到端开发流程（10 阶段）
- [Part 5](#part-5-需求阶段强化（直击上线后大规模返工）) 需求阶段强化
- [Part 6](#part-6（修正版）-规则体系设计--技术栈分层适配) 规则体系设计 ✅已修正
- [Part 7](#part-7（修正版）-落地步骤关键修正) 落地步骤 ✅已修正
- [Part 8](#part-8-配置质检与开发流验收) 配置质检与开发流验收
- [Part 9](#part-9-反模式（14-个）) 反模式（14 个）
- [Part 10](#part-10（修正版）-跨项目复用关键修正) 跨项目复用 ✅已修正
- [Part 11](#part-11-交付件索引（全量）) 交付件索引

## 实测修正总账（本版相对初稿的 4 处变更）

| # | 修正点 | 初稿（已废弃） | 现行（已实测/已查证） | 落点 |
|---|---|---|---|---|
| 1 | 用户级 agents 目录 | `~/Library/.../User/agents` | **`~/.copilot/agents`** | Part 10.3.1 |
| 2 | PreToolUse hook 输出 schema | 顶层 `decision:"block"` | **`hookSpecificOutput.permissionDecision:"deny"`** | Part 7.7 |
| 3 | 多 glob 写法 | 逗号串 `"a.sql,api/**"` | **子文件夹组织 + 花括号 `{ts,tsx}`** | Part 6.1 / 6.2 |
| 4 | BMAD 技能数 | `121+ 个 bmad-*` | **73 个 bmad-***（skills 总数 121） | 全文 |

验证依据：① applyTo 花括号 → chat 问暗号回 `BANANA-7731`；② PreToolUse deny → 危险命令被拦；
③ `/skills` 显示 73；④ 官方 custom-agents 文档「file locations」表确认 `~/.copilot/agents`。

---

# Part 6（修正版）— 规则体系设计 + 技术栈分层适配

## 6.1 规则架构（十类）

控制原则不变：**官方无原生优先级**，多份 instructions 合并且顺序不保证。用
**作用域（applyTo glob）+ 单一关注点 + 命名约定** 替代优先级，Hooks 做确定性兜底。

`【已实测 · VS Code 1.120.0】` **子文件夹组织合法且推荐**。官方文档明确 VS Code 递归扫描
`.github/instructions/` 子目录，因此按领域分文件夹组织规则文件是受支持的标准做法：

```
.github/instructions/
├─ 00-workspace.instructions.md          # applyTo: "**"
├─ frontend/10-frontend.instructions.md  # applyTo: "**/*.{tsx,jsx}"
├─ backend/10-backend-node.instructions.md   # applyTo: "**/*.ts"
├─ backend/10-backend-python.instructions.md # applyTo: "**/*.py"
├─ backend/10-backend-go.instructions.md     # applyTo: "**/*.go"
├─ backend/10-backend-java.instructions.md   # applyTo: "**/*.java"
├─ backend/10-backend-rust.instructions.md   # applyTo: "**/*.rs"
├─ backend/10-backend-dotnet.instructions.md # applyTo: "**/*.cs"
├─ ai/10-ai-llm.instructions.md          # applyTo: "**/{ai,llm,rag}/**"（附加层）
├─ data-api/20-data-api.instructions.md  # applyTo: "**/*.{sql,prisma}"
├─ testing/30-testing.instructions.md    # applyTo: "**/*.{test,spec}.*"
├─ security/40-security.instructions.md  # applyTo: "**"
└─ release-ops/50-release-ops.instructions.md # applyTo: "**/{Dockerfile,*.yml,*.yaml}"
```

> 多个 `applyTo: "**"` 的薄规则（如 workspace + security）覆盖**不同主题**时是**叠加而非冲突**，
> 属合法模式（`validate-config.mjs` 对 `**` 豁免 S3 重复检测）。

R1（Global）模板不变：仅放全项目公约数，引用 `docs/eos/agent-map.md` 复用 73 个 bmad-*。

## 6.2 主流全栈子规则（修正版关键点）

`【已实测 · VS Code 1.120.0】` **花括号多扩展名 `**/*.{ts,tsx}` 可靠生效**。因此：

- ✅ **同一扩展名集合** → 用花括号：`"**/*.{tsx,jsx}"`、`"**/*.{sql,prisma}"`、`"**/*.{test,spec}.*"`。
- ⚠️ **跨不同路径/领域** → **不要用逗号串**（官方未记载逗号多 glob，未验证）。改为
  **拆分到子文件夹的多个规则文件**，每个文件一条 glob（见 6.1 树）。

**glob 互斥（防 AP-11 双重注入）**：前端 `{tsx,jsx}` 与后端 `{ts}` 天然互斥 —— 同一 React 项目里
`.tsx` 命中前端规则、`.ts` 命中后端规则。若你的前端含纯 `.ts`，把后端收窄到目录
`applyTo: "apps/api/**/*.ts"`，前端放宽到 `.ts`。

### 6.2.5 新增一个技术栈（4 步，修正版）
1. 在 `.github/instructions/<area>/` 新建 `NN-<area>-<stack>.instructions.md`。
2. 写**单条** `applyTo`（花括号合并同集合扩展名；跨路径则另起文件，**不用逗号**）。
3. 三段式正文：`Architecture / Validation&Errors / Tooling(lint+format+test+commands)`。
4. 跑 `node .github/hooks/validate-config.mjs` 确认 glob 互斥（S3）通过。

---

# Part 7（修正版）— 落地步骤关键修正

## 7.7 Hooks 护栏（修正版 · 已实测）

`【已实测 · VS Code 1.120.0】`
- **`.github/hooks/*.json` 默认加载**（官方 `chat.hookFilesLocations` 默认含 `.github/hooks`）。
  **工作区 hooks 无需任何 Preview 开关**。（`chat.useCustomAgentHooks` 只管写在 `.agent.md`
  frontmatter 里的 agent 内嵌 hooks，与工作区 hooks 无关。）
- **PreToolUse 拦截已实测生效**：危险命令被 deny。

PreToolUse 与 PostToolUse 的输出 schema **不同**，这是初稿的关键 bug：

**PreToolUse（拦截工具调用）** → 用 `hookSpecificOutput.permissionDecision`：
```javascript
// .github/hooks/deny-dangerous.js  — 已实测正确版
let s = ''; process.stdin.on('data', d => (s += d)); process.stdin.on('end', () => {
  let payload = {}; try { payload = JSON.parse(s || '{}'); } catch {}
  const text = JSON.stringify(payload);
  const danger = [/rm\s+-rf\s+[\/~]/, /DROP\s+TABLE/i, /git\s+push\s+--force/, /:\s*>\s*\//];
  if (danger.some(r => r.test(text))) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",                 // ← 不是 decision:"block"
        permissionDecisionReason: "Blocked by EOS guardrail: destructive operation detected."
      }
    }));
  } else { process.stdout.write("{}"); }
});
```
> 多 hook 并发时，最严格者胜：`deny` > `ask` > `allow`。

**PostToolUse（工具完成后）** → 才用顶层 `decision:"block"` + `reason`（`quality.json` 用法不变）。

`guardrails.json` 配置不变：
```json
{ "hooks": { "PreToolUse": [ { "type": "command", "command": "node .github/hooks/deny-dangerous.js" } ] } }
```

---

# Part 10（修正版）— 跨项目复用关键修正

## 10.3.1 用户级 vs 工作区级分层（修正版）

`【已查证 · 官方 custom-agents 文档】` 用户级各类自定义文件的**确切磁盘位置**：

| 内容 | 用户级位置（跨项目共享） | 工作区位置（随仓库） |
|---|---|---|
| Skills（含 73 个 bmad-*） | `~/.copilot/skills`、`~/.agents/skills`、`~/.claude/skills` | `.github/skills/` |
| **Custom agents** | **`~/.copilot/agents`** | `.github/agents/` |
| Prompts | VS Code user profile（用 `Chat: New Prompt File → User` 创建） | `.github/prompts/` |
| Instructions | `~/.copilot/instructions`、`~/.claude/rules` | `.github/instructions/` |
| Hooks | `~/.copilot/hooks`、`~/.claude/settings.json` | `.github/hooks/*.json` |

> 实测：本机 `~/.agents/skills` 与 `~/.claude/skills` 各 121 个 skill（其中 **73 个 bmad-***，
> 另 48 个 gds-/wds- 等）；`~/.copilot/skills` 不存在（按需创建即可）。

判定原则不变：**通用且稳定 → 用户级；项目特异或需随仓审查 → 工作区级。**

## 10.3.2 一键初始化（修正版 · private 仓库注意）

本模板已发布为 **template repository**：`niaodian/eos-template`（Private）。

```bash
# A. gh CLI（推荐，private 可用）
gh repo create my-app --template niaodian/eos-template --private --clone
cd my-app && node .github/hooks/validate-config.mjs    # 期望 PASS

# B. degit —— ⚠️ private 仓库必须走 git 模式
npx degit --mode=git niaodian/eos-template my-app
#   （仓库若设为 Public，则标准 `npx degit niaodian/eos-template my-app` 即可）

# C. git template directory（离线本地）
mkdir -p ~/.git-templates/eos && cp -R <golden>/.github ~/.git-templates/eos/
git config --global init.templateDir ~/.git-templates/eos
```

版本化：`docs/eos/VERSION`（当前 `eos-1.2.1`）。升级用 `degit` 拉新版到 /tmp 后 `diff -ru` 合并，
再跑 `validate-config.mjs` + `bmad-code-review`。

---

# Part 0. 设计判断

**复杂度等级：Standard 为主路径，Enterprise 能力以"本地等价物"可插拔。**
单机 macOS 纯本地是 Standard；目标域（0-1 + 1-N + 跨项目治理）是 Enterprise 野心。
正确做法：用本地可运行机制实现 Enterprise 级"形状"，企业依赖一律降级为可选扩展。

**最关键三个失败风险（按致命度排序）**：
1. **规则膨胀 + 上下文污染**：多份 instructions 合并顺序不保证，矛盾指令淹没 Agent。
2. **重复造轮子**：已装 73 个 `bmad-*` skill，若 EOS 重新生成这些能力，制造漂移与双维护。
3. **误把"优先级"当原生特性**：依赖规则 A 覆盖规则 B 的隐式假设在版本变化时静默失效。

**最需优先补强的三个环节**：
- 需求阶段运营前置（四张清单，阻断"上线后大规模返工"主闸门）
- 配置质检 + 行为验收（让你能客观判断 EOS 是否按预期工作）
- 跨项目移植机制（用户级 vs 工作区级正确分层 + template repo）

**效率·约束·可维护性平衡**：
- 效率靠 `*.prompt.md` 斜杠命令 + handoffs 一键化，优先调用 `bmad-*`。
- 约束靠 `applyTo` 精准作用域化 + Hooks 确定性护栏（不靠 Agent 自觉）。
- 可维护性靠 rule budget + Git 版本化 + 用户级/工作区级清晰分层 + 复用 BMAD 缩小自维护面。

---

# Part 1. 假设与边界

**① 已明确提供的前提（事实）**
- OS：macOS · IDE：VS Code 1.120.0 · AI：GitHub Copilot（企业 license，仅作 license）
- BMAD：73 个 `bmad-*` skill 已安装于 `~/.agents/skills/`、`~/.claude/skills/`（总 121 个）
- 目标：规范化 SDD 环境，分层规范 Agent 全生命周期；覆盖 0-1 + 1-N + 规模化；可跨项目复用
- 痛点：需求前置不足、运营需求未前置、1-N 扩展性不足、缺 SDLC 治理、缺多栈规则分层

**② 合理假设**
- 单人/小团队起步；本地 CI = npm scripts + Hooks + `act`（本地跑 GitHub Actions，需 Docker）
- 默认参考栈（可插拔）：前端 TypeScript + Next.js；后端 Node.js/TypeScript 或 Python/FastAPI；数据 PostgreSQL + OpenAPI/REST
- `~/.agents/skills/` 与 `~/.claude/skills/` 是 VS Code 识别的 personal skills 合法路径

**③ 主路径 vs 可选扩展**
- **主路径**：纯本地、Git 化、离线可运行；规则/prompt/agent/skill/hook 全部自包含
- `【可选扩展·需企业/网络环境】`：组织级 instructions、连真实服务的 MCP、cloud agents、私有模型后端

---

# Part 2. 总体设计原则

## 2.1 为何需要三类分层

**规则分层**：官方无原生优先级，唯一可靠控制手段是 `applyTo` 作用域。按互斥 glob 切薄片，
让"哪条规则在哪类文件生效"由确定的 glob 决定，服务于 token 预算与跨项目复用。

**流程分层**：SDLC 的价值是决策门（gate）。每个阶段有明确输入/输出/通过标准，
把"线性对话"变成"带检查点的状态机"，是减少返工的核心。

**上下文分层**：四类机制对应四种装载时机：
- `copilot-instructions.md` / `AGENTS.md` = always-on（项目级不变真相）
- `*.instructions.md` + `applyTo` = 条件触发（按文件类型/路径）
- `*.prompt.md` = 按需调用（斜杠命令，单任务）
- `*.agent.md` = 角色切换（持久 persona + 工具限制 + handoffs）
- Agent Skills = 相关性按需加载（跨工具可移植）

> 原则：**能用窄作用域就不用 always-on**。always-on 是最稀缺资源。

## 2.2 四者关系（一句话）

**Agile 给节奏，SDLC 给骨架，SDD 给真相源，Agentic Engineering 给执行器与护栏。**
四者叠层而非替代：SDD 是 SDLC 在 AI 时代的真相源升级；Agentic Engineering 让 Agent
可靠执行 SDD/SDLC；Agile 决定它们以多快的节奏循环。

## 2.3 行业级 Solution 必须纳入全生命周期的要素

需求可追溯 / NFR / 运营前置（埋点·权限·审计·回滚·监控·灰度·配额·i18n·多租户·容量·容灾）/
架构演进治理（ADR）/ 质量与发布门禁 / 观测反馈闭环。

## 2.4 BMAD 的定位与补强

- **优势**：成熟全链路 analyst→pm→architect→dev→review→retro，已装即用
- **局限**：偏 0-1 build；运营前置、NFR 清单、埋点、质量/发布门禁、配置质检相对薄弱
- **补强方式**：EOS 只在 BMAD 缺口处新建（运营前置 checklist、NFR 清单、Hooks 门禁、validate-config），并显式说明"为何新建 / 建了什么 / 衔接哪个 BMAD"

## 2.5 从仅 0-1 升级为 0-1 + 1-N + 规模化

- **0-1**：`bmad-create-prd` → `bmad-architecture` → `bmad-create-epics-and-stories` → `bmad-dev-story` → `bmad-code-review`
- **1-N**：叠加运营前置 + `bmad-correct-course` + `bmad-retrospective` + `bmad-document-project`
- **规模化**：叠加 NFR 门禁 + 观测反馈闭环 + ADR 架构演进 + Hooks 确定性护栏

---

# Part 3. 六层架构

```
┌──────────────────────────────────────────────────────────────┐
│ L1 环境层  macOS · VS Code 1.120.0 · Copilot(license only)    │
│            BMAD 73 bmad-* skills (用户级，全项目共享)          │
├──────────────────────────────────────────────────────────────┤
│ L2 规则层  R1 copilot-instructions.md (always-on, 极简)        │
│            R2–R8 *.instructions.md + applyTo (互斥glob)        │
│            R9 *.agent.md (persona+handoffs)                    │
│            R10 *.prompt.md (斜杠命令)                          │
│            ▲ 无原生优先级 → 用"作用域+约定+Hooks"控制           │
├──────────────────────────────────────────────────────────────┤
│ L3 规范层  需求/架构/编码/测试/发布/运维 → 编码进 L2            │
├──────────────────────────────────────────────────────────────┤
│ L4 交付物  PRD/ADR/data-model/API契约/埋点方案/测试策略/Runbook  │
│            多数【复用 bmad-*】少数【新建补强】                   │
├──────────────────────────────────────────────────────────────┤
│ L5 治理层  .github/hooks/guardrails.json (PreToolUse 拦截)     │
│            .github/hooks/quality.json   (PostToolUse 质量门)   │
│            .github/hooks/config-check.json (配置自检+门诊)     │
│            .github/hooks/secret-scan.mjs (密钥扫描+gitleaks可选)│
│            .github/workflows/eos-ci.yml (act 本地 CI 批量门)    │
│            ▲ 三层强制：实时Hook＋配置静态＋CI全仓批量           │
├──────────────────────────────────────────────────────────────┤
│ L6 协作层  bmad-agent-*(Mary/John/Winston/Amelia/Murat)        │
│            eos-*.agent.md 调度入口 + handoffs 串成工作流         │
└──────────────────────────────────────────────────────────────┘
数据流: discovery→requirements→prd→ux→architecture→stories→code→test→release→telemetry→iterate ⟲
```

**各层机制对照**（官方已核验，VS Code 1.120.0）：

| 子层 | 真实机制 | 来源 |
|---|---|---|
| Global（always-on） | `.github/copilot-instructions.md` | 新建 |
| Workspace | `00-workspace.instructions.md`（`applyTo:"**"`） | 新建 |
| Language-Stack | `*.instructions.md` + 精准 `applyTo`，子文件夹组织 | 新建 |
| Workflow | `.github/prompts/*.prompt.md`（`#tool` 调 `bmad-*`） | BMAD+补强 |
| Agent 调度 | `.github/agents/*.agent.md`（`handoffs[]`） | BMAD+补强 |
| Skills | `.github/skills/` + `~/.agents/skills/bmad-*` | 复用+新建 |
| 护栏 | `.github/hooks/*.json`（8 个生命周期事件，Preview） | 新建 |


---

# Part 4. 端到端开发流程（10 阶段）

> 状态机：每个 `→` 是决策门，未过门不进入下一阶段。
> `I:` = instructions · `P:` = prompt · `A:` = agent · `H:` = hook

| 阶段 | 目标 | 主要执行体 | 决策门 | 生效规则 | 防返工关键 |
|---|---|---|---|---|---|
| 1 Discovery | 收敛为单句可证伪问题+可度量成功指标 | `bmad-brainstorming`、`bmad-agent-analyst`(Mary)、`bmad-forge-idea` | G1：问题可证伪 + 指标可度量 | `I:00-workspace` | 最廉价纠错点：锁定问题不漂移 |
| 2 Requirement | 展开功能+NFR+**运营前置** | `/requirements`（包裹 `bmad-create-prd`） + skill `eos-operational-readiness` | **G2：四张清单全过审（必过项）** | `P:requirements`、`P:nfr`、`I:security` | 主闸门：阻断上线后大规模返工 |
| 3 Spec | PRD 成为唯一真相源 | `bmad-create-prd`；校验 `bmad-validate-prd` | G3：每条需求有验收标准 | `P:spec` | Spec 即契约，下游只认 `docs/prd.md` |
| 3.5 UX & Design（条件） | 视觉+体验契约（面向用户必做） | `/ux-spec`（包裹 `bmad-ux`）、`bmad-agent-ux-designer`(Sally)、`bmad-cis-design-thinking`(Maya) | **G-UX：每条面向用户需求有屏幕/流程/三态/a11y/视觉token；纯后端 SKIP+理由** | `P:ux-spec`、`A:eos-design`、`I:frontend` | UI/UX 前置：防"实现完才发现交互/信息架构错" |
| 4 Architecture | 技术方案+数据模型+API 契约+NFR 落点+ADR | `eos-architecture`（包裹 `bmad-architecture` Winston）；`/adr` | G4：关键不可逆决策有 ADR；NFR 有落点 | `I:data-api`、`A:eos-architecture` | API 契约先于实现；扩展性显式审查 |
| 5 Planning | Epics→Stories，各 story 上下文自包含 + 验收测试先行(ATDD) | `bmad-create-epics-and-stories`→`bmad-create-story`→`bmad-sprint-planning`；`bmad-testarch-atdd`；`bmad-check-implementation-readiness` | G5：story 就绪 + 每条 AC 有验收测试设计 | `A:eos-plan` | 就绪门防缺上下文；测试左移防"事后补测" |
| 6 Development | 按 story 实现，受栈规则+护栏约束，**完成前过代码审查** | `bmad-dev-story`、`bmad-agent-dev`(Amelia)、**`bmad-code-review`** | G6：lint/typecheck/单测全绿 **且代码审查无阻断项** | `I:frontend/backend/data-api`（`applyTo`自动注入）+ `H:guardrails`（PreToolUse）+ `H:quality`（PostToolUse） | Hooks 确定性拦截 + 审查补自动化查不出的设计/逻辑/边界/安全问题 |
| 7 Testing | 按测试策略验证+spec↔test 可追溯+**NFR 验证** | `bmad-tea`(Murat)、`bmad-testarch-trace`、`bmad-testarch-nfr`、`bmad-qa-generate-e2e-tests` | G7：每条验收≥1测试且全绿；**NFR 目标已验证或显式 deferred** | `I:testing` | trace 矩阵确保无未被测试的验收标准；**NFR 定了就必须验** |
| 8 Release | 过质量/安全/回滚/灰度/NFR 门后发布 | `/release-gate`；`/runbook` | **G8：5 项门禁全过（必过项）** | `I:release-ops`、`H:quality` | 无回滚/无灰度不得发布；NFR 未验不得发布 |
| 9 Observability | 埋点上线、指标可见、运营闭环 | `/telemetry-plan` | G9：关键路径埋点在产 | `I:release-ops` | 埋点需求阶段设计，此处只做落实校验 |
| 10 Iteration | 指标回流驱动下轮需求；管理架构演进 | `bmad-correct-course`、`bmad-retrospective`、`bmad-document-project`、`bmad-sprint-status` | G10：变更回写 Spec | `A:eos-review`（handoff 回 requirements） | 变更必须回写 Spec，防"代码与真相源漂移" |

> 主轴是 10 个门（G1–G10）。**3.5 UX & Design 是条件子阶段**（面向用户的产品必做，纯后端/CLI 项目 SKIP+理由），
> 插在 Spec(G3) 与 Architecture(G4) 之间——PRD 定义*做什么*、UX 定义*长什么样/怎么交互*、架构定义*怎么实现*，
> 顺序不可省，否则 story 切出来没有屏幕/状态依据。全部复用 `bmad-ux`，不重建能力。
>
> **另一条件门 G-EVAL（LLM/agentic 产品专用）**：`/eval-spec` 产 `docs/eval-plan.md`，在 Planning(G5) 设计
> 评估集（eval-driven，类比 ATDD），在 Testing(G7) 运行。LLM 输出非确定，不能用 exact-match 单测——必须
> eval 集 + grader + 回归基线。纯确定性功能 SKIP+理由。配套 `ai/10-ai-llm` 规则 + C-nfr 成本/延迟维度 +
> security LLM 红线 + telemetry LLM tracing。此块以 `【新建补强】` 为主（BMAD 无产品级 eval 能力，仅借鉴 `bmad-eval-runner` 模式）。
> **G-EVAL 现由本地 CI 机器强制**：`eos-doctor.mjs`（有 `ai/llm/rag` 代码却无 `docs/eval-plan.md` → 报错）+ `eos-ci.yml`（`act` 跑评估基线，回归即失败）。起步骨架见 `docs/eos/examples/eval-starter/`。

---

# Part 5. 需求阶段强化（直击"上线后大规模返工"）

## 5.1 三个发现问题的机制

1. **可证伪门**（G1/G2）：每条需求必须能写出"失败长什么样"。写不出→需求不清，立即返修。
2. **反向提问法**：对每条功能需求强制追问：
   - 谁**无权**做这件事？（→ 暴露 authz 缺口）
   - 做错了怎么**回滚**？（→ 暴露 rollback 缺口）
   - 怎么**知道**它在线上有没有用？（→ 暴露 telemetry 缺口）
   - 用户量 ×100 会怎样？（→ 暴露 scaling 缺口）
3. **四张清单触发器**：把老手才记得的隐性需求显性化为必答题。

## 5.2 运营前置映射表

| 运营要素 | 需求阶段产物 | 架构阶段落点 |
|---|---|---|
| telemetry | 关键事件清单 + 对应成功指标 | 事件 schema、上报通道 |
| authz | 角色/资源/操作矩阵 | 鉴权中间件、策略点 |
| audit | 需审计的操作清单 | 审计日志表/不可篡改存储 |
| rollback | 每个高风险变更的回滚方式 | 迁移可逆性、特性开关 |
| canary | 灰度维度（用户/地区/比例） | 特性开关/流量切分 |
| quota | 资源上限、滥用阈值 | 限流器、配额计量 |
| i18n | 目标语言/区域 | 文案外置、locale 路由 |
| multi-tenancy | 隔离级别（行/库/实例） | 租户上下文贯穿 |
| capacity/SLO | SLO/SLA 目标 | 容量模型、缓存/分片 |
| DR | RTO/RPO 目标 | 备份/故障转移 |

## 5.3 四张清单（可直接使用，完整版在 docs/checklists/）

**A. 需求缺口**（`docs/checklists/A-gap.md`）：问题陈述可证伪 / 验收标准可度量 /
边界/异常/并发已定义 / 依赖已列明 / scope-out 已明确 / 重叠已排查。

**B. 上线后高概率补做**（`docs/checklists/B-rework.md`）：telemetry / authz / audit /
rollback-flag / monitoring-alerting / canary / rate-limit-quota / i18n-l10n /
空错加载态 UX / 数据迁移可逆性。

**C. 非功能需求**（`docs/checklists/C-nfr.md`）：性能(P95延迟/吞吐) / 容量&扩展 /
可用性&容灾(SLO/RTO/RPO) / 安全&合规 / 可观测性(日志/指标/追踪) / 可维护性 / a11y。

**D. 运营前置**（`docs/checklists/D-ops.md`）：埋点↔指标闭合 / 权限矩阵 / 审计范围 /
回滚预案 / 灰度维度+阈值 / 配额/限流 / 多租户隔离 / i18n / 容量模型+告警 / Runbook。

> 每项三选一：**采纳**（写需求）/ **不采纳+理由** / **延后+触发条件**。禁止留空。

## 5.4 挂接片段（`/requirements` prompt 中的 Step 2 + Step 3）

见 `.github/prompts/requirements.prompt.md`：
- Step 2 强制对 5.2 表格逐行输出决策，不允许留空。
- Step 3 逐条核对四张清单，任一未决项标 BLOCKER，对应 G2 决策门。


---

# Part 8. 配置质检与开发流验收

## 8.1 静态校验（`validate-config.mjs`）

脚本：`.github/hooks/validate-config.mjs`，零依赖，`node .github/hooks/validate-config.mjs`。

| 检查项 | 说明 | Hooks 联动 |
|---|---|---|
| S1 | 主规则文件必须存在 | — |
| S2 | 每个 `.instructions.md` 有合法 `applyTo` | `config-check.json` PostToolUse 每次写规则文件后自动跑 |
| S3 | 非 `"**"` 文件无重复 glob（`"**"` 合法共存） | — |
| S4 | 所有 `#tool:` 引用的 skill 名称存在于磁盘 | — |
| S5 | `*.prompt.md` 有 `description` | — |
| S6 | `*.agent.md` 有 `description` 和 `tools[]` | — |
| S7 | hook JSON 有 `event` 字段 | — |
| S8 | `deny-dangerous.js` 使用正确 PreToolUse schema | — |
| S9 | `AGENTS.md` 存在且非空 | — |
| S10 | 规则文件总字数 ≤ budget（全局≤400词，栈规则≤300词） | — |

**目标**：0 errors, 0 warnings（当前已通过，见 work_done）。

## 8.2 语义验证 prompt

`.github/prompts/validate-config.prompt.md` — 让 Agent 读 `.github/` 目录并验证：
规则有无矛盾逻辑、glob 覆盖有无漏洞、PRD 与 Spec 的 NFR 有无落点、hook 逻辑与规则有无冲突。

## 8.3 冒烟验收 Rubric（10 阶段打分表）

对每个阶段用一个最小 dry-run 功能（如"用户登录"）跑一遍流程：

| 阶段 | 期望产出 | 通过标准 |
|---|---|---|
| Discovery | 单句问题+成功指标 | ☐ 可证伪 ☐ 有度量 |
| Requirements | PRD draft + 四张清单 | ☐ 清单无未决 BLOCKER |
| Spec | 标准 `docs/prd.md` | ☐ 每条需求有验收标准 |
| Architecture | ADR + API contract | ☐ ADR 决策有 trade-off ☐ API 先于实现 |
| Planning | Story 列表 | ☐ 每 story 含 AC + context |
| Development | 代码 + 通过 hook | ☐ hook 未拦截合规代码 ☐ 危险指令被拦截 |
| Testing | 测试 + trace 矩阵 | ☐ 每条 AC ≥1 测试 ☐ 全绿 |
| Release | G8 门禁 checklist | ☐ 4 项全√ |
| Observability | 埋点在产 | ☐ 关键路径可见 |
| Iteration | 变更回写 Spec | ☐ `docs/prd.md` 已更新 |

**失败定位决策树**：
```
Agent 输出不符预期
├─ 某类文件时不生效 → 检查 applyTo glob（S2/S3）
├─ 规则被覆盖/矛盾 → 检查多 "**" 文件是否有冲突措辞（语义验证 prompt）
├─ prompt 未被识别 → 检查 description 字段（S5）
├─ 危险操作未被拦截 → 检查 deny-dangerous.js schema（S8），grep hookSpecificOutput.permissionDecision
└─ 全局规则不生效 → 确认 .github/copilot-instructions.md 路径正确（S1）
```

---

# Part 9. 反模式（14 个）

| # | 现象 | 后果 | EOS 防御 |
|---|---|---|---|
| P1 | 只写功能 Spec，不写 NFR | SLO 上线后爆，补测时已有大量耦合 | C-nfr 清单是 G2 必过项；架构阶段须有 NFR 落点 |
| P2 | 运营需求（埋点/authz/灰度）不前置 | 上线后打补丁返工 × 3 倍成本 | D-ops 清单 + `eos-operational-readiness` skill + G2 | 
| P3 | 所有规则塞进 `copilot-instructions.md` | always-on 长度爆、污染所有会话 | copilot-instructions.md ≤40 行，S10 词数门禁 |
| P4 | 重复造轮子（已有 `bmad-*` 却新建相似 prompt） | 双维护、输出漂移 | 所有交付件须标注来源；agent-map.md 引用表 |
| P5 | 误以为多规则有原生优先级 | 版本变化后静默错误 | 官方已核验：顺序不保证；靠 applyTo + Hooks 控制 |
| P6 | 用逗号分隔多 glob 放在单个 `applyTo` | 未在官方文档验证，行为未知 | S2 检查；推荐：用 brace expansion `{a,b}` 代替 |
| P7 | `deny-dangerous.js` 用 PostToolUse schema 的 `decision:"block"` | PreToolUse 无效，危险操作通过 | S8 检查；正确字段：`hookSpecificOutput.permissionDecision:"deny"` |
| P8 | 规则膨胀，单文件超 300 词 | Token 超预算，规则被截断 | S10 词数检查；按"单一职责"拆分文件 |
| P9 | 无 ADR 就做不可逆架构决策 | 团队失忆，演进时没有决策上下文 | G4 必须有 ADR；`/adr` prompt |
| P10 | 让 Agent 直接生成代码跳过 Spec | 代码与需求漂移，测试无可追溯目标 | G3 是 G5 前置门；无 `docs/prd.md` 不得进入 Planning |
| P11 | 无回滚/灰度就发布 | 出问题无法撤，用户全部受影响 | G8 五项门禁；`/release-gate` prompt 强制 |
| P12 | 把企业/内网接口写进本地规则 | 离开企业环境配置损坏，不可移植 | 工作约定 B；本地配置只写本地可验证内容 |
| P13 | 用户级 skills/agents 做项目专属配置 | 跨项目污染，新开项目受旧项目约束 | 用户级放通用能力；项目专属放 `.github/` |
| P14 | 不验证就发布 EOS 配置更新 | 规则静默失效无感知 | 每次修改规则文件后跑 `validate-config.mjs` + rubric |

---

# Part 11. 交付件索引（全量）

> 完整文件内容在对应路径，此处为索引与来源标注。

| # | 交付件 | 路径 | 来源 |
|---|---|---|---|
| D1 | 总体架构图（文字化） | `docs/eos/blueprint.md` Part 3 | 新建 |
| D2 | 完整规则目录结构 | `docs/eos/blueprint.md` Part 7 / `README.md` | 新建 |
| D3 | 规则文件模板（含真实 frontmatter） | `.github/instructions/**/*.instructions.md` | 新建 |
| D4 | 主流技术栈子规则模板集 + 配方册 | `instructions/frontend/`、`backend/`（node/python/go/java/rust/dotnet）、`ai/`、`data-api/`；`docs/eos/stack-presets.md` | 新建 |
| D5 | 标准开发流程图（10 阶段） | 本文 Part 4 | 新建 |
| D6 | 需求阶段缺口清单 | `docs/checklists/A-gap.md` | 新建 |
| D7 | 非功能需求清单 | `docs/checklists/C-nfr.md` | 新建 |
| D8 | 埋点与运营前置清单 | `docs/checklists/D-ops.md` | 新建 |
| D9 | 质量/发布门禁清单 | `docs/checklists/B-rework.md`；`/release-gate` prompt | 新建+BMAD补强 |
| D10 | 配置质检清单 + 开发流验收 rubric | 本文 Part 8；`validate-config.mjs` | 新建 |
| D11 | 新项目 Quickstart + 跨项目移植指南 | `docs/eos/quickstart.md` | 新建 |
| D12 | 端到端落地走查 | 本文 Part 4 × Part 8 rubric（用"用户登录"dry-run） | 新建 |
| D13 | MVP vs Enterprise 方案对比 | 见下表 | 新建 |
| — | UX/设计规划阶段（视觉+体验契约） | `/ux-spec`、`A:eos-design`；产 `docs/DESIGN.md`+`docs/EXPERIENCE.md` | 复用BMAD（bmad-ux/Sally）+补强 |
| — | Agentic Engineering 扩展包（LLM/agent 产品） | `ai/10-ai-llm` 规则、`/eval-spec`(G-EVAL)、C-nfr/security/telemetry 扩展；产 `docs/eval-plan.md`；起步骨架 `docs/eos/examples/eval-starter/` | 新建补强（借鉴 bmad-eval-runner） |
| — | BMAD reuse map（73 bmad-*） | `docs/eos/agent-map.md` | 复用BMAD |
| — | 运营前置 skill | `.github/skills/eos-operational-readiness/SKILL.md` | 新建 |
| — | Hooks 护栏 | `.github/hooks/guardrails.json` + `deny-dangerous.js`（危险操作+供应链投毒+密钥泄漏） | 新建 |
| — | 安全门禁 | `secret-scan.mjs`（密钥扫描）+ `E-security.md`（清单）+ security/frontend 红线；复用 `bmad-review-adversarial-general` 人审 | 新建补强+复用BMAD |
| — | 本地 CI（act 可跑）+ SDLC 门诊 | `.github/workflows/eos-ci.yml` + `.github/hooks/eos-doctor.mjs`（validate-config+doctor+tests+evals；G-EVAL 机器强制） | 新建补强（复用 bmad-testarch-ci） |
| — | 配置静态验证器 | `.github/hooks/validate-config.mjs` | 新建 |

**D13：MVP vs Enterprise 对比**

| 能力 | MVP 主路径 | Enterprise 可选扩展 |
|---|---|---|
| 规则分发 | Git template / degit | `【需企业环境】` 组织级 instructions |
| AI Agent 后端 | Copilot（本地） | `【需企业环境】` 私有模型后端 |
| 外部集成 | 无 / mock | `【需企业环境】` 真实 MCP servers |
| 质量门 | npm scripts + Hooks + **act 本地 CI**（`eos-ci.yml`，需 Docker） | `【需企业环境】` 托管 runner / 组织级流水线 |
| 监控 | console / 本地 mock | `【需企业环境】` 云 observability 平台 |
| 规则审核 | validate-config.mjs（本地） | `【需企业环境】` 组织级策略扫描 |

