> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/agent-map.md`](../eos/agent-map.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS ↔ BMAD 复用映射

> **你并不需要靠这张表来干活。** `.eos/agent-map.json` 才是 Router 读取的机器可读版本：它把一个动作
> 映射到一个主 agent（或 prompt）加最小 skill 链，而 `eos next` 已经把这个映射解析好交给你了。
> 本页是面向人类的投影——想看全景时读它，而不是为了给当前这一步挑 skill。

| 阶段 | 使用（skills / agents） |
|---|---|
| 导航（任意阶段） | EOS agent `eos-guide`；prompts `/eos-next`、`/eos-resume`、`/eos-status`；CLI `node .github/eos/eos.mjs next` |
| 发现 Discovery | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea |
| 需求 Requirements | bmad-agent-pm, bmad-prd, bmad-product-brief, eos-operational-readiness |
| 规格 Spec | bmad-prd |
| UX/设计 UX/Design | bmad-ux, bmad-agent-ux-designer (Sally), bmad-cis-design-thinking (Maya) |
| 架构 Architecture | bmad-architecture (Winston)；EOS `/adr`、`/deploy-topology`（拓扑决策 → docs/checklists/G-deployment.md + deployment-topology ADR） |
| 规划 Planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd, bmad-check-implementation-readiness |
| 开发 Development | bmad-dev-story, bmad-agent-dev (Amelia), bmad-quick-dev, bmad-code-review；EOS skill `eos-compliance-skeletons`（隐私脚手架） |
| 测试 Testing | bmad-tea (Murat), bmad-testarch-*, bmad-qa-generate-e2e-tests；EOS `/e2e`（Playwright 框架+生成+trace；开发期用沙箱化 **Playwright MCP** 驱动浏览器自查——阶段 7 经 `cp .vscode/mcp.json.example .vscode/mcp.json` opt-in，随仓 inert），`/spec-align`（AC 覆盖 / first-pass 率） |
| LLM Eval（若 agentic） | EOS `/eval-spec` → docs/eval-plan.md；bmad-eval-runner（仅作模式参考） |
| 发布/运维 Release/Ops | EOS prompts：/release-gate（遵循阶段 4 的部署拓扑）、/runbook |
| 可观测性 Observability | EOS prompt：/telemetry-plan |
| 迭代 Iteration | bmad-correct-course, bmad-retrospective, bmad-document-project, bmad-sprint-status |
| CI（本地，用 act） | bmad-testarch-ci（脚手架）；`.github/workflows/eos-ci.yml` 跑 validate-config + eos-doctor + secret-scan + tests + evals |
| 安全评审 Security review | bmad-review-adversarial-general, bmad-code-review；EOS secret-scan.mjs + E-security 清单 + guardrail |

> 73 个 `bmad-*` 技能安装在 `~/.agents/skills/` 与 `~/.claude/skills/`（用户级，跨项目共享）。
> EOS 从不全量加载：路由器每个动作至多点名一两个；未安装的技能被报告为 BLOCKED 并给出替代路径，
> 而不是推荐一个用不了的东西。

## 运行时兼容性 —— 在相信"doctor 变绿"之前先读这一段

已安装不等于**可激活**。每个被映射的 BMAD 技能都通过**项目级**的 `_bmad/` 运行时解析自身定制
（`resolve_customization.py`、`memlog.py`，以及 `bmm`/`core`/`tea` 的 `config.yaml`），而 EOS **不**附带它。
因此仅检查目录名会把"首个激活步骤就会失败"的技能报告为 PASS（审计发现 EOS-AUD-002）。

- `.eos/bmad.lock.json` 声明 EOS 的全部假设：必需技能、运行时脚本与配置、可执行文件，
  以及 EOS 拒绝映射的已废弃技能。
- `node .github/hooks/eos-doctor.mjs --deep` 检查它，并区分两种回答：技能**根本无法激活**时报
  **BLOCKED**（判失败）；技能能激活、只是因为没装项目运行时而跑在自带默认值上时报 **DEGRADED**
  （仅告警——那是可用状态，把它说成坏掉就是"假红"）。CI 运行 `--deep`。
- **没有 BMAD，EOS 也是完整的。** 任何门禁、求值器、迁移或路由决策都不调用技能；
  缺失技能只是一条 NOTE，`eos next` 仍会给出动作、目标门禁与完成判据。
- 设计依据：[ADR-003 —— BMAD 运行时边界](../adr/003-bmad-runtime-boundary.md)。

上游已废弃、此处不再映射：`bmad-create-prd` 与 `bmad-validate-prd` → **`bmad-prd`**
（自动识别 create / update / validate 意图）；`bmad-create-architecture` → **`bmad-architecture`**。
