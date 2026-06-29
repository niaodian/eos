---
applyTo: "**"
---
# Engineering Operating System — Global Rules

## Source of Truth
- Specs in `docs/` are the single source of truth. Never implement beyond the approved spec.
- Sequence: discovery → requirements → PRD → UX → architecture → stories → code. Don't skip gates.

## Reuse First (do not reinvent)
- Prefer existing BMAD skills (`bmad-*`, 73 installed) over building new capabilities.
- See the reuse map: [docs/eos/agent-map.md](../docs/eos/agent-map.md).

## Naming (project-wide)
- PascalCase: types/interfaces/components. camelCase: vars/functions. ALL_CAPS: constants.

## Error Handling (project-wide)
- Fail loud in dev, degrade gracefully in prod. Always log errors with context.

## Security Red Lines (never cross)
- Never hardcode secrets. Never log PII/credentials. Never disable authz to "make it work".

## Operational Awareness
- Every user-facing feature must consider: telemetry, authz, rollback.
  If any is skipped, state why in the PR description.
