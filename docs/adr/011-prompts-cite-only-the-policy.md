# ADR-011 — Prompts may cite only what the policy defines; projections are generated in both languages

- Status: Accepted
- Date: 2026-10-01
- Depends on: ADR-007 (generated docs), ADR-010 (one diagnostic contract)
- Governs: `validate-config` S13 (`enforces`) and S15, `.github/eos/lib/alignment.mjs`, the `enforces` property of a gate, `docs/{eos,zh}/generated/actions.md`

## Context

The audit's #10 asked for one authority. Part of that was already true. `eos docs` generates the
gate reference, the workflow and the evidence graph from the policy and fails CI when they drift
(1.18.0). S13 checks that the workflow, the gates and the agent map reference each other correctly.

Two gaps remained.

1. **Hand-written prompts were unchecked.** Prompts, agents and instructions tell agents what to
   run (`eos check --gate story-ready`, `--to READY_FOR_DEV`, "hand off to `eos-plan`",
   `/release-gate`, "G6"). Renaming a gate, a state or a prompt left every file that cited the old
   name sending agents to nothing, with every check green. A rename test proved it: a gate renamed
   in `.eos/gates.json` passed validation while `eos-plan.agent.md` still cited the old id on two lines.
2. **The agent map had no generated projection.** `docs/eos/agent-map.md` called itself "the
   human-readable projection" of `.eos/agent-map.json`, but it is a hand-curated table by phase that
   does not list the 27 actions the router uses.

The first measurement found that `G6` and `G-EVAL`, cited in prompts and instructions, are not gate
codes in `.eos/gates.json`. They are documented gates that run inside `verified` (lint, typecheck
and tests through `tests-executed`; evals through `eval-threshold`). A checker that allowed them by
an internal list would be a second authority.

## Decision

**Every name a prompt cites is checked against the machine-readable policy, and the policy
declares every name the method uses.**

- A gate may declare `enforces: [{code, title, checks}]`: codes the method names that have no gate
  of their own because this gate's checks enforce them. `verified` declares G6 and G-EVAL. S13
  requires each listed check to exist on that gate, and the code to collide with no gate's code
  and no other gate's claim. `enforces` is documentation, so it is not part of the policy lock.
  The generated gate reference shows it.
- `validate-config` S15 scans `.github/{prompts,agents,instructions,skills}`,
  `.github/copilot-instructions.md`, `AGENTS.md` and every agent-map `handoff`. It checks:
  - in code (`eos <command>`, `--gate`, `explain`, `--to` with its `--scope`), and in prose (gate
    codes, `STATE → STATE`, `/prompt`, agent handoffs, `.github/{eos,hooks}/*.mjs` and
    `.eos/schemas/*.json` paths);
  - each name against the vocabulary read from `.eos/gates.json`, `.eos/workflow.json`, the command
    registry and the prompt, agent and skill files.
  Placeholders (`<id>`, `${…}`), fenced shell paths and URLs are not citations. A near miss gets a
  "did you mean".
- `--gate G6` is an error even though prose may cite G6: the CLI runs gates, and there is no gate
  by that code.
- `eos docs` generates `docs/eos/generated/actions.md` and `docs/zh/generated/actions.md` from
  `.eos/agent-map.json`. Both come from one source, so `docs --check` fails both when the map
  changes. The Chinese page localises its structure and keeps identifiers and the policy's own text
  (each handoff) verbatim. The curated `agent-map.md` stays, and says that it is curated.

## Declined

- **Wiring the check into `spec-align`.** `spec-align` proves a product's story ↔ test
  traceability and runs inside the product's `release-ready` gate. Drift in EOS's own prompts is
  the template's problem, not the product's, and must not fail a product's release. S15 runs in
  `validate-config`, which CI already runs.
- **Checking the manuals.** `docs/` legitimately cites names that are not EOS's: the 1.21 upgrade
  guide explains that `eos constructor` is *not* a command, and the manuals mention other tools'
  slash commands (`/yolo`, `/skills`) and shell paths. A strict check there needs suppressions,
  which would become a second authority. Measured at the time of writing: the manuals contained no
  gate-code, state or transition drift.
- **Translating policy text.** Chinese `handoff`, `title` and `fix` fields in the JSON would be a
  second copy of the policy that nothing can check. Only structure is localised.
- **Generating agent instruction files from the map.** `.github/agents/*.agent.md` are authored
  prompts, not projections. They are checked (S15), not generated.
- **Judging prose.** S15 is a static check of references. Whether an instruction is good advice
  remains a review question.

## Consequences

**Accepted:** a new citation form (for example a new flag that names a gate) is unchecked until the
scanner learns it. The patterns live in one module with unit tests per form.

**Preserved:** renaming any gate, state, command, prompt or agent now fails CI at every file that
still cites the old name, and the error names the file and line.
