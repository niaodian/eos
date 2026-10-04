---
name: eos-init
description: One-time hardening after copying the template — make the CI gates merge-blocking (branch protection, CODEOWNERS, approval baseline) and stamp docs/eos/activation.md. Use right after the project is declared, or when eos next asks for activation.
---
# EOS Guided Activation — `/eos-init`

You are hardening a **freshly instantiated** EOS repository so its 3 CI hard gates stop being merely
*contractual* and become *merge-blocking authority*. This is the one-time step that reclaims the audit's
"downstream" points. **Be honest: you can do the local edits, but server-side branch protection can only
be done by the human in GitHub's UI — for those, print the exact steps, do not pretend to enforce them.**

Work through `docs/eos/activation.md` top to bottom. For each item: do what is locally doable, then update
the ledger line (`- [ ]` → `- [x]` done, or `- [~] … · Reason: <reason>` if the developer waives it). Never
mark an item `[x]` unless it is actually done or verified.

## Before you start: who has to be there

Say this first, so a one-person project does not find out at the release. Some steps need a person other
than the one working with you; EOS records approvals and never grants them, and **you never run an
approval, and never pass `--self`, yourself** — print the command and let the person type it.

| Step | Needs a second person | One maintainer alone |
|---|---|---|
| Branch protection and Code Owners review (steps 5–6) | someone who can merge a pull request the author cannot | not available on a private Free repository — waive it with a reason (step 5) |
| The first declaration's policy REVIEW (`eos policy check` asks for an `approver`) | the approver fills in `.eos/policy.lock.json` | declare `eos init <pack> --solo --write`: the approver may then be written `<name> (self)`, recorded as a self-approval |
| `eos approve` at `VERIFIED → APPROVED` | someone who did not prepare the candidate | `eos approve --self --reason "<why>"`, **typed by the person**, only with `approvalMode: "solo"` (Standard track) |
| Confirming the one-way decision ADRs | the person who owns the decision | the same person: set `Status: accepted`, `Confirmed by`, `Confirmed at` |
| Waivers | an approver other than the requester | `<name> (self)` as the approver, solo projects only |

`solo` is the Standard track's exit and nothing else: it is refused with the regulated or controlled
profiles, switching to it is itself a weakening that needs an independent approver, and every self-approval
shows as "self" in `status`, `next` and the release record. Ask which of the two this project is.

## Replace these template files with your own

`eos init <pack> --write` replaces the declaration; these files still describe EOS until you replace them.
Print this list, then do each one with the user:

- `README.md` **and** `README.zh.md` — replace both together (the doc-parity check compares the pair; the
  Chinese project README is `README.zh.md` at the root, not `docs/zh/README.md`, which belongs to EOS's manual).
- `package.json` — name, version, description, `engines`; a project that is not a Node project may delete it.
- `docs/adr/` — the numbering continues EOS's own ADRs (the template ships ADR-003 … ADR-023): start your
  own series, and keep or delete EOS's records on purpose.
- `.github/CODEOWNERS` — the default owner is the template's author (step 2).
- `.nvmrc` — the Node major CI and the people working on the project share (24 at the time of writing).
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` — yours, not EOS's.

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

   **An existing system is different.** If this repository already holds a product that runs, do not
   walk them through discovery and architecture they already have: adopt it at the delivery gates with
   `node .github/eos/eos.mjs init <pack> --brownfield --write` (Standard track). `eos next` then asks
   for the as-is documentation (`bmad-document-project` → `docs/index.md`), and every change after
   that is a story held to G5, G7 and G8 (manual §3.5).

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
   - **How to tell whether protection actually holds on a private repository (do not trust the UI).**
     A ruleset can be saved, show "Active", and still enforce nothing. The proof is behavioural: open a
     throwaway pull request that makes `verify` fail, and look at the merge button — if it is enabled, or
     the required check is not listed as *required*, the protection is not in force. Delete the throwaway
     branch afterwards. Ask the user to do it; report what they see, never infer it.
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
   - If **yes**: run `/eos-compliance` to produce `docs/compliance-profile.md`, confirm the data-boundary
     decision is recorded, and flag the `【Needs org standard】` items (approved secret store, runner, model
     registry, artifact integrity). Check the ledger line only once `eos-doctor` shows no D5 ERROR.
   - If **no**: waive it — set the ledger line to `- [~] Compliance profile · Reason: this project handles no regulated data (no PHI/PAN)`.

8. **Confirm & report.** Run `node .github/hooks/eos-doctor.mjs` and show the user the `ACTIVATION` line
   (it reflects the ledger you just updated). Summarize: what is now `[x]`, what is `[~]` waived (with
   reasons), and what remains `[ ]` pending (and why the human still needs to do it). Remind them
   `/eos-release-gate` (G8) re-checks this before shipping.

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
> `/eos-requirements` directly if the problem is already framed). The activation ledger stays in the repo;
> revisit it via `/eos-init` any time an item changes.
