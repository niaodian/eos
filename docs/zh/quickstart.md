> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/quickstart.md`](../eos/quickstart.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS 快速开始（Quickstart）

> **任何时候迷路了？** 跑 `node .github/eos/eos.mjs next`（或在 Copilot Chat 里用 **eos-guide**
> agent / `/eos-next`）。它从仓库本身推导阶段，并给你一个动作、为什么是它、怎么开始、以及
> 怎样算做完。你永远不需要背门禁顺序。

## 前置条件（local-first——无需任何企业设施）
| 工具 | 用于 | 缺失时 |
|---|---|---|
| **Node.js**（20.10+） | `eos` CLI、验证器、hooks、JS/TS 测试与 eval | 必需——唯一的硬依赖（`npx --offline eos` 快捷方式需要 npm 10.9+，Node 22 自带） |
| **一个 AI agent**——VS Code + GitHub Copilot、Claude Code、OpenAI Codex 或 Google Antigravity | `eos-*` 智能体、`/eos-*` 斜杠命令（技能；Codex 中为 `$eos-*`）与护栏；Copilot 还会自动应用按范围生效的编码规则 | 引导式流程需要其中之一——各 agent 的配置见[用户手册第 6.6 章](user-manual.md#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)；`eos.mjs` CLI 本身不依赖任何 agent |
| **BMAD 技能**（`bmad-*`） | 各阶段工作流（`bmad-prd`、`bmad-architecture`、`bmad-create-story` 等） | 引导式流程必需——EOS 只做编排，不重复实现它们。用 `node .github/hooks/eos-doctor.mjs --deep` 核验 |
| **`gh` CLI**（已登录） | 创建远端仓库，以及在 `/eos-init` 中验证分支保护 | **可选**：也可在 GitHub 网页端完成。用 `gh auth login` 配置 |
| **Docker** + `act` | 本地 CI（`act push`）——在本地跑 GitHub Actions | **可选**：跳过 CI，直接跑同样的检查（见下） |
| 各栈工具链（pnpm、python/pytest、go、spectral、golangci-lint、gitleaks…） | 只装你用到的那个栈；`gitleaks` 深化密钥扫描 | 按需安装，均可选（无 gitleaks 时 secret-scan 回退到内置正则） |

- 核心流程**无需联网**（验证器、hooks、测试、eval 全部离线运行）。
- **一次性联网步骤**：*首次* `act` 运行会拉取 runner 镜像 + actions（之后走缓存）；
  随后 `act push --pull=false --action-offline-mode` 完全离线。完全不想用 Docker？
  直接跑等价的门禁：
  ```sh
  node .github/hooks/validate-config.mjs && node .github/hooks/eos-doctor.mjs \
    && node .github/hooks/project-gate.mjs   # 你声明的 lint/typecheck/test/eval——任意技术栈
  ```
- `npm audit`（一个 G8 项）需要 lockfile——先跑 `npm i --package-lock-only`；离线时它可能
  deferred（联网后重跑），绝不作为本地硬阻断。

### Windows
EOS **原生在 Windows 上运行**（PowerShell 或 Command Prompt）——核心流程*不*需要 WSL/Git-Bash
（hooks、验证器、测试全是 Node，路径已跨平台归一化）：
- **安装 Node.js**：从 [nodejs.org](https://nodejs.org)，或用包管理器
  （`winget install OpenJS.NodeJS.LTS` / `choco install nodejs-lts`）。
- **命令串联**：上面用到的 `&&` 与 `\` 续行是 POSIX 写法。**PowerShell 7+** 与
  **Command Prompt** 支持 `&&`；**Windows PowerShell 5.1** 不支持——把每条命令单独放一行跑
  即可：
  ```
  node .github/hooks/validate-config.mjs
  node .github/hooks/eos-doctor.mjs
  ```
- **行尾**：仓库自带 `.gitattributes` 强制 **LF**，因此 Windows 检出后 hooks/脚本仍有效。
  保持 `core.autocrlf` 未设置（别把它们重新改成 CRLF）。
- **`act`**（本地 CI）需要 **Docker Desktop**（WSL2 后端）；否则用上面的 `node ...`
  命令——它们是同一道门禁。
- **`build-pdf.sh`**（可选的 手册→PDF）是 Bash 脚本——用 **Git-Bash 或 WSL** 运行，或直接
  读 `docs/eos/user-manual.md`。

## 能力与依赖

EOS 本身从不调用任何模型，也不需要任何 API key。每一行都在上一行的基础上叠加：

| 你具备 | 你得到 |
|---|---|
| **只有 Node.js** | 完整的治理引擎：`eos next` / `status` / `check` / `verify`、全部门禁、账本、策略锁、签名发布、密钥扫描 |
| **+ VS Code 与 GitHub Copilot** | 引导式流程：`eos-*` agent、`/eos-*` 斜杠命令（技能）、常驻规则与 PreToolUse 护栏。所用模型就是你在 Copilot 里选的那个——无需任何配置 |
| **或其他 agent**（Claude Code、Codex、Cursor、Antigravity、Gemini CLI …） | 同样的技能与 `AGENTS.md`、EOS 的 MCP 服务，以及按该 agent 自身钩子格式运行的护栏。Claude Code 与 Antigravity 开箱即用；其他平台用 `node .github/eos/eos.mjs agents sync --platform <名称> --write` 加入（[用户手册第 6.6 章](user-manual.md#第-66-章-在-claude-code、codex-和-antigravity-中使用-eos)与 §7.9） |
| **+ BMAD 技能**（`bmad-*`） | 各阶段编排的撰写工作流（PRD、架构、story、测试设计）。没有它们，`eos next` 仍会点名每一步，由你手工完成 |
| **+ BMAD 项目运行时**（`_bmad/`，需要 python3 与 uv） | BMAD 的项目级定制与会话记忆。可选：没有它，技能按自带默认值运行 |
| **一个 agentic / LLM 产品** | 你产品自己的模型调用，由评估工具链来检验（[eval-starter](../eos/examples/eval-starter/README.md)）。那是你本来就要写的产品代码，不是 EOS 的配置 |

## 已知局限

- **PreToolUse 护栏是减速带，不是权威。** VS Code hooks 是预览功能，不同 agent harness 的行为不同，按机器生效，CI 也不会运行它。钩子读不懂的负载会按文本扫描；钩子自身出错时仍会放行。真正做决定的是 CI、分支保护与评审。
- **密钥检测是启发式的。** 两道防线匹配已知的密钥格式、凭据赋值，以及为敏感命名的环境变量写的字面量回退；经过混淆的字面量可能漏过。`gitleaks` 补充厂商格式与熵检测——本地可选，EOS CI 中则是必需的：CI 会安装固定版本并校验其校验和（自 eos-2.3.0 起）；两者都不能替代评审。
- **在分支保护与 CODEOWNERS 就位之前，治理是契约式的。** EOS 无法在本机验证服务端保护，因此"放宽需要第二个人"只有在完成 `/eos-init` 加固后才成立；在此之前 `eos-doctor` 会报告 `CONTRACTUAL`（[ADR-014](../adr/014-trust-chain.md)）。
- **本地证据诚实，但未经证明。** 在笔记本上记录的证据是 `UNATTESTED_LOCAL`；Regulated 发布需要 CI 产出的证据（`evidencePolicy`）。
- **"任意技术栈"的验证深度不同。** EOS 自身的 CI 覆盖 Node 路径与 Python 评估起步包；Python、Go、Java、Rust 与 .NET 起步包声明的是 EOS 会运行的命令，对应的工具链需要你自行安装。
- **JUnit 结果可能只按名称匹配。** 有些运行器（包括 Node 20 与 22 上的 node:test）在 JUnit XML 中不记录文件（node:test 自 Node 24.11 起记录文件）。此时 EOS 按测试名称匹配 trace matrix 的行，标记为 `"match": "name"`，并从源码确定文件：该行所指文件必须声明这个测试（不能在注释里），且不能有其他测试文件声明同名测试——请让测试名称唯一，或在行中写明所属 suite（`tests/login.test.mjs::login > valid password`）（[ADR-016](../adr/016-junit-test-evidence.md)）。
- **Windows 上的符号链接。** 不支持符号链接的检出会把链接变成普通文件，于是产品树指纹与 Linux 不同，在一边记录的证据在另一边读作 `STALE`。

## Day-1（可直接复制——与用户手册 §3.4 完全一致的序列）

```sh
npx degit niaodian/eos#eos-2.3.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs        # 期望 PASS
node .github/eos/eos.mjs init config-only --write   # 声明项目：还没有代码（或 init <pack>；--track regulated）
code .                                        # 必须在项目目录*内部*执行——见下方警告
```

**已有系统？** 那就把 EOS 引入那个仓库，在交付门禁处接入：`eos init <pack> --brownfield --write`——
无需先做 discovery 或架构；此后每项改动都是一个 story，受 G5、G7、G8 约束（[手册 §3.5](user-manual.md)）。

**`git init` 不是可选步骤。** `degit` 给你的是一个没有仓库的目录，而 EOS 会把每一次验证都绑定到它
所运行的那棵 git 树上。缺了它，`verified` 门禁会报 BLOCKED——行为本身是正确的，但这是个令人困惑的开局。

**打开项目文件夹本身，绝不要打开它的上层目录。** VS Code 是相对于工作区根去发现 `.github/` 的；
打开上层目录，自定义 agent、instructions 和 hooks 都会被静默地找不到。

**GitHub 远端仓库是一个独立的手动步骤。** EOS 只在*本地*脚手架与硬化，既不会替你在 GitHub 上
创建仓库，也不会替你推送。而分支保护（让 CI 门禁真正能阻断合并的那一环）必须依赖这个远端，
因此请在 `/eos-init` 之前或过程中创建它：

```sh
gh repo create my-new-app --private --source=. --remote=origin --push
```

然后，在 **Copilot Chat** 里：

1. **`/eos-init`**——一次性硬化引导：回答语言、分支保护、CODEOWNERS、审批基线，
   记录在 `docs/eos/activation.md`。
2. **`/eos-next`**（或 `eos-guide` agent）——照着它说的做。然后重复。

> **Day-1 就声明项目——`config-only` 是诚实的答案。** 模板自带的 `.eos/project.json` 描述的是
> EOS（`"templateDefault": true`），所以 `eos next` 会先把你引向 `eos init`。还没有代码时，运行
> `eos init config-only --write`（适用时加 `--track regulated`）：技术栈属于不可逆决策，EOS 刻意
> 把它推迟到 **Phase 4（架构阶段）**，由 ADR 正式锁定。只有当真实的技术栈清单（`pyproject.toml`、
> `go.mod`、带依赖的 `package.json` 等）已经存在、而声明仍说"没有代码"时，它才会变成错误。此时
> `eos next` 会把你引回 `eos init`，它会点名相匹配的包，而 `eos init <pack> --write` 会保留你的轨道。

> **两个名字很像、但做的事完全不同。**
> `/eos-init`（Copilot Chat）是上面那个**硬化引导**——这才是你 Day-1 需要的那个。
> `node .github/eos/eos.mjs init`（终端）负责声明项目——它的治理轨道与起步包——加上 `--write`
> 时还会写 `.vscode/tasks.json`，让 **EOS: Next / Resume / Verify Current Gate / Release Status**
> 出现在 Run Task 菜单里。

更喜欢终端？每个 prompt 都有等价的 CLI——`eos next`、`eos resume`、`eos status`——两者是同一个引擎。
在 VS Code 里 Chat 是更短的路径；CLI 是 CI 实际运行的那条。

这就是全部循环。下面的内容只在你想知道*为什么*时才需要。

- Router 会带你走 discovery → requirements → PRD → UX → architecture → stories，然后按 Story：
  readiness → implementation → verification → merge，上线之后还有：telemetry → 写回。
  每一步都会点名 Copilot agent（或 `/prompt`）和最小 BMAD skill 链——你永远不用自己从
  73 个已安装 skill 里挑。
- 每个阶段既产出给人读的文档，**也**产出给机器读的结构化记录
  （`docs/discovery.json`、`docs/requirements.json`、`docs/design.json`、`docs/architecture.json`）。
  门禁读记录：空文档不会推进产品；而一次验证会绑定到它真正运行过的源码、测试、prompt 与 eval 数据——
  因此改动它们会让已记录的 PASS 变成 `STALE`，而不是继续挂在那里。
- **一次性硬化**（把 CI 门从 advisory 变成合并阻断）：在 Copilot Chat 里跑 `/eos-init`——
  branch protection + CODEOWNERS + 审批基线，记录在 `docs/eos/activation.md`。
  个人/一次性仓库？用理由豁免各项；`eos-doctor` 会持续记账。
- 之后开了新对话？`node .github/eos/eos.mjs resume`（或 `/eos-resume`）会恢复你正在做的事、
  最近一次通过的门禁和当前 Blocker——不需要重读任何文档。

> 首次且已定栈：`eos init <pack> --write` 把它声明进 **`.eos/project.json`**，产品质量门禁才会
> 真的跑你的测试；再用 `eos stack sync --write` 把同一套命令写进
> `.github/instructions/00-workspace.instructions.md`（所有技术栈见 `docs/eos/stack-presets.md`）。
> 有了真实代码还停留在 `config-only`，会**直接失败**，而不是被无声跳过。

## Happy Path（最短入口）
```
node .github/eos/eos.mjs next
```
做完它点名的那一个动作，然后再跑一次。更喜欢用 Chat？**eos-guide** agent 跑的是同一条命令，
并为 Router 选中的 agent 提供 handoff 按钮。

## 记忆卡
```
唯一循环：     eos resume → 做那一个动作 → eos check --gate <id> --scope <id> → eos next
我在哪：       node .github/eos/eos.mjs status         （加 --changed 看你的改动影响了什么）
这条规则为啥： node .github/eos/eos.mjs explain <gate> (activation|prd-ready|story-ready|verified|release-ready)
晋级工作：     node .github/eos/eos.mjs transition --scope story --id <id> --to <STATE>
一次性硬化：   /eos-init   (branch protection + CODEOWNERS + 审批基线 → docs/eos/activation.md)
发布前：       node .github/eos/eos.mjs release-status   然后 /eos-release-gate
声明项目：     node .github/eos/eos.mjs init [<pack>] [--track regulated] --write
更短的写法：   npx --offline eos <command>   (npm 10.9+) · npm run -s eos -- <command>
自检：         node .github/hooks/validate-config.mjs · node .github/eos/eos.mjs doctor
产品门禁：     node .github/hooks/project-gate.mjs   （跑 .eos/project.json 的命令——任意技术栈）
本地 CI：      act push -j verify   (validate-config + eos-doctor + tests + evals；需 Docker)
```

## 跨项目复用
- 用户级（共享，已安装）：`~/.agents/skills/`、`~/.claude/skills/`（73 个 bmad-*）。
- 用户级 agents 位置：`~/.copilot/agents`。
- 工作区级（随仓库走）：`.github/` + `docs/` 下的一切。
- 新项目：`npx degit <you>/template my-app`（在把它发布为模板仓库之后）。私有仓库 → 加 `--mode=git`：`npx degit --mode=git <you>/template my-app`。
