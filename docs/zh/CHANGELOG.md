# EOS 更新日志

> 英文为参照语言 · English is the reference language（[docs/eos/CHANGELOG.md](../eos/CHANGELOG.md)）。
>
> 最新版本在前。`eos upgrade` 会打印项目当前版本与目标版本之间的条目，因此每条都写明对项目而言变了什么。
> 每个版本的升级步骤见用户手册第 10 章；`eos-2.0.0` 之前的版本见
> [GitHub Releases](https://github.com/niaodian/eos/releases)。EOS 多久发一次版、补丁版可以包含什么：
> [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence)。

## eos-2.7.0 — 2026-10-06

- **信任边界现已成文**（ADR-024）：EOS 是一套交付纪律和证据记录，不是针对"能写入仓库的角色"的安全边界。README 与 quickstart 的"已知局限"都已说明，并指出真正能阻止绕过的是平台控制，把批准人与 `approver` 字段标为自我声明，同时写明：在信任根移到仓库之外以前，Regulated 轨道无法证明职责分离。`eos approve` 现在会提示所记录的姓名是自我声明
- **账本事件对所有字段求哈希——请让所有人一起升到 2.7.0：**新事件带 `hv: 2`，哈希覆盖整个事件，因此 `assurance`、`deferred`、`deferredDigest` 不能再被改动而不破坏链；重放（`reconcileEvents`）过去会丢掉这些字段，现在会保留。已有账本无需改动即可校验，链不能从 `hv: 2` 退回旧方案。由本引擎写出的账本，无法被早于 `hv` 的引擎校验通过
- **对不存在的对象做状态迁移会被拒绝**：对产品中不存在的故事、或没有清单（manifest）的发布执行 `eos transition`，现在会失败，而不是为一个幽灵范围记录事件
- **`verify --full` 不再让故事对自己的那次运行失败**：verify 循环在每次记录运行后都会重新读取状态，所以处于 `READY_FOR_TEST` 的故事不会因为拿的是之前的账本而被报告为 `ERROR`
- **EOS 自身的覆盖率下限已重新定基**：排除规则 `**/*.test.mjs` 匹配不到 `.github/` 下的文件，测试文件因此被算作被覆盖的代码。排除后实测为 行 96.67 / 分支 75.50 / 函数 94.44，`.eos/test-budget.json` 现设为 96 / 75 / 94。这是修正度量，不是测试变弱
- **EOS 封版为参考实现。** 之后只做安全修复、已发布内容中的缺陷修复，以及维护者明确要求的单项改动。未修复也未排期：对 eos-2.6.0 的独立审计中的其余发现（例如 README 的 Node 徽章仍写着 20）

## eos-2.6.0 — 2026-10-04

- **破坏性变更——Node 20 已移除。** `engines` 现在是 `>=22.10.0`；模板自带 `.nvmrc`（`24`），`eos-ci.yml` 与 `eos-release.yml` 里的每个 `setup-node` 步骤都读取它，EOS 的矩阵运行 Node 22 与 24，Linux 作业固定在 `ubuntu-24.04`。Node 26 本地验证通过（26.10），在 2026-10-28 成为 LTS 之后加入 CI。
- **破坏性变更——被推迟的 NFR 需要 `dueBy` 才能晋级**（ADR-023）：`release-ready` 仍是 `DEFERRED`（绝不是 PASS），在 Standard 轨道上，仅有 NFR 目标被推迟、且每个都有负责人、触发条件和将来的 `dueBy` 的发布可以离开 `CANDIDATE`。`dueBy` 已过会让 `nfr-evidence` 为 FAIL。`eos approve` 会打印整份推迟清单并把批准绑定到它；`RELEASED` 之后 `status` 与 `next` 会一直列出它。被推迟的依赖审计仍然阻断，Regulated 或 Controlled 发布带任何推迟都不会晋级。
- **破坏性变更——`release-ready` 新增检查 `one-way-doors-confirmed`：** 每个引用了 ADR 的架构决策，其 ADR 都必须是 `Status: accepted`，并带 `Confirmed by` 与 `Confirmed at`。G4 对 `proposed` 的 ADR 仍然通过并给出提示；无人值守的收尾是"暂定决策，并列出来请人确认"。G4 现在还会把工作区规则与声明的技术栈做比较：技术栈 DECIDED 但 `.eos/project.json` 没有 `stacks`，或 `Local commands` 与 `stack sync` 的结果不同，都会失败。
- **破坏性变更——门禁版本号变化**（`architecture-ready`、`story-ready`、`verified`、`release-ready`）：这些门禁已记录的 PASS 证据会变 STALE 一次。运行 `eos policy lock --write`（没有任何削弱，所以不需要批准人）与 `eos verify --full`。
- **给单人维护者的 solo 路径**（ADR-023）：`.eos/project.json` 接受 `approvalMode: "solo"`（仅限 Standard 轨道；`eos init <pack> --solo`）。此后 `eos approve --self --reason`、`eos policy lock --self` 和写成 `<name> (self)` 的 waiver 批准人都会被接受，记录为 `assurance: "self"` 并显示为自批准。切换到 `solo` 是需要独立批准人的 WEAKENING，而 agent 永远不会运行 `--self`：护栏会拒绝它。CI 在这里接受 `(self)` 批准人，策略检查失败也不再跳过产品质量门——两者分别报告。
- **护栏按命令真正执行的内容来判断**，而不是它携带的文本：heredoc 正文、`git commit` 或 `echo` 的带引号参数、注释，以及不是 shell 脚本的文件都是数据；凭据规则需要一个高熵的单一 token；`curl … | node -e` 与 `kill $PID` 放行；拒绝信息会点出规则、匹配到的文本和改法。Antigravity 的钩子会找到仓库根目录，因此可以从 `.agents/` 运行。
- **`eos next` 说出适用的情况**：尚未激活、等待一个人（`proposed` 的 ADR）、现在开始测量（带规模条件的 NFR）、先冻结，以及发布之后要做的事（G9、G10）。过期的 `product` 焦点不再钉住 `next`；`verify` 只评估基线已到达的阶段；对 `docs/stories/` 的"不存在"报告会先检查目录。
- **Doctor、证据与 init**：D5 从结构化记录读取制度（散文里点名某个制度只是警告）；trace matrix 里的测试名读到单元格末尾；失败的测试运行会点名第一个失败的测试，并把"没有工具链"分开报告；`language: zh` 的项目里中文 runbook 可以通过；`operability` 成为 NFR 类别；`productTree.exclude` 让 `docs/pilot-log.md` 这类记录不进入产品树（新增一项属于策略 REVIEW）；删除 `.eos/project.json` 属于 WEAKENING；`eos stage init story`，以及同时写出 `docs/EXPERIENCE.md` 的 design 记录；`init` 会保留你已选的 `language`、平台与排除项，并在声明 `agentic` 时列出需要 `Eval case` 列的 story；`check-doc-parity` 会给出成对的两个文件名。
- **示例与规则**：eval-starter 的 cassette 字段改为 `requestSha256`（旧名 `key` 仍可读取——gitleaks 把每个哈希都当成了凭据），文档写明经中转录制的做法（`usageComparable: false`），并拒绝不是 chat-completions 文档的 200 响应；frontend 规则与框架无关，Next.js 专属条款单独成节；`/eos-init` 会列出谁必须在场、要替换的模板文件，以及如何判断分支保护是否真的生效。
- **文档**：手册第 10.13 节（升级）、附录 E（由你手工执行的平台冒烟清单）、工作流契约里的批准保证级别一节，以及 `act` 现在要加 `-W .github/workflows/eos-ci.yml`。
- **已知局限**：产品树指纹中的符号链接（P3-2）、Node 26 未纳入 CI 矩阵，以及 `solo` 与 `DEFERRED` 按设计是低保证级别（ADR-023）。此版本之后 EOS 的开发暂停；之后只接受安全修复、你亲自提出的单项需求，以及导致 CI 失败的平台或运行时变更。

## eos-2.5.0 — 2026-10-04

- **你的 CI 运行你的项目，而不是 EOS 的测试套件**（ADR-021）：一旦 `.eos/project.json` 是你自己的声明，`eos-ci.yml` 就会跳过 EOS 的五个测试层、覆盖率作业以及 Linux/macOS/Windows 矩阵，不会启动任何 Windows 或 macOS runner。治理检查和你声明的命令照常运行；EOS 自己的测试套件仍在 EOS 本身以及尚未运行 `eos init` 的副本中运行。分支保护中只需把 `verify` 设为必需检查。
- **首次声明会建立你自己的策略锁与 SBOM**（ADR-022）：在模板副本上，`eos init <pack> --write` 会把本项目的策略记录到 `.eos/policy.lock.json`（不确认任何变更），并重新生成 `.eos/sbom.json`。因此无论脚手架是否先提交，首次推送与首个 PR 都能通过 `policy check`、`sbom --check` 与两个 doctor。已声明的项目保留自己的锁：重新声明属于策略变更，削弱仍需第二个人审批；把声明重新标记为模板自身本身就是一项削弱。
- **CI 的触发时机有变**：推送只构建 `main`、`master` 与 tag；PR 的每个提交构建一次，新提交会取消它之前的运行。没有 PR 的分支推送后不再构建：请为它开 PR，或把它加入 `on.push.branches`。每周一次的定时运行在你的仓库里只启动一个很短的 `plan` 作业；不需要的话，删除 `schedule:` 一节即可。
- **EOS 自己的 CI 更省**：PR 只在每个平台上用 Node 24 各跑一次 EOS 的矩阵，只改文档的 PR 跳过矩阵；合并、tag、每周运行与手动运行使用完整矩阵（Windows 与 macOS 上的 Node 20、22、24，Linux 上的 24，外加 Node 20 的 `verify` 与 Node 22 的 `coverage`）。
- **`eos init` 会让 SBOM 保持最新**：只要声明改变了 SBOM 所描述的技术栈（包括 `config-only` 项目有了代码之后），就会重新生成；`sbom --check` 失败时会给出 `eos sbom --write`。

## eos-2.4.0 — 2026-10-04

- **每个平台都测试 Node 24**：CI 在 Linux、macOS 和 Windows 上运行 Node 20、22 和 24。Node 20 已于 2026-04-30 停止维护，只作为声明的最低版本保留（`engines` 不变）：请使用 22 或 24。
- **Node 24 的 JUnit 报告会按文件定位每个测试**：node:test 自 Node 24.11 起记录测试所在的文件，因此 trace matrix 的行按文件匹配（`"match": "file"`，Node 20 和 22 上为 `"name"`），EOS 会把路径转换为相对仓库的路径——证据永远不会记录仓库检出在哪里。请在各台机器和 CI 上使用同一个 Node 主版本做验证。
- **为 Antigravity 安装的 BMAD 也算已安装**：`eos next` 和 `eos-doctor --deep` 还会查找 `~/.gemini/config/skills`、`~/.gemini/antigravity-cli/skills` 以及 IDE 的旧目录 `~/.gemini/antigravity/skills`。
- **`eos next --exit-zero`、`eos resume --exit-zero`**：存在阻断时也退出 0——用于提示符、钩子或 `&&` 串联；3 仍表示 EOS 无法评估，JSON 中保留原判定。
- **编排 agent 在 Antigravity 和 Codex 中同样读得通**：它们会说明在每种工具中如何进入下一个 agent，而不是指向 Copilot 的 handoff 按钮。
- **修复：runbook 是 `ops/runbook.md`**，也就是发布门禁读取的文件。`eos-runbook` 技能和文档原先写的是 `ops/runbook-<service>.md`，而 G8 从不读取它；请把这类文件合并进 `ops/runbook.md`，每个服务一节。
- **每道门禁一个评估器模块**（`.github/eos/lib/evaluators/`），由注册表汇总：判定、门禁版本和已记录的证据都不变。
- `src/`、`api/` 和 `ops/` 说明了各自该放什么；EOS 自身的覆盖率阈值提高到 97 / 79 / 96。

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
