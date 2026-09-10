# ADR-003 — The BMAD runtime boundary

- Status: Accepted
- Date: 2026-09-10
- Supersedes: nothing
- Closes: EOS-AUD-002 (P0)

## Context

EOS delegates *authoring* work to BMAD skills: `bmad-brainstorming` for discovery, `bmad-prd` for
the PRD, `bmad-architecture` for the architecture, `bmad-create-story` for slicing, `bmad-tea` and
`bmad-testarch-*` for test design and traceability, `bmad-retrospective` for the loop back.
`.eos/agent-map.json` maps each EOS action to the skills that do it best.

The `eos-1.12.0` audit found that this delegation was not actually closed:

1. 73 `bmad-*` skills exist at user level (`~/.agents/skills`), so a directory-name check reports
   them as available.
2. Every mapped skill's **first activation step** is
   `python3 {project-root}/_bmad/scripts/resolve_customization.py …`, and several also call
   `uv run {project-root}/_bmad/scripts/memlog.py`. Those paths live in the **project**, not in the
   skill.
3. `eos-1.12.0` ships no `_bmad/`, and no documentation told anyone to create one.
4. `eos-doctor` therefore reported **PASS** for a repository in which every mapped skill would fail
   at step 1 — the "directory exists, doctor green, activation red" false green.
5. `bmad-create-prd` and `bmad-validate-prd` — both mapped — are upstream **DEPRECATED** shims that
   forward to `bmad-prd`.

## Decision

**Option 3: EOS states the BMAD project runtime as an explicit, machine-verified prerequisite; it
neither vendors it nor installs it.** Concretely:

1. `.eos/bmad.lock.json` is a versioned compatibility manifest: the EOS version it matches, the
   BMAD generation, the required and optional skills, the runtime scripts and configs those skills
   read, and the executables they invoke.
2. `eos-doctor` reads it. `--deep` additionally checks the project runtime and PATH, and reports
   **BLOCKED** — never PASS — when a mapped skill is installed but cannot activate here.
3. Deprecated skills are recorded in the manifest and **refused** in the agent map: mapping one is a
   doctor ERROR. `bmad-create-prd` / `bmad-validate-prd` are migrated to `bmad-prd`.
4. `eos init` never downloads or executes a remote installer. Offline, and by default, it prints the
   commands to run; it does not run them.

### Why not the alternatives

- **Vendor a minimal `_bmad/` inside EOS.** It would make EOS ship and version someone else's
  runtime, and a stale copy would break skill activation in a way that looks like an EOS bug. It
  would also mean shipping Python into a zero-dependency, Node-only tool.
- **Only map skills that are genuinely standalone.** Every skill EOS wants for authoring reads the
  customization resolver, so this reduces to "map nothing" — it throws away the reuse that is the
  point of the map.

## Consequences

- EOS is still **complete without BMAD**. No gate, evaluator, transition or routing decision calls a
  skill; `eos next` always names the action, the target gate and the done-when, so every step can be
  done by hand. A missing skill is a NOTE, not a blocker.
- A skill that is installed but cannot activate is a **BLOCKER**, because that is the state that
  previously produced a green doctor and a red session.
- Upgrading BMAD may require bumping `eosCompatibility` / `bmadGeneration` in the manifest. That is
  the intended cost: it is the file that makes the assumption reviewable instead of implicit.
- `--deep` is opt-in for speed. CI runs it (see `.github/workflows/eos-ci.yml`), so the honest
  answer is produced at least once per change.

## Verification

- `node .github/hooks/eos-doctor.mjs --deep` on a repository with the skills installed and no
  `_bmad/` reports BLOCKED and names the missing paths.
- `.github/eos/audit-regression.test.mjs` locks: directory-without-SKILL.md is BLOCKED, a deprecated
  mapping is an ERROR, and an absent skill set is a NOTE rather than a failure.
