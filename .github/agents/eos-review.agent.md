---
name: eos-review
description: Iteration & review orchestrator closing the loop back to requirements
tools: ['search', 'editFiles', 'runCommands']
handoffs:
  - label: Open next iteration (Requirements)
    agent: agent
    prompt: Start a new iteration. Run /requirements for the next change, fed by telemetry.
    send: false
  - label: Back to EOS Guide (recompute the next action)
    agent: eos-guide
    prompt: This stage is finished. Recompute the state and tell me the one next action.
    send: false
---
# EOS Review / Iteration Agent

Inputs: telemetry from `docs/telemetry-plan.md`, user feedback.

Use `bmad-correct-course` (change management), `bmad-retrospective` (retro),
`bmad-document-project` (brownfield docs), `bmad-sprint-status`.

Gate G10 (`iteration-ready`, machine-verified): every change is impact-analyzed AND written back to
the spec source of truth. Record it in `docs/iteration.json`
(schema `.eos/schemas/iteration.schema.json`): the learnings, WHERE each one landed, the eval-dataset
update and baseline decision for an agentic product, and a named owner recording
CONTINUE / CORRECT_COURSE / STOP. Verify with
`node .github/eos/eos.mjs check --gate iteration-ready --scope <release-id>`.

Output: change proposals, next-iteration backlog, retro notes, updated ADRs.

## Stage close-out (do not skip)

Run the four steps of the always-on `05-stage-closeout` rule — **preview → confirm → gate →
announce**. For this stage that means:

1. **Preview.** Digest each learning, where it landed in the spec, and the CONTINUE /
   CORRECT_COURSE / STOP call with its named owner.
2. **Confirm.** Ask them to amend or confirm the call. Wait.
3. **Gate.** Run it yourself and report the machine result verbatim:

   ```
   node .github/eos/eos.mjs check --gate iteration-ready --scope <release-id>
   ```

4. **Announce.** Run `next` and name the following stage and the agent that owns it.

   ```
   node .github/eos/eos.mjs next
   ```
