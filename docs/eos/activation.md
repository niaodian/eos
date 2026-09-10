# EOS Post-instantiation Hardening · Activation Ledger

> **What this is**: after you instantiate a real repo from the template, a few "one-time" things
> **only your org/GitHub account can do** — the template can't do them for you (`【Needs org/GitHub setup】`).
> Once they're done, EOS's 3 CI hard gates change from **"contractually present"** to
> **"merge-blocking technical authority"** — which is exactly **the part you CAN win back** of the
> "9 points you can't get back" from the third-party audit.
>
> **How to use it**:
> - Want a guided, step-by-step run → run **`/eos-init`** in Copilot Chat (it changes what it can for you,
>   and prints the exact steps for what it can't).
> - Want the full rationale and steps → see **Appendix D** of `docs/eos/user-manual.md`.
> - This file is a **checkable progress ledger**: every run of `eos-doctor` reads it and advisory-reminds you
>   how many items remain; **`/release-gate` (G8)** re-checks it before you ship — **this is the defense against
>   "systematic forgetting".**
>
> **Checkbox syntax** (`eos-doctor` parses this — do not change the line-start format):
> - `- [ ]` not done (pending; will be reminded continuously)
> - `- [x]` done
> - `- [~]` intentionally waived — **you must add the reason on the same line**, e.g.:
>   `- [~] Branch protection · Reason: personal spike repo, one-off`
>
> **The template itself**: the items below are **deliberately left unchecked in the clean template** (honest
> self-report: the template genuinely isn't hardened yet, and cannot open server-side protection for itself).
> After you instantiate from it, check off or waive each item according to your real decisions.

---

## 1. Win back the "enforcement authority" axis (~+4 points) — every real repo should do this

- [ ] Branch protection: default branch requires a PR + the required check `verify` + Code Owner review
  - **Why**: without it, CI is only a "green-light suggestion" — anyone with write access (or an agent granted
    `editFiles`) can merge without review. This is the root cause the audit judged "contractual rather than
    technical authority", and the single biggest point loss.
  - **Steps**: GitHub repo → Settings → Branches → Add branch ruleset; for the default branch enable *Require a
    pull request before merging* + *Require status checks to pass* → select `verify` (the `eos-ci.yml` job) +
    *Require review from Code Owners*. (See Appendix D.1)
  - **Verify**: self-check in Settings → Branches; or (optional, needs `gh` login)
    `gh api repos/:owner/:repo/branches/main/protection` returns 200 rather than 404. **Local/offline cannot
    verify server-side state — this is a reminder, not a gate.**

- [ ] CODEOWNERS: replace every `@niaodian` in `.github/CODEOWNERS` with your team handle
  - **Why**: combined with "Require review from Code Owners" above, this stops anyone (including an agent) from
    **changing governance files without review** (instructions / agents / hooks / workflows / prompts and
    `docs/eos/`). (Audit E1/H5)
  - **Steps**: edit `.github/CODEOWNERS`, `@niaodian` → e.g. `@your-org/platform-team` (prefer a team over an
    individual, to avoid a single person's leave blocking review). (See Appendix D.2)
  - **Verify**: `grep -n '@niaodian' .github/CODEOWNERS` should print nothing.

- [ ] Approval baseline: `cp .vscode/settings.json.example .vscode/settings.json`
  - **Why**: pins the safe auto-approval baseline to this machine — `chat.tools.global.autoApprove:false`
    (no /yolo) + a terminal dangerous-command denylist (defense-in-depth with `deny-dangerous.js`).
  - **Steps**: run the `cp` above (the active file is git-ignored, so it won't flow back to the template).
    (See Appendix D.3)
  - **Verify**: `.vscode/settings.json` exists and `chat.tools.global.autoApprove` is `false`.

- [ ] Project facts: fill in `.github/instructions/00-workspace.instructions.md` (tech stack / directory layout / conventions)
  - **Why**: this is the anchor for global always-on context; fill it accurately and every step of the Agent's
    output is steadier, with less rework.
  - **Steps**: replace the placeholder content with your project's real stack and layout. (See §3.3)
  - **Verify**: the file no longer contains placeholders like `TODO` / `<replace`.

- [ ] Project declaration: change `.eos/project.json` from `config-only` to your real project (`projectType` / `stacks` / `commands.test`)
  - **Why**: this is the **only entry point of the product-quality gate**. CI will not guess how to test your
    repo — no declaration means fail closed. Historical defect: CI ran tests only when a `package.json` existed,
    so a Python/Go/Java/Rust/.NET project's **failing tests were never executed** and "EOS config green" was
    misread as "product tests green". An LLM/Agentic product must also add `"productParadigms": ["agentic"]`
    plus `commands.eval` — **that declaration, not SDK sniffing, is the authoritative G-EVAL switch**
    (a self-hosted or self-wrapped gateway leaves no fingerprint to detect).
  - **Steps**: copy your stack's block from `docs/eos/stack-presets.md` § `.eos/project.json`; for a non-Node
    stack remember to add the matching toolchain setup step in `.github/workflows/eos-ci.yml`.
  - **Verify**: `node .github/hooks/project-gate.mjs` is PASS **and actually ran** your lint/typecheck/test;
    `node .github/hooks/validate-config.mjs` shows no S12 ERROR. **Never edit the declaration to turn a red gate green.**

- [ ] (If you use BMAD skills) BMAD project runtime: run its own installer, or unmap the skills
  - **Why**: EOS delegates *authoring* to BMAD skills, but every mapped skill resolves its customization
    through a **project-local** `_bmad/` runtime (`resolve_customization.py`, `memlog.py`, and the
    `core`/`bmm`/`tea` `config.yaml`) that EOS deliberately does not ship or download. Before `eos-1.13.0`
    the doctor only checked that a directory named `bmad-<x>` existed, so it reported PASS for a repository
    in which every one of those skills would fail on its **first activation step** (audit EOS-AUD-002).
    **EOS itself does not need this**: no gate, evaluator, transition or routing decision calls a skill, and
    `eos next` names the action, the gate and the done-when either way. This item is only about whether the
    accelerators work.
  - **Steps**: install the BMAD project runtime with **its own** installer (EOS will not guess the command
    and will never pipe a remote script into a shell), or remove those skills from `.eos/agent-map.json` and
    do the authoring steps by hand. Design rationale: `docs/adr/003-bmad-runtime-boundary.md`.
  - **Verify**: `node .github/hooks/eos-doctor.mjs --deep` reports no `D6 BMAD (BLOCKED)` line.
    With no BMAD skills installed at all it passes and simply notes which actions are manual.

## 2. Open the "org-compliance" axis (~+2 points) — only **regulated** projects need this

- [ ] (If regulated) Compliance boundary: run `/compliance` to produce `docs/compliance-profile.md` **+ `docs/compliance-profile.json`**, and confirm org standards
  - **Why**: a profile-neutral template can't certify HIPAA/PCI-DSS etc. for you; once you declare a regulated
    regime AND an LLM/agent is present, `eos-doctor`'s **D5 (BLOCKER, deny-by-default)** requires you to first
    record the data boundary (BAA/DPA · self-host · redaction · excluding regulated data).
    **The boundary must be written as structured JSON**: D5 validates enumerated values + control status +
    owner + a non-expired approval, no longer prose keywords (a negation like "no redaction is implemented"
    used to READ AS "boundary recorded" and passed). Template: `docs/eos/examples/compliance-profile.example.json`.
  - **Requires org decisions** (the template won't make them, `【Needs org standard】`): approved secret store,
    CI runner standard, model pin/registry policy, artifact integrity (SBOM / signing / SLSA). (See Appendix D.4)
  - **Verify**: `docs/compliance-profile.md`'s first line `**Regulatory regime:**` is filled in truthfully;
    `docs/compliance-profile.json` validates (`thirdPartyModelPolicy` + an `implemented` control +
    `approval.reviewBy` not in the past); `eos-doctor` shows no D5 ERROR.
  - **Not regulated**? → record it with the waiver syntax:
    `- [~] Compliance profile · Reason: this project handles no regulated data (no PHI/PAN)`.

---

## 3. Points you can't get back (structural ceiling · recorded here for honesty)

These are **not** recoverable by any action you take; they are the template's inherent ceiling under a
profile-neutral / local-first premise, and the audit disclosed them faithfully:

- **Hooks are Preview · per-machine · fail-open on parse error · not invoked by CI** — local guardrails are a
  "speed bump", not authority; authority is correctly relocated to the CI hard gates + human review
  (see Appendix D.4).
- **The denylist is a finite enumerated blacklist** — the real floor is `autoApprove:false` (deny-by-default);
  the denylist is only defense-in-depth.
- **`bmad-*` user-level, not pinned** — a cross-machine reproducibility gap, the inherent cost of reuse-first
  (see Appendix D.4).

### Beginner version: are these things actually scary? (one-liner, in plain words)

First, the conclusion: **these aren't bugs — they're the inherent cost of the "pure-local + zero-dependency +
still-in-preview official features" premise, and each one has a harder safety net behind it.**

| What you see | Plain-words translation | Why it isn't scary |
|---|---|---|
| Hooks are Preview · fail-open on parse error | That "automatic speed bump" at the door is beta; on input it can't parse it **lifts the barrier and lets you through** rather than locking you out | It's only a speed bump, not a turnstile — what actually stops danger is items 1/3/4 of the "safety net" below |
| Denylist is finite / incomplete | The guard's "dangerous-command list" is inherently incomplete (`shred`, `git clean -fdx`, etc. aren't all listed) | The real floor is that **by default every command needs one click of your approval** (`autoApprove:false`); the list is just an extra automatic helper |
| quality runs in full every time | Every file edit auto-runs a check, a bit slow (already slimmed from "full test suite" to **just the fast checks `lint`+`typecheck`**) | It **only advises, never interrupts you** (always exit 0); the full test suite is run by the cloud CI authority, so correctness is unaffected |
| `bmad-*` not pinned | The bmad skills installed on your machine aren't version-locked; another computer may have different versions | Affects "cross-machine identical", not single-machine correct operation; a team can standardize the version in `docs/` |

**The real "safety net" that stops danger (this is what you should remember):**

1. **Default human approval** (`chat.tools.global.autoApprove:false`) — dangerous operations pop up and ask you once before executing.
2. **CI's 3 hard gates** (`validate-config` / `eos-doctor` / `secret-scan`) — run enforced in the cloud after you push to GitHub; can't be bypassed locally.
3. **Branch protection** (the one `/eos-init` helps you open in section 1) — turns the CI gates from "green-light suggestion" into "no merge unless it passes".
4. **Human code review** (CODEOWNERS) — changes to governance files must be signed off by a person.

> Remember just this: **the local items here are "speed bumps"; the four cloud ones are the "turnstiles".** EOS
> doesn't pretend the speed bump is a turnstile — writing down "what it can't do" honestly is exactly its design
> integrity (and why the audit gave full marks on the honesty/disclosure layer).

> In one line: **finish sections 1 and 2 and you've won back every point the template lets you win back**; the
> ceiling in section 3 depends on the local-first architecture itself, and isn't lost because some developer
> "forgot to do it" — it's honestly labeled "can't do" by design.
