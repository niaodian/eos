---
name: eos-resume
description: Restore the current work in a fresh chat session — what was in progress, what is blocking it, and the next action
agent: eos-guide
tools: ['search', 'runCommands']
---
# /eos-resume — pick up where the last session stopped

A new chat has no memory of the previous one, and chat history is not project state. Recover the
context from the repository instead:

1. Run `node .github/eos/eos.mjs resume --json`. It restores the local focus
   (`.eos/local/active-work.json` — gitignored, no authority) and returns the same next-action
   contract as `/eos-next`, plus the last verified gate for that scope.
2. Report, in at most six short lines:
   - `Current work: <scopeId> — <state> (<changeType>)`
   - `Last verified gate: <gate> — PASS at <ts>` (or "none recorded yet")
   - `Blocker: <the first blocker>` (or "none")
   - `Recommended next: <title>`
   - `Done when: <first done-when condition>`
3. Then offer the handoff / prompt / command exactly as `/eos-next` does, and generate the context
   package with `node .github/eos/eos.mjs handoff --scope <type> --id <id>` so the next agent does
   not have to re-read the repository.

Never reconstruct state by summarizing documents, and never trust a previous session's claim that
something was finished — the ledger and the evidence files are the only record that counts.
