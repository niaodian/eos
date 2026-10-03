// The policy lock — no gate gets weaker without someone saying so, and someone else agreeing.
//
// THE GAP THIS CLOSES (#9). One edit to .eos/workflow.json — `"verified": "required"` becoming
// `"not_applicable"` — switches a gate off for every story of that kind. Recorded evidence goes
// STALE, because governance files invalidate it by design, but re-running under the weaker rule
// then PASSES. Nothing in EOS objected: the tier-ordering test only checks that the shipped tiers
// stay in order, so a weaker `standard-product` sails through. The same is true of
// .eos/project.json: switching projectType to "config-only" stops the product tests running at all.
//
// THE MECHANISM, in three parts:
//   1. A SNAPSHOT of every policy-relevant field — gate definitions, profiles, state machines, and
//      the project declaration. Prose (titles, summaries, fix text) is deliberately excluded: a
//      rewording is not a policy change and must not demand sign-off.
//   2. A DIFF that classifies every change between two snapshots. WEAKENING and REVIEW changes need
//      acknowledgement; STRENGTHENING and INFO do not. REVIEW means "EOS cannot tell whether this is
//      weaker" (an evaluator swapped, a new transition path) — unknown is not treated as safe.
//   3. A LOCK (.eos/policy.lock.json) recording the digest of the policy in force plus every
//      acknowledgement. A policy edit without regenerating the lock fails the check; a weakening
//      needs a reason and an approver who is not the requester — the same rule waivers already use.
import { canonicalJson } from './canonical.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic.mjs';
import { loadSchema, validate } from './schema.mjs';
import { resolveBaseRef, fileAt, gitOut } from './git-base.mjs';
import { schemaChanges } from './schema-diff.mjs';
import { verifyDocument, loadPublicKey } from './signing.mjs';

export const POLICY_LOCK_PATH = '.eos/policy.lock.json';
export const POLICY_FILES = { gates: '.eos/gates.json', workflow: '.eos/workflow.json', project: '.eos/project.json' };

const POLICY_RANK = { not_applicable: 0, waivable: 1, required: 2 };
const EVIDENCE_RANK = { local: 0, ci: 1, attested: 2 };
const rankOf = (policy) => POLICY_RANK[policy ?? 'not_applicable'] ?? 0;

/** Stable serialization, so the digest depends on content and never on key order. */
const canonical = canonicalJson;

/**
 * Everything that decides how strictly work is verified, and nothing that merely describes it.
 * A pure function of parsed files, so it can be computed from the working tree or from any ref.
 */
export function policySnapshot({ gates, workflow, project }) {
  const gateMap = {};
  for (const def of gates?.gates || []) {
    gateMap[def.id] = {
      scope: def.scope ?? null,
      version: def.version ?? null,
      waivable: def.waivable !== false,
      bindsProductTree: !!def.bindsProductTree,
      checks: Object.fromEntries((def.checks || []).map((c) => [c.id, c.evaluator ?? null])),
    };
  }
  const profiles = {};
  for (const [name, p] of Object.entries(workflow?.profiles || {})) {
    const changeTypes = {};
    for (const [ct, d] of Object.entries(p.changeTypes || {})) {
      changeTypes[ct] = {
        scope: d.scope ?? null,
        mergeable: d.mergeable !== false,
        requiresClassificationReason: !!d.requiresClassificationReason,
        gates: { ...(d.gates || {}) },
      };
    }
    profiles[name] = { defaultChangeType: p.defaultChangeType ?? null, requiresCompliance: !!p.requiresCompliance, changeTypes };
  }
  const stateMachines = {};
  for (const [name, m] of Object.entries(workflow?.stateMachines || {})) {
    stateMachines[name] = {
      initial: m.initial ?? null,
      transitions: Object.fromEntries((m.transitions || []).map((t) => [`${t.from}->${t.to}`, {
        requiresGate: t.requiresGate ?? null,
        requiresSeparateApprover: !!t.requiresSeparateApprover,
      }])),
    };
  }
  let proj = null;
  if (project) {
    const paradigms = [...(project.productParadigms || [])].sort();
    proj = {
      projectType: project.projectType ?? null,
      workflowProfile: project.workflowProfile || workflow?.defaultProfile || 'standard-product',
      complianceProfile: project.complianceProfile || 'none',
      evidencePolicy: project.evidencePolicy || 'local',
      productParadigms: paradigms,
      // Effective, not literal: an absent evalRequired on an agentic product still requires evals.
      evalRequired: project.evalRequired === true || (project.evalRequired === undefined && paradigms.includes('agentic')),
      evalWaiver: !!project.evalWaiver,
      commands: Object.fromEntries(Object.entries(project.commands || {}).map(([k, v]) => [k, canonical(v)])),
      // Which organization baseline the project answers to (ADR-013): leaving it must be visible.
      upstream: project.policyUpstream?.source || null,
      // Where the verified gate reads test results from (ADR-016). Present only when declared, so
      // every project that never declared it keeps the digest it was locked with.
      ...(project.evidence !== undefined ? { evidence: canonical(project.evidence) } : {}),
    };
  }
  return { gates: gateMap, workflow: { defaultProfile: workflow?.defaultProfile ?? null, profiles, stateMachines }, project: proj };
}

export const policyDigest = (snapshot) => createHash('sha256').update(canonical(snapshot)).digest('hex');

// ------------------------------------------------------------------------------------------ diff

/** Compare two profiles; used for a profile edited in place AND for a project switching profiles. */
function diffProfile(pa, pb, label, prefix, add) {
  // Dropping the flag lets the profile be selected without the compliance boundary — exactly the
  // gap #12 closed — so it is held to the same sign-off as switching a gate off.
  if (pa.requiresCompliance && !pb.requiresCompliance) add('WEAKENING', `${prefix}:requires-compliance-dropped`, `${label} no longer requires complianceProfile "regulated"`);
  if (!pa.requiresCompliance && pb.requiresCompliance) add('STRENGTHENING', `${prefix}:requires-compliance`, `${label} now requires complianceProfile "regulated"`);
  if (pa.defaultChangeType !== pb.defaultChangeType) {
    const before = pa.changeTypes[pa.defaultChangeType]?.gates || {};
    const after = pb.changeTypes[pb.defaultChangeType]?.gates || {};
    const weaker = Object.keys({ ...before, ...after }).filter((g) => rankOf(after[g]) < rankOf(before[g]));
    add(weaker.length ? 'WEAKENING' : 'INFO', `${prefix}:default-change-type:${pa.defaultChangeType}->${pb.defaultChangeType}`,
      `${label}: unclassified work now defaults to ${pb.defaultChangeType}${weaker.length ? `, which applies ${weaker.join(', ')} less strictly` : ''}`);
  }
  for (const [ct, ca] of Object.entries(pa.changeTypes)) {
    const cb = pb.changeTypes[ct];
    if (!cb) {
      // Unknown change types fall back to "required", so removing one can only make work stricter.
      add('INFO', `${prefix}:change-type-removed:${ct}`, `${label}: change type ${ct} removed (its work now falls back to "required")`);
      continue;
    }
    for (const gate of Object.keys({ ...ca.gates, ...cb.gates })) {
      const ra = rankOf(ca.gates[gate]);
      const rb = rankOf(cb.gates[gate]);
      const from = ca.gates[gate] ?? 'not_applicable';
      const to = cb.gates[gate] ?? 'not_applicable';
      if (rb < ra) add('WEAKENING', `${prefix}:${ct}/${gate}:${from}->${to}`, `${label}: ${gate} for ${ct} work went from ${from} to ${to}`);
      else if (rb > ra) add('STRENGTHENING', `${prefix}:${ct}/${gate}:${from}->${to}`, `${label}: ${gate} for ${ct} work went from ${from} to ${to}`);
    }
    if (!ca.mergeable && cb.mergeable) add('WEAKENING', `${prefix}:${ct}/mergeable`, `${label}: ${ct} work can now be merged`);
    if (ca.requiresClassificationReason && !cb.requiresClassificationReason) {
      add('WEAKENING', `${prefix}:${ct}/classification-reason`, `${label}: classifying work as ${ct} no longer needs a recorded reason`);
    }
    if (ca.scope !== cb.scope) add('REVIEW', `${prefix}:${ct}/scope:${ca.scope}->${cb.scope}`, `${label}: ${ct} now applies to ${cb.scope}`);
  }
  // A new change type is an escape hatch if work classified under it skips what the default requires.
  const baseline = pb.changeTypes[pb.defaultChangeType]?.gates || {};
  for (const [ct, cb] of Object.entries(pb.changeTypes)) {
    if (pa.changeTypes[ct]) continue;
    const weaker = Object.keys({ ...baseline, ...cb.gates }).filter((g) => rankOf(cb.gates[g]) < rankOf(baseline[g]));
    add(weaker.length ? 'WEAKENING' : 'INFO', `${prefix}:change-type-added:${ct}`,
      weaker.length
        ? `${label}: new change type ${ct} skips ${weaker.join(', ')} that the default (${pb.defaultChangeType}) requires — work classified as ${ct} escapes them`
        : `${label}: new change type ${ct}, no weaker than ${pb.defaultChangeType}`);
  }
}

/**
 * Every change between two snapshots, classified.
 * @returns {{kind:'WEAKENING'|'REVIEW'|'STRENGTHENING'|'INFO', id:string, detail:string, requiresAck:boolean}[]}
 */
export function diffPolicy(a, b) {
  const changes = [];
  const add = (kind, id, detail) => changes.push({ kind, id, detail, requiresAck: kind === 'WEAKENING' || kind === 'REVIEW' });

  for (const [id, ga] of Object.entries(a.gates)) {
    const gb = b.gates[id];
    if (!gb) { add('WEAKENING', `gate-removed:${id}`, `gate ${id} was removed — nothing checks what it checked`); continue; }
    for (const [cid, ev] of Object.entries(ga.checks)) {
      if (!(cid in gb.checks)) add('WEAKENING', `check-removed:${id}/${cid}`, `${id} no longer runs check ${cid}`);
      else if (gb.checks[cid] !== ev) add('REVIEW', `evaluator-changed:${id}/${cid}:${ev}->${gb.checks[cid]}`, `${id}/${cid} is now decided by ${gb.checks[cid]} instead of ${ev}`);
    }
    for (const cid of Object.keys(gb.checks)) if (!(cid in ga.checks)) add('STRENGTHENING', `check-added:${id}/${cid}`, `${id} gained check ${cid}`);
    if (!ga.waivable && gb.waivable) add('WEAKENING', `gate-waivable:${id}`, `${id} can now be waived`);
    if (ga.waivable && !gb.waivable) add('STRENGTHENING', `gate-not-waivable:${id}`, `${id} can no longer be waived`);
    if (ga.bindsProductTree && !gb.bindsProductTree) {
      add('WEAKENING', `unbound-from-product-tree:${id}`, `${id} evidence is no longer tied to the code it verified — a rewrite after verification would stay green`);
    }
    if (ga.scope !== gb.scope) add('REVIEW', `gate-scope:${id}:${ga.scope}->${gb.scope}`, `${id} now applies to ${gb.scope}`);
    if (ga.version !== gb.version) add('INFO', `gate-version:${id}:${ga.version}->${gb.version}`, `${id} version changed — its recorded evidence becomes STALE`);
  }
  for (const id of Object.keys(b.gates)) if (!a.gates[id]) add('STRENGTHENING', `gate-added:${id}`, `new gate ${id}`);

  for (const [name, pa] of Object.entries(a.workflow.profiles)) {
    const pb = b.workflow.profiles[name];
    if (!pb) { add('REVIEW', `profile-removed:${name}`, `profile ${name} was removed — projects selecting it now fail closed`); continue; }
    diffProfile(pa, pb, `profile ${name}`, `profile:${name}`, add);
  }
  for (const name of Object.keys(b.workflow.profiles)) if (!a.workflow.profiles[name]) add('INFO', `profile-added:${name}`, `new profile ${name}`);
  if (a.workflow.defaultProfile !== b.workflow.defaultProfile) {
    add('REVIEW', `default-profile:${a.workflow.defaultProfile}->${b.workflow.defaultProfile}`, `projects that select no profile now get ${b.workflow.defaultProfile}`);
  }

  for (const [name, ma] of Object.entries(a.workflow.stateMachines)) {
    const mb = b.workflow.stateMachines[name];
    if (!mb) { add('REVIEW', `state-machine-removed:${name}`, `state machine ${name} was removed`); continue; }
    if (ma.initial !== mb.initial) add('REVIEW', `state-machine:${name}/initial:${ma.initial}->${mb.initial}`, `${name} now starts in ${mb.initial}`);
    for (const [edge, ta] of Object.entries(ma.transitions)) {
      const tb = mb.transitions[edge];
      if (!tb) { add('STRENGTHENING', `transition-removed:${name}:${edge}`, `${name}: ${edge} is no longer allowed`); continue; }
      if (ta.requiresGate && !tb.requiresGate) add('WEAKENING', `transition-ungated:${name}:${edge}`, `${name}: ${edge} no longer requires ${ta.requiresGate}`);
      else if (ta.requiresGate !== tb.requiresGate) add('REVIEW', `transition-gate:${name}:${edge}:${ta.requiresGate}->${tb.requiresGate}`, `${name}: ${edge} is now guarded by ${tb.requiresGate} instead of ${ta.requiresGate}`);
      if (ta.requiresSeparateApprover && !tb.requiresSeparateApprover) {
        add('WEAKENING', `transition-self-approval:${name}:${edge}`, `${name}: ${edge} no longer needs a second person`);
      }
    }
    for (const edge of Object.keys(mb.transitions)) {
      if (!ma.transitions[edge]) add('REVIEW', `transition-added:${name}:${edge}`, `${name}: new path ${edge}${mb.transitions[edge].requiresGate ? ` (guarded by ${mb.transitions[edge].requiresGate})` : ' — unguarded'}`);
    }
  }

  const pa = a.project;
  const pb = b.project;
  if (pa && pb) {
    if (['application', 'library'].includes(pa.projectType) && pb.projectType === 'config-only') {
      add('WEAKENING', `project:projectType:${pa.projectType}->config-only`, 'the product-quality gate stops running the project\'s tests at all');
    } else if (pa.projectType !== pb.projectType) {
      add('INFO', `project:projectType:${pa.projectType}->${pb.projectType}`, `project declared as ${pb.projectType}`);
    }
    // Deleting two lines of project.json must not quietly take a project out from under its
    // organization's floor: leaving the baseline, or pointing at another one, is a weakening.
    const ua = pa.upstream ?? null;
    const ub = pb.upstream ?? null;
    if (ua && !ub) add('WEAKENING', `project:upstream:${ua}->none`, `the project no longer follows the organization baseline ${ua}`);
    else if (ua && ub && ua !== ub) add('WEAKENING', `project:upstream:${ua}->${ub}`, `the project now follows ${ub} instead of the organization baseline ${ua} — it may be weaker`);
    else if (!ua && ub) add('STRENGTHENING', `project:upstream:none->${ub}`, `the project now follows the organization baseline ${ub}`);
    if (pa.workflowProfile !== pb.workflowProfile) {
      const before = a.workflow.profiles[pa.workflowProfile];
      const after = b.workflow.profiles[pb.workflowProfile];
      if (!before || !after) {
        add('REVIEW', `project:workflowProfile:${pa.workflowProfile}->${pb.workflowProfile}`, 'the project switched to a profile that cannot be compared');
      } else {
        const inner = [];
        diffProfile(before, after, `switching to ${pb.workflowProfile}`, 'x', (kind, id, detail) => inner.push({ kind, detail }));
        const weaker = inner.filter((c) => c.kind === 'WEAKENING');
        add(weaker.length ? 'WEAKENING' : 'INFO', `project:workflowProfile:${pa.workflowProfile}->${pb.workflowProfile}`,
          weaker.length ? `the project moved to a weaker profile: ${weaker.slice(0, 3).map((c) => c.detail).join('; ')}${weaker.length > 3 ? ` (+${weaker.length - 3} more)` : ''}` : `the project moved to ${pb.workflowProfile}`);
      }
    }
    if (pa.complianceProfile === 'regulated' && pb.complianceProfile !== 'regulated') {
      add('WEAKENING', 'project:complianceProfile:regulated->none', 'the compliance boundary is switched off');
    }
    if ((EVIDENCE_RANK[pb.evidencePolicy] ?? 0) < (EVIDENCE_RANK[pa.evidencePolicy] ?? 0)) {
      add('WEAKENING', `project:evidencePolicy:${pa.evidencePolicy}->${pb.evidencePolicy}`, `release evidence may now be ${pb.evidencePolicy} instead of ${pa.evidencePolicy}`);
    }
    if (pa.productParadigms.includes('agentic') && !pb.productParadigms.includes('agentic')) {
      add('WEAKENING', 'project:paradigm-agentic-removed', 'the agentic paradigm was removed — prompts, datasets and model config stop counting as product');
    }
    if (pa.evalRequired && !pb.evalRequired) add('WEAKENING', 'project:evalRequired:true->false', 'evals are no longer required (G-EVAL switched off)');
    if (!pa.evalWaiver && pb.evalWaiver) add('WEAKENING', 'project:evalWaiver-added', 'an eval waiver was added');
    for (const [step, cmd] of Object.entries(pa.commands)) {
      if (!(step in pb.commands)) add('WEAKENING', `project:command-removed:${step}`, `the ${step} command no longer runs`);
      else if (pb.commands[step] !== cmd) add('REVIEW', `project:command-changed:${step}`, `the ${step} command changed — EOS cannot tell whether the new one checks as much`);
    }
    for (const step of Object.keys(pb.commands)) if (!(step in pa.commands)) add('STRENGTHENING', `project:command-added:${step}`, `the ${step} command now runs`);
    // Which reports the verified gate trusts as the run's results. Pointing it elsewhere, or back at a
    // hand-maintained test-run.json, changes what "the tests passed" rests on — EOS cannot rank that.
    if ((pa.evidence ?? null) !== (pb.evidence ?? null)) {
      add('REVIEW', 'project:evidence-changed', pb.evidence === undefined
        ? 'the verified gate no longer derives test-run.json from JUnit reports (evidence removed)'
        : `the verified gate now reads its test results from ${pb.evidence}${pa.evidence === undefined ? '' : ` instead of ${pa.evidence}`}`);
    }
  }
  return changes;
}

// ------------------------------------------------------------------------------------------ files

function parseOrNull(text, label, errors) {
  if (text === null || text === undefined) return null;
  try { return JSON.parse(text); } catch (e) { errors.push(`${label}: invalid JSON (${e.message})`); return null; }
}

/** The policy files in the working tree. */
export function readPolicy(root) {
  const errors = [];
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null);
  const files = Object.fromEntries(Object.entries(POLICY_FILES).map(([k, rel]) => [k, parseOrNull(read(rel), rel, errors)]));
  return { files, errors };
}

/** The policy files as they were at a revision. A file absent there reads as null, not an error. */
export function readPolicyAt(root, rev) {
  const errors = [];
  const files = Object.fromEntries(Object.entries(POLICY_FILES).map(([k, rel]) => [k, parseOrNull(fileAt(root, rev, rel), `${rev}:${rel}`, errors)]));
  return { files, errors };
}

export function readLock(root) {
  const full = join(root, POLICY_LOCK_PATH);
  if (!existsSync(full)) return { present: false, lock: null, errors: [] };
  let lock;
  try { lock = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, lock: null, errors: [`${POLICY_LOCK_PATH}: invalid JSON (${e.message})`] };
  }
  const { schema, error } = loadSchema(root, 'policy-lock.schema.json');
  if (!schema) return { present: true, lock: null, errors: [`${error} — ${POLICY_LOCK_PATH} cannot be validated`] };
  const v = validate(schema, lock, { label: POLICY_LOCK_PATH });
  return { present: true, lock: v.valid ? lock : null, errors: v.errors };
}

/**
 * What to compare against. An explicit ref wins (CI passes the PR base); otherwise the point this
 * branch left its base; otherwise HEAD, so uncommitted edits are still caught.
 */
export function resolvePolicyBase(root, against = null) {
  if (against) return { rev: against, label: against };
  const base = resolveBaseRef(root);
  if (base?.mergeBase) return { rev: base.mergeBase, label: `merge-base with ${base.ref}` };
  if (gitOut(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])) return { rev: 'HEAD', label: 'HEAD (uncommitted changes only)' };
  return null;
}

/** Changes between a base revision and the working tree: policy AND schema breaking changes. */
export function policyChanges(root, against = null) {
  const current = readPolicy(root);
  const base = resolvePolicyBase(root, against);
  if (!base) return { base: null, changes: [], errors: current.errors, current: policySnapshot(current.files) };
  const before = readPolicyAt(root, base.rev);
  const a = policySnapshot(before.files);
  const b = policySnapshot(current.files);
  return { base, changes: [...diffPolicy(a, b), ...schemaChanges(root, base.rev)], errors: [...current.errors, ...before.errors], current: b };
}

const sameActor = (x, y) => String(x || '').trim().toLowerCase() === String(y || '').trim().toLowerCase();

/** Is this acknowledgement good enough to stand behind a weakening? */
export function acknowledgementProblem(ack) {
  if (!ack) return 'not acknowledged';
  if (!ack.reason || ack.reason.trim().length < 20) return 'acknowledged without a real reason (20+ characters)';
  if (!ack.approver || !ack.approver.trim()) return `awaiting an approver — requested by ${ack.requestedBy}; EOS records approvals, it never grants them`;
  if (sameActor(ack.approver, ack.requestedBy)) return 'the approver is the requester — weakening a control needs a second person';
  return null;
}

/**
 * Has the policy moved since .eos/policy.lock.json was written, and what would recording it take?
 *
 * `policy check` answers this in CI, after the push. The developer who just switched a project
 * from Regulated to Standard should hear it where they work: `eos next` and `eos status` call
 * this. One digest in the common case; git is consulted only when the digest differs.
 *
 * @returns {null | {lockDigest:string, currentDigest:string, base:string|null, weakenings:string[], otherChanges:number}}
 */
export function policyDrift(root) {
  const { present, lock } = readLock(root);
  if (!present || !lock?.policyDigest) return null;
  const current = readPolicy(root);
  if (current.errors.length) return null;
  const currentDigest = policyDigest(policySnapshot(current.files));
  if (currentDigest === lock.policyDigest) return null;
  const { changes, base } = policyChanges(root);
  const covered = new Set((lock.acknowledged || []).filter((a) => !acknowledgementProblem(a)).map((a) => a.change));
  const weakenings = changes.filter((c) => c.requiresAck && !covered.has(c.id)).map((c) => c.id);
  return { lockDigest: lock.policyDigest, currentDigest, base: base?.label || null, weakenings, otherChanges: changes.length - weakenings.length };
}

/**
 * The CI check.
 * @returns {{ok:boolean, problems:string[], notes:string[], changes:object[], base:object|null}}
 */
export function checkPolicy(root, { against = null } = {}) {
  const problems = [];
  const notes = [];
  const { base, changes, errors, current } = policyChanges(root, against);
  problems.push(...errors);
  const { present, lock, errors: lockErrors } = readLock(root);
  problems.push(...lockErrors);
  const needing = changes.filter((c) => c.requiresAck);

  if (!present) {
    if (needing.length) problems.push(`${needing.length} policy change(s) need acknowledgement but there is no ${POLICY_LOCK_PATH} — run \`eos policy lock --write --reason "<why>"\``);
    else notes.push(`no ${POLICY_LOCK_PATH} yet — nothing needs acknowledging; \`eos policy lock --write\` pins the current policy`);
  } else if (lock) {
    const digest = policyDigest(current);
    if (lock.policyDigest !== digest) {
      problems.push(`the policy changed since ${POLICY_LOCK_PATH} was written — run \`eos policy lock\` to see what changed, then \`--write\` to record it`);
    }
    for (const c of needing) {
      const ack = (lock.acknowledged || []).find((a) => a.change === c.id);
      const problem = acknowledgementProblem(ack);
      if (problem) problems.push(`${c.kind} ${c.id} — ${c.detail}: ${problem}`);
    }
  }
  if (!base) notes.push('no git history to compare against — only the lock digest was checked');

  // 2.0: the organization baseline, if the project follows one — checked against the VENDORED copy,
  // so this stays offline. `eos policy sync` is the only thing that fetches. (ADR-013)
  const up = upstreamChanges(root);
  if (up.declared) {
    if (!up.vendored.present) {
      problems.push(`.eos/project.json follows ${up.declared.source}, but ${UPSTREAM_PATH} is missing — run \`eos policy sync\``);
    } else if (!up.vendored.bundle) {
      problems.push(...up.vendored.errors);
    } else {
      const label = `${up.vendored.bundle.name}@${up.vendored.bundle.version}`;
      if (lock && lock.upstream?.digest !== up.digest) {
        problems.push(`${UPSTREAM_PATH} does not match the baseline pinned in ${POLICY_LOCK_PATH} — run \`eos policy sync\`, then \`eos policy lock --write\``);
      }
      // A pinned digest proves the copy did not change since the lock — not that it is what the
      // organization signed. With a declared key, that is checked here too, offline, every time.
      const signature = vendoredSignatureProblem(root, up.declared, up.vendored.bundle);
      if (signature) problems.push(signature);
      for (const c of up.changes.filter((x) => x.requiresAck)) {
        const ack = (lock?.acknowledged || []).find((a) => a.change === c.id);
        const problem = acknowledgementProblem(ack);
        if (problem) problems.push(`${c.kind} ${c.id} — weaker than the organization baseline ${label}: ${c.detail}: ${problem}`);
      }
      notes.push(`follows the organization baseline ${label} (${up.changes.filter((x) => x.requiresAck).length} acknowledged deviation(s) checked)`);
    }
  }
  return { ok: problems.length === 0, problems, notes, changes, base, upstream: up.declared ? { source: up.declared.source, digest: up.digest || null, changes: up.changes } : null };
}

/**
 * Plan (and optionally write) a new lock. Existing acknowledgements are kept — they are the record
 * of who agreed to what — and every newly needed one is drafted with an EMPTY approver.
 */
export function planLock(root, { against = null, reason = null, actor = null, write = false, now = new Date() } = {}) {
  const { base, changes, errors, current } = policyChanges(root, against);
  const existing = readLock(root).lock;
  const acknowledged = [...(existing?.acknowledged || [])];
  const drafted = [];
  const up = upstreamChanges(root);
  const lockable = [...changes, ...(up.changes || [])];
  for (const c of lockable.filter((x) => x.requiresAck)) {
    if (acknowledged.some((a) => a.change === c.id)) continue;
    const entry = { change: c.id, kind: c.kind, detail: c.detail, reason: reason || '', requestedBy: actor || 'unknown', approver: '', recordedAt: now.toISOString().slice(0, 10) };
    acknowledged.push(entry);
    drafted.push(entry);
  }
  // The pin is what `policy sync` fetched. Re-locking must never move it to whatever the vendored file
  // says now — that would launder an edited baseline. Only a first lock (sync found no lock to write
  // into) pins the vendored copy; a project that stops following a baseline drops its pin.
  const firstPin = up.vendored?.bundle && !existing?.upstream
    ? { source: up.declared.source, name: up.vendored.bundle.name, version: up.vendored.bundle.version, digest: up.digest, syncedAt: now.toISOString(), ...(up.vendored.bundle.signature ? { keyId: up.vendored.bundle.signature.keyId } : {}) }
    : null;
  const pinned = up.declared ? (existing?.upstream || firstPin) : null;
  const lock = { $schema: './schemas/policy-lock.schema.json', schemaVersion: 1, policyDigest: policyDigest(current), acknowledged, ...(pinned ? { upstream: pinned } : {}) };
  const refused = drafted.length && (!reason || reason.trim().length < 20)
    ? `${drafted.length} change(s) need acknowledgement: pass --reason "<why, 20+ characters>"`
    : null;
  if (write && !refused && !errors.length) writeFileAtomic(join(root, POLICY_LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`);
  return { base, changes, errors, lock, drafted, refused, written: write && !refused && !errors.length };
}

// --------------------------------------------------------------------------------- organization baseline
// An organization publishes the minimum policy its projects follow: gates and workflow profiles,
// never a project's own declaration (what one project is says nothing about another). A project
// declares it as `policyUpstream`; `eos policy sync` vendors it into UPSTREAM_PATH; `policy check`
// compares this project against the vendored copy, offline, with the same WEAKENING rules as a
// change between commits. A deviation is allowed only with a reason and a second person's approval,
// recorded in this project's lock. (ADR-013)
export const UPSTREAM_PATH = '.eos/policy.upstream.json';

/** The baseline `eos policy export` writes, from this repository's gates and workflow. */
export function buildBaseline({ gates, workflow, name, version, now = new Date() }) {
  return {
    schemaVersion: 1,
    kind: 'eos-policy-baseline',
    name,
    version,
    issuedAt: now.toISOString(),
    snapshot: policySnapshot({ gates, workflow, project: null }),
  };
}

/** A baseline's identity: its canonical content, signature included (a re-signed baseline is a new one). */
export const baselineDigest = (bundle) => createHash('sha256').update(canonical(bundle)).digest('hex');

/** Why the vendored baseline is not what the declared key signed — or null. Offline. */
function vendoredSignatureProblem(root, declared, bundle) {
  if (!declared?.publicKey) return null;
  let key;
  try { key = loadPublicKey(readFileSync(join(root, declared.publicKey), 'utf8')); } catch (e) {
    return `the declared baseline key ${declared.publicKey} cannot be used: ${e.message}`;
  }
  const v = verifyDocument('policy', bundle, key);
  return v.valid ? null : `${UPSTREAM_PATH} is not what the organization signed: ${v.problem} — run \`eos policy sync\``;
}

/** The vendored baseline, schema-checked. */
export function readVendored(root) {
  const full = join(root, UPSTREAM_PATH);
  if (!existsSync(full)) return { present: false, bundle: null, errors: [] };
  let bundle;
  try { bundle = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, bundle: null, errors: [`${UPSTREAM_PATH}: invalid JSON (${e.message})`] };
  }
  const { schema, error } = loadSchema(root, 'policy-baseline.schema.json');
  if (!schema) return { present: true, bundle: null, errors: [`${error} — ${UPSTREAM_PATH} cannot be validated`] };
  const v = validate(schema, bundle, { label: UPSTREAM_PATH });
  return v.valid ? { present: true, bundle, errors: [] } : { present: true, bundle: null, errors: v.errors.slice(0, 4) };
}

/**
 * How this project differs from the baseline it follows. Each change is classified exactly as a change
 * between commits would be, and gets an `upstream:` id so its acknowledgement cannot be confused with one.
 */
export function upstreamChanges(root) {
  const { files } = readPolicy(root);
  const declared = files.project?.policyUpstream || null;
  if (!declared) return { declared: null, vendored: null, digest: null, changes: [] };
  const vendored = readVendored(root);
  if (!vendored.bundle) return { declared, vendored, digest: null, changes: [] };
  const local = policySnapshot({ gates: files.gates, workflow: files.workflow, project: null });
  const changes = diffPolicy(vendored.bundle.snapshot, local).map((c) => ({ ...c, id: `upstream:${c.id}` }));
  return { declared, vendored, digest: baselineDigest(vendored.bundle), changes };
}
