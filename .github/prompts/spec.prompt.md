---
name: spec
description: Produce the PRD as the single source of truth (reuses bmad-prd)
argument-hint: <path to docs/requirements.md>
agent: agent
tools: ['search', 'editFiles']
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

```sh
node .github/eos/eos.mjs check --gate prd-ready
```

> **Next (after G3):** if the product is user-facing, run `/ux-spec` (Gate G-UX).
> For a pure backend / API / CLI, skip UX and **switch to the `eos-architecture` agent**
> in the Chat mode picker (Gate G4) — this is a manual hop, because a prompt workflow
> cannot render a handoff button.
