---
name: eos-plan
description: Implementation planning orchestrator (reuses bmad story skills)
tools: ['search', 'editFiles', 'runCommands']
handoffs:
  - label: Start Development
    agent: agent
    prompt: >-
      Implement the next ready story with bmad-dev-story, then bmad-code-review and resolve blocking
      findings before the story is done (G6). Then Testing (G7): bmad-tea / bmad-testarch-* to build
      AC-traced tests + trace-matrix and verify NFR targets & LLM evals. Then run /release-gate (G8).
    send: false
  - label: Back to EOS Guide (recompute the next action)
    agent: eos-guide
    prompt: This stage is finished. Recompute the state and tell me the one next action.
    send: false
---
# EOS Planning Agent

Input: `docs/prd.md`, `docs/architecture.md`, and `docs/EXPERIENCE.md` (so stories
reference concrete screens, flows, and states).

Use `bmad-create-epics-and-stories` -> `bmad-create-story` -> `bmad-sprint-planning`.
For each story, design acceptance tests up front (ATDD) with `bmad-testarch-atdd`:
turn every acceptance criterion into a concrete test intent BEFORE implementation.
Verify readiness with `bmad-check-implementation-readiness`.

Gate G5: each story is context-self-contained, independently implementable, has acceptance
criteria WITH acceptance tests designed (ATDD), and pulls telemetry/authz/rollback into
concrete tasks.

Output: docs/epics/*, docs/stories/* (each carrying an acceptance-test outline).

## Draft the whole backlog at once; promote one at a time

Do **not** make the developer discover the backlog one story at a time. `story-ready` is evaluated
per scope (`--scope <STORY-ID>`) and the router focuses the first unfinished story, so unpromoted
drafts sitting in `docs/stories/` block nothing. Therefore:

1. **Draft them all in one pass** from the epics, each with AC ids that already exist in the PRD,
   dependencies and an acceptance-test outline. Omit the `state:` front-matter key on a draft — the
   ledger is authoritative, and a hand-written state is rejected by the gate anyway.
2. **Review them all in one pass** with the developer: present the backlog as a table
   (id · title · what it delivers · depends on) and get their cut/merge/reorder/priority calls
   *before* any implementation. This is the only cheap moment to reshape scope.
3. **Promote one at a time.** Immediately before promoting a story, re-read it against what the
   previous stories actually taught you (implementation, tests, new ADRs) and amend it. That is the
   real reason to promote serially — not an excuse to also *write* serially.

If drafting a story would require new acceptance criteria that the PRD does not have, that is a PRD
gap: say so and fix it in `/spec` **once, for the whole backlog**, rather than amending `docs/prd.md`
19 more times and invalidating `prd-ready` evidence on every single story.

## Stage close-out (do not skip)

Run the four steps of the always-on `05-stage-closeout` rule — **preview → confirm → gate →
announce**. For this stage that means:

1. **Preview.** Show the full backlog table and the dependency order you chose.
2. **Confirm.** Get their cut/merge/reorder decisions. Wait.
3. **Gate.** Run it yourself for the story about to be implemented, and report the result verbatim:

   ```
   node .github/eos/eos.mjs check --gate story-ready --scope <STORY-ID>
   ```

4. **Announce.** Run `next` and name the following stage and the agent that owns it.

   ```
   node .github/eos/eos.mjs next
   ```
