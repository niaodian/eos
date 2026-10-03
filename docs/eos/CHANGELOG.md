# EOS changelog

> Newest release first. `eos upgrade` prints the entries between the version a project is on and the
> one it upgrades to, so each entry says what changes for a project. The upgrade steps for every
> release are in the user manual, Chapter 10; releases before `eos-2.0.0` are listed on
> [GitHub Releases](https://github.com/niaodian/eos/releases). How often EOS releases, and what a
> patch may contain: [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence).

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
