---
name: eos-nfr
description: Fill the non-functional requirements checklist (performance, availability, security, cost and the rest) with concrete, measurable targets. Use during requirements analysis, or when the release gate finds an NFR without a target.
---
# Non-Functional Requirements (EOS)

Walk `docs/checklists/C-nfr.md`. For each line, set a concrete target value or
mark "N/A + reason". Map each adopted NFR to an architecture landing point.
Feed results into `docs/prd.md` (NFR section) and `docs/architecture.md`.

> **Next:** these targets flow into `/eos-spec` (PRD NFR section, G3) and get a landing point at
> Architecture (G4); they are verified at Testing (G7, `bmad-testarch-nfr`).
