// story-ready (G5) — Story is ready for development.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { resolve } from 'node:path';
import { gatePolicy, scopeState } from '../state.mjs';
import { opsDecisionProblem } from '../story.mjs';
import { ok, fail, blocked, na } from '../gate-primitives.mjs';

export const evaluators = {
  storyPresent(ctx) {
    if (!ctx.story) return blocked(`no story with id "${ctx.scopeId}" under docs/stories/ — the gate has nothing to evaluate (create it with the eos-plan agent)`);
    if (ctx.story.errors?.length) return { status: 'ERROR', detail: ctx.story.errors.join(' · ') };
    return ok(`${ctx.story.path}`);
  },
  storyStateNotHandEdited(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.declaredState) return ok('state is not declared in the file — the ledger is authoritative');
    const ledger = scopeState(ctx.snapshot, 'story', ctx.scopeId);
    return ctx.story.declaredState === ledger
      ? ok(`declared state mirrors the ledger (${ledger})`)
      : fail(`the story file claims state "${ctx.story.declaredState}" but the ledger says "${ledger}" — hand-edited state is not evidence; use \`eos transition\``);
  },
  storyAcResolves(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.acs.length) return fail('the story has no acceptance criteria table');
    if (!ctx.snapshot.prd.present) {
      return gatePolicy(ctx.snapshot, ctx.changeType, 'prd-ready') === 'not_applicable'
        ? na(`no PRD is required for a ${ctx.changeType} change`)
        : fail('docs/prd.md does not exist, so the referenced acceptance criteria cannot be resolved');
    }
    const missing = ctx.story.acs.filter((a) => !ctx.snapshot.prd.ids.includes(a.id)).map((a) => a.id);
    return missing.length
      ? fail(`acceptance criteria not found in docs/prd.md: ${missing.join(', ')} — add them to the PRD first or reference the real ids`)
      : ok(`${ctx.story.acs.length} criteria resolve against the PRD`);
  },
  storyAcTestIntent(ctx) {
    if (!ctx.story) return blocked('no story file');
    if (!ctx.story.acs.length) return fail('the story has no acceptance criteria table');
    const missing = ctx.story.acs.filter((a) => !a.testIntent).map((a) => a.id);
    return missing.length
      ? fail(`${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no acceptance-test intent — design the test before the implementation (bmad-testarch-atdd)`)
      : ok('every acceptance criterion has a test intent');
  },
  storyAgenticEvalCase(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic, so no acceptance criterion is model-backed');
    if (!ctx.story) return blocked('no story file');
    const missing = ctx.story.acs.filter((a) => !/EVAL-\d+/i.test(a.evalCase) && !a.evalDeclaredNotApplicable).map((a) => a.id);
    return missing.length
      ? fail(`${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no eval case — an agentic product needs EVAL-<n> per criterion, or an explicit "N/A — deterministic" cell`)
      : ok('every acceptance criterion carries an eval case or an explicit N/A');
  },
  storyOpsTasks(ctx) {
    if (!ctx.story) return blocked('no story file');
    const labels = { telemetry: 'Telemetry', authorization: 'Authorization', rollback: 'Rollback' };
    const problems = Object.entries(ctx.story.ops)
      .map(([key, value]) => opsDecisionProblem(labels[key], value))
      .filter(Boolean);
    // An empty "## Dependencies" heading used to satisfy this check, because only a MISSING
    // heading was treated as unanswered.
    const deps = (ctx.story.dependencies || '').replace(/[-*+\s]/g, '');
    if (ctx.story.dependencies === null) problems.push('Dependencies: no "## Dependencies" section');
    else if (!deps.length) problems.push('Dependencies: the section is empty — list them, or write "none — <why nothing blocks this story>"');
    else if (/^none$/i.test(deps)) problems.push('Dependencies: "none" on its own — say why nothing blocks this story');
    return problems.length
      ? fail(`${problems.join(' · ')}`)
      : ok('telemetry, authorization, rollback and dependencies are decided (adopted with an owner and a verification, or skipped/deferred with a reason)');
  },
};
