---
name: 'Stage close-out & language'
description: 'How every EOS stage must end — preview, confirm, gate, announce — and which language to answer in'
applyTo: "**"
---
# Stage Close-Out (every phase, every agent)

Writing the artifact is not finishing the stage. End every EOS stage with these four steps, in
order, in the same reply. This binds the default agent too, not only the `eos-*` agents.

1. **Preview, don't link.** Print a digest of what you wrote: the decisions a reader would
   otherwise have to open the file to find, plus every choice you made on the developer's behalf.
   ~10 bullets. Never end a stage with only "Made changes."
2. **Confirm before you gate.** Ask them to confirm or amend, and name the 2–3 places you most
   expect to be wrong. Wait for the answer. A gate checks structure — it cannot tell you the
   content is what they meant, so gating unreviewed content just locks the mistake in.
3. **Run the gate yourself.** You have `runCommands`. Never ask the developer to paste a command
   you can run. Report the machine result verbatim, not your opinion of it.
4. **Announce the handoff.** Run `node .github/eos/eos.mjs next`, then state in one line: the next
   stage, the agent to switch to, and what it needs from them. Offer the handoff button and say
   plainly that you cannot switch agents yourself.

## One-way doors get a real conversation

Before writing any irreversible decision (tech stack, deployment topology, data model, auth model):
present the options, the trade-offs and your recommendation, and get an explicit answer. Never bury
a one-way door inside a document and treat silence as agreement.

## Language

Answer in `.eos/project.json` → `language` (BCP-47) when it is set; otherwise mirror the
developer's language. Code, identifiers, paths, commands and `.eos/**` records stay English.
