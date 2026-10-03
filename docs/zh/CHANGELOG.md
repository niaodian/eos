# EOS 更新日志

> 英文为参照语言 · English is the reference language（[docs/eos/CHANGELOG.md](../eos/CHANGELOG.md)）。
>
> 最新版本在前。`eos upgrade` 会打印项目当前版本与目标版本之间的条目，因此每条都写明对项目而言变了什么。
> 每个版本的升级步骤见用户手册第 10 章；`eos-2.0.0` 之前的版本见
> [GitHub Releases](https://github.com/niaodian/eos/releases)。EOS 多久发一次版、补丁版可以包含什么：
> [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence)。

## eos-2.3.0 — 2026-10-03

- **所有 agent 平台都从同一个源头生成**（ADR-019）：`eos agents sync` 写出 EOS 的 MCP 条目、按各平台自身格式运行的护栏钩子，以及不会冲突的编排 agent。Copilot、Claude Code 和 Antigravity 默认生成——模板新增了 `.mcp.json`、`.claude/settings.json` 和 `.agents/…`；Codex、Cursor、Gemini CLI 以及五个第二梯队平台按需生成：`eos agents sync --platform <名称> --write`。共享文件中不属于 EOS 的内容一律保留，`eos upgrade` 会重新生成这些文件，而不是拿它们做比较。
- **用户手册覆盖 Claude Code、Codex 和 Antigravity**：新增的第 6.6 章逐一说明各平台的一次性配置和日常开发流程，以及 `eos next` 点名的每一步在其中如何操作。
- **`eos mcp`**（ADR-018）：把 EOS 的读取与验证命令作为 MCP 工具提供——`eos_next`、`eos_check`、`eos_verify` 等。批准、豁免和状态迁移仍是由人运行的 CLI 命令。
- **存量项目接入**（ADR-020）：`eos init <pack> --brownfield` 让已有系统使用 `delivery-only` profile：按现状记录系统，每项改动都是一个受 G5、G7、G8 约束的 story。
- **`eos stage init <阶段>`** 根据 schema 写出阶段记录的骨架；在每个 `TODO(eos)` 被回答之前，所有门禁都会拒绝它。样例记录见 `docs/eos/examples/stage-records`。
- **`eos upgrade` 会打印本更新日志**中跨越的各版本条目；CONTRIBUTING.md 写明了发版节奏。
- **CI 要求 gitleaks**，版本固定并校验 checksum（`EOS_REQUIRE_GITLEAKS=1`）；本地仍为可选。
- **修复：** 护栏不再拦截与无关管道相邻的下载命令（`curl … -o f && sha256sum f | …`）。

## eos-2.2.0 — 2026-10-03

- **破坏性变更——斜杠命令改为 Agent Skills**，位于 `.agents/skills/eos-*`（ADR-017）：`/spec` 现在是 `/eos-spec`，`/requirements` 是 `/eos-requirements`，依此类推；`.github/prompts/` 已移除。Claude Code 会在 `.claude/skills/` 中得到一份生成的副本（`eos agents sync`）。
- **verified 门禁根据本次运行写出的 JUnit XML 生成 `test-run.json`**（ADR-016）：声明 `"evidence": {"junit": [...]}`，即可去掉你的映射步骤。`eos evidence junit` 可导入来自 CI 其他步骤的报告。
- **起步包声明了 `commands.audit`**（运行器能输出 JUnit 时还声明 `evidence.junit`）；`eos status` 会预告发布门禁 G8 将需要什么。
- **NFR 摘要示例与辅助脚本**（`docs/eos/examples/nfr-summary`）。
- **eval-starter 可评估真实模型**：任意 OpenAI 兼容端点、录制 / 回放；回放的结果标注为未经证明。
- **发布前修复：** 仅按名称匹配的测试必须在 trace matrix 所指的文件中声明，且不得在其他测试文件中声明；重跑若复现了已记录的测试结果，就保留 `test-run.json`，其他 story 因此保持已验证；发布门禁根据 `test-run.json` 为 trace 行计分；`eos agents sync` 绝不透过符号链接写入；eval-starter 在 Windows 上也记录相对项目根的路径。

## eos-2.1.0 — 2026-10-03

- **`eos upgrade`**（ADR-015）：逐文件三方比较，绝不覆盖你的改动。
- **eval-starter 写出 `eval-summary.json`**，即 G-EVAL 读取的摘要；附带仅用标准库的 Python 版。
- **审批基线默认生效**：`eos init --write` 会创建 `.vscode/settings.json`；`eos-doctor` D8 检查其取值。
- **文档**：各项能力需要什么、已知局限、ADR-014（信任链）。

## eos-2.0.1 — 2026-10-02

- **两道密钥防线的安全补丁**：`secret-scan` 不再跳过提到环境变量的行，PreToolUse 钩子逐个读取工具调用的每个字段。能识别更多凭据写法与密钥格式。

## eos-2.0.0 — 2026-10-01

- **两条治理轨道**：Standard 与 Regulated——`eos init <pack> --track standard|regulated --write`。
- **签名的发布清单**与 **CI 中带证明的发布**（ADR-012）；`release-ready` 校验签名与制品摘要。
- **中心化策略分发**，离线执行：`eos policy export` / `eos policy sync`（ADR-013）。
- **治理报告**：`eos report`，可针对单个仓库或整个组织。
