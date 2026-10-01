// EOS commands — running gates and moving scopes: check, verify, explain, waive, transition, approve.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gatePolicy, changeTypeOf, gateInputs, gateCollections } from '../lib/state.mjs';
import { prepareGateRun, isBlocking } from '../lib/gates.mjs';
import { recordGateRun } from '../lib/record.mjs';
import { crossBranchActivity, crossBranchLines } from '../lib/cross-branch.mjs';
import { checkTransition, legalTransitions } from '../lib/transitions.mjs';
import { appendEvent, withLedger } from '../lib/ledger.mjs';
import { renderGate, renderExplain } from '../lib/render.mjs';
import { listEvidence, evidenceFreshness, readEvidence } from '../lib/evidence.mjs';
import { readManifest, manifestPath, listManifests } from '../lib/release.mjs';
import { writeFileAtomic } from '../lib/atomic.mjs';
import { EXIT, statusExit, emit, resolveScope, consultProviders } from './shared.mjs';

export const gateCommands = {
  async check(snapshot, flags) {
    const gateId = flags.gate;
    if (!gateId || gateId === true) { console.log('check requires --gate <id> (see `explain`)'); return EXIT.FAIL; }
    const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
    if (!def) { console.log(`unknown gate "${gateId}" — known gates: ${(snapshot.gates?.gates || []).map((g) => `${g.id} (${g.code})`).join(', ')}`); return EXIT.FAIL; }
    const scope = def.scope === 'product'
      ? { type: 'product', id: 'product' }
      : { type: def.scope, id: resolveScope(snapshot, flags, def.scope).id };
    const providerVerdicts = await consultProviders(snapshot, def.id);
    const { result, evidence, evidenceFile } = prepareGateRun(snapshot, def.id, scope.type, scope.id, { providerVerdicts });
    // Evidence and its ledger entry are written as ONE unit (record.mjs). The digest goes INTO the
    // hashed entry, so regenerating or editing the evidence afterwards no longer matches the chain.
    recordGateRun(snapshot.root, {
      evidence,
      evidenceFile,
      event: { type: 'gate', scope: { type: scope.type, id: String(scope.id) }, changeType: result.changeType, gate: result.gate, status: result.status, commit: snapshot.commit },
    });
    emit(flags, { ...result, evidence: { file: evidenceFile, inputs: (listEvidence(snapshot.root).find((e) => e.file === evidenceFile)?.evidence?.inputs) || [] } }, renderGate(result, { evidenceFile }));
    return statusExit(result.status);
  },

  /**
   * Run the gates this change can actually have affected.
   *
   * Every gate already DECLARES its inputs — that is how recorded evidence knows when it has gone
   * stale. The same declaration answers a question nobody was asking it: given these changed files,
   * which gates could possibly have a different answer than last time? Re-running all of them on
   * every edit is what makes a governance tool something people route around.
   *
   * The selection is deliberately conservative. A gate is run when its inputs intersect the change,
   * when a governance file changed (which invalidates everything by design), when its recorded
   * evidence is already STALE or absent, or when EOS cannot see the changes at all. Skipping is
   * only ever justified by evidence that is present AND fresh — "nothing changed" is never
   * inferred from silence.
   */
  async verify(snapshot, flags) {
    const full = !!flags.full;
    const changed = snapshot.changedFiles;
    const gates = snapshot.gates?.gates || [];

    // Every (gate, scope) pair this repository could be asked about.
    const targets = [];
    for (const def of gates) {
      if (def.scope === 'product') targets.push({ def, scopeType: 'product', scopeId: 'product' });
      else if (def.scope === 'story') for (const s of snapshot.stories) targets.push({ def, scopeType: 'story', scopeId: s.id });
      else if (def.scope === 'release') for (const m of listManifests(snapshot.root)) { if (m.releaseId) targets.push({ def, scopeType: 'release', scopeId: m.releaseId }); }
    }

    const GOVERNANCE = ['.eos/gates.json', '.eos/workflow.json', '.eos/project.json'];
    const governanceChanged = changed === null ? [] : GOVERNANCE.filter((g) => changed.includes(g));

    const plan = [];
    for (const t of targets) {
      const policy = gatePolicy(snapshot, changeTypeOf(snapshot, t.scopeType, t.scopeId), t.def.id);
      if (policy === 'not_applicable') { plan.push({ ...t, run: false, reason: 'not applicable to this change type' }); continue; }
      if (full) { plan.push({ ...t, run: true, reason: '--full' }); continue; }
      if (changed === null) { plan.push({ ...t, run: true, reason: 'no git repository — the change set is unknown, so nothing may be skipped' }); continue; }
      if (governanceChanged.length) { plan.push({ ...t, run: true, reason: `governance changed (${governanceChanged.join(', ')}) — every prior result is invalidated by design` }); continue; }

      const prior = readEvidence(snapshot.root, t.def.id, t.scopeType, t.scopeId);
      if (!prior.present || !prior.evidence) { plan.push({ ...t, run: true, reason: 'no recorded evidence' }); continue; }
      const fresh = evidenceFreshness(snapshot.root, prior.evidence, {
        gateDefinition: t.def,
        expectedInputs: gateInputs(snapshot, t.def.id, t.scopeType, t.scopeId),
        collections: gateCollections(snapshot, t.def.id, t.scopeType, t.scopeId),
      });
      if (fresh.status !== 'FRESH') { plan.push({ ...t, run: true, reason: `evidence is STALE: ${fresh.reasons[0]}` }); continue; }

      const inputs = gateInputs(snapshot, t.def.id, t.scopeType, t.scopeId);
      const hits = inputs.filter((i) => changed.includes(i));
      if (hits.length) { plan.push({ ...t, run: true, reason: `inputs changed: ${hits.join(', ')}` }); continue; }
      plan.push({ ...t, run: false, reason: `evidence is FRESH and none of its inputs changed (recorded ${prior.evidence.status})` });
    }

    const selected = plan.filter((p) => p.run);
    if (flags.plan) {
      const json = { full, changedFiles: changed, planned: plan.map((p) => ({ gate: p.def.id, scopeType: p.scopeType, scopeId: p.scopeId, run: p.run, reason: p.reason })) };
      const lines = [`EOS verify · plan (${selected.length} of ${plan.length} gate-scope pair(s) would run)`, ''];
      for (const p of plan) lines.push(`  ${(p.run ? 'RUN ' : 'skip').padEnd(5)} ${p.def.id.padEnd(20)} ${String(p.scopeId).padEnd(14)} ${p.reason}`);
      lines.push('');
      emit(flags, json, lines.join('\n'));
      return EXIT.OK;
    }

    const results = [];
    for (const p of selected) {
      const providerVerdicts = await consultProviders(snapshot, p.def.id);
      const { result, evidence, evidenceFile } = prepareGateRun(snapshot, p.def.id, p.scopeType, p.scopeId, { providerVerdicts });
      recordGateRun(snapshot.root, {
        evidence,
        evidenceFile,
        event: { type: 'gate', scope: { type: p.scopeType, id: String(p.scopeId) }, changeType: result.changeType, gate: result.gate, status: result.status, commit: snapshot.commit },
      });
      results.push({ gate: p.def.id, scopeType: p.scopeType, scopeId: p.scopeId, status: result.status, reason: p.reason, rerunCommand: result.rerunCommand });
    }
    const skipped = plan.filter((p) => !p.run);
    const worst = results.reduce((acc, r) => (isBlocking(r.status) && !isBlocking(acc) ? r.status : acc), 'PASS');
    const cross = crossBranchActivity(snapshot.root, {
      focus: snapshot.activeWork?.scopeId ? [{ type: snapshot.activeWork.scopeType, id: snapshot.activeWork.scopeId }] : [],
    });
    const json = { full, changedFiles: changed, ran: results, skipped: skipped.map((p) => ({ gate: p.def.id, scopeId: p.scopeId, reason: p.reason })), status: worst, crossBranch: { checked: cross.checked, base: cross.base?.ref ?? null, overlaps: cross.overlaps } };
    const lines = [`EOS verify · ${results.length} gate(s) run, ${skipped.length} skipped`, ''];
    for (const r of results) lines.push(`  ${r.status.padEnd(15)} ${r.gate.padEnd(20)} ${String(r.scopeId).padEnd(14)} ${r.reason}`);
    if (!results.length) lines.push('  nothing to re-verify — every applicable gate has fresh evidence covering the current inputs');
    lines.push('', `  ${skipped.length} skipped · run with --full to re-verify everything · --plan to see the selection without running it`, '');
    lines.push(...crossBranchLines(cross), worst, '');
    emit(flags, json, lines.join('\n'));
    return statusExit(worst);
  },

  transition(snapshot, flags) {    const scopeType = flags.scope === true || !flags.scope ? 'story' : flags.scope;
    const scopeId = flags.id;
    const to = flags.to;
    if (!scopeId || !to || scopeId === true || to === true) { console.log('transition requires --scope <type> --id <id> --to <STATE>'); return EXIT.FAIL; }
    if (!['product', 'story', 'release'].includes(scopeType)) { console.log(`unknown scope type "${scopeType}"`); return EXIT.FAIL; }
    const verdict = checkTransition(snapshot, { scopeType, scopeId, to });
    if (!verdict.allowed) {
      emit(flags, { allowed: false, ...verdict }, [
        `EOS transition · ${scopeId}: ${verdict.from} → ${to} REJECTED`, '',
        ...verdict.reasons.map((r) => `  ${r}`), '',
        scopeType !== 'product' ? `  legal next state(s) from ${verdict.from}: ${legalTransitions(snapshot.workflow, scopeType, verdict.from).map((t) => t.to).join(', ') || '(none)'}` : '',
        '',
      ].join('\n'));
      return EXIT.FAIL;
    }
    const event = appendEvent(snapshot.root, {
      type: 'transition',
      scope: { type: scopeType, id: String(scopeId) },
      changeType: changeTypeOf(snapshot, scopeType, scopeId),
      from: verdict.from,
      to,
      commit: snapshot.commit,
      notApplicableGates: Object.entries(snapshot.profile?.changeTypes?.[changeTypeOf(snapshot, scopeType, scopeId)]?.gates || {})
        .filter(([, p]) => p === 'not_applicable').map(([g]) => g),
    });
    emit(flags, { allowed: true, ...verdict, event }, `EOS transition · ${scopeId}: ${verdict.from} → ${to} RECORDED (seq ${event.seq})\n`);
    return EXIT.OK;
  },

  approve(snapshot, flags) {
    const scopeType = flags.scope === true || !flags.scope ? 'release' : flags.scope;
    const scopeId = flags.id;
    if (!scopeId || scopeId === true) { console.log('approve requires --scope <type> --id <id>'); return EXIT.FAIL; }
    const actor = process.env.EOS_ACTOR || process.env.USER || process.env.USERNAME || '';
    const requesters = new Set(snapshot.events.filter((e) => e.type === 'transition' && e.scope?.id === scopeId).map((e) => e.actor));
    if (requesters.has(actor)) {
      console.log(`EOS approve · REJECTED — "${actor}" prepared this candidate and cannot also approve it. A second person must run this command.`);
      return EXIT.FAIL;
    }
    // An approval is consent to ship a SPECIFIC set of changes. Binding it to the manifest digest is
    // what stops that consent from silently transferring to a different set later.
    let manifestDigest;
    if (scopeType === 'release') {
      const m = readManifest(snapshot.root, scopeId);
      if (m.errors.length) { console.log(`EOS approve · REJECTED — ${m.errors.join('; ')}`); return EXIT.FAIL; }
      if (!m.present) {
        console.log(`EOS approve · REJECTED — ${manifestPath(scopeId)} does not exist. There is nothing to approve yet: a release states which stories it ships before anyone consents to shipping them.`);
        return EXIT.FAIL;
      }
      manifestDigest = m.digest;
    }
    const event = appendEvent(snapshot.root, {
      type: 'approval',
      scope: { type: scopeType, id: String(scopeId) },
      ...(manifestDigest ? { manifestDigest } : {}),
      commit: snapshot.commit,
      detail: String(flags.note || ''),
    });
    emit(flags, { approved: true, event, manifestDigest: manifestDigest || null },
      `EOS approve · ${scopeId} approved by ${event.actor} (seq ${event.seq})${manifestDigest ? `\n  bound to manifest ${manifestDigest.slice(0, 12)} — editing what this release ships invalidates this approval` : ''}\n`);
    return EXIT.OK;
  },

  explain(snapshot, flags) {
    const id = flags._[1];
    const def = snapshot.gates?.gates.find((g) => g.id === id || g.code === id);
    if (!def) { console.log(`unknown gate "${id || ''}" — known gates: ${(snapshot.gates?.gates || []).map((g) => `${g.id} (${g.code})`).join(', ')}`); return EXIT.FAIL; }
    const rows = Object.entries(snapshot.profile?.changeTypes || {}).map(([ct, cfg]) => [ct, cfg.gates?.[def.id] || 'not_applicable']);
    emit(flags, { gate: def, policy: Object.fromEntries(rows) }, renderExplain(def, rows));
    return EXIT.OK;
  },

  waive(snapshot, flags) {
    const gateId = flags.gate;
    const scopeId = flags.scope || flags.id;
    if (!gateId || !scopeId || gateId === true || scopeId === true) { console.log('waive requires --gate <id> --scope <id> --reason <text> --risk-owner <who> --expires <YYYY-MM-DD> --control <text>'); return EXIT.FAIL; }
    const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
    if (!def) { console.log(`unknown gate "${gateId}"`); return EXIT.FAIL; }
    const scopeType = def.scope;
    const changeType = changeTypeOf(snapshot, scopeType, scopeId);
    const policy = gatePolicy(snapshot, changeType, def.id);
    if (def.waivable === false || policy !== 'waivable') {
      console.log(`EOS waive · REFUSED — gate "${def.id}" is not waivable${def.waivable === false ? ' by definition' : ` for a ${changeType} change (policy: ${policy})`}. Close the gap instead.`);
      return EXIT.FAIL;
    }
    const reason = String(flags.reason || '');
    if (reason.trim().length < 20) { console.log('waive requires --reason with a real explanation (>= 20 characters)'); return EXIT.FAIL; }
    const controls = [].concat(flags.control || []).filter((c) => typeof c === 'string' && c.trim());
    if (!controls.length) { console.log('waive requires at least one --control (compensating control)'); return EXIT.FAIL; }
    const waiver = {
      schemaVersion: 1,
      gate: def.id,
      scope: { type: scopeType, id: String(scopeId) },
      reason,
      riskOwner: String(flags['risk-owner'] || ''),
      requestedBy: process.env.EOS_ACTOR || process.env.USER || process.env.USERNAME || 'unknown',
      approver: '',
      expiresOn: String(flags.expires || ''),
      compensatingControls: controls,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(waiver.expiresOn)) { console.log('waive requires --expires YYYY-MM-DD'); return EXIT.FAIL; }
    if (!waiver.riskOwner) { console.log('waive requires --risk-owner'); return EXIT.FAIL; }
    const rel = `.eos/waivers/${def.id}__${scopeType}__${String(scopeId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
    mkdirSync(join(snapshot.root, '.eos/waivers'), { recursive: true });
    // The draft file and its ledger entry are one unit, entry first — the same rule as a gate run.
    withLedger(snapshot.root, ({ append }) => {
      append({ type: 'waiver', scope: { type: scopeType, id: String(scopeId) }, gate: def.id, status: 'DRAFT', detail: rel });
      writeFileAtomic(join(snapshot.root, rel), JSON.stringify(waiver, null, 2) + '\n');
    });
    emit(flags, { drafted: rel, waiver, honored: false }, [
      `EOS waive · DRAFTED ${rel}`, '',
      '  This waiver is NOT in effect: "approver" is empty. EOS drafts waivers and never approves them.',
      '  A person who is not the requester must fill in "approver" and commit the file for review.', '',
    ].join('\n'));
    return EXIT.BLOCKED;
  },
};
