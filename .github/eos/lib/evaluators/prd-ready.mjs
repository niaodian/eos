// prd-ready (G3) — PRD is the single source of truth.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { ARTIFACTS } from '../state.mjs';
import { readStageRecord } from '../stage-record.mjs';
import { ok, fail, na, awaiting } from '../gate-primitives.mjs';

export const evaluators = {
  prdPresent(ctx) {
    return ctx.snapshot.prd.present ? ok('docs/prd.md exists') : fail('docs/prd.md does not exist — the PRD is the single source of truth downstream');
  },
  prdAcParseable(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const prd = ctx.snapshot.prd;
    if (!prd.defined.length) {
      return fail(prd.referenced.length
        ? `the PRD mentions ${prd.referenced.join(', ')} but DEFINES none of them — a criterion is defined by a list item, table row or heading that states it, not by a sentence that names it`
        : 'the PRD contains no parseable acceptance criteria (expected ids of the form AC<n>.<n>)');
    }
    // EOS-AUD-004: an id that only ever appears inside prose is a reference, and a story that
    // claims to implement it is claiming to implement a sentence.
    if (prd.referencedOnly.length) {
      return fail(`referenced but never defined: ${prd.referencedOnly.join(', ')} — state each one as a list item, table row or heading with its criterion text, or stop citing it`);
    }
    if (prd.unstated.length) {
      return fail(`declared with no statement: ${prd.unstated.join(', ')} — an id with an empty criterion is a placeholder`);
    }
    return ok(`${prd.defined.length} acceptance criteria, each with a statement`);
  },
  /** Every requirement must have at least one acceptance criterion, or it is unspecified. */
  prdCoversRequirements(ctx) {
    const req = readStageRecord(ctx.root, 'requirements');
    if (!req.present) return na('no structured requirements record to cross-check (docs/requirements.json)');
    if (!req.data) return { status: 'ERROR', detail: `${req.path}: ${req.errors.join('; ')}` };
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const { sections, statements } = ctx.snapshot.prd;
    const uncovered = [];
    for (const fr of req.data.functional) {
      const idRe = new RegExp(`\\b${fr.id}\\b`);
      const inline = [...statements.entries()].some(([, s]) => idRe.test(s));
      const inSection = sections.some((s) => s.acs.length && idRe.test(s.text));
      if (!inline && !inSection) uncovered.push(fr.id);
    }
    return uncovered.length
      ? fail(`requirement(s) with no acceptance criterion in the PRD: ${uncovered.join(', ')} — cite the requirement id next to its criteria, or in the heading section that defines them`)
      : ok(`${req.data.functional.length} requirement(s) each carry at least one acceptance criterion`);
  },
  prdAcUnique(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const dupes = ctx.snapshot.prd.duplicates;
    return dupes.length ? fail(`duplicate acceptance-criterion id(s): ${dupes.join(', ')} — each id must address exactly one statement`) : ok('every acceptance-criterion id is unique');
  },
  prdNoOpenBlockers(ctx) {
    if (!ctx.snapshot.prd.present) return awaiting(ARTIFACTS.prd);
    const b = ctx.snapshot.prd.blockers;
    return b.length ? fail(`${b.length} unresolved marker(s) in the PRD: ${b[0].trim().slice(0, 120)}`) : ok('no unresolved BLOCKER / TBD marker');
  },
};
