---
name: eos-help
description: Orient me — print the EOS memory card, detect which phase this repo is in, tell me the exact next step, and show any pending one-time activation
agent: agent
tools: ['search']
---
# EOS Help — "Where am I, what's next?"

The developer is (re)orienting. Give a SHORT, friendly, accurate snapshot — no walls of text. Do the
detection first (read-only), then print the four blocks below. Never invent state you didn't verify.

## 1. Detect the current phase (read-only — check which artifacts exist)

Scan the repo and report the FURTHEST phase reached, then the single next action. Mapping:

| If this exists | Phase reached | Next action |
|---|---|---|
| (nothing yet) | 0 Init | `/eos-init` (one-time harden) → then switch to **eos-discovery** agent |
| `docs/discovery.md` | 1 Discovery | `/requirements "<feature>"` |
| `docs/requirements.md` | 2 Requirements | `/spec` |
| `docs/prd.md` | 3 Spec | `/ux-spec` (user-facing) or switch to **eos-architecture** (backend) |
| `DESIGN.md` / `EXPERIENCE.md` | 3.5 UX | switch to **eos-architecture** agent |
| `docs/architecture.md` or `api/openapi.yaml` | 4 Architecture | switch to **eos-plan** agent (lock stack + ADR + topology first) |
| `docs/stories/` non-empty | 5 Planning | `bmad-dev-story` |
| `src/` has implementation | 6 Development | `bmad-code-review` → `/e2e` |
| `docs/trace-matrix.md` | 7 Testing | `/release-gate` |
| `docs/release-gate.md` | 8 Release | `/telemetry-plan` |
| `docs/telemetry-plan.md` | 9 Observability | switch to **eos-review** agent (iterate) |

Report it as one line, e.g.: `You're at Phase 3 (Spec) — docs/prd.md exists. Next: /ux-spec, or eos-architecture for a backend-only service.`

## 2. Memory card (always print)

```
New feature:   /requirements "<feature>" → /spec → /ux-spec → (agent) eos-architecture
                                          → (handoff) eos-plan → bmad-dev-story → bmad-code-review
One-time harden: /eos-init          (branch protection + CODEOWNERS + approval baseline)
Before release: /release-gate
Self-check:     node .github/hooks/validate-config.mjs
Local CI:       act push -j verify   (needs Docker)
```

## 3. Activation status (always check)

Read `docs/eos/activation.md` and report how many items are still `- [ ]` pending (vs `[x]` done / `[~]`
waived). If any pending, add: "Run `/eos-init` to harden — this is what turns the CI gates from advisory
into merge-blocking." If the file is missing, say so and point to `/eos-init`. Be honest that EOS can track
this but cannot verify server-side branch protection for you.

## 4. Where to read more (one line each)

- Fast start: `docs/eos/quickstart.md` · One-page cheat-sheet: user-manual §6.x · Beginner tracks: §6.5
- Terms you don't recognize: user-manual Appendix A (glossary) · Why it's built this way: `docs/eos/blueprint.md`

> Keep the whole reply scannable (a novice should grok it in ~20 seconds). Do not run any commands or edit
> files — this is orientation only.
