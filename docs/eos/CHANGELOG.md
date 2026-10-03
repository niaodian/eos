# EOS changelog

> Newest release first. `eos upgrade` prints the entries between the version a project is on and the
> one it upgrades to, so each entry says what changes for a project. The upgrade steps for every
> release are in the user manual, Chapter 10; releases before `eos-2.0.0` are listed on
> [GitHub Releases](https://github.com/niaodian/eos/releases). How often EOS releases, and what a
> patch may contain: [CONTRIBUTING.md](../../CONTRIBUTING.md#release-cadence).

## eos-2.2.0 — 2026-10-03

- **Breaking — slash commands are Agent Skills** in `.agents/skills/eos-*` (ADR-017): `/spec` is now `/eos-spec`, `/requirements` is `/eos-requirements` and so on; `.github/prompts/` is removed. Claude Code gets a generated copy in `.claude/skills/` (`eos agents sync`).
- **The verified gate derives `test-run.json` from JUnit XML** its own run wrote (ADR-016): declare `"evidence": {"junit": [...]}` and drop your mapping step. `eos evidence junit` imports reports from another CI step.
- **Starter packs declare `commands.audit`** (and `evidence.junit` where the runner writes JUnit); `eos status` previews what the release gate G8 will need.
- **NFR summary example and helper** (`docs/eos/examples/nfr-summary`).
- **The eval-starter scores a real model**: any OpenAI-compatible endpoint, record / replay; a replayed run is unattested.

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
