---
name: nfr
description: Fill the non-functional requirements checklist with concrete targets
agent: agent
tools: ['search', 'editFiles']
---
# Non-Functional Requirements (EOS)

Walk `docs/checklists/C-nfr.md`. For each line, set a concrete target value or
mark "N/A + reason". Map each adopted NFR to an architecture landing point.
Feed results into `docs/prd.md` (NFR section) and `docs/architecture.md`.

> **Next:** these targets flow into `/spec` (PRD NFR section, G3) and get a landing point at
> Architecture (G4); they are verified at Testing (G7, `bmad-testarch-nfr`).
