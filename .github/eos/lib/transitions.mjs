// Transition validator. A state is a claim about evidence, so every transition is checked against
// the machine in `.eos/workflow.json` AND against recorded gate evidence. Nothing here trusts a
// Markdown field, a chat message or an LLM assertion.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listStories } from './story.mjs';
import { recordedGateStatus, evaluateGate } from './gates.mjs';
import { readEvidence, evidenceFreshness } from './evidence.mjs';
import { scopeState } from './state.mjs';

export const PROMOTABLE = new Set(['PASS', 'WAIVED', 'NOT_APPLICABLE']);

export function machineOf(workflow, scopeType) {
  const m = workflow?.stateMachines?.[scopeType];
  if (!m) throw new Error(`unknown scope type "${scopeType}" (expected product | story | release)`);
  return m;
}

export const legalTransitions = (workflow, scopeType, from) =>
  machineOf(workflow, scopeType).transitions.filter((t) => t.from === from);

/** Pure: is this edge in the machine at all? Never touches the ledger or the filesystem. */
export function planTransition({ workflow }, { scopeType, from, to }) {
  const machine = machineOf(workflow, scopeType);
  if (!machine.states.includes(to)) {
    return { legal: false, reason: `unknown state "${to}" for scope ${scopeType} (states: ${machine.states.join(', ')})`, transition: null, legalTargets: legalTransitions(workflow, scopeType, from).map((t) => t.to) };
  }
  const transition = machine.transitions.find((t) => t.from === from && t.to === to) || null;
  if (!transition) {
    const targets = legalTransitions(workflow, scopeType, from).map((t) => t.to);
    return {
      legal: false,
      reason: `illegal transition ${from} → ${to}${targets.length ? `; from ${from} the only legal next state(s) are: ${targets.join(', ')}` : `; ${from} is terminal`}`,
      transition: null,
      legalTargets: targets,
    };
  }
  return { legal: true, reason: '', transition, legalTargets: legalTransitions(workflow, scopeType, from).map((t) => t.to) };
}

/**
 * Walk the product machine forward while each guard holds — the product state is DERIVED.
 * Derivation evaluates gates LIVE (cheap mode) rather than reading recorded evidence: it is a
 * read-only projection, not a promotion, so requiring the developer to run a gate just to see an
 * accurate status would be noise. Promotions (`checkTransition`) still demand recorded evidence.
 */
export function deriveProductState(snapshot) {
  const machine = machineOf(snapshot.workflow, 'product');
  let state = machine.initial;
  const guardsMet = [];
  for (;;) {
    const next = machine.transitions.find((t) => t.from === state && !t.rollback);
    if (!next) break;
    const check = guardResult(snapshot, next, 'product', 'product', { live: true });
    if (!check.ok) return { state, blockedBy: { transition: next, ...check }, guardsMet };
    guardsMet.push(`${next.from} → ${next.to}`);
    state = next.to;
  }
  return { state, blockedBy: null, guardsMet };
}

/** Evaluate one transition guard against recorded evidence (or, for a read-only projection, live). */
export function guardResult(snapshot, transition, scopeType, scopeId, { live = false } = {}) {
  if (transition.requiresFile && !existsSync(join(snapshot.root, transition.requiresFile))) {
    return { ok: false, reason: `${transition.requiresFile} does not exist`, kind: 'file', missing: transition.requiresFile };
  }
  if (transition.requiresStories && !listStories(snapshot.root).length) {
    return { ok: false, reason: 'there is no story under docs/stories/ yet', kind: 'stories' };
  }
  if (transition.requiresGate) {
    const target = scopeType === 'product' ? 'product' : scopeType;
    const g = live
      ? evaluateGate(snapshot, transition.requiresGate, target, scopeId, { mode: 'cheap' })
      : recordedGateStatus(snapshot, transition.requiresGate, target, scopeId);
    if (!PROMOTABLE.has(g.status)) {
      const why = g.detail || (g.checks || []).filter((c) => !PROMOTABLE.has(c.status)).map((c) => c.detail).filter(Boolean)[0] || '';
      return { ok: false, reason: `gate "${transition.requiresGate}" is ${g.status}${why ? ` — ${why}` : ''}`, kind: 'gate', gate: transition.requiresGate, status: g.status };
    }
    if (transition.requiresFresh) {
      const def = snapshot.gates?.gates.find((x) => x.id === transition.requiresGate);
      const stored = readEvidence(snapshot.root, transition.requiresGate, scopeType, scopeId);
      if (stored.evidence) {
        const f = evidenceFreshness(snapshot.root, stored.evidence, { gateDefinition: def });
        if (f.status === 'STALE') {
          return { ok: false, reason: `gate "${transition.requiresGate}" evidence is STALE: ${f.reasons.join('; ')}`, kind: 'stale', gate: transition.requiresGate, status: 'STALE' };
        }
      }
    }
  }
  if (transition.requiresSeparateApprover) {
    const approvals = snapshot.events.filter((e) => e.type === 'approval' && e.scope?.type === scopeType && e.scope?.id === scopeId);
    const requesters = new Set(snapshot.events.filter((e) => e.type === 'transition' && e.scope?.id === scopeId).map((e) => e.actor));
    const valid = approvals.find((a) => !requesters.has(a.actor));
    if (!valid) {
      return { ok: false, reason: 'no approval by someone other than the person who prepared the candidate — record it with `eos approve`', kind: 'approval' };
    }
  }
  if (transition.requiresCandidateCommit) {
    const stored = readEvidence(snapshot.root, transition.requiresGate || 'release-ready', scopeType, scopeId);
    if (!stored.evidence) return { ok: false, reason: 'no release evidence to bind to the candidate commit', kind: 'evidence' };
    if (!snapshot.commit) return { ok: false, reason: 'the current commit is unknown (no git repository), so release evidence cannot be bound to a candidate', kind: 'commit' };
    if (stored.evidence.commit !== snapshot.commit) {
      return { ok: false, reason: `the release evidence was produced at commit ${String(stored.evidence.commit).slice(0, 8)} but HEAD is ${snapshot.commit.slice(0, 8)} — re-verify the candidate`, kind: 'commit' };
    }
  }
  return { ok: true, reason: '' };
}

/**
 * Full validation of a requested transition.
 * @returns {{allowed:boolean, from:string, to:string, reasons:string[], transition:object|null}}
 */
export function checkTransition(snapshot, { scopeType, scopeId, to }) {
  if (scopeType === 'product') {
    const derived = deriveProductState(snapshot);
    return {
      allowed: false,
      from: derived.state,
      to,
      transition: null,
      reasons: [
        `the product state is DERIVED from artifacts and gate evidence, so it cannot be set by hand (currently ${derived.state}).`,
        derived.blockedBy ? `To advance to ${derived.blockedBy.transition.to}: ${derived.blockedBy.reason}.` : 'The product baseline is already at its final state.',
      ],
    };
  }
  const from = scopeState(snapshot, scopeType, scopeId);
  const plan = planTransition(snapshot, { scopeType, from, to });
  if (!plan.legal) return { allowed: false, from, to, transition: null, reasons: [plan.reason] };
  const guard = guardResult(snapshot, plan.transition, scopeType, scopeId);
  if (!guard.ok) return { allowed: false, from, to, transition: plan.transition, reasons: [guard.reason] };
  return { allowed: true, from, to, transition: plan.transition, reasons: [] };
}
