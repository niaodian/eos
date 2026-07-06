---
name: ux-spec
description: Design the UX/UI spec (visual + experience contracts) before architecture (reuses bmad-ux / Sally)
argument-hint: <path to docs/prd.md>
agent: agent
tools: ['search', 'editFiles']
---
# UX & Design Spec (EOS) — Gate G-UX

Input: `docs/prd.md` (must have passed G3).

Produce the two peer design contracts using skill `bmad-ux`
(or talk to `bmad-agent-ux-designer` / Sally for an opinionated pass;
use `bmad-cis-design-thinking` / Maya when the problem is still fuzzy):

- `docs/DESIGN.md` — visual identity (owns *how it looks*: design tokens, type, color, spacing).
- `docs/EXPERIENCE.md` — information architecture, user flows, screen states, interactions,
  accessibility, journeys, **target device matrix (phone/tablet/desktop + breakpoints)** (owns
  *how it works*). Cross-reference DESIGN.md tokens by name.

## Scope decision (conditional gate)
This stage is **conditional**. For a pure backend / API / CLI project with no user-facing
surface, write one line in `docs/EXPERIENCE.md`: `SKIP — no user-facing surface (reason: …)`
and proceed. Otherwise, do not skip.

## Gate G-UX (for user-facing work)
For EACH user-facing requirement in the PRD, verify:
- [ ] A screen/flow exists in `EXPERIENCE.md`.
- [ ] All states are defined: loading / empty / error / success.
- [ ] Accessibility baseline is stated (keyboard path, focus, labels, contrast).
- [ ] Visual tokens it needs exist in `DESIGN.md` (referenced by name, not hardcoded).
- [ ] Responsive/multi-device behavior is stated: target devices + breakpoints, and how the
      layout adapts (or `single-target` with a reason for a fixed-surface app).

Any unmet item => BLOCKER. These contracts win over any later mock or import,
and they are the source of truth for the frontend rules (a11y + loading/empty/error states)
and for `/telemetry-plan` instrumentation of user actions.

Output: `docs/DESIGN.md`, `docs/EXPERIENCE.md`.

> **Next (after G-UX):** switch to the `eos-architecture` agent in the Chat mode picker
> (this hop is manual — a prompt workflow can't render a handoff button). That agent honors
> `docs/EXPERIENCE.md` + `docs/DESIGN.md` as contracts and produces the architecture (Gate G4);
> run `/adr` for each irreversible decision. From `eos-architecture` onward the chain is
> button-driven: `eos-architecture → eos-plan → (dev)`.
