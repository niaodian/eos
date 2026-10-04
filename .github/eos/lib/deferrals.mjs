// Bounded deferral (eos-2.6.0, ADR-023): what a release may carry when an NFR target cannot be
// measured before shipping, and under which conditions that release can still be promoted.
//
// A monthly availability target, a real-network LCP or a real vendor's latency and cost cannot be
// measured on a candidate; G9 (telemetry, RELEASED → OBSERVED) is where they are finally collected.
// EOS therefore lets a Standard-track release be promoted with a DEFERRED `nfr-evidence` — and with
// nothing else deferred — under four guardrails:
//   1. only `nfr-evidence` (and `evidence-trust`, for a non-regulated release) may be DEFERRED;
//      `dependency-audit` and every other deferral still blocks promotion;
//   2. every deferred target has an owner, a trigger and a `dueBy` date in the future; a `dueBy` that
//      has passed turns `nfr-evidence` into FAIL until the target is measured, or deferred again with
//      a new date and a new approval;
//   3. the approval (VERIFIED → APPROVED) is bound to the digest of the deferred list, which
//      `eos approve` prints in full first: a changed list voids the approval;
//   4. Standard track only — regulated and controlled releases are never promoted with a deferral.
// The status stays DEFERRED everywhere it is shown; it is never PASS.
import { createHash } from 'node:crypto';
import { readSummary } from './machine-summary.mjs';
import { canonicalJson } from './canonical.mjs';
import { isSoloProject, STRICT_TRACKS } from '../../hooks/lib/project-config.mjs';

export const PROMOTABLE_DEFERRED_CHECKS = ['nfr-evidence', 'evidence-trust'];

export const todayOf = (now = new Date()) => now.toISOString().slice(0, 10);

/** The deferred NFR targets in the machine summary, in a stable order. */
export function listDeferrals(root) {
  const summary = readSummary(root, 'nfrSummary');
  if (!summary.data) return [];
  return summary.data.targets
    .filter((t) => t.decision === 'DEFER')
    .map((t) => ({ id: t.id, owner: t.owner || '', trigger: t.trigger || '', dueBy: t.dueBy || '' }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The digest an approval is bound to; null when nothing is deferred. */
export const deferralDigest = (list) => (list.length ? createHash('sha256').update(canonicalJson(list)).digest('hex') : null);

/** What stops a deferred list from being promoted: a missing or non-future `dueBy`. */
export function deferralProblems(list, now = new Date()) {
  const today = todayOf(now);
  return list.flatMap((d) => {
    if (!d.dueBy) return [`${d.id} has no dueBy date`];
    if (d.dueBy <= today) return [`${d.id}: dueBy ${d.dueBy} is not in the future`];
    return [];
  });
}

export function onStandardTrack(snapshot) {
  return !STRICT_TRACKS.includes(snapshot.profileName) && snapshot.project?.complianceProfile !== 'regulated';
}

/**
 * May a release-ready gate whose status is DEFERRED be promoted (CANDIDATE → VERIFIED)?
 * @param {object} snapshot
 * @param {{evidence?: {checks?: object[]}, checks?: object[]}} gate the recorded (or live) gate result
 * @returns {{ok: boolean, reason: string}}
 */
export function deferralPromotion(snapshot, gate, now = new Date()) {
  if (!onStandardTrack(snapshot)) {
    return { ok: false, reason: 'a regulated or controlled release is never promoted with a deferred check — measure it, or take the project off that track on purpose' };
  }
  const checks = gate.evidence?.checks || gate.checks || [];
  const blocking = checks.filter((c) => c.status === 'DEFERRED' && !PROMOTABLE_DEFERRED_CHECKS.includes(c.id)).map((c) => c.id);
  if (blocking.length) {
    return { ok: false, reason: `${blocking.join(', ')} is DEFERRED and cannot be promoted: only nfr-evidence (and evidence-trust, for a non-regulated release) may be deferred` };
  }
  const problems = deferralProblems(listDeferrals(snapshot.root), now);
  if (problems.length) {
    return { ok: false, reason: `a deferred NFR target needs an owner, a trigger and a dueBy in the future before the release can be promoted: ${problems.join('; ')}` };
  }
  return { ok: true, reason: '' };
}

/** `Ada (self)`-style approvals are accepted only when this project declared the solo path. */
export const selfApprovalAllowed = (snapshot) => isSoloProject(snapshot.project);

/**
 * What the latest approval of a release accepted: who gave it, with which assurance, and the deferred
 * targets it was bound to. This is the release record `eos status` and `eos next` read after RELEASED.
 * @returns {{actor: string, assurance: string, deferred: object[]}|null}
 */
export function acceptedDeferrals(snapshot, releaseId) {
  const approval = [...snapshot.events].reverse().find((e) => e.type === 'approval' && e.scope?.type === 'release' && e.scope?.id === releaseId);
  if (!approval || !Array.isArray(approval.deferred) || !approval.deferred.length) return null;
  return { actor: approval.actor || 'unknown', assurance: approval.assurance || 'independent', deferred: approval.deferred };
}
