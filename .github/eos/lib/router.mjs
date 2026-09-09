// Next-Best-Action router — a pure, deterministic function of the state snapshot.
//
// It answers exactly one question: given what this repository actually contains, what is the ONE
// thing to do next, why, how to start it, and how you will know it is done. It never asks a model
// to guess the phase, and it never returns a menu of twelve possibilities.
import { resolveAction, skillDiagnostics } from './registry.mjs';
import { evaluateGate, isBlocking } from './gates.mjs';
import { deriveProductState } from './transitions.mjs';
import { scopeState, changeTypeOf, gatePolicy } from './state.mjs';

const CLI = 'node .github/eos/eos.mjs';

/** Bootstrap pointers used before .eos/agent-map.json can be read (a brand-new repository). */
const BOOTSTRAP_MAP = {
  'fix-eos-configuration': { agent: null, prompt: 'validate-config', skills: [] },
  'complete-local-activation': { agent: null, prompt: 'eos-init', skills: [] },
};

const TITLES = {
  'fix-eos-configuration': 'Repair the EOS configuration',
  'complete-local-activation': 'Complete local activation',
  'frame-the-problem': 'Frame the problem',
  'expand-requirements': 'Expand the requirements',
  'write-prd': 'Write the PRD',
  'repair-prd': 'Repair the PRD',
  'design-ux': 'Design the UX contract (or record SKIP)',
  'design-architecture': 'Design the architecture',
  'plan-stories': 'Slice the work into stories',
  'design-acceptance-tests': 'Design the missing acceptance tests',
  'design-eval-cases': 'Design the missing eval cases',
  'complete-story-readiness': 'Close the story-readiness gaps',
  'promote-story': 'Verify and promote the story',
  'implement-story': 'Implement the story',
  'verify-story': 'Verify the story',
  'repair-verification': 'Repair the failing verification',
  'build-trace-matrix': 'Trace the acceptance criteria to passing tests',
  'refresh-stale-evidence': 'Re-run the gate whose evidence went stale',
  'record-spike-outcome': 'Record the spike outcome',
  'prepare-release': 'Prepare the release',
  'repair-release': 'Close the release blockers',
  'close-the-loop': 'Write the change back to the spec',
  'start-next-change': 'Start the next change',
};

/** Which repair action a failed check maps to. One check → one action, so routing stays stable. */
const CHECK_ACTION = {
  'project-declaration': 'complete-local-activation',
  'declaration-matches-repo': 'complete-local-activation',
  'workflow-profile': 'complete-local-activation',
  'activation-ledger': 'complete-local-activation',
  'prd-present': 'write-prd',
  'ac-parseable': 'repair-prd',
  'ac-unique': 'repair-prd',
  'no-open-blockers': 'repair-prd',
  'story-present': 'plan-stories',
  'state-not-hand-edited': 'complete-story-readiness',
  'ac-references-resolve': 'complete-story-readiness',
  'ac-test-intent': 'design-acceptance-tests',
  'agentic-eval-case': 'design-eval-cases',
  'ops-tasks': 'complete-story-readiness',
  'waiver-rejected': 'complete-story-readiness',
  'tests-executed': 'repair-verification',
  'trace-complete': 'build-trace-matrix',
  'eval-threshold': 'design-eval-cases',
  'evidence-current': 'refresh-stale-evidence',
  'stories-verified': 'repair-release',
  'spec-alignment': 'repair-release',
  'secret-scan': 'repair-release',
  'compliance-boundary': 'repair-release',
  'no-expired-waivers': 'repair-release',
  'ops-artifacts': 'repair-release',
};

const SEVERITY = { ERROR: 5, BLOCKED: 4, FAIL: 3, STALE: 2, PENDING: 1 };

const blockersOf = (gate) => (gate.checks || [])
  .filter((c) => isBlocking(c.status))
  .map((c) => ({ gate: gate.gate, check: c.id, status: c.status, detail: String(c.detail || '').slice(0, 400), ...(c.fix ? { fix: c.fix } : {}) }));

/** The check that should drive the recommendation: worst status first, declaration order as tiebreak. */
function drivingCheck(gate) {
  const candidates = (gate.checks || []).filter((c) => SEVERITY[c.status]);
  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (SEVERITY[c.status] > SEVERITY[best.status] ? c : best), candidates[0]);
}

/**
 * Decide the repair for a failing gate.
 * STALE is special: nothing is *wrong*, an input moved, so the answer is always "re-run", never
 * "go fix the tests". Sending a developer to debug a passing suite because a doc changed is exactly
 * the kind of misleading advice this router exists to prevent.
 */
function repairFor(gate, driver, fallbackAction, fallbackCommand) {
  const stale = driver?.status === 'STALE';
  const withCommand = (gate.checks || []).find((c) => c.command);
  return {
    id: stale ? 'refresh-stale-evidence' : (CHECK_ACTION[driver?.id] || fallbackAction),
    command: withCommand?.command || driver?.command || fallbackCommand,
  };
}

function action(snapshot, id, { reason, targetGate = null, command = null, doneWhen = [], scopeId = null }) {
  const mapped = snapshot.agentMap
    ? resolveAction(snapshot.root, snapshot.agentMap, id)
    : { ...(BOOTSTRAP_MAP[id] || { agent: null, prompt: null, skills: [] }), handoff: '', blocked: snapshot.agentMapErrors?.length ? snapshot.agentMapErrors.join('; ') : null };
  const skills = mapped.skills || [];
  const diag = skills.length ? skillDiagnostics(skills, snapshot.root) : { checked: false, missing: [], note: '' };
  return {
    action: {
      id,
      title: TITLES[id] || id,
      reason,
      targetGate,
      copilotAgent: mapped.agent,
      copilotPrompt: mapped.prompt,
      prompt: mapped.handoff || null,
      skills,
      command: command || `${CLI} status`,
      doneWhen: doneWhen.length ? doneWhen : ['`eos next` no longer recommends this action'],
    },
    problems: [
      ...(mapped.blocked ? [{ gate: 'agent-map', check: 'action-mapping', status: 'BLOCKED', detail: mapped.blocked }] : []),
      ...(diag.checked && diag.missing.length ? [{ gate: 'agent-map', check: 'skill-availability', status: 'BLOCKED', detail: `BMAD skill(s) not installed: ${diag.missing.join(', ')} — install them at ~/.agents/skills/, or do the step manually` }] : []),
    ],
  };
}

const artifactAction = (snapshot, id, { file, reason, doneWhen, command = null }) => ({
  ...action(snapshot, id, { reason, command: command || `${CLI} handoff`, doneWhen }),
  blocker: { gate: 'product', check: id, status: 'FAIL', detail: `${file} does not exist` },
});

/** Pick the active scope: the local focus wins, then the first unfinished story, then the product. */
export function activeScope(snapshot) {
  const aw = snapshot.activeWork;
  if (aw) {
    if (aw.scopeType === 'release') return { type: 'release', id: aw.scopeId };
    if (aw.scopeType === 'story' && snapshot.stories.some((s) => s.id === aw.scopeId)) return { type: 'story', id: aw.scopeId };
    if (aw.scopeType === 'product') return { type: 'product', id: 'product' };
  }
  const unfinished = snapshot.stories.find((s) => scopeState(snapshot, 'story', s.id) !== 'MERGED');
  if (unfinished) return { type: 'story', id: unfinished.id };
  if (snapshot.stories.length) return { type: 'story', id: snapshot.stories.at(-1).id };
  return { type: 'product', id: 'product' };
}

export function route(snapshot, { now = new Date() } = {}) {
  const blockers = [];
  const alternatives = [];
  let recommended = null;
  let current = { scopeType: 'product', scopeId: 'product', state: 'UNINITIALIZED', changeType: null };
  let exitCode = 0;

  const finish = () => ({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    repo: { commit: snapshot.commit, root: snapshot.root },
    current,
    recommendedAction: recommended,
    alternatives,
    blockers,
    exitCode,
  });

  // --- EOS itself must load before anything can be recommended ---------------------------------
  if (snapshot.errors.length) {
    const a = action(snapshot, 'fix-eos-configuration', {
      reason: `EOS cannot evaluate this repository: ${snapshot.errors[0]}`,
      command: 'node .github/hooks/validate-config.mjs',
      doneWhen: ['`eos status` no longer reports an ERROR'],
    });
    recommended = a.action;
    blockers.push(...snapshot.errors.map((e) => ({ gate: 'eos', check: 'configuration', status: 'ERROR', detail: e })));
    exitCode = 3;
    return finish();
  }
  if (!snapshot.workflow || !snapshot.gates) {
    const a = action(snapshot, 'complete-local-activation', {
      reason: 'EOS is not activated in this repository yet — the workflow and gate definitions are missing.',
      targetGate: 'activation',
      command: `${CLI} init --write`,
      doneWhen: ['.eos/workflow.json and .eos/gates.json exist', '`eos status` reports the current phase'],
    });
    recommended = a.action;
    blockers.push({ gate: 'activation', check: 'eos-installed', status: 'FAIL', detail: 'no .eos/workflow.json + .eos/gates.json — copy them from the EOS template or run `eos init --write`' });
    exitCode = 2;
    return finish();
  }

  const scope = activeScope(snapshot);
  const changeType = changeTypeOf(snapshot, scope.type, scope.id);
  const derivedProduct = deriveProductState(snapshot);
  current = {
    scopeType: scope.type,
    scopeId: scope.id,
    state: scope.type === 'product' ? derivedProduct.state : scopeState(snapshot, scope.type, scope.id),
    changeType,
  };

  const gate = (id, sType = scope.type, sId = scope.id) => evaluateGate(snapshot, id, sType, sId, { mode: 'cheap', now });
  const take = (built, { blocker = null } = {}) => {
    recommended = built.action;
    if (blocker) blockers.push(blocker);
    if (built.blocker) blockers.push(built.blocker);
    blockers.push(...(built.problems || []));
  };

  // --- activation is the precondition for every other gate --------------------------------------
  if (gatePolicy(snapshot, changeType, 'activation') !== 'not_applicable') {
    const g = gate('activation', 'product', 'product');
    if (isBlocking(g.status)) {
      const driver = drivingCheck(g);
      take(action(snapshot, CHECK_ACTION[driver?.id] || 'complete-local-activation', {
        reason: driver?.detail || 'local activation is incomplete',
        targetGate: 'activation',
        command: `${CLI} check --gate activation`,
        doneWhen: ['`eos check --gate activation` passes'],
      }));
      blockers.push(...blockersOf(g));
      exitCode = 2;
      return finish();
    }
  }

  // --- release scope ----------------------------------------------------------------------------
  if (scope.type === 'release') {
    const g = gate('release-ready', 'release', scope.id);
    if (isBlocking(g.status)) {
      const driver = drivingCheck(g);
      const repair = repairFor(g, driver, 'repair-release', `${CLI} check --gate release-ready --scope ${scope.id}`);
      take(action(snapshot, repair.id, {
        reason: driver?.detail || 'the release is not ready',
        targetGate: 'release-ready',
        command: repair.command,
        doneWhen: ['`eos check --gate release-ready` passes', 'every required story is VERIFIED with fresh evidence'],
      }));
      blockers.push(...blockersOf(g));
    } else {
      take(action(snapshot, 'prepare-release', {
        reason: `release-ready is ${g.status} for ${scope.id}; record the candidate and its approval.`,
        targetGate: 'release-ready',
        command: `${CLI} verify-release --release ${scope.id}`,
        doneWhen: ['release evidence is bound to the candidate commit', 'an approver other than the requester has recorded the approval'],
      }));
    }
    exitCode = blockers.some((b) => isBlocking(b.status)) ? 2 : 0;
    addAlternatives(snapshot, alternatives, recommended, scope);
    return finish();
  }

  // --- product scope: the artifacts drive the baseline -------------------------------------------
  if (scope.type === 'product') {
    const steps = [
      { key: 'discovery', id: 'frame-the-problem', file: 'docs/discovery.md', reason: 'there is no problem statement yet, and everything downstream is derived from it.', doneWhen: ['docs/discovery.md states one falsifiable problem and a measurable success metric'] },
      { key: 'requirements', id: 'expand-requirements', file: 'docs/requirements.md', reason: 'the problem is framed but the requirements (functional + NFR + operational readiness) are not written.', doneWhen: ['docs/requirements.md exists with the operational decision table'] },
      { key: 'prd', id: 'write-prd', file: 'docs/prd.md', reason: 'requirements exist but there is no PRD, so nothing downstream has addressable acceptance criteria.', doneWhen: ['docs/prd.md exists', '`eos check --gate prd-ready` passes'] },
    ];
    for (const s of steps) {
      if (!snapshot.artifacts[s.key]) {
        take(artifactAction(snapshot, s.id, { file: s.file, reason: s.reason, doneWhen: s.doneWhen }));
        exitCode = 2;
        addAlternatives(snapshot, alternatives, recommended, scope);
        return finish();
      }
    }
    const prd = gate('prd-ready', 'product', 'product');
    if (isBlocking(prd.status)) {
      const driver = drivingCheck(prd);
      const repair = repairFor(prd, driver, 'repair-prd', `${CLI} check --gate prd-ready`);
      take(action(snapshot, repair.id, {
        reason: driver?.detail || 'the PRD is not ready',
        targetGate: 'prd-ready',
        command: repair.command,
        doneWhen: ['`eos check --gate prd-ready` passes'],
      }));
      blockers.push(...blockersOf(prd));
      exitCode = 2;
      addAlternatives(snapshot, alternatives, recommended, scope);
      return finish();
    }
    if (!snapshot.artifacts.experience) {
      take(artifactAction(snapshot, 'design-ux', {
        file: 'docs/EXPERIENCE.md',
        reason: 'the PRD is ready but there is no UX contract; a story sliced without screens and states is what causes rework.',
        doneWhen: ['docs/EXPERIENCE.md exists (or records "SKIP — no user-facing surface" with a reason)'],
      }));
      exitCode = 2;
      addAlternatives(snapshot, alternatives, recommended, scope);
      return finish();
    }
    if (!snapshot.artifacts.architecture) {
      take(artifactAction(snapshot, 'design-architecture', {
        file: 'docs/architecture.md',
        reason: 'the UX contract is settled but the technical approach, tech-stack lock and deployment topology are not decided.',
        doneWhen: ['docs/architecture.md exists', 'the tech stack and deployment topology each have an ADR'],
      }));
      exitCode = 2;
      addAlternatives(snapshot, alternatives, recommended, scope);
      return finish();
    }
    take(artifactAction(snapshot, 'plan-stories', {
      file: 'docs/stories/',
      reason: 'the baseline is approved but there is no story to work on.',
      doneWhen: ['at least one story exists under docs/stories/', '`eos check --gate story-ready --scope <id>` passes for it'],
    }));
    exitCode = 2;
    addAlternatives(snapshot, alternatives, recommended, scope);
    return finish();
  }

  // --- story scope: the state machine drives the step ---------------------------------------------
  const state = current.state;
  const story = snapshot.stories.find((s) => s.id === scope.id) || null;

  if (changeType === 'SPIKE') {
    take(action(snapshot, 'record-spike-outcome', {
      reason: 'a SPIKE is deliberately ungated — the only requirement is that it ends in a decision record.',
      command: `${CLI} status`,
      doneWhen: ['a decision record (docs/adr/*.md) captures what the spike settled', 'a follow-up story exists if any of it should ship'],
    }));
    addAlternatives(snapshot, alternatives, recommended, scope);
    return finish();
  }
  if (changeType === 'DOC_ONLY') {
    take(action(snapshot, 'start-next-change', {
      reason: 'this is a DOC_ONLY change: the workflow profile declares every product gate not applicable, and that decision is recorded rather than skipped.',
      command: `${CLI} status`,
      doneWhen: ['the documentation change is committed', 'no product behaviour changed'],
    }));
    addAlternatives(snapshot, alternatives, recommended, scope);
    return finish();
  }

  if (['DRAFT', 'IN_REVIEW'].includes(state)) {
    const g = gate('story-ready', 'story', scope.id);
    if (isBlocking(g.status)) {
      const driver = drivingCheck(g);
      const repair = repairFor(g, driver, 'complete-story-readiness', `${CLI} check --gate story-ready --scope ${scope.id}`);
      take(action(snapshot, repair.id, {
        reason: driver?.detail || 'the story is not ready for development',
        targetGate: 'story-ready',
        command: repair.command,
        doneWhen: [driver?.fix || 'the failing readiness check is closed', `\`eos check --gate story-ready --scope ${scope.id}\` passes`],
      }));
      blockers.push(...blockersOf(g));
      exitCode = 2;
    } else {
      const to = state === 'DRAFT' ? 'IN_REVIEW' : 'READY_FOR_DEV';
      take(action(snapshot, 'promote-story', {
        reason: `story-ready is ${g.status} for ${scope.id}; record the evidence and promote it to ${to}.`,
        targetGate: 'story-ready',
        command: state === 'DRAFT'
          ? `${CLI} transition --scope story --id ${scope.id} --to IN_REVIEW`
          : `${CLI} check --gate story-ready --scope ${scope.id} && ${CLI} transition --scope story --id ${scope.id} --to READY_FOR_DEV`,
        doneWhen: [`the ledger records ${scope.id} as ${to}`],
      }));
    }
  } else if (state === 'READY_FOR_DEV') {
    take(action(snapshot, 'implement-story', {
      reason: `${scope.id} is READY_FOR_DEV with recorded readiness evidence — implement it exactly to its acceptance criteria.`,
      command: `${CLI} transition --scope story --id ${scope.id} --to IN_DEVELOPMENT`,
      doneWhen: ['every acceptance criterion has an implementation and its designed test', 'lint / typecheck / tests pass locally'],
    }));
  } else if (state === 'IN_DEVELOPMENT') {
    take(action(snapshot, 'verify-story', {
      reason: `${scope.id} is in development — run the declared quality commands and trace each acceptance criterion to a passing test.`,
      targetGate: 'verified',
      command: `${CLI} transition --scope story --id ${scope.id} --to READY_FOR_TEST`,
      doneWhen: ['docs/trace-matrix.md has a passing row for every acceptance criterion', `\`eos check --gate verified --scope ${scope.id}\` passes`],
    }));
  } else if (['READY_FOR_TEST', 'VERIFIED'].includes(state)) {
    const g = gate('verified', 'story', scope.id);
    if (isBlocking(g.status)) {
      const driver = drivingCheck(g);
      const repair = repairFor(g, driver, 'repair-verification', `${CLI} check --gate verified --scope ${scope.id}`);
      take(action(snapshot, repair.id, {
        reason: driver?.detail || 'verification is incomplete',
        targetGate: 'verified',
        command: repair.command,
        doneWhen: [driver?.fix || 'the failing verification check is closed', `\`eos check --gate verified --scope ${scope.id}\` passes`],
      }));
      blockers.push(...blockersOf(g));
      exitCode = 2;
    } else if (g.status === 'PENDING') {
      take(action(snapshot, 'verify-story', {
        reason: `${scope.id} is ${state} but the verified gate has not been executed yet.`,
        targetGate: 'verified',
        command: `${CLI} check --gate verified --scope ${scope.id}`,
        doneWhen: [`\`eos check --gate verified --scope ${scope.id}\` passes and writes evidence`],
      }));
    } else {
      const to = state === 'READY_FOR_TEST' ? 'VERIFIED' : 'MERGED';
      take(action(snapshot, 'promote-story', {
        reason: `verified is ${g.status} for ${scope.id} with fresh evidence; promote it to ${to}.`,
        targetGate: 'verified',
        command: `${CLI} transition --scope story --id ${scope.id} --to ${to}`,
        doneWhen: [`the ledger records ${scope.id} as ${to}`],
      }));
    }
  } else {
    take(action(snapshot, 'start-next-change', {
      reason: story ? `${scope.id} is ${state}; nothing is blocked.` : 'nothing is blocked.',
      command: `${CLI} status`,
      doneWhen: ['the next change is described as a requirement before any code is written'],
    }));
  }

  if (blockers.some((b) => isBlocking(b.status))) exitCode = 2;
  addAlternatives(snapshot, alternatives, recommended, scope);
  return finish();
}

/** Other legal moves, folded away by default (`--all` reveals them). */
function addAlternatives(snapshot, out, recommended, scope) {
  const anyVerified = snapshot.stories.some((s) => ['VERIFIED', 'MERGED'].includes(scopeState(snapshot, 'story', s.id)));
  const candidates = [
    { id: 'record-spike-outcome', reason: 'Exploration is always allowed: run a time-boxed spike instead — it is ungated, but it may not merge product code.', command: `${CLI} status` },
    ...(anyVerified ? [{ id: 'prepare-release', reason: 'At least one story is verified, so a release candidate can be prepared.', command: `${CLI} release-status` }] : []),
    { id: 'start-next-change', reason: 'Park this scope and start a different change.', command: `${CLI} status` },
    { id: 'close-the-loop', reason: 'Feed telemetry and findings back into the spec before picking up new work.', command: `${CLI} status` },
  ];
  for (const c of candidates) {
    if (recommended && c.id === recommended.id) continue;
    out.push(action(snapshot, c.id, { reason: c.reason, command: c.command, doneWhen: ['the alternative path is recorded in the ledger'] }).action);
  }
}
