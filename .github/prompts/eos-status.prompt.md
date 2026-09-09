---
name: eos-status
description: Show the whole picture — product baseline state, every story's state, stale evidence and release readiness
agent: eos-guide
tools: ['search', 'runCommands']
---
# /eos-status — the whole board, on demand

`/eos-next` answers "what now?". This answers "where is everything?" — use it for planning, standups
and before a release, not as the normal working loop.

1. Run `node .github/eos/eos.mjs status --json`. Add `--changed` when the developer asks what their
   working tree affects; it lists changed files and the evidence those changes just made STALE.
2. Report:
   - the product baseline state and the guard that blocks the next advance;
   - a compact table of stories: `id · state · changeType`;
   - anything STALE (evidence whose inputs moved) — say plainly that a stale PASS is not a PASS;
   - the single recommended next action from the same JSON.
3. If the developer is preparing a release, also run `node .github/eos/eos.mjs release-status` and
   report the PASS / FAIL / BLOCKED / PENDING / STALE / WAIVED counts with the one next step.

Read-only. Never edit a file, never run `check`, `transition`, `waive` or `approve` from here.
