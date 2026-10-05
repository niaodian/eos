# EOS changelog

> Newest release first. `eos upgrade` prints the entries between the version a project is on and the
> one it upgrades to, so each entry says what changes for a project. The upgrade steps for every
> release are in the user manual, Chapter 10; releases before `eos-2.0.0` are listed on
> [GitHub Releases](https://github.com/niaodian/eos/releases). How often EOS releases, and what a
> patch may contain: [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence).

## eos-2.7.0 — 2026-10-06

- **The trust boundary is now written down** (ADR-024): EOS is a delivery discipline and an evidence record, not a security boundary against an actor who can write the repository. README and the quickstart's Known limitations say so, name what does stop a bypass (platform controls), label approver and `approver` fields as self-asserted, and state that the Regulated track cannot prove separation of duties until the trust roots move outside the repository. `eos approve` now prints that the recorded name is self-asserted
- **Ledger events hash every field — move everyone to 2.7.0 together:** new events carry `hv: 2` and the hash covers the whole event, so `assurance`, `deferred` and `deferredDigest` can no longer be edited without breaking the chain; replay (`reconcileEvents`) used to drop those fields and now keeps them. Existing ledgers verify unchanged, and a chain may not step back from `hv: 2` to the old scheme. A ledger written by this engine does not verify under an engine that predates `hv`
- **A transition for something that does not exist is refused**: `eos transition` on a story that is not in the product, or a release with no manifest, now fails instead of recording an event for a ghost scope
- **`verify --full` no longer fails a story against its own run**: the verify loop re-reads state after each recorded run, so a story in `READY_FOR_TEST` is not reported `ERROR` because it was judged against the ledger as it stood before
- **EOS's own coverage floor is re-based:** the exclude globs `**/*.test.mjs` did not match files under `.github/`, so test files counted as covered code. With them excluded the measured figure is lines 96.67 / branches 75.50 / functions 94.44, and `.eos/test-budget.json` now sets 96 / 75 / 94. This corrects the measurement; the tests did not get weaker
- **EOS is sealed as a reference implementation.** Only security fixes, defects in what already ships, and a single change the maintainer asks for will follow. Not fixed, and not scheduled: the remaining findings of the independent audit of eos-2.6.0 (for example, the README's Node badge still lists 20)

## eos-2.6.0 — 2026-10-04

- **Breaking — Node 20 is removed.** `engines` is now `>=22.10.0`; the template ships `.nvmrc` (`24`) and every `setup-node` step in `eos-ci.yml` and `eos-release.yml` reads it, EOS's matrix runs Node 22 and 24, and Linux jobs are pinned to `ubuntu-24.04`. Node 26 passed locally (26.10) and joins CI after it becomes an LTS on 2026-10-28.
- **Breaking — a deferred NFR needs a `dueBy` to be promoted** (ADR-023): `release-ready` stays `DEFERRED` (never PASS), and on the Standard track a release whose only deferrals are NFR targets with an owner, a trigger and a `dueBy` in the future can leave `CANDIDATE`. A `dueBy` that has passed makes `nfr-evidence` FAIL. `eos approve` prints the whole deferred list and binds the approval to it; `status` and `next` keep listing it after `RELEASED`. A deferred dependency audit still blocks, and Regulated or Controlled releases are never promoted with a deferral.
- **Breaking — `release-ready` has a new check, `one-way-doors-confirmed`:** every architecture decision that cites an ADR needs that ADR at `Status: accepted` with `Confirmed by` and `Confirmed at`. G4 still passes with a `proposed` ADR and says so; the unattended close-out is "decide provisionally, list it for a person to confirm". G4 now also compares the workspace rule with the declared stack: a DECIDED stack with no `stacks` in `.eos/project.json`, or `Local commands` that differ from `stack sync`, fails.
- **Breaking — gate versions change** (`architecture-ready`, `story-ready`, `verified`, `release-ready`): recorded PASS evidence for them reads STALE once. Run `eos policy lock --write` (nothing weakens, so no approver) and `eos verify --full`.
- **A solo path for one maintainer** (ADR-023): `.eos/project.json` accepts `approvalMode: "solo"` (Standard track only; `eos init <pack> --solo`). Then `eos approve --self --reason`, `eos policy lock --self` and a waiver approver written `<name> (self)` are accepted, recorded as `assurance: "self"` and shown as self-approvals. Switching to `solo` is a WEAKENING that needs an independent approver, and an agent never runs `--self`: the guardrail refuses it. CI accepts `(self)` approvers there, and a failing policy check no longer skips the product quality gate — the two are reported apart.
- **The guardrail judges what a command executes**, not the text it carries: heredoc bodies, quoted arguments of `git commit` or `echo`, comments and files that are not shell scripts are data; a credential rule needs one high-entropy token; `curl … | node -e` and `kill $PID` are allowed; a refusal names the rule, the matched text and a fix. The Antigravity hook finds the repository root, so it runs from `.agents/`.
- **`eos next` says what applies**: not activated yet, awaiting a person (a `proposed` ADR), start measuring now (an NFR stated at a scale), freeze first, and what comes after the release (G9, G10). A stale `product` focus no longer pins `next`; `verify` evaluates only the stages the baseline has reached; the "does not exist" report for `docs/stories/` looks first.
- **Doctor, evidence and init**: D5 reads regimes from structured records (prose naming a regime is a warning); a trace-matrix test name is read to the end of its cell; a failing test run names the first failing test and "no toolchain" is reported apart; a Chinese runbook passes for `language: zh`; `operability` is an NFR category; `productTree.exclude` keeps a record such as `docs/pilot-log.md` out of the product tree (adding one is a policy REVIEW); a deleted `.eos/project.json` is a WEAKENING; `eos stage init story` and a design record that also writes `docs/EXPERIENCE.md`; `init` keeps the `language`, platforms and exclusions you chose and lists the stories that need an `Eval case` column when you declare `agentic`; `check-doc-parity` names both files.
- **Examples and rules**: the eval-starter cassette field is `requestSha256` (`key` is still read — gitleaks mistook every hash for a credential), it documents recording through a relay (`usageComparable: false`) and refuses a 200 that is not a chat-completions document; the frontend rule is framework-neutral with a Next.js-only section; `/eos-init` lists who must be present, the template files to replace and how to tell whether branch protection really holds.
- **Docs**: the manual's Chapter 10.13 (upgrade), Appendix E (a platform smoke checklist you run by hand), the approval-assurance section in the workflow contract, and `act` now takes `-W .github/workflows/eos-ci.yml`.
- **Known limitations**: symlinks in the product-tree fingerprint (P3-2), Node 26 not in the CI matrix, and `solo` and `DEFERRED` are low-assurance by design (ADR-023). EOS development is paused after this release; only security fixes, a single item you ask for, or a platform or runtime change that breaks CI will follow.

## eos-2.5.0 — 2026-10-04

- **Your CI runs your project, not EOS's test suite** (ADR-021): once `.eos/project.json` is your own declaration, `eos-ci.yml` skips EOS's five test layers, its coverage job and its Linux/macOS/Windows matrix — no Windows or macOS runner starts. The governance checks and your declared commands run as before; EOS's suites still run in EOS itself and in a copy that has not run `eos init`. Require only `verify` in branch protection.
- **Your first declaration starts your own policy lock and SBOM** (ADR-022): on a template copy, `eos init <pack> --write` records this project's policy in `.eos/policy.lock.json` (nothing acknowledged) and regenerates `.eos/sbom.json`, so the first push and the first pull request pass `policy check`, `sbom --check` and the doctors — scaffold committed first or not. A declared project keeps its lock: re-declaring is a policy change, a weakening still needs a second person, and marking a declaration as the template's own again is itself a weakening.
- **When your CI runs changes**: a push builds only `main`, `master` and tags, and a pull request is built once per commit — a new commit cancels its older run. A branch without a pull request is no longer built when you push it: open a pull request, or add the branch to `on.push.branches`. A weekly scheduled run starts one short `plan` job in your repository; delete the `schedule:` block if you do not want it.
- **EOS's own CI is cheaper**: a pull request runs EOS's matrix once per platform on Node 24, a documentation-only pull request skips it, and merges, tags, the weekly run and manual runs take the full matrix (Windows and macOS on Node 20, 22 and 24, Linux on 24, plus `verify` on 20 and `coverage` on 22).
- **`eos init` keeps the SBOM current** whenever a declaration changes the stacks it describes — including when code lands in a `config-only` project — and a failing `sbom --check` names `eos sbom --write`.

## eos-2.4.0 — 2026-10-04

- **Node 24 is tested on every platform**: CI runs Node 20, 22 and 24 on Linux, macOS and Windows. Node 20 reached end of life on 2026-04-30 and stays only as the declared minimum (`engines` is unchanged): use 22 or 24.
- **Node 24's JUnit report places each test by its file**: node:test records the file from Node 24.11, so a trace-matrix row is matched by file (`"match": "file"`, `"name"` on Node 20 and 22), and EOS makes the path repository-relative — the evidence never records where the repository was checked out. Verify on one Node major across machines and CI.
- **BMAD installed for Antigravity counts**: `eos next` and `eos-doctor --deep` also look in `~/.gemini/config/skills`, `~/.gemini/antigravity-cli/skills` and the IDE's legacy `~/.gemini/antigravity/skills`.
- **`eos next --exit-zero`, `eos resume --exit-zero`**: exit 0 while blocked — for a prompt, a hook or an `&&` chain; 3 still means EOS cannot evaluate, and the JSON keeps the verdict.
- **The orchestrator agents read the same in Antigravity and Codex**: they say how to reach the next agent in each tool instead of pointing at Copilot's handoff button.
- **Fix: the runbook is `ops/runbook.md`**, the file the release gate reads. The `eos-runbook` skill and the docs named `ops/runbook-<service>.md`, which G8 never read; merge such a file into `ops/runbook.md`, one section per service.
- **One evaluator module per gate** (`.github/eos/lib/evaluators/`), collected by a registry: no verdict, gate version or recorded evidence changes.
- `src/`, `api/` and `ops/` say what belongs in them; EOS's own coverage thresholds rise to 97 / 79 / 96.

## eos-2.3.0 — 2026-10-03

- **Every agent platform is generated from one source** (ADR-019): `eos agents sync` writes the EOS MCP entry, the guardrail hook in each platform's own dialect and, where they do not collide, the orchestrator agents. Copilot, Claude Code and Antigravity get theirs by default — `.mcp.json`, `.claude/settings.json` and `.agents/…` are new in the template; Codex, Cursor, Gemini CLI and five Tier-2 platforms on demand: `eos agents sync --platform <name> --write`. Shared files keep everything that is not EOS's, and `eos upgrade` regenerates these files instead of comparing them.
- **The user manual covers Claude Code, Codex and Antigravity**: a new Chapter 6.6 walks through the one-time setup and the daily workflow in each, and how every step `eos next` names translates there.
- **`eos mcp`** (ADR-018): EOS's read and verify commands as MCP tools — `eos_next`, `eos_check`, `eos_verify` and more. Approving, waiving and state changes stay CLI commands a person runs.
- **Brownfield adoption** (ADR-020): `eos init <pack> --brownfield` puts an existing system on the `delivery-only` profile: it is documented as it is, and every change is a story held to G5, G7 and G8.
- **`eos stage init <stage>`** writes a stage record's skeleton from its schema; every gate rejects it until each `TODO(eos)` is answered. Sample records are in `docs/eos/examples/stage-records`.
- **`eos upgrade` prints this changelog** for the versions it crosses; CONTRIBUTING.md states the release cadence.
- **CI requires gitleaks**, pinned and checksum-verified (`EOS_REQUIRE_GITLEAKS=1`); locally it stays optional.
- **Fix:** the guardrail no longer blocks a download that sits next to an unrelated pipe (`curl … -o f && sha256sum f | …`).

## eos-2.2.0 — 2026-10-03

- **Breaking — slash commands are Agent Skills** in `.agents/skills/eos-*` (ADR-017): `/spec` is now `/eos-spec`, `/requirements` is `/eos-requirements` and so on; `.github/prompts/` is removed. Claude Code gets a generated copy in `.claude/skills/` (`eos agents sync`).
- **The verified gate derives `test-run.json` from JUnit XML** its own run wrote (ADR-016): declare `"evidence": {"junit": [...]}` and drop your mapping step. `eos evidence junit` imports reports from another CI step.
- **Starter packs declare `commands.audit`** (and `evidence.junit` where the runner writes JUnit); `eos status` previews what the release gate G8 will need.
- **NFR summary example and helper** (`docs/eos/examples/nfr-summary`).
- **The eval-starter scores a real model**: any OpenAI-compatible endpoint, record / replay; a replayed run is unattested.
- **Fixed before release:** a test matched by name only must be declared in the file the trace matrix names, and in no other test file; a re-run that reproduces the recorded test results keeps `test-run.json`, so other stories stay verified; the release gate scores trace rows from `test-run.json`; `eos agents sync` never writes through a symbolic link; the eval-starter records project-relative paths on Windows.

## eos-2.1.0 — 2026-10-03

- **`eos upgrade`** (ADR-015): a three-way comparison per file that never overwrites your edits.
- **The eval-starter writes `eval-summary.json`**, the summary G-EVAL reads; a stdlib-only Python twin.
- **The approval baseline is default-on**: `eos init --write` creates `.vscode/settings.json`; `eos-doctor` D8 checks its values.
- **Docs**: what you need for what, the known limitations, ADR-014 (the trust chain).

## eos-2.0.1 — 2026-10-02

- **Security patch for the two secret guards**: `secret-scan` no longer skips lines that mention an environment variable, and the PreToolUse hook reads each field of a tool call as itself. More credential forms and key formats are caught.

## eos-2.0.0 — 2026-10-01

- **Two governance tracks**, Standard and Regulated: `eos init <pack> --track standard|regulated --write`.
- **Signed release manifests** and **attested releases in CI** (ADR-012); `release-ready` checks signatures and artifact digests.
- **Central policy distribution** enforced offline: `eos policy export` / `eos policy sync` (ADR-013).
- **Governance reports**: `eos report` for one repository or an organisation.
