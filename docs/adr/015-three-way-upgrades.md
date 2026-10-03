# ADR-015 — Upgrades are a three-way comparison against the template a project started from

- Status: Accepted
- Date: 2026-10-03
- Depends on: ADR-005 (external-authority boundary: EOS Core never reaches the network)
- Governs: `eos upgrade`, `.github/eos/lib/upgrade.mjs`, the project-owned path rules, the numbering of a project's own ADRs

## Context

A project is a copy of the template (degit). From then on it diverges two ways at once: EOS ships new
versions of its own files, and the project edits some of them (a workflow, an instruction file) and
owns others outright (its declaration, evidence, ledger, waivers, stories). Up to 2.0 the only upgrade
path was "diff `.github/` against the new template and merge by hand", across 18 versions — five of
them in one day. The eos-2.0.0 audit evaluation ranked this the largest recurring cost after evidence
production.

Options considered:

1. **A hashed manifest of framework files, committed and checked in CI.** Detects local edits, but every
   change to a framework file must regenerate it, and it cannot help a project upgrading from a version
   that shipped without one.
2. **Path rules only** ("`.github/eos/**` is EOS's"). Simple, but cannot tell an untouched file from an
   edited one, so it either overwrites edits or asks about every file.
3. **A three-way comparison against the template the project started from.** The base is just another
   copy of the template, fetched by the developer — so it works from any version, needs no committed
   artifact, and tells "only EOS changed it" from "only you changed it" from "both did".
4. **Fetch the new version from GitHub inside `eos upgrade`.** Convenient, but it would put a network
   call into EOS Core, which `offline-boundary.test.mjs` forbids for everything but `policy sync`.

## Decision

**Option 3, offline.** `eos upgrade --from <new template> --base <template you started from> [--write]`:

- Both directories are fetched by the developer — degit of a release tag, or the attested release
  tarball. EOS Core downloads nothing. The base must carry the version the project says it is
  (`docs/eos/VERSION`); otherwise the command refuses, because a wrong base makes EOS's changes and
  yours look alike.
- Per file: `current` (identical), `update`/`add` (only EOS changed it), `remove` (EOS deleted it, you
  never touched it), `kept` (only you changed it), `conflict` (both changed it). A conflict never
  overwrites the project's file: the new version is parked under `.eos/local/upgrade/<version>/`
  (gitignored) for a hand merge, and the command exits BLOCKED.
- A dry run by default; `--write` applies. Run the NEW version's CLI — an older EOS lacks the command.
- Project-owned paths are never read or written, whatever either template contains: the declaration,
  the policy lock, evidence, ledger, waivers, handoffs, local files, releases, keys, stories and epics,
  `src/` `api/` `ops/`, the README, LICENSE and community files, `package.json`, `CODEOWNERS`.
- EOS's own ADRs stay in `docs/adr/` and upgrade like any template file. **A project numbers its own
  ADRs from 100**, so the two series never collide; moving EOS's ADRs elsewhere would break every link
  into them for no gain the three-way comparison does not already give.

## Consequences

- The first upgrade with this command is from 2.0.x to 2.1.0, run with the 2.1.0 CLI.
- After an upgrade, `eos policy lock` shows what the new version changed in the policy, and recorded
  evidence of gates whose version moved reads STALE until re-run — both by design.
- A file the project edited AND EOS changed still needs a person; the command only makes sure such
  files are the only ones that do.
