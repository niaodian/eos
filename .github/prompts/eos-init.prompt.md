---
name: eos-init
description: One-time post-instantiation hardening — make the CI gates merge-blocking (branch protection + CODEOWNERS + approval baseline) and stamp docs/eos/activation.md
agent: agent
tools: ['search', 'editFiles', 'runCommands']
---
# EOS Guided Activation — `/eos-init`

You are hardening a **freshly instantiated** EOS repository so its 3 CI hard gates stop being merely
*contractual* and become *merge-blocking authority*. This is the one-time step that reclaims the audit's
"downstream" points. **Be honest: you can do the local edits, but server-side branch protection can only
be done by the human in GitHub's UI — for those, print the exact steps, do not pretend to enforce them.**

Work through `docs/eos/activation.md` top to bottom. For each item: do what is locally doable, then update
the ledger line (`- [ ]` → `- [x]` done, or `- [~] … · 原因：<reason>` if the developer waives it). Never
mark an item `[x]` unless it is actually done or verified.

## Steps

1. **Read the ledger.** Open `docs/eos/activation.md`. If it is missing, tell the user to re-pull the
   template (it ships with one). Summarize the pending items so the user sees the whole one-time list first.

2. **CODEOWNERS handle.** Ask the user for their team handle (e.g. `@your-org/platform-team`; a team is
   preferred over a person). Replace **every** `@niaodian` in `.github/CODEOWNERS`. Verify with
   `grep -n '@niaodian' .github/CODEOWNERS` → expect no output. Then check the ledger's CODEOWNERS line.

3. **Approval baseline.** If `.vscode/settings.json` does not exist, run
   `cp .vscode/settings.json.example .vscode/settings.json`. Confirm `chat.tools.global.autoApprove` is
   `false`. Check the ledger's baseline line. (The active file is git-ignored by design.)

4. **Project facts.** Open `.github/instructions/00-workspace.instructions.md`. Help the user replace the
   placeholders with the real stack / directory layout / conventions. Check the ledger line once no
   `TODO` / `<替换…>` placeholders remain.

5. **Branch protection (SERVER-SIDE — you cannot do this for them).** Print the exact click-path from
   `docs/eos/user-manual.md` 附录 D.1: GitHub repo → Settings → Branches → Add branch ruleset on the
   default branch → *Require a pull request before merging* + *Require status checks to pass* → select the
   `verify` job + *Require review from Code Owners*. Then offer an **opt-in** verification: only if the user
   confirms `gh` is installed and authenticated, run
   `gh api repos/:owner/:repo/branches/main/protection` and interpret 200 (protected) vs 404 (not yet).
   Ask the user to confirm they enabled it before you check the ledger's branch-protection line. If they
   defer, leave it `- [ ]` (honest) — do **not** auto-check it.

6. **Compliance (only if regulated).** Ask whether this project handles regulated data (PHI / PAN / etc.).
   - If **yes**: run `/compliance` to produce `docs/compliance-profile.md`, confirm the data-boundary
     decision is recorded, and flag the `【需组织标准】` items (approved secret store, runner, model
     registry, artifact integrity). Check the ledger line only once `eos-doctor` shows no D5 ERROR.
   - If **no**: waive it — set the ledger line to `- [~] 合规档案 · 原因：本项目不处理受监管数据（无 PHI/PAN）`.

7. **Confirm & report.** Run `node .github/hooks/eos-doctor.mjs` and show the user the `ACTIVATION` line
   (it reflects the ledger you just updated). Summarize: what is now `[x]`, what is `[~]` waived (with
   reasons), and what remains `[ ]` pending (and why the human still needs to do it). Remind them
   `/release-gate` (G8) re-checks this before shipping.

> **Next:** with authority hardened, begin the lifecycle — `/discovery` (or `/requirements` if the problem
> is already framed). The activation ledger stays in the repo; revisit it via `/eos-init` any time an item
> changes.
