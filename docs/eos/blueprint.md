# EOS Blueprint — Verified Sections (Part 6 / 7 / 10)

> 本文件是 EOS 蓝图中 **Part 6（规则体系）/ Part 7（落地步骤）/ Part 10（跨项目复用）** 的
> **已实测修正版正文**。所有标注 `【已实测 · VS Code 1.120.0】` 的条目均在本机验证通过，
> 不再是纸面推断。其余 Part（0–5、8、9、11）见对话记录。

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

版本化：`docs/eos/VERSION`（当前 `eos-1.0.0`）。升级用 `degit` 拉新版到 /tmp 后 `diff -ru` 合并，
再跑 `validate-config.mjs` + `bmad-code-review`。
