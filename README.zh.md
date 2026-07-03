# EOS 模板 · 中文导航 (onramp)

> ⚠️ **英文为权威 (English is canonical).** 本文件只是给中文用户的**简短入口**，不是完整文档。
> 完整且持续维护的文档在英文版；中文全文存档见 [`docs/zh/`](docs/zh/)（**非权威 · 可能滞后**，冲突时以英文为准）。

**EOS** 是一套可移植、**纯本地优先**的「工程操作系统」模板，面向 VS Code + GitHub Copilot，
在完整 SDLC 上编排已安装的 **BMAD** 技能（73 个 `bmad-*`）。当前版本：**eos-1.10.0**。

**在同一框架内支持两种范式：**
- **传统 SaaS**（确定性）：事务、韧性（熔断/退避）、REST/OpenAPI、RBAC/多租户、OTel 可观测性。
- **Agentic / LLM 产品**（概率性）：prompt 即制品、工具白名单、评估驱动测试（G-EVAL）、认知重试（reflection）、token/成本追踪。

两者**显式隔离**——一个项目可以是其一、或两者兼具，而不发生范式交叉污染。

## 从这里开始（英文权威文档）
| 想做什么 | 看这里（英文，权威） |
|---|---|
| 快速上手（前置条件 + Day-1） | [`docs/eos/quickstart.md`](docs/eos/quickstart.md) |
| 完整用户手册（点子 → 上线 → 迭代；含 SaaS / Agentic 两条新手路径） | [`docs/eos/user-manual.md`](docs/eos/user-manual.md) |
| 设计理念（为什么这样构建） | [`docs/eos/blueprint.md`](docs/eos/blueprint.md) |
| 各技术栈配方（Node/Python/Go/Java/Rust/.NET + AI/LLM） | [`docs/eos/stack-presets.md`](docs/eos/stack-presets.md) |
| 项目总览 | [`README.md`](README.md) |

第一条命令（期望 PASS）：
```sh
node .github/hooks/validate-config.mjs
```

> **把项目文件夹本身作为工作区根目录打开**（在其中执行 `code .`）。VS Code 只在被打开的根目录发现
> `.github/{agents,instructions,hooks,prompts}`——若打开的是**上层**父文件夹，自定义 agents、instructions、hooks 会静默失效。

## 中文存档（非权威）
冻结于基线 `eos-1.10.0-zh` 的中文全文快照在 [`docs/zh/`](docs/zh/)，**不再持续维护、可能与英文权威版本产生偏差**；
若中英文有冲突，**以英文为准**。

> 纯本地 · 零企业/网络依赖 · 可随 Git 携带。有问题欢迎在 Issues / Discussions 提出。
