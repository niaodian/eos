# EOS changelog

> Newest release first. `eos upgrade` prints the entries between the version a project is on and the
> one it upgrades to, so each entry says what changes for a project. The upgrade steps for every
> release are in the user manual, Chapter 10; releases before `eos-2.0.0` are listed on
> [GitHub Releases](https://github.com/niaodian/eos/releases). How often EOS releases, and what a
> patch may contain: [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence).

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
