// architecture-ready (G4) — The architecture decides what stories will assume.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStageRecord, decisionProblem, STAGE_RECORDS } from '../stage-record.mjs';
import {
  ok, fail, blocked, na, awaiting, stageDocCheck, WORKSPACE_RULE, PROVISIONAL_STACK, repoFileExists,
  isRegulated,
} from '../gate-primitives.mjs';

export const evaluators = {
  architectureWritten(ctx) {
    return stageDocCheck(ctx, 'architecture', 100);
  },
  architectureDecisions(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    const d = r.data.decisions;
    const required = ['techStack', 'deploymentTopology', 'authz', 'security', 'audit', 'rollback', 'disasterRecovery', 'dataModel', 'apiContract', 'eventContract'];
    // An agentic product without a tool allow-list, a bounded loop and an eval architecture is not
    // "the same system with an LLM in it" — those ARE its failure modes.
    if (ctx.snapshot.agentic) required.push('toolAllowList', 'boundedOrchestration', 'memoryLayering', 'asyncBoundary', 'evalArchitecture');
    if (isRegulated(ctx)) required.push('regulatedDataBoundary', 'approvalBoundary');
    const problems = [];
    for (const key of required) {
      const problem = decisionProblem(key, d[key], { adoptField: 'summary' });
      if (problem) { problems.push(problem); continue; }
      if (d[key].status === 'DECIDED' && d[key].adr && !repoFileExists(ctx.root, d[key].adr)) {
        problems.push(`${key}: cites ${d[key].adr}, which does not exist inside this repository`);
      }
    }
    // The two irreversible ones must be decided, not declared inapplicable.
    for (const key of ['techStack', 'deploymentTopology']) {
      if (d[key]?.status === 'NOT_APPLICABLE') problems.push(`${key}: cannot be NOT_APPLICABLE — every product runs on some stack, in some topology`);
      else if (d[key]?.status === 'DECIDED' && !d[key].adr) problems.push(`${key}: an irreversible decision needs an ADR (docs/adr/…)`);
    }
    return problems.length
      ? fail(`architecture decisions incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`)
      : ok(`${required.length} architectural concern(s) decided or explicitly N/A with a reason`);
  },
  architectureNfrLanding(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    const req = readStageRecord(ctx.root, 'requirements');
    if (!req.data) return blocked(`${STAGE_RECORDS.requirements.path} is required to check that every NFR lands somewhere`);
    const landed = new Set(r.data.nfrLandingPoints.map((p) => p.nfr));
    const missing = req.data.nfr.map((n) => n.id).filter((id) => !landed.has(id));
    return missing.length
      ? fail(`NFR(s) with no landing point in the architecture: ${missing.join(', ')} — name the component and the mechanism that satisfies each one`)
      : ok(`${landed.size} NFR(s) land on a named component and mechanism`);
  },
  /**
   * Locking the stack in an ADR is only half the decision: every agent in every later session reads
   * the always-on workspace rule, not the ADR. While that rule still carries the PROVISIONAL
   * placeholder it actively contradicts the architecture — a Python project keeps telling agents to
   * run `npm ci`. An ADR nobody's tooling reads is not a locked stack.
   */
  architectureStackLanded(ctx) {
    const r = readStageRecord(ctx.root, 'architecture');
    if (!r.data) return awaiting(STAGE_RECORDS.architecture.path);
    if (r.data.decisions?.techStack?.status !== 'DECIDED') {
      return na('the tech stack is not DECIDED yet, so there is nothing to land in the workspace rule');
    }
    if (!repoFileExists(ctx.root, WORKSPACE_RULE)) {
      // The failure this check exists to prevent is a placeholder CONTRADICTING the ADR. With no
      // workspace rule there is no contradiction, and inventing a file-must-exist requirement here
      // would be G4 enforcing something it was never about.
      return na(`${WORKSPACE_RULE} does not exist, so no always-on rule can contradict the locked stack`);
    }
    const text = readFileSync(join(ctx.root, WORKSPACE_RULE), 'utf8');
    return PROVISIONAL_STACK.test(text)
      ? fail(`${WORKSPACE_RULE} still carries the PROVISIONAL placeholder while docs/architecture.json declares the stack DECIDED — declare the stack in .eos/project.json, then run \`node .github/eos/eos.mjs stack sync --write\` to render the "Local commands" block from it`)
      : ok(`${WORKSPACE_RULE} no longer carries the provisional stack placeholder`);
  },
};
