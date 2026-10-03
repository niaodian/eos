// discovery-ready (G1) — The problem is framed, not merely filed.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { readStageRecord, openBlockers } from '../stage-record.mjs';
import { ok, fail, awaiting, stageDocCheck } from '../gate-primitives.mjs';

export const evaluators = {
  discoveryWritten(ctx) {
    return stageDocCheck(ctx, 'discovery', 80);
  },
  discoveryProblemFalsifiable(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const p = r.data.problem;
    // "Users want a better experience" is unfalsifiable, so it can never be wrong — and a problem
    // that can never be wrong cannot tell you when you are done.
    return p.falsifiableBy.trim().length >= 20
      ? ok(`falsifiable: "${p.falsifiableBy.slice(0, 70)}"`)
      : fail('problem.falsifiableBy does not state what observation would prove the problem wrong');
  },
  discoveryMetricMeasurable(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const m = r.data.successMetric;
    const problems = [];
    if (String(m.target ?? '').trim().length === 0) problems.push('no target value');
    if (String(m.dataSource ?? '').trim().length < 5) problems.push('no data source — the number cannot be obtained, only quoted');
    return problems.length ? fail(`successMetric "${m.name}": ${problems.join('; ')}`) : ok(`metric "${m.name}" targets ${m.target}${m.unit || ''} from ${m.dataSource}`);
  },
  discoveryScopeBounded(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const { in: inScope, out } = r.data.scope;
    return inScope.length && out.length
      ? ok(`${inScope.length} in scope · ${out.length} explicitly out of scope`)
      : fail('scope.in and scope.out must both be non-empty — a scope with no boundary is not a scope');
  },
  discoveryNoOpenBlockers(ctx) {
    const r = readStageRecord(ctx.root, 'discovery');
    if (!r.data) return awaiting(r.path);
    const open = openBlockers(r.data);
    return open.length ? fail(`${open.length} unresolved blocking question: ${open[0].slice(0, 120)}`) : ok('no unresolved blocking question');
  },
};
