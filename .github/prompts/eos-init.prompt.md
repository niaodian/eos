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
the ledger line (`- [ ]` → `- [x]` done, or `- [~] … · Reason: <reason>` if the developer waives it). Never
mark an item `[x]` unless it is actually done or verified.

## Steps

0. **GitHub remote + `gh` (do this first — everything server-side depends on it).**
   `/eos-init` hardens a *local* repo; it does not create a GitHub repository for you, and it
   cannot. Check what already exists before instructing anything:

   ```sh
   git remote -v
   gh auth status
   ```

   - No `gh`, or not logged in → `gh auth login` (choose GitHub.com → HTTPS → login with a browser).
     A first-time user will not know this; say it, don't assume it.
   - No `origin` → create the remote and push. `gh` can do both in one step, so prefer it over the
     web UI click-path:

     ```sh
     gh repo create <name> --private --source=. --remote=origin --push
     ```

     If they'd rather use the web UI: create an **empty** repo (no README, no .gitignore), then
     `git remote add origin <url> && git branch -M main && git push -u origin main`.
   - Record the resolved `owner/repo`; steps 5 and 7 need it.

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
   `TODO` / `<replace...>` placeholders remain.

   **Say plainly what is *not* being decided here.** `.eos/project.json` staying `config-only` is
   **not** a blocker on Day 1 and not a thing they are behind on. The stack is an irreversible
   decision that EOS deliberately defers to **Phase 4 (Architecture)**, where it is locked in
   `docs/adr/00X-tech-stack.md`. It only becomes failing when real stack manifests
   (`package.json`, `pyproject.toml`, `go.mod`, …) exist while the declaration still says
   `config-only` — because then the quality gate would be passing vacuously. Do not ask a user who
   has not designed the architecture yet to "just tell me the tech stack".

5. **Branch protection (SERVER-SIDE — you cannot do this for them).**

   First find out whether protection is even enforceable, because on GitHub Free **rulesets are not
   enforced on private repositories** — the UI accepts the ruleset and then ignores it:

   ```sh
   gh repo view --json nameWithOwner,visibility,isPrivate
   ```

   - **Private repo on a Free plan** → tell them the truth up front: the ruleset will save but never
     enforce ("won't be enforced … until you upgrade"), and **Require review from Code Owners** is
     not offered at all. Their real options are (a) make the repo public, (b) upgrade to
     Pro/Team, or (c) waive the item honestly:
     `- [~] Branch protection · Reason: private repo on a Free plan — rulesets are not enforced`.
     Do not walk them through a click-path that cannot work.
   - **Otherwise** print the click-path: repo → **Settings → Rules → Rulesets → New branch ruleset**
     → target the default branch →
     - **Enforcement status: `Active`** ← state this first and emphasise it. A new ruleset defaults
       to **Disabled**; every other box ticked on a Disabled ruleset enforces exactly nothing, and
       the user will believe they are protected.
     - *Require a pull request before merging*
     - *Require status checks to pass* → select **`verify`** (the job in `eos-ci.yml`)
     - *Require review from Code Owners* (public repo, or Pro/Team private)

6. **Verify it yourself — do not hand back homework.** Once they say it is enabled, check it. The
   ruleset API is the one that matters; the legacy endpoint returns 404 for a ruleset and would make
   you report a false negative:

   ```sh
   gh api repos/<owner>/<repo>/rules/branches/main
   ```

   - A non-empty array → **Active** rules apply. Confirm `pull_request` and `required_status_checks`
     with `verify` are among them, then check the ledger line.
   - `[]` (empty array) → nothing is enforced. Most often the ruleset exists but is still
     **Disabled** — send them back to the enforcement dropdown rather than the whole click-path.
   - Also accept classic protection if that is what they used:
     `gh api repos/<owner>/<repo>/branches/main/protection` returning 200.
   - `gh` missing or offline → leave the line `- [ ]` and say the check was not run. Never infer.

   Then re-run the ledger check for them (this is the command they would otherwise have to guess):

   ```sh
   node .github/hooks/eos-doctor.mjs
   ```

7. **Compliance (only if regulated).** Ask whether this project handles regulated data (PHI / PAN / etc.).
   - If **yes**: run `/compliance` to produce `docs/compliance-profile.md`, confirm the data-boundary
     decision is recorded, and flag the `【Needs org standard】` items (approved secret store, runner, model
     registry, artifact integrity). Check the ledger line only once `eos-doctor` shows no D5 ERROR.
   - If **no**: waive it — set the ledger line to `- [~] Compliance profile · Reason: this project handles no regulated data (no PHI/PAN)`.

8. **Confirm & report.** Run `node .github/hooks/eos-doctor.mjs` and show the user the `ACTIVATION` line
   (it reflects the ledger you just updated). Summarize: what is now `[x]`, what is `[~]` waived (with
   reasons), and what remains `[ ]` pending (and why the human still needs to do it). Remind them
   `/release-gate` (G8) re-checks this before shipping.

9. **Announce the next stage — do not wait to be asked.** Run `node .github/eos/eos.mjs next` and
   tell them the stage, the agent to switch to, and what it needs from them. Offer the handoff
   button. Activation is finished; the lifecycle starts at Discovery.

   ```sh
   node .github/eos/eos.mjs next
   ```

## Language

Before anything else, ask which language they want EOS to answer in, and record it as
`"language": "<BCP-47>"` in `.eos/project.json` (e.g. `"zh-CN"`). Then use it. Code, commands,
identifiers and `.eos/**` records stay English.

> **Next:** with authority hardened, begin the lifecycle — switch to the **eos-discovery** agent (or run
> `/requirements` directly if the problem is already framed). The activation ledger stays in the repo;
> revisit it via `/eos-init` any time an item changes.
