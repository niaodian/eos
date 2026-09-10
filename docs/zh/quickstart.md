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
| **Node.js**（18+） | 验证器、hooks、JS/TS 测试与 eval | 必需——唯一的硬依赖 |
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

## Day-1（可直接复制——与用户手册 §3.4 完全一致的序列）

```sh
npx degit niaodian/eos#eos-1.15.0 my-new-app && cd my-new-app
git init && git add -A && git commit -q -m "chore: scaffold from eos"
node .github/hooks/validate-config.mjs        # 期望 PASS
code .                                        # 必须在项目目录*内部*执行——见下方警告
```

**`git init` 不是可选步骤。** `degit` 给你的是一个没有仓库的目录，而 EOS 会把每一次验证都绑定到它
所运行的那棵 git 树上。缺了它，`verified` 门禁会报 BLOCKED——行为本身是正确的，但这是个令人困惑的开局。

**打开项目文件夹本身，绝不要打开它的上层目录。** VS Code 是相对于工作区根去发现 `.github/` 的；
打开上层目录，自定义 agent、instructions 和 hooks 都会被静默地找不到。

然后，在 **Copilot Chat** 里：

1. **`/eos-init`**——一次性硬化引导：分支保护、CODEOWNERS、审批基线，记录在 `docs/eos/activation.md`。
2. **`/eos-next`**（或 `eos-guide` agent）——照着它说的做。然后重复。

> **两个名字很像、但做的事完全不同。**
> `/eos-init`（Copilot Chat）是上面那个**硬化引导**——这才是你 Day-1 需要的那个。
> `node .github/eos/eos.mjs init --write`（终端）只写 `.vscode/tasks.json`，让
> **EOS: Next / Resume / Verify Current Gate / Release Status** 出现在 Run Task 菜单里。
> 它是便利设施，不是必经步骤。

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

> 首次：在 `.github/instructions/00-workspace.instructions.md` 填项目事实——
> 从 `docs/eos/stack-presets.md` 复制你的栈预设（Node/Python/Go/Java/Rust/.NET），并把同一套命令
> 写进 **`.eos/project.json`**，产品质量门禁才会真的跑你的测试。模板初始为
> `projectType: "config-only"`；有了真实代码还留着它，会**直接失败**，而不是被无声跳过。

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
发布前：       node .github/eos/eos.mjs release-status   然后 /release-gate
自检：         node .github/hooks/validate-config.mjs · node .github/eos/eos.mjs doctor
产品门禁：     node .github/hooks/project-gate.mjs   （跑 .eos/project.json 的命令——任意技术栈）
本地 CI：      act push -j verify   (validate-config + eos-doctor + tests + evals；需 Docker)
```

## 跨项目复用
- 用户级（共享，已安装）：`~/.agents/skills/`、`~/.claude/skills/`（73 个 bmad-*）。
- 用户级 agents 位置：`~/.copilot/agents`。
- 工作区级（随仓库走）：`.github/` + `docs/` 下的一切。
- 新项目：`npx degit <you>/template my-app`（在把它发布为模板仓库之后）。私有仓库 → 加 `--mode=git`：`npx degit --mode=git <you>/template my-app`。
