# EOS 实例化后硬化 · 激活清单（Activation Ledger）

> **这是什么**：从模板实例化一个真实仓库后，有几件"一次性"的事**只有你的组织/GitHub 账户能做**，
> 模板替不了（`【需组织/GitHub 设置】`）。做完它们，EOS 的 3 道 CI 硬门才从**"契约性存在"**变成
> **"合并阻断的技术权威"**——这正是第三方审计里"拿不回的 9 分"中**你能拿回的部分**。
>
> **怎么用**：
> - 想要引导式逐步执行 → 在 Copilot Chat 里跑 **`/eos-init`**（它会尽量替你改、改不了的打印确切步骤）。
> - 想要完整原理与步骤 → 见 `docs/eos/user-manual.md` **附录 D**。
> - 本文件是**可勾选的进度台账**：`eos-doctor` 每次运行都会读它并 advisory 提示还剩几项；
>   `/release-gate`（G8）发布前会再核一次——**这就是"系统性遗忘"的防线**。
>
> **勾选语法**（`eos-doctor` 按此解析，请勿改变行首格式）：
> - `- [ ]` 未做（pending，会被持续提示）
> - `- [x]` 已完成
> - `- [~]` 有意豁免——**必须在同一行补上原因**，例如：`- [~] 分支保护 · 原因：个人试验仓，一次性 spike`
>
> **模板自身**：以下项在**纯净模板里故意保持未勾选**（诚实自陈：模板确实还没硬化，也无法自开服务端保护）。
> 你从模板实例化后，请按你的真实决定逐项勾掉或豁免。

---

## 一、拿回"强制权威"轴（约 +4 分）——每个真实仓库都应做

- [ ] Branch protection: default branch 要求 PR + 必需检查 `verify` + Code Owner 评审
  - **为什么**：没有它，CI 只是"绿灯建议"，任何写权限者（或获 `editFiles` 的 agent）可不评审直接合并——
    审计判定"契约性而非技术权威"的根因，也是失分最大的一项。
  - **步骤**：GitHub 仓库 → Settings → Branches → Add branch ruleset，对默认分支勾选 *Require a pull request
    before merging* + *Require status checks to pass* → 选中 `verify`（`eos-ci.yml` 的 job）+ *Require review
    from Code Owners*。（详见附录 D.1）
  - **验证**：Settings → Branches 自查；或（可选，需 `gh` 登录）`gh api repos/:owner/:repo/branches/main/protection`
    返回 200 而非 404。**本地/离线无法验证服务端状态——这是提醒，不是门禁。**

- [ ] CODEOWNERS: 把 `.github/CODEOWNERS` 里的 `@niaodian` 全部换成你的团队 handle
  - **为什么**：配合上面的 "Require review from Code Owners"，阻止任何人（含 agent）**免评审改动治理文件**
    （instructions / agents / hooks / workflows / prompts 与 `docs/eos/`）。（审计 E1/H5）
  - **步骤**：编辑 `.github/CODEOWNERS`，`@niaodian` → 例如 `@your-org/platform-team`（推荐团队而非个人，
    避免单人休假阻塞评审）。（详见附录 D.2）
  - **验证**：`grep -n '@niaodian' .github/CODEOWNERS` 应无输出。

- [ ] 审批基线: `cp .vscode/settings.json.example .vscode/settings.json`
  - **为什么**：把安全的自动审批基线固定到本机——`chat.tools.global.autoApprove:false`（不开 /yolo）+
    终端危险命令 denylist（与 `deny-dangerous.js` 纵深防御）。
  - **步骤**：执行上面的 `cp`（活跃文件是 git-ignored，不会回流模板）。（详见附录 D.3）
  - **验证**：`.vscode/settings.json` 存在且 `chat.tools.global.autoApprove` 为 `false`。

- [ ] 项目事实: 填 `.github/instructions/00-workspace.instructions.md`（技术栈 / 目录结构 / 约定）
  - **为什么**：这是全局 always-on 上下文的锚点；填得准，Agent 的每一步输出都更稳、更少返工。
  - **步骤**：把占位内容替换为你项目的真实栈与布局。（见 §3.3）
  - **验证**：文件内不再含 `TODO` / `<替换` 一类占位符。

## 二、打开"组织合规"轴（约 +2 分）——仅**受监管**项目需要

- [ ] （若受监管）合规边界: 跑 `/compliance` 产出 `docs/compliance-profile.md`，并确认组织标准
  - **为什么**：profile-neutral 模板无法替你认证 HIPAA/PCI-DSS 等；一旦声明受监管 regime 且存在 LLM/agent，
    `eos-doctor` 的 **D5（BLOCKER，deny-by-default）** 会要求先记录数据边界（BAA/DPA · 自托管 · 脱敏 · 排除受监管数据）。
  - **须组织决策**（模板不代做，`【需组织标准】`）：批准的密钥库、CI runner 标准、模型 pin/注册策略、
    制品完整性（SBOM / 签名 / SLSA）。（详见附录 D.4）
  - **验证**：`docs/compliance-profile.md` 存在且首行 `**Regulatory regime:**` 已如实填写；`eos-doctor` 无 D5 ERROR。
  - **不受监管**？→ 用豁免语法记为：`- [~] 合规档案 · 原因：本项目不处理受监管数据（无 PHI/PAN）`。

---

## 三、拿不回的分数（结构性上限 · 记录在此以示诚实）

这些**不是**你能靠动作拿回的，它们是模板在 profile-neutral / local-first 前提下的固有上限，审计已如实披露：

- **hooks 是 Preview · 逐机器 · 解析失败放行 · CI 不调用**——本地护栏是"减速带"非权威；权威已正确重定位到
  CI 硬门 + 人工评审（见附录 D.4）。
- **denylist 是有限枚举黑名单**——真正的地板是 `autoApprove:false`（deny-by-default），denylist 仅纵深防御。
- **`bmad-*` 用户级未 pin**——跨机可复现性缺口，reuse-first 的固有成本（见附录 D.4）。

> 一句话：**第一、二节做完，你就拿回了模板允许你拿回的全部分数**；第三节的上限取决于 local-first 架构本身，
> 不因为哪个开发者"忘了做"而失分——它从设计上就被如实标注为"做不到"。
