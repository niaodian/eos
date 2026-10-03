// requirements-ready (G2) — Requirements and operational pre-flight are decided.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { readStageRecord, decisionProblem, openBlockers } from '../stage-record.mjs';
import { ok, fail, awaiting, stageDocCheck, duplicates, isRegulated } from '../gate-primitives.mjs';

export const evaluators = {
  requirementsWritten(ctx) {
    return stageDocCheck(ctx, 'requirements', 80);
  },
  requirementsFunctional(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const dupes = duplicates(r.data.functional.map((f) => f.id));
    if (dupes.length) return fail(`duplicate functional requirement id(s): ${dupes.join(', ')}`);
    return ok(`${r.data.functional.length} functional requirement(s)`);
  },
  requirementsNfr(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const dupes = duplicates(r.data.nfr.map((n) => n.id));
    if (dupes.length) return fail(`duplicate NFR id(s): ${dupes.join(', ')}`);
    const vague = r.data.nfr.filter((n) => !(n.target || '').trim()).map((n) => n.id);
    return vague.length
      ? fail(`NFR(s) with no target: ${vague.join(', ')} — an unquantified NFR cannot be verified at G8`)
      : ok(`${r.data.nfr.length} NFR(s), each with a target`);
  },
  /**
   * The operational pre-flight. Documented as a hard gate, previously satisfied by the string
   * "SKIP". Each of the 1-N concerns is now ADOPT / SKIP+reason / DEFER+owner+trigger. (EOS-AUD-005)
   */
  requirementsOperationalPreFlight(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const pre = r.data.operationalPreFlight;
    const required = ['telemetry', 'authz', 'audit', 'rollback', 'monitoring', 'canary', 'quota', 'i18n', 'multiTenancy', 'capacitySlo', 'dr'];
    if (isRegulated(ctx)) required.push('compliance');
    const problems = [];
    for (const key of required) {
      const problem = decisionProblem(key, pre[key]);
      if (problem) problems.push(problem);
    }
    const deferred_ = required.filter((k) => pre[k]?.decision === 'DEFER');
    if (problems.length) return fail(`operational pre-flight incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`);
    return ok(`${required.length} operational concern(s) decided${deferred_.length ? ` (${deferred_.length} deferred with an owner and a trigger)` : ''}`);
  },
  requirementsNoOpenBlockers(ctx) {
    const r = readStageRecord(ctx.root, 'requirements');
    if (!r.data) return awaiting(r.path);
    const open = openBlockers(r.data);
    return open.length ? fail(`${open.length} unresolved blocking question: ${open[0].slice(0, 120)}`) : ok('no unresolved blocking question');
  },
};
