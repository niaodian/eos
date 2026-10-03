// ux-ready (G-UX) — The interaction contract exists (or is explicitly not needed).
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { ARTIFACTS } from '../state.mjs';
import { readStageRecord, emptyDocReason, decisionProblem, placeholderReason, STAGE_RECORDS } from '../stage-record.mjs';
import { ok, fail, blocked, na, awaiting } from '../gate-primitives.mjs';

export const evaluators = {
  uxApplicabilityDecided(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; ') };
    const unanswered = placeholderReason(r);
    if (unanswered) return fail(unanswered, r.path);
    if (!r.present) {
      return fail(`${STAGE_RECORDS.design.path} does not exist — a product must state whether it has a user-facing surface. A non-UI product records { "userInterface": false, "skipReason": "…" }; run ${STAGE_RECORDS.design.prompt}.`);
    }
    if (!r.data) return blocked(`${r.path} could not be read`);
    if (r.data.userInterface === false) {
      return (r.data.skipReason || '').trim().length >= 20
        ? na(`no user-facing surface: ${r.data.skipReason.slice(0, 90)}`)
        : fail('userInterface is false but skipReason does not explain why — "SKIP" is not a decision');
    }
    return ok('this product has a user-facing surface, so the UX contract applies');
  },
  uxDocumentsPresent(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (!r.data) return awaiting(STAGE_RECORDS.design.path);
    if (r.data.userInterface === false) return na('no user-facing surface');
    // The audit walked a UI product through with NO docs/DESIGN.md at all: EXPERIENCE alone was
    // enough because only its existence was checked, and only for one of the two files.
    const problems = [ARTIFACTS.design, ARTIFACTS.experience]
      .map((rel) => emptyDocReason(ctx.root, rel, { minWords: 60 }))
      .filter(Boolean);
    return problems.length
      ? fail(`a user-facing product needs both a design and an experience contract: ${problems.join(' · ')} — run ${STAGE_RECORDS.design.prompt}`)
      : ok('docs/DESIGN.md and docs/EXPERIENCE.md both exist and carry content');
  },
  uxCoverageComplete(ctx) {
    const r = readStageRecord(ctx.root, 'design');
    if (!r.data) return awaiting(STAGE_RECORDS.design.path);
    if (r.data.userInterface === false) return na('no user-facing surface');
    if (!r.data.coverage) return fail('userInterface is true but no coverage is recorded — flows, states, accessibility, tokens and responsive behaviour each need an answer');
    const problems = [];
    for (const [key, value] of Object.entries(r.data.coverage)) {
      if (value.status === 'COVERED') {
        if ((value.ref || '').trim().length < 5) problems.push(`${key}: COVERED but names no document or section`);
      } else {
        const problem = decisionProblem(key, value, { minReason: 15 });
        if (problem) problems.push(problem);
      }
    }
    return problems.length ? fail(`UX coverage incomplete: ${problems.join(' · ')}`) : ok('flows, states, accessibility, tokens and responsive behaviour are each covered or scoped out with a reason');
  },
};
