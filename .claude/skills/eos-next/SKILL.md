---
name: eos-next
description: Show the single recommended next action for this repository, why it is next and how to start it, from eos next. Use when asked what to do next, where the project stands, or which agent or command to use.
---
# /eos-next — the one next action

1. Run `node .github/eos/eos.mjs next --json` and parse the result. If the developer asked "why",
   also run `node .github/eos/eos.mjs next --why`; if they asked what else they could do, run
   `node .github/eos/eos.mjs next --all`.
2. Print the six blocks — `Current`, `Blockers`, `Recommended next`, `Why`, `Start`, `Done when` —
   using **only** values from the JSON. Do not add advice the machine did not produce.
3. Offer the handoff that matches `recommendedAction.copilotAgent`, or name the slash command to run (`/<recommendedAction.copilotPrompt>` — an EOS skill),
   or print `recommendedAction.command` verbatim. Say plainly that EOS cannot switch the agent for
   you — that click is the developer's.
4. If `blockers` is non-empty, list each as `gate/check — detail` with its `fix`, in that order.
   Never answer a failing gate with "see the documentation".

Do not edit any file. Do not mark anything as done. If `exitCode` is 3, report the ERROR lines and
recommend `node .github/eos/eos.mjs doctor`.
