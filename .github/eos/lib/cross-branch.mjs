// "Someone else is moving this story too" — said before the merge, not discovered at it.
//
// The merge policy (ledger --resolve) settles two branches that moved the same story, but only
// after the fact: the conflict appears at merge time, and the story is reset to the last state both
// branches shared, so whatever one side verified has to be verified again. This module raises the
// same fact while there is still time to coordinate: when the base branch has ledger entries for a
// story or release that this branch has also touched (or is focused on), since the point where the
// branch left it.
//
// Local refs only. EOS never fetches, so the answer is as fresh as the last `git fetch`, and the
// output names the ref it compared with rather than implying it looked at the remote.
import { readEvents, LEDGER_PATH } from './ledger.mjs';
import { resolveBaseRef, fileAt } from './git-base.mjs';

const SCOPES = new Set(['story', 'release']);
const keyOf = (scope) => (scope && SCOPES.has(scope.type) ? `${scope.type}/${scope.id}` : null);

/** Ledger events at a revision. Unparseable lines (a committed conflict) are skipped, never fatal. */
function eventsAt(root, rev) {
  const raw = fileAt(root, rev, LEDGER_PATH);
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* not an event */ }
  }
  return out;
}

const summarise = (e) => {
  const what = e.type === 'transition' || e.type === 'reconcile' ? `${e.type} ${e.from ?? '?'} → ${e.to}`
    : e.type === 'gate' ? `${e.gate} ${e.status}` : `${e.type}${e.status ? ` ${e.status}` : ''}`;
  return { seq: e.seq, ts: e.ts, actor: e.actor || 'unknown', what };
};

/**
 * Stories and releases that moved on the base branch AND here since this branch left it.
 *
 * @param {string} root
 * @param {{focus?: {type:string,id:string}[]}} options  scopes worth warning about even if this
 *        branch has not recorded anything for them yet (the story you are working on)
 * @returns {{checked:boolean, base:object|null, reason?:string, overlaps:{scope:object, theirs:object[], ours:number}[]}}
 */
export function crossBranchActivity(root, { focus = [] } = {}) {
  const base = resolveBaseRef(root);
  if (!base) return { checked: false, base: null, reason: 'no base branch found in local refs', overlaps: [] };
  if (!base.mergeBase) return { checked: false, base, reason: `${base.ref} shares no history with this branch`, overlaps: [] };
  if (base.mergeBase === base.commit) return { checked: true, base, overlaps: [] }; // the base has not moved

  const shared = new Set(eventsAt(root, base.mergeBase).map((e) => e.hash));
  const theirs = eventsAt(root, base.commit).filter((e) => !shared.has(e.hash));
  const ours = readEvents(root).events.filter((e) => !shared.has(e.hash));

  const mine = new Map();
  for (const e of ours) { const k = keyOf(e.scope); if (k) mine.set(k, (mine.get(k) || 0) + 1); }
  for (const s of focus) { const k = keyOf(s); if (k && !mine.has(k)) mine.set(k, 0); }

  const byScope = new Map();
  for (const e of theirs) {
    const k = keyOf(e.scope);
    if (!k || !mine.has(k)) continue;
    if (!byScope.has(k)) byScope.set(k, { scope: { type: e.scope.type, id: e.scope.id }, theirs: [], ours: mine.get(k) });
    byScope.get(k).theirs.push(summarise(e));
  }
  return { checked: true, base, overlaps: [...byScope.values()] };
}

/** Human lines for status / next / verify. Empty when there is nothing to say. */
export function crossBranchLines(activity) {
  if (!activity?.overlaps?.length) return [];
  const lines = [`Also changing on ${activity.base.ref} (compared with your local copy — \`git fetch\` for a fresher view)`];
  for (const o of activity.overlaps) {
    const last = o.theirs.at(-1);
    lines.push(`  ${o.scope.id.padEnd(14)} ${o.theirs.length} entr${o.theirs.length === 1 ? 'y' : 'ies'} since you branched — latest: ${last.what} by ${last.actor}`);
  }
  lines.push('  Merging will conflict on the ledger; `eos ledger --resolve --write` reconciles it, resetting each story both',
    '  sides moved to the state they last shared. Coordinating now is cheaper than re-verifying later.', '');
  return lines;
}
