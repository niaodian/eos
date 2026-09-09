#!/usr/bin/env node
// EOS — the guided-workflow CLI. Zero external deps, offline, cross-platform.
//
//   node .github/eos/eos.mjs next        # the single recommended next action
//   node .github/eos/eos.mjs resume      # restore this machine's focus in a new session
//   node .github/eos/eos.mjs check --gate story-ready --scope STORY-012
//   node .github/eos/eos.mjs transition --scope story --id STORY-012 --to READY_FOR_DEV
//
// Exit codes (contract — see docs/eos/developer-experience.md §10.1):
//   0 PASS / nothing blocking · 1 FAIL or rejected transition · 2 BLOCKED/PENDING/STALE · 3 ERROR
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSnapshot, gatePolicy, changeTypeOf, scopeState, gateInputs, gateCollections } from './lib/state.mjs';
import { runGate, evaluateGate, recordedGateStatus, isBlocking } from './lib/gates.mjs';
import { checkTransition, deriveProductState, legalTransitions } from './lib/transitions.mjs';
import { appendEvent, readEvents, verifyChain, LEDGER_PATH } from './lib/ledger.mjs';
import { route, activeScope } from './lib/router.mjs';
import { renderCard, renderGate, renderExplain } from './lib/render.mjs';
import { buildHandoff, writeHandoff, readHandoff, verifyHandoff, handoffPath } from './lib/handoff.mjs';
import { listEvidence, evidenceFreshness } from './lib/evidence.mjs';
import { loadWaivers, expiredWaivers } from './lib/waivers.mjs';
import { resolveAction, ACTIVE_WORK_PATH } from './lib/registry.mjs';

const EXIT = { OK: 0, FAIL: 1, BLOCKED: 2, ERROR: 3 };
const statusExit = (s) => (['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(s) ? EXIT.OK : s === 'FAIL' ? EXIT.FAIL : s === 'ERROR' ? EXIT.ERROR : EXIT.BLOCKED);

const USAGE = `EOS guided workflow

usage: node .github/eos/eos.mjs <command> [flags]

  status [--changed]                      where the project and the active scope are
  next [--why] [--all]                    the single recommended next action
  resume                                  restore the local focus in a new session
  check --gate <id> [--scope <id>]        run one gate and record evidence
  transition --scope <type> --id <id> --to <STATE>
  approve --scope <type> --id <id>        record an approval (a second person, never the requester)
  explain <gate>                          the full rule set for one gate
  release-status                          aggregate release readiness
  verify-release --release <id>           candidate-bound release verification
  waive --gate <id> --scope <id> --reason <text> --risk-owner <who> --expires <YYYY-MM-DD> --control <text>
  handoff --scope <type> --id <id> [--verify]
  ledger [--verify] [--against <git-ref>]
  focus --scope <type> --id <id>          set this machine's local focus (no authority)
  init [--write]                          report or create local, non-destructive integration files
  doctor                                  is EOS itself wired correctly?

  global: --json  --why  --all  --no-color
`;

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { (flags[key] = flags[key] === undefined ? next : [].concat(flags[key], next)); i++; }
  }
  return flags;
}

const emit = (flags, json, text) => {
  if (flags.json) console.log(JSON.stringify(json, null, 2));
  else console.log(text);
};

const SCOPE_TYPES = ['product', 'story', 'release'];

/**
 * Accept both spellings: `--scope story --id STORY-012` and the shorthand `--scope STORY-012`.
 * Without either, fall back to the router's active scope so `eos handoff` "just works".
 */
function resolveScope(snapshot, flags, defaultType = 'story') {
  let type = null;
  let id = null;
  if (typeof flags.scope === 'string') {
    if (SCOPE_TYPES.includes(flags.scope)) type = flags.scope;
    else id = flags.scope;
  }
  if (typeof flags.id === 'string') id = flags.id;
  if (!id) {
    const active = activeScope(snapshot);
    return { type: type || active.type, id: active.id };
  }
  if (!type) {
    if (snapshot.stories.some((s) => s.id === id)) type = 'story';
    else if (id === 'product') type = 'product';
    else type = defaultType;
  }
  return { type, id };
}

// --------------------------------------------------------------------------------- commands
const commands = {
  status(snapshot, flags) {
    const decision = route(snapshot);
    const product = snapshot.workflow ? deriveProductState(snapshot) : { state: 'UNINITIALIZED', blockedBy: null };
    const stories = snapshot.stories.map((s) => ({
      id: s.id,
      changeType: s.changeType || changeTypeOf(snapshot, 'story', s.id),
      state: scopeState(snapshot, 'story', s.id),
    }));
    const changed = snapshot.changedFiles;
    const touched = changed === null ? null : listEvidence(snapshot.root)
      .filter(({ evidence }) => evidence && (evidence.inputs || []).some((i) => changed.includes(i.path)))
      .map(({ evidence }) => ({ gate: evidence.gate, scope: evidence.scope.id, status: 'STALE' }));

    const json = {
      schemaVersion: 1,
      repo: { commit: snapshot.commit, root: snapshot.root },
      product: { state: product.state, blockedBy: product.blockedBy ? product.blockedBy.reason : null },
      profile: snapshot.profileName,
      stories,
      active: decision.current,
      blockers: decision.blockers,
      ...(flags.changed ? { changed: { files: changed, staleEvidence: touched } } : {}),
    };
    const lines = [`EOS · ${snapshot.profileName}`, ''];
    if (snapshot.errors.length) {
      // Printing derived state next to "the state source is broken" would be the worst of both:
      // it looks authoritative while resting on data EOS has just declared untrustworthy.
      lines.push('Errors');
      for (const e of snapshot.errors) lines.push(`  ERROR ${e}`);
      lines.push('', 'State', '  not reported — EOS cannot derive state from a source it cannot verify', '');
      emit(flags, { ...json, product: { state: null, blockedBy: null }, stories: [], errors: snapshot.errors }, lines.join('\n'));
      return EXIT.ERROR;
    }
    lines.push('Product', `  ${product.state}${product.blockedBy ? ` — next guard: ${product.blockedBy.reason}` : ''}`, '');
    if (stories.length) {
      lines.push('Stories');
      for (const s of stories) lines.push(`  ${s.id.padEnd(14)} ${String(s.state).padEnd(16)} ${s.changeType}`);
      lines.push('');
    }
    if (flags.changed) {
      lines.push('Changed');
      if (changed === null) lines.push('  no git repository — cannot compute tracked changes');
      else if (!changed.length) lines.push('  no tracked changes in the working tree');
      else {
        for (const f of changed.slice(0, 10)) lines.push(`  ${f}`);
        if (touched?.length) for (const t of touched) lines.push(`  ⇒ ${t.gate} evidence for ${t.scope} is now STALE`);
      }
      lines.push('');
    }
    lines.push(`Recommended next`, `  ${decision.recommendedAction?.title || '—'}`, '', `  ${decision.recommendedAction?.command || ''}`, '');
    emit(flags, json, lines.join('\n'));
    return snapshot.errors.length ? EXIT.ERROR : EXIT.OK;
  },

  next(snapshot, flags) {
    const decision = route(snapshot);
    emit(flags, decision, renderCard(decision, { why: !!flags.why, all: !!flags.all }));
    return decision.exitCode;
  },

  resume(snapshot, flags) {
    const decision = route(snapshot);
    // Record the focus locally so a new chat session starts where the last one stopped. This file
    // is gitignored and carries no authority — only a scope id and a change type.
    if (decision.current.scopeId) {
      const full = join(snapshot.root, ACTIVE_WORK_PATH);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify({
        schemaVersion: 1,
        scopeType: decision.current.scopeType,
        scopeId: decision.current.scopeId,
        updatedAt: new Date().toISOString(),
      }, null, 2) + '\n', 'utf8');
    }
    const lastGate = [...snapshot.events].reverse().find((e) => e.type === 'gate' && e.scope?.id === decision.current.scopeId && e.status === 'PASS');
    const card = renderCard(decision, { why: !!flags.why, all: !!flags.all });
    const extra = lastGate ? `\nLast verified gate\n  ${lastGate.gate} — PASS at ${lastGate.ts}\n` : '';
    emit(flags, decision, card + extra);
    return decision.exitCode;
  },

  check(snapshot, flags) {
    const gateId = flags.gate;
    if (!gateId || gateId === true) { console.log('check requires --gate <id> (see `explain`)'); return EXIT.FAIL; }
    const def = snapshot.gates?.gates.find((g) => g.id === gateId || g.code === gateId);
    if (!def) { console.log(`unknown gate "${gateId}" — known gates: ${(snapshot.gates?.gates || []).map((g) => `${g.id} (${g.code})`).join(', ')}`); return EXIT.FAIL; }
    const scope = def.scope === 'product'
      ? { type: 'product', id: 'product' }
      : { type: def.scope, id: resolveScope(snapshot, flags, def.scope).id };
    const { result, evidenceFile } = runGate(snapshot, def.id, scope.type, scope.id);
    appendEvent(snapshot.root, {
      type: 'gate',
      scope: { type: scope.type, id: String(scope.id) },
      changeType: result.changeType,
      gate: result.gate,
      status: result.status,
      commit: snapshot.commit,
      detail: evidenceFile || '',
    });
    emit(flags, { ...result, evidence: { file: evidenceFile, inputs: (listEvidence(snapshot.root).find((e) => e.file === evidenceFile)?.evidence?.inputs) || [] } }, renderGate(result, { evidenceFile }));
    return statusExit(result.status);
  },

  transition(snapshot, flags) {
    const scopeType = flags.scope === true || !flags.scope ? 'story' : flags.scope;
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
    const event = appendEvent(snapshot.root, { type: 'approval', scope: { type: scopeType, id: String(scopeId) }, commit: snapshot.commit, detail: String(flags.note || '') });
    emit(flags, { approved: true, event }, `EOS approve · ${scopeId} approved by ${event.actor} (seq ${event.seq})\n`);
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

  'release-status'(snapshot, flags) {
    const scope = { type: 'release', id: flags.release || snapshot.activeWork?.scopeId || 'next' };
    const g = evaluateGate(snapshot, 'release-ready', scope.type, scope.id, { mode: 'cheap' });
    const summary = { PASS: 0, FAIL: 0, BLOCKED: 0, PENDING: 0, STALE: 0, WAIVED: 0, NOT_APPLICABLE: 0, ERROR: 0 };
    for (const c of g.checks) summary[c.status] = (summary[c.status] || 0) + 1;
    const decision = route(snapshot);
    const failing = g.checks.filter((c) => isBlocking(c.status));
    const json = { schemaVersion: 1, release: scope.id, status: g.status, summary, checks: g.checks, recommendedNext: decision.recommendedAction };
    const lines = [`Release ${scope.id}: ${g.status}`, '',
      `  Passed: ${summary.PASS}`, `  Failed: ${summary.FAIL}`, `  Blocked: ${summary.BLOCKED}`,
      `  Pending: ${summary.PENDING}`, `  Stale: ${summary.STALE}`, `  Waived: ${summary.WAIVED}`, `  N/A: ${summary.NOT_APPLICABLE}`, ''];
    if (failing.length) { lines.push('Blockers'); for (const c of failing) lines.push(`  ${c.id} — ${c.detail}`); lines.push(''); }
    lines.push('Recommended next', `  ${decision.recommendedAction?.title || '—'}`, `  ${decision.recommendedAction?.command || ''}`, '');
    emit(flags, json, lines.join('\n'));
    return statusExit(g.status);
  },

  'verify-release'(snapshot, flags) {
    const id = flags.release === true || !flags.release ? null : flags.release;
    if (!id) { console.log('verify-release requires --release <id>'); return EXIT.FAIL; }
    const { result, evidenceFile } = runGate(snapshot, 'release-ready', 'release', id);
    const recorded = recordedGateStatus(snapshot, 'release-ready', 'release', id);
    const boundToCandidate = !!snapshot.commit && recorded.evidence?.commit === snapshot.commit;
    const expired = expiredWaivers(snapshot.root);
    const status = result.status === 'PASS' && !boundToCandidate ? 'BLOCKED' : result.status;
    appendEvent(snapshot.root, { type: 'release', scope: { type: 'release', id }, gate: 'release-ready', status, commit: snapshot.commit, detail: evidenceFile || '' });
    const lines = [renderGate(result, { evidenceFile }),
      boundToCandidate ? `  evidence is bound to the candidate commit ${String(snapshot.commit).slice(0, 8)}` : '  BLOCKED: the evidence is not bound to a candidate commit (no git repository, or HEAD moved)',
      expired.length ? `  BLOCKED: ${expired.length} expired waiver(s)` : '', ''];
    emit(flags, { release: id, status, boundToCandidate, expiredWaivers: expired.map((w) => w.file), result }, lines.filter(Boolean).join('\n'));
    return statusExit(status);
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
    writeFileSync(join(snapshot.root, rel), JSON.stringify(waiver, null, 2) + '\n', 'utf8');
    appendEvent(snapshot.root, { type: 'waiver', scope: { type: scopeType, id: String(scopeId) }, gate: def.id, status: 'DRAFT', detail: rel });
    emit(flags, { drafted: rel, waiver, honored: false }, [
      `EOS waive · DRAFTED ${rel}`, '',
      '  This waiver is NOT in effect: "approver" is empty. EOS drafts waivers and never approves them.',
      '  A person who is not the requester must fill in "approver" and commit the file for review.', '',
    ].join('\n'));
    return EXIT.BLOCKED;
  },

  handoff(snapshot, flags) {
    const scope = resolveScope(snapshot, flags);
    if (flags.verify) {
      const { present, pkg, rel, error } = readHandoff(snapshot.root, scope.id);
      if (error) { console.log(`  ERROR ${error}`); return EXIT.ERROR; }
      if (!present) { console.log(`no handoff package at ${rel} — create one with \`eos handoff --scope ${scope.type} --id ${scope.id}\``); return EXIT.BLOCKED; }
      const v = verifyHandoff(snapshot, pkg);
      emit(flags, { file: rel, ...v }, `EOS handoff · ${scope.id} — ${v.status}\n${v.reasons.map((r) => `  ${r}`).join('\n')}\n`);
      return v.status === 'FRESH' ? EXIT.OK : EXIT.BLOCKED;
    }
    const pkg = buildHandoff(snapshot, { scopeType: scope.type, scopeId: scope.id });
    const rel = writeHandoff(snapshot.root, pkg);
    emit(flags, { file: rel, package: pkg }, [
      `EOS handoff · ${rel}`, '',
      `  goal: ${pkg.goal}`,
      `  agent: ${pkg.recommended.agent || '—'}${pkg.recommended.prompt ? ` · prompt: /${pkg.recommended.prompt}` : ''}${pkg.recommended.skills.length ? ` · skills: ${pkg.recommended.skills.join(', ')}` : ''}`,
      `  files: ${pkg.files.length} (hash-bound)`,
      `  return: ${pkg.returnCommand}`, '',
    ].join('\n'));
    return EXIT.OK;
  },

  ledger(snapshot, flags) {
    const { events, errors } = readEvents(snapshot.root);
    const chain = verifyChain(events, { root: snapshot.root });
    const problems = [...errors, ...chain.problems];
    const warnings = [...chain.warnings];
    if (flags.against && flags.against !== true) {
      const r = spawnSync('git', ['show', `${flags.against}:${LEDGER_PATH}`], { cwd: snapshot.root, encoding: 'utf8' });
      if (r.status === 0) {
        const base = r.stdout;
        const current = existsSync(join(snapshot.root, LEDGER_PATH)) ? readFileSync(join(snapshot.root, LEDGER_PATH), 'utf8') : '';
        if (!current.startsWith(base)) problems.push(`the ledger is not append-only relative to ${flags.against}: earlier bytes changed`);
      }
    }
    const json = { events: events.length, ok: problems.length === 0, problems, warnings };
    emit(flags, json, [`EOS ledger · ${events.length} event(s)`, '', ...warnings.map((w) => `  WARN  ${w}`), ...problems.map((p) => `  ERROR ${p}`), '',
      problems.length ? `FAIL: the append-only ledger is broken (${problems.length} problem(s))` : 'PASS — the hash chain is intact.', ''].join('\n'));
    return problems.length ? EXIT.FAIL : EXIT.OK;
  },

  focus(snapshot, flags) {
    const scopeType = flags.scope === true || !flags.scope ? 'story' : flags.scope;
    const scopeId = flags.id;
    if (!scopeId || scopeId === true) { console.log('focus requires --scope <type> --id <id>'); return EXIT.FAIL; }
    const full = join(snapshot.root, ACTIVE_WORK_PATH);
    mkdirSync(dirname(full), { recursive: true });
    if (flags['change-type']) {
      console.log('focus does not accept --change-type: a change type selects the gate policy, so it belongs in the tracked story file, not in a gitignored local file.');
      return EXIT.FAIL;
    }
    const body = { schemaVersion: 1, scopeType, scopeId: String(scopeId), updatedAt: new Date().toISOString() };
    writeFileSync(full, JSON.stringify(body, null, 2) + '\n', 'utf8');
    emit(flags, body, `EOS focus · ${scopeType}/${scopeId} (local only — ${ACTIVE_WORK_PATH} is gitignored and carries no authority)\n`);
    return EXIT.OK;
  },

  init(snapshot, flags) {
    const planned = [
      { path: '.vscode/tasks.json', body: VSCODE_TASKS },
      { path: '.eos/local/.gitkeep', body: '' },
    ];
    const lines = ['EOS init', ''];
    let created = 0;
    for (const f of planned) {
      const full = join(snapshot.root, f.path);
      if (existsSync(full)) { lines.push(`  kept    ${f.path} (already exists — never overwritten)`); continue; }
      if (!flags.write) { lines.push(`  would create ${f.path}`); continue; }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, f.body, 'utf8');
      created++;
      lines.push(`  created ${f.path}`);
    }
    if (!flags.write) lines.push('', '  Nothing was written. Re-run with --write to create the missing files.');
    lines.push('', '  Next: node .github/eos/eos.mjs next', '');
    emit(flags, { wrote: flags.write ? created : 0, planned: planned.map((p) => p.path) }, lines.join('\n'));
    return EXIT.OK;
  },

  doctor(snapshot, flags) {
    const problems = [];
    const notes = [];
    for (const e of snapshot.errors) problems.push({ level: 'ERROR', detail: e });
    for (const e of snapshot.agentMapErrors) problems.push({ level: 'ERROR', detail: e });
    if (!snapshot.workflow) problems.push({ level: 'BLOCKED', detail: '.eos/workflow.json is missing — run `eos init --write` or copy it from the EOS template' });
    if (!snapshot.gates) problems.push({ level: 'BLOCKED', detail: '.eos/gates.json is missing' });
    if (snapshot.agentMap) {
      for (const id of Object.keys(snapshot.agentMap.actions)) {
        const r = resolveAction(snapshot.root, snapshot.agentMap, id);
        if (r.blocked) problems.push({ level: 'BLOCKED', detail: r.blocked });
      }
      const referenced = new Set(Object.keys(snapshot.agentMap.actions));
      for (const id of ['fix-eos-configuration', 'complete-local-activation', 'start-next-change']) {
        if (!referenced.has(id)) notes.push(`action "${id}" has no entry in .eos/agent-map.json — the built-in fallback will be used`);
      }
    }
    const { errors: waiverErrors } = loadWaivers(snapshot.root);
    for (const e of waiverErrors) problems.push({ level: 'ERROR', detail: e });
    for (const { file, evidence } of listEvidence(snapshot.root)) {
      if (!evidence) { problems.push({ level: 'ERROR', detail: `${file}: unreadable evidence` }); continue; }
      const def = snapshot.gates?.gates.find((g) => g.id === evidence.gate);
      const f = evidenceFreshness(snapshot.root, evidence, {
        gateDefinition: def,
        expectedInputs: gateInputs(snapshot, evidence.gate, evidence.scope.type, evidence.scope.id),
        collections: gateCollections(snapshot, evidence.gate),
      });
      if (f.status === 'STALE') notes.push(`${file} is STALE: ${f.reasons[0]}`);
    }
    const chain = verifyChain(readEvents(snapshot.root).events, { root: snapshot.root });
    for (const p of chain.problems) problems.push({ level: 'ERROR', detail: `ledger: ${p}` });
    for (const w of chain.warnings) notes.push(`ledger: ${w}`);

    const lines = ['EOS doctor', ''];
    for (const n of notes) lines.push(`  NOTE    ${n}`);
    for (const p of problems) lines.push(`  ${p.level.padEnd(7)} ${p.detail}`);
    lines.push('', problems.length ? `FAIL: ${problems.length} problem(s)` : `PASS${notes.length ? ` (${notes.length} note(s))` : ''}`, '');
    emit(flags, { ok: problems.length === 0, problems, notes }, lines.join('\n'));
    return problems.length ? (problems.some((p) => p.level === 'ERROR' && !p.detail.startsWith('ledger')) ? EXIT.BLOCKED : EXIT.BLOCKED) : EXIT.OK;
  },
};

const VSCODE_TASKS = JSON.stringify({
  version: '2.0.0',
  tasks: [
    { label: 'EOS: Next', type: 'shell', command: 'node .github/eos/eos.mjs next', problemMatcher: [], presentation: { reveal: 'always', panel: 'dedicated' } },
    { label: 'EOS: Resume', type: 'shell', command: 'node .github/eos/eos.mjs resume', problemMatcher: [], presentation: { reveal: 'always', panel: 'dedicated' } },
    { label: 'EOS: Verify Current Gate', type: 'shell', command: 'node .github/eos/eos.mjs check --gate ${input:eosGate} --scope ${input:eosScope}', problemMatcher: [] },
    { label: 'EOS: Release Status', type: 'shell', command: 'node .github/eos/eos.mjs release-status', problemMatcher: [] },
    { label: 'EOS: Doctor', type: 'shell', command: 'node .github/eos/eos.mjs doctor', problemMatcher: [] },
  ],
  inputs: [
    { id: 'eosGate', type: 'promptString', description: 'Gate id (activation | prd-ready | story-ready | verified | release-ready)', default: 'story-ready' },
    { id: 'eosScope', type: 'promptString', description: 'Scope id (for example STORY-012)', default: 'product' },
  ],
}, null, 2) + '\n';

// --------------------------------------------------------------------------------- entry
function main() {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0];
  if (!command || flags.help || command === 'help') { console.log(USAGE); return command ? EXIT.OK : EXIT.ERROR; }
  const fn = commands[command];
  if (!fn) { console.log(`unknown command "${command}"\n\n${USAGE}`); return EXIT.ERROR; }

  let snapshot;
  try {
    snapshot = readSnapshot(process.cwd());
  } catch (e) {
    console.log(`EOS ERROR — the project state could not be read: ${e.message}`);
    return EXIT.ERROR;
  }
  // A broken EOS configuration is an ERROR for every command except the ones whose job is to
  // report or repair it. It is never downgraded into a pass.
  if (snapshot.errors.length && !['doctor', 'init', 'next', 'resume', 'status', 'ledger'].includes(command)) {
    console.log(['EOS ERROR — the configuration could not be evaluated:', '', ...snapshot.errors.map((e) => `  ERROR ${e}`), '',
      '  Fix the file(s) above, or run `node .github/eos/eos.mjs doctor`.', ''].join('\n'));
    return EXIT.ERROR;
  }
  try {
    return fn(snapshot, flags);
  } catch (e) {
    console.log(`EOS ERROR — ${command} failed: ${e.message}`);
    return EXIT.ERROR;
  }
}

process.exit(main());
