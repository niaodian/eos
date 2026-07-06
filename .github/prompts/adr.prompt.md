---
name: adr
description: Record one architecture decision (EOS supplement to bmad-architecture)
argument-hint: <short decision title>
agent: agent
tools: ['editFiles']
---
# Architecture Decision Record (EOS)

Create `docs/adr/NNN-<slug>.md` (next sequential NNN) with:
- Status: proposed | accepted | superseded
- Context: the forces and constraints
- Decision: what we chose
- Consequences: trade-offs, especially for 1-N scaling & reversibility
- Alternatives considered: with reasons rejected

Keep it to one decision per file. Link from `docs/architecture.md`.

> **Next:** return to the `eos-architecture` agent (G4). One ADR per irreversible decision — including
> the **tech-stack lock** (language/framework), which also updates `00-workspace` + enables the R3 rule.
