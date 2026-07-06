> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/quickstart.md`](../eos/quickstart.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS 快速开始（Quickstart）

> **任何时候迷路了？** 在 Copilot Chat 里跑 `/eos-help`——它会检测本仓库当前处于哪个阶段、
> 打印记忆卡、并告诉你确切的下一步（以及任何待办的一次性硬化）。

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
    && npm run -s verify --if-present     # verify = tests + evals, if package.json has it
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

## Day-1（从 clone 到第一份 spec）
1. 在 VS Code 打开这个文件夹。
2. 校验配置：`node .github/hooks/validate-config.mjs`（期望 PASS）。
3. **一次性硬化**（把 CI 门从 advisory 变成合并阻断）：在 Copilot Chat 里跑 `/eos-init`——
   它带你走 branch protection + CODEOWNERS + 审批基线，记录在 `docs/eos/activation.md`。
   个人/一次性仓库？用理由豁免各项；`eos-doctor` 会持续记账。
4. 在 Copilot Chat（Agent 模式）：
   - 切到 **eos-discovery** agent → 产出 `docs/discovery.md`。
   - 跑 `/requirements "<feature>"` → `docs/requirements.md` + 运营决策表（门 G2）。
   - 跑 `/spec` → `docs/prd.md`（复用 bmad-create-prd，由 bmad-validate-prd 校验）。
5. 提交。

> 首次：在 `.github/instructions/00-workspace.instructions.md` 填项目事实——
> 从 `docs/eos/stack-presets.md` 复制你的栈预设（Node/Python/Go/Java/Rust/.NET）。

## Happy Path（最短入口）
```
/requirements "<one-line feature>"
```
然后跟着 handoff 走：→ /spec → /ux-spec（面向用户）→（agent）eos-architecture →（handoff）eos-plan → bmad-dev-story → bmad-code-review。

## 记忆卡
```
新功能：       /requirements "<feature>" → /spec → /ux-spec → (agent) eos-architecture
                                          → (handoff) eos-plan → bmad-dev-story → bmad-code-review
一次性硬化：   /eos-init   (branch protection + CODEOWNERS + 审批基线 → docs/eos/activation.md)
发布前：       /release-gate
自检：         node .github/hooks/validate-config.mjs
本地 CI：      act push -j verify   (validate-config + eos-doctor + tests + evals；需 Docker)
```

## 跨项目复用
- 用户级（共享，已安装）：`~/.agents/skills/`、`~/.claude/skills/`（73 个 bmad-*）。
- 用户级 agents 位置：`~/.copilot/agents`。
- 工作区级（随仓库走）：`.github/` + `docs/` 下的一切。
- 新项目：`npx degit <you>/template my-app`（在把它发布为模板仓库之后）。私有仓库 → 加 `--mode=git`：`npx degit --mode=git <you>/template my-app`。
