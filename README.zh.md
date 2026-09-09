# EOS 模板 · Engineering Operating System

> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`README.md`](README.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准。

一套可移植、**纯本地优先（local-first）**的「工程操作系统」，面向 VS Code + GitHub Copilot，
在完整 SDLC 上编排已安装的 **BMAD** 技能（73 个 `bmad-*`）。当前版本：**eos-1.11.0**。

**在同一框架内支持两种范式：**
- **传统 SaaS**（确定性）：事务、韧性（熔断/退避）、REST/OpenAPI、RBAC/多租户、OTel 可观测性。
- **Agentic / LLM 产品**（概率性）：prompt 即制品、工具白名单、评估驱动测试（G-EVAL）、认知重试（reflection）、token/成本追踪。

两者**显式隔离**——一个项目可以是其一、或两者兼具，而不发生范式交叉污染。

## 内含什么
```
.github/
  copilot-instructions.md       # R1 always-on 全局规则（极简）
  instructions/                 # 分域规则（applyTo glob）：6 个后端栈 + 前端 + data-api
                                #   + ai/llm + testing + security + release-ops
  prompts/                      # 斜杠命令工作流（/eos-help /eos-init /requirements /spec /ux-spec /eval-spec
                                #   /spec-align /adr /nfr /telemetry-plan /release-gate /runbook /validate-config）
  agents/                       # 5 个编排 agent（discovery/design/architecture/plan/review）
  skills/                       # 项目级能力（operational-readiness）
  hooks/                        # 护栏 + 验证器（validate-config、eos-doctor、secret-scan、
                                #   spec-align、project-gate）
  workflows/                    # 本地 CI（eos-ci.yml）——经 act 运行，无需云端 runner
.eos/
  project.json                  # 项目声明：projectType + stacks + 质量命令
                                #   （产品质量门禁真正执行的那一份——适用任意技术栈）
docs/
  checklists/                   # A-gap、B-rework、C-nfr、D-ops、E-security
  eos/                          # blueprint、user-manual、quickstart、stack-presets、agent-map、examples、VERSION
  adr/ epics/ stories/          # SDD 制品
api/ ops/ src/
```

## 三道强制层（全部本地）
1. **逐次编辑 hooks**（实时）：护栏拦截破坏性 / 供应链投毒 / 密钥泄露操作；
   每次编辑后 quality + config-check 跑验证器。
2. **静态验证器**（按需）：`validate-config.mjs`（配置 S1–S12）、`check-doc-parity.mjs`（中⇄英文档对等）、
   `eos-doctor.mjs`（SDLC 门，含 G-EVAL）、`secret-scan.mjs`（+gitleaks）、`spec-align.mjs`（spec 对齐度量，
   `--strict` 为 fail-closed）、`project-gate.mjs`（项目自己的 lint/typecheck/test/eval——适用任意技术栈）。
3. **全仓 CI**（合并/发布前）：`act push` 运行 `.github/workflows/eos-ci.yml`。
   产品测试按 **`.eos/project.json` 声明的技术栈**执行（Node/Python/Go/Java/Rust/.NET）——
   测试失败即 CI 失败；未声明或无法测试的项目 fail closed，而不是被跳过。

## 本机已验证
- 较新版本的 VS Code + Copilot Chat · brace glob（`**/*.{ts,tsx}`）正确加载。
- PreToolUse 护栏拦截破坏性/投毒/密钥操作（`permissionDecision: "deny"`）。
- `act` 一次性拉取镜像后离线跑 CI；73 个 `bmad-*` 技能从用户级目录加载。

## 从这里开始
见 [docs/zh/quickstart.md](docs/zh/quickstart.md)（前置条件 + Day-1）。第一条命令：
```
node .github/hooks/validate-config.mjs    # 期望 PASS
```

> **一次性硬化（让 CI 门真正合并阻断，而非仅 advisory）：** 从模板实例化真实仓库后，
> 在 Copilot Chat 里跑 `/eos-init`。它带你走 branch protection + 替换 CODEOWNERS handle +
> 审批基线，并在 [docs/zh/activation.md](docs/zh/activation.md) 记录进度。`eos-doctor` 每次运行
> 都会提示尚未完成的项，`/release-gate` 在发布前再核一次——因此不会被系统性遗忘。

> **把项目文件夹本身作为工作区根目录打开**（在其中执行 `code .`）。VS Code 只在被打开的根目录发现
> `.github/{agents,instructions,hooks,prompts}`——若打开的是**上层**父文件夹，自定义 agents、
> instructions、hooks 会静默失效。

**完整用户手册**（点子 → 上线 → 迭代；含面向新手的分步 **SaaS** 与 **Agentic** 两条路径）：
[docs/zh/user-manual.md](docs/zh/user-manual.md)。

设计理念（为什么这样构建）：[docs/zh/blueprint.md](docs/zh/blueprint.md)。

各技术栈配方（Node/Python/Go/Java/Rust/.NET + AI/LLM）：[docs/zh/stack-presets.md](docs/zh/stack-presets.md)。

## 说明
- 无组织/网络依赖：完全本地、可随 Git 携带。
- 本地 CI 经 `act` 运行（在本地跑 GitHub Actions，需 Docker）——`.github/workflows/eos-ci.yml`。
  没有 Docker？直接跑同样的门禁：`node .github/hooks/validate-config.mjs && node .github/hooks/eos-doctor.mjs`。
- Hooks 是 VS Code **Preview** 功能（官方：配置格式/行为可能变化）——`.github/hooks/*.json`
  经 `chat.hookFilesLocations` 默认加载。见 `docs/zh/user-manual.md` §2.4 + 附录 D。
- **没有原生规则优先级**——靠 `applyTo` 作用域 + 约定 + hooks 控制。

## 许可证 (License)

[MIT](LICENSE) © 2026 Xavier Zhang。
