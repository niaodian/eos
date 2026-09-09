// Handoff context packages — the minimum an agent needs to continue, and nothing more.
// A package is a CACHE: it records the commit and a hash per file so `--verify` can refuse to let
// an agent act on a stale picture instead of silently working from one.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { posix } from './registry.mjs';
import { sha256File } from './evidence.mjs';
import { scopeState, changeTypeOf, ARTIFACTS } from './state.mjs';
import { route } from './router.mjs';

export const HANDOFF_DIR = '.eos/handoffs';
export const handoffPath = (scopeId) => `${HANDOFF_DIR}/${String(scopeId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

const NON_GOALS = [
  'Do not widen the scope beyond the acceptance criteria listed here.',
  'Do not mark any gate as passed — only `eos check` may record a result.',
  'Do not edit .eos/ledger/events.jsonl, .eos/evidence/ or any waiver.',
];

export function buildHandoff(snapshot, { scopeType, scopeId, now = new Date() }) {
  const story = scopeType === 'story' ? snapshot.stories.find((s) => s.id === scopeId) || null : null;
  const decision = route(snapshot, { now });
  const a = decision.recommendedAction;

  const files = [];
  const add = (rel) => { if (rel && existsSync(join(snapshot.root, rel))) files.push({ path: posix(rel), sha256: sha256File(snapshot.root, rel) }); };
  if (story) add(story.path);
  add(ARTIFACTS.prd);
  if (scopeType === 'release' || !story) { add(ARTIFACTS.architecture); add(ARTIFACTS.traceMatrix); }
  if (snapshot.agentic) add(ARTIFACTS.evalPlan);

  const decisions = [];
  const adrDir = join(snapshot.root, 'docs/adr');
  if (existsSync(adrDir)) {
    try {
      for (const f of readdirSync(adrDir).filter((n) => n.endsWith('.md')).sort()) decisions.push(`docs/adr/${f}`);
    } catch { /* optional */ }
  }

  return {
    schemaVersion: 1,
    scope: { type: scopeType, id: String(scopeId) },
    state: scopeType === 'product' ? decision.current.state : scopeState(snapshot, scopeType, scopeId),
    changeType: changeTypeOf(snapshot, scopeType, scopeId),
    goal: a ? `${a.title}: ${a.reason}` : 'No action is currently recommended.',
    acceptanceCriteria: story ? story.acs.map((c) => `${c.id} ${c.statement}`.trim()) : [],
    approvedDecisions: decisions,
    files,
    blockers: decision.blockers.map((b) => `${b.gate}/${b.check}: ${b.detail}`),
    nonGoals: NON_GOALS,
    recommended: { agent: a?.copilotAgent ?? null, prompt: a?.copilotPrompt ?? null, skills: a?.skills || [] },
    doneWhen: a?.doneWhen?.length ? a.doneWhen : ['`eos next` recommends a different action'],
    returnCommand: 'node .github/eos/eos.mjs next',
    commit: snapshot.commit,
    generatedAt: now.toISOString(),
  };
}

export function writeHandoff(root, pkg) {
  const rel = handoffPath(pkg.scope.id);
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return rel;
}

export function readHandoff(root, scopeId) {
  const rel = handoffPath(scopeId);
  if (!existsSync(join(root, rel))) return { present: false, pkg: null, rel };
  try { return { present: true, pkg: JSON.parse(readFileSync(join(root, rel), 'utf8')), rel }; } catch (e) {
    return { present: true, pkg: null, rel, error: `${rel}: invalid JSON (${e.message})` };
  }
}

/** @returns {{status:'FRESH'|'STALE', reasons:string[]}} */
export function verifyHandoff(snapshot, pkg) {
  const reasons = [];
  if (!pkg) return { status: 'STALE', reasons: ['no handoff package'] };
  if (pkg.commit && snapshot.commit && pkg.commit !== snapshot.commit) {
    reasons.push(`bound to commit ${String(pkg.commit).slice(0, 8)} but HEAD is ${snapshot.commit.slice(0, 8)}`);
  }
  for (const f of pkg.files || []) {
    const now = sha256File(snapshot.root, f.path);
    if (now !== f.sha256) reasons.push(now === null ? `file disappeared: ${f.path}` : `file changed: ${f.path}`);
  }
  return { status: reasons.length ? 'STALE' : 'FRESH', reasons };
}
