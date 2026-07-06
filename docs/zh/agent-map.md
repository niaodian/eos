> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/agent-map.md`](../eos/agent-map.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS ↔ BMAD 复用映射

| 阶段 | 使用（skills / agents） |
|---|---|
| 发现 Discovery | bmad-brainstorming, bmad-agent-analyst, bmad-forge-idea |
| 需求 Requirements | bmad-agent-pm, bmad-create-prd, bmad-product-brief, eos-operational-readiness |
| 规格 Spec | bmad-create-prd, bmad-validate-prd |
| UX/设计 UX/Design | bmad-ux, bmad-agent-ux-designer (Sally), bmad-cis-design-thinking (Maya) |
| 架构 Architecture | bmad-architecture / bmad-create-architecture (Winston)；EOS `/adr`、`/deploy-topology`（拓扑决策 → docs/checklists/G-deployment.md + deployment-topology ADR） |
| 规划 Planning | bmad-create-epics-and-stories, bmad-create-story, bmad-sprint-planning, bmad-testarch-atdd, bmad-check-implementation-readiness |
| 开发 Development | bmad-dev-story, bmad-agent-dev (Amelia), bmad-quick-dev, bmad-code-review；EOS skill `eos-compliance-skeletons`（隐私脚手架） |
| 测试 Testing | bmad-tea (Murat), bmad-testarch-*, bmad-qa-generate-e2e-tests；EOS `/e2e`（Playwright 框架+生成+trace；开发期用沙箱化 **Playwright MCP** 驱动浏览器自查——阶段 7 经 `cp .vscode/mcp.json.example .vscode/mcp.json` opt-in，随仓 inert），`/spec-align`（AC 覆盖 / first-pass 率） |
| LLM Eval（若 agentic） | EOS `/eval-spec` → docs/eval-plan.md；bmad-eval-runner（仅作模式参考） |
| 发布/运维 Release/Ops | EOS prompts：/release-gate（遵循阶段 4 的部署拓扑）、/runbook |
| 可观测性 Observability | EOS prompt：/telemetry-plan |
| 迭代 Iteration | bmad-correct-course, bmad-retrospective, bmad-document-project, bmad-sprint-status |
| CI（本地，用 act） | bmad-testarch-ci（脚手架）；`.github/workflows/eos-ci.yml` 跑 validate-config + eos-doctor + secret-scan + tests + evals |
| 安全评审 Security review | bmad-review-adversarial-general, bmad-code-review；EOS secret-scan.mjs + E-security 清单 + guardrail |

> 73 个 `bmad-*` skill 安装在 `~/.agents/skills/` 与 `~/.claude/skills/`（用户级，跨项目共享）。
