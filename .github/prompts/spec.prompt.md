---
name: spec
description: Produce the PRD as the single source of truth (reuses bmad-prd)
argument-hint: <path to docs/requirements.md>
agent: agent
tools: ['search', 'editFiles', 'runCommands']
---
# Spec (PRD) — EOS

1. Read `docs/requirements.md` (must have passed G2).
2. Draft the PRD using skill `bmad-prd` (it detects create / update / validate intent;
   `bmad-create-prd` and `bmad-validate-prd` are deprecated shims that forward to it).
3. Append an NFR section sourced from `docs/checklists/C-nfr.md` (do not leave blank).
4. Validate with `bmad-prd` in validate intent. Any failed criterion => BLOCKER.

Output: `docs/prd.md`.

**Define every acceptance criterion; do not merely mention it.** G3 counts a criterion as defined
only when its id OPENS a list item, a table row or a heading *and* is followed by the criterion
text — a sentence that names `AC9.9` in passing is a reference, and a story claiming to implement it
would be claiming to implement a sentence. Cite the `FR<n>` id beside its criteria (or in the
heading that groups them) so every requirement is visibly covered.

**Cover the whole backlog in one pass.** Write the acceptance criteria for every requirement now,
not just for the first story. `prd-ready` evidence goes stale whenever `docs/prd.md` changes, so a
PRD that grows one story at a time forces a G2/G3 re-run per story — the single most expensive
rework loop in EOS. If a criterion is genuinely unknowable until earlier work lands, say so
explicitly in the PRD and schedule that requirement behind a spike, rather than leaving it out and
discovering it 19 stories later.

## Close-out (do not skip)

Follow the always-on `05-stage-closeout` rule: **preview → confirm → gate → announce**. Digest the
requirements and the criteria you wrote, ask the developer to amend or confirm, and only then run
the gate — yourself, not by handing them a command to paste:

```sh
node .github/eos/eos.mjs check --gate prd-ready
```

> **Next (after G3):** if the product is user-facing, run `/ux-spec` (Gate G-UX).
> For a pure backend / API / CLI, skip UX and **switch to the `eos-architecture` agent**
> in the Chat mode picker (Gate G4) — this is a manual hop, because a prompt workflow
> cannot render a handoff button. Say this out loud; do not leave the developer to ask.
