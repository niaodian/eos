# EOS 更新日志

> 英文为参照语言 · English is the reference language（[docs/eos/CHANGELOG.md](../eos/CHANGELOG.md)）。
>
> 最新版本在前。`eos upgrade` 会打印项目当前版本与目标版本之间的条目，因此每条都写明对项目而言变了什么。
> 每个版本的升级步骤见用户手册第 10 章；`eos-2.0.0` 之前的版本见
> [GitHub Releases](https://github.com/niaodian/eos/releases)。EOS 多久发一次版、补丁版可以包含什么：
> [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence)。

## eos-2.2.0 — 2026-10-03

- **破坏性变更——斜杠命令改为 Agent Skills**，位于 `.agents/skills/eos-*`（ADR-017）：`/spec` 现在是 `/eos-spec`，`/requirements` 是 `/eos-requirements`，依此类推；`.github/prompts/` 已移除。Claude Code 会在 `.claude/skills/` 中得到一份生成的副本（`eos agents sync`）。
- **verified 门禁根据本次运行写出的 JUnit XML 生成 `test-run.json`**（ADR-016）：声明 `"evidence": {"junit": [...]}`，即可去掉你的映射步骤。`eos evidence junit` 可导入来自 CI 其他步骤的报告。
- **起步包声明了 `commands.audit`**（运行器能输出 JUnit 时还声明 `evidence.junit`）；`eos status` 会预告发布门禁 G8 将需要什么。
- **NFR 摘要示例与辅助脚本**（`docs/eos/examples/nfr-summary`）。
- **eval-starter 可评估真实模型**：任意 OpenAI 兼容端点、录制 / 回放；回放的结果标注为未经证明。

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
