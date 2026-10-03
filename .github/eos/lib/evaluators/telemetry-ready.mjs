// telemetry-ready (G9) — The shipped change can be observed.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { readStageRecord, STAGE_RECORDS } from '../stage-record.mjs';
import { ok, fail, blocked, awaiting, stageDocCheck } from '../gate-primitives.mjs';

export const evaluators = {
  telemetryPlanWritten(ctx) {
    return stageDocCheck(ctx, 'telemetry', 60);
  },
  /** Every discovery success metric must be carried by a real, named signal. */
  telemetrySignalsLand(ctx) {
    const r = readStageRecord(ctx.root, 'telemetry');
    if (!r.data) return awaiting(STAGE_RECORDS.telemetry.path);
    const discovery = readStageRecord(ctx.root, 'discovery');
    if (!discovery.data) return blocked(`${STAGE_RECORDS.discovery.path} is required: G9 proves the SUCCESS METRIC is observable, so it must know what that metric is`);
    const emitted = r.data.signals.map((s) => s.metric.toLowerCase());
    const target = discovery.data.successMetric.name;
    const covered = emitted.some((m) => m.includes(target.toLowerCase()) || target.toLowerCase().includes(m));
    return covered
      ? ok(`the success metric "${target}" is emitted as ${r.data.signals.find((s) => s.metric.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(s.metric.toLowerCase())).emittedAs}`)
      : fail(`the discovery success metric "${target}" is not among the emitted signals (${emitted.join(', ') || 'none'}) — shipping without it means the release cannot be judged`);
  },
  telemetryObservability(ctx) {
    const r = readStageRecord(ctx.root, 'telemetry');
    if (!r.data) return awaiting(STAGE_RECORDS.telemetry.path);
    const problems = [];
    if (r.data.release !== undefined && String(r.data.release) !== String(ctx.scopeId)) {
      problems.push(`this record observes release "${r.data.release}", not "${ctx.scopeId}"`);
    }
    if (!r.data.dashboards.length) problems.push('no dashboard is recorded');
    if (!r.data.alerts.length) problems.push('no alert is recorded');
    const unrouted = r.data.alerts.filter((a) => !(a.routesTo || '').trim()).map((a) => a.name);
    if (unrouted.length) problems.push(`alert(s) that reach nobody: ${unrouted.join(', ')}`);
    if (!(r.data.owner || '').trim()) problems.push('no owner reads these signals');
    if (!(r.data.rolloutMetrics?.rollbackTrigger || '').trim()) problems.push('no rollback trigger — a canary with no abort condition is just a slow deploy');
    // A sink name is naturally short ("audit-log"), so this one is checked on its own terms rather
    // than through the generic decision validator's "say what you will build" minimum.
    const audit = r.data.sensitiveOperationAudit;
    if (audit?.status === 'COVERED') {
      if (!(audit.sink || '').trim()) problems.push('sensitiveOperationAudit is COVERED but names no sink — an audit trail nobody can read is not an audit trail');
      else if (!(audit.operations || []).length) problems.push('sensitiveOperationAudit is COVERED but lists no operation');
    } else if (audit?.status === 'NOT_APPLICABLE') {
      if ((audit.reason || '').trim().length < 15) problems.push('sensitiveOperationAudit is N/A without a reason — say why this product performs no sensitive operation');
    } else {
      problems.push('sensitiveOperationAudit: no decision recorded');
    }
    return problems.length ? fail(`observability incomplete: ${problems.join(' · ')}`) : ok(`${r.data.dashboards.length} dashboard(s), ${r.data.alerts.length} routed alert(s), owner ${r.data.owner}`);
  },
};
