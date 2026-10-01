# ADR-009 — Committed state is per-branch because git is; only local state is keyed by branch

- Status: Accepted
- Date: 2026-10-01
- Depends on: ADR-004, the 1.19.0 ledger merge policy
- Governs: `.eos/ledger/`, `.eos/evidence/`, `.eos/local/`, `eos ledger --resolve`

## Context

The round-4 audit asked for **branch-scoped state**: EOS state kept separately per branch, so work
on two branches cannot interfere.

For committed state, git already does exactly this. `.eos/ledger/events.jsonl`, `.eos/evidence/` and
the release manifests are tracked files: each branch has its own copy, changes on one branch are
invisible to another until they merge, and the merge is where the two histories meet. What was
missing was what happens at that meeting:

- 1.19.0 made git conflict on the ledger instead of merging it textually, and made
  `eos ledger --resolve` replay both sides into one valid chain.
- 1.20.0 re-checks the merged status history (a story both sides moved is reset to the last state
  both agreed on, by a recorded `reconcile` entry). It also warns before the merge when the base
  branch is moving a story this branch is also moving, and writes each gate run's evidence and
  ledger entry as one unit.

A second, EOS-specific mechanism for keeping committed state per branch (for example a ledger file
per branch, or per-branch sections inside one ledger) would duplicate what git already guarantees,
and would add a second authority: two places that could disagree about a story's state.

Local state is different. `.eos/local/active-work.json`, the "what was I working on" focus, is
gitignored, so git does not keep it per branch. It was one file per machine, and switching branches
kept the previous branch's focus.

## Decision

**Committed EOS state is NOT duplicated per branch; git's own branching is the mechanism. Only
local, gitignored state is keyed by branch.**

- `.eos/local/active-work.<branch>.json` holds each branch's focus. A detached HEAD, or no git,
  falls back to the original single file. A focus recorded before 1.20.0 (no branch) is honoured; a
  focus recorded on another branch is never used.
- Branches meet at the merge, where the ledger policy applies: git conflicts, `--resolve` replays,
  the status history is re-checked, and `reconcile` entries settle any story both sides moved.

## Consequences

**Accepted:** concurrent work on one story is still discovered no earlier than when the base branch
moves it. EOS never fetches, so the warning is as fresh as the developer's last `git fetch`.

**Preserved:** there is exactly one ledger per checkout and one source of truth for any story's
state. Every branch-related behaviour is a consequence of git's model, not a parallel one.
