// iteration-ready (G10) — Production learning is written back to the source of truth.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { sha256File } from '../evidence.mjs';
import { readStageRecord, decisionProblem, placeholderReason, STAGE_RECORDS } from '../stage-record.mjs';
import { ok, fail, blocked, na, awaiting, repoFileExists } from '../gate-primitives.mjs';

export const evaluators = {
  iterationWriteBack(ctx) {
    const r = readStageRecord(ctx.root, 'iteration');
    if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; ') };
    const unanswered = placeholderReason(r);
    if (unanswered) return fail(unanswered, r.path);
    if (!r.present) return fail(`${STAGE_RECORDS.iteration.path} does not exist — what production taught has not been written back, so the specs and the running system are already drifting apart (${STAGE_RECORDS.iteration.prompt})`);
    if (!r.data) return blocked(`${r.path} could not be read`);
    // The record names a release. If nobody checks it, one write-back closes the loop for every
    // release that follows — the learning is written once and reused as a formality.
    if (String(r.data.release) !== String(ctx.scopeId)) {
      return fail(`${r.path} records the write-back for release "${r.data.release}", not "${ctx.scopeId}" — each release closes its own loop`);
    }
    const missing = r.data.specWriteBack.filter((w) => !repoFileExists(ctx.root, w.target)).map((w) => w.target);
    if (missing.length) return fail(`the write-back cites document(s) that do not exist: ${missing.join(', ')}`);
    // "We updated the PRD" is a claim about a file. Binding the content makes reverting it visible,
    // instead of leaving a closed loop that quietly reopened.
    const drifted = r.data.specWriteBack
      .filter((w) => sha256File(ctx.root, w.target) !== w.targetDigest)
      .map((w) => w.target);
    return drifted.length
      ? fail(`the write-back records a different version of ${drifted.join(', ')} than what is on disk — the learning was recorded and then changed or reverted; re-record it with the current digest`)
      : ok(`${r.data.learnings.length} learning(s) written back into ${r.data.specWriteBack.length} spec document(s), each bound to its content`);
  },
  iterationAgenticFeedback(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic');
    const r = readStageRecord(ctx.root, 'iteration');
    if (!r.data) return awaiting(STAGE_RECORDS.iteration.path);
    const problems = [];
    const dataset = r.data.evalDatasetUpdate;
    if (!dataset) problems.push('evalDatasetUpdate is missing — for an agentic product, production feedback must reach the eval dataset or the model never learns from it');
    else {
      const p = decisionProblem('evalDatasetUpdate', { status: dataset.status === 'UPDATED' ? 'DECIDED' : 'NOT_APPLICABLE', summary: dataset.datasetRef, reason: dataset.reason }, { adoptField: 'summary' });
      if (p) problems.push(p);
    }
    if (!r.data.baselineRebaselined) problems.push('baselineRebaselined is missing — state whether the prompt/model/tool surface changed and, if so, which new baseline replaces the old one');
    return problems.length ? fail(problems.join(' · ')) : ok('production feedback reaches the eval dataset and the baseline decision is recorded');
  },
  iterationDecisionRecorded(ctx) {
    const r = readStageRecord(ctx.root, 'iteration');
    if (!r.data) return awaiting(STAGE_RECORDS.iteration.path);
    const d = r.data.decision;
    return (d.owner || '').trim()
      ? ok(`${d.outcome}, owned by ${d.owner}`)
      : fail('the iteration decision has no owner — EOS records the decision, it does not make it');
  },
};
