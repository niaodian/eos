// EOS commands — the append-only ledger and handoffs: verification, merge resolution, handoff records.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withLedger, readEvents, readLedgerSnapshot, verifyChain, parseConflicted, reconcileEvents, writeLedger, divergence, transitionConflicts, stateOf, LEDGER_PATH } from '../lib/ledger.mjs';
import { buildHandoff, writeHandoff, readHandoff, verifyHandoff } from '../lib/handoff.mjs';
import { EXIT, emit, resolveScope } from './shared.mjs';

/**
 * One `reconcile` entry per story/release whose status history stopped following from itself.
 *
 * Its timestamp is placed after everything already in the ledger (not merely "now"), so a replay in
 * timestamp order can never slide it in front of the events it settles — even with a skewed clock.
 */
function buildReconciles(events, workflow) {
  const conflicts = transitionConflicts(events, workflow);
  if (!conflicts.length) return [];
  const latest = Math.max(Date.now(), ...events.map((e) => Date.parse(e.ts) || 0));
  return conflicts.map((c, i) => ({
    ts: new Date(latest + 1 + i).toISOString(),
    type: 'reconcile',
    scope: c.scope,
    from: stateOf(events, workflow, c.scope.type, c.scope.id),
    to: c.agreed,
    actor: 'eos ledger --resolve',
    detail: `two histories changed ${c.scope.id} concurrently: seq ${c.seq} moved it ${c.recordedFrom} → ${c.to} while the merged history was already in ${c.derived}. Reset to ${c.agreed}, the last state both agreed on; re-run its gates to move it forward.`,
  }));
}

/**
 * Reconcile a ledger that two branches both appended to.
 *
 * Git cannot merge an append-only hash chain. A textual merge leaves duplicated sequence numbers
 * and prevHash pointers that lead nowhere; `.gitattributes` therefore forces a conflict instead,
 * and this is the tool that resolves it — by REPLAYING both sides onto the shared prefix in
 * timestamp order, re-deriving seq/prevHash/hash. Every event survives; only its position moves.
 */
function resolveLedger(snapshot, flags) {
  const full = join(snapshot.root, LEDGER_PATH);
  if (!existsSync(full)) {
    emit(flags, { resolved: false, reason: 'no ledger' }, `EOS ledger · ${LEDGER_PATH} does not exist — nothing to resolve.\n`);
    return EXIT.OK;
  }
  const raw = readFileSync(full, 'utf8');
  const { common, ours, theirs } = parseConflicted(raw);
  const conflicted = ours.length > 0 || theirs.length > 0;

  let sources;
  if (conflicted) {
    sources = [common, ours, theirs];
  } else {
    // No markers. The other shape of the same problem: a merge that already "succeeded" textually
    // and left duplicated sequence numbers behind.
    const { events } = readEvents(snapshot.root);
    if (!divergence(events).diverged) {
      const chain = verifyChain(events, { root: snapshot.root });
      const pending = buildReconciles(events, snapshot.workflow);
      if (!chain.problems.length && pending.length) {
        // The chain is intact, but two histories already replayed together left status changes
        // that do not follow from each other (a ledger resolved before 1.20.0 did not check this).
        // Nothing needs replaying; the settling entries are appended like any other event.
        const lines = ['EOS ledger · resolve', '', `  ${pending.length} story/release status history does not follow from itself after a merge:`, ''];
        for (const r of pending) lines.push(`  ${r.scope.id.padEnd(14)} ${r.from} → ${r.to}  (${r.detail})`);
        if (flags.write) {
          withLedger(snapshot.root, ({ append }) => { for (const r of pending) append(r); });
          lines.push('', `  appended ${pending.length} reconcile entr${pending.length === 1 ? 'y' : 'ies'} — every earlier event is unchanged`, '', 'PASS', '');
        } else {
          lines.push('', '  Nothing was written. Re-run with --write to record the reconciliation.', '', 'PASS', '');
        }
        emit(flags, { resolved: !!flags.write, diverged: false, reconciled: pending.map((r) => ({ scope: r.scope, from: r.from, to: r.to })) }, lines.join('\n'));
        return EXIT.OK;
      }
      const lines = ['EOS ledger · resolve', '',
        chain.problems.length
          ? '  This ledger is broken, but NOT by a merge: no conflict markers and no duplicated sequence numbers.'
          : '  Nothing to resolve — no conflict markers, no duplicated sequence numbers.',
        ...chain.problems.map((p) => `  ERROR ${p}`),
        '', chain.problems.length ? 'FAIL' : 'PASS', ''];
      emit(flags, { resolved: false, diverged: false, problems: chain.problems }, lines.join('\n'));
      return chain.problems.length ? EXIT.FAIL : EXIT.OK;
    }
    sources = [events];
  }

  const merged = reconcileEvents(sources);
  // Replaying makes the CHAIN valid; it does not make the history mean something. A story both
  // branches moved now has a status change that starts from a state the merged history already
  // left. Each such story is reset to the last state both histories agreed on, by an entry that
  // says so — never by editing or dropping the events that disagree.
  const reconciles = buildReconciles(merged, snapshot.workflow);
  const replayed = reconciles.length ? reconcileEvents([merged, reconciles]) : merged;
  const before = conflicted ? common.length + ours.length + theirs.length : sources[0].length;
  const json = {
    resolved: !!flags.write, conflicted, events: replayed.length, inputEvents: before,
    ours: ours.length, theirs: theirs.length, common: common.length,
    reconciled: reconciles.map((r) => ({ scope: r.scope, from: r.from, to: r.to })),
  };
  const lines = ['EOS ledger · resolve', '',
    conflicted
      ? `  conflict markers found · ${common.length} shared · ${ours.length} ours · ${theirs.length} theirs`
      : `  merged ledger with duplicated sequence numbers · ${before} event(s)`,
    `  replayed into a single chain of ${replayed.length} event(s) in timestamp order`,
    '  Every event is kept. Timestamps, actors, gates, statuses and evidence digests are unchanged;',
    '  only seq/prevHash/hash move, because that is what giving two histories one order means.',
    ''];
  if (reconciles.length) {
    lines.push(`  ${reconciles.length} story/release was changed on both sides; each is reset to the last state both agreed on:`);
    for (const r of reconciles) lines.push(`    ${r.scope.id.padEnd(14)} ${r.from} → ${r.to}`);
    lines.push('  Re-run their gates to move them forward again — the merged code is not what either side verified.', '');
  }
  if (flags.write) {
    writeLedger(snapshot.root, replayed);
    const check = verifyChain(readEvents(snapshot.root).events, { root: snapshot.root });
    lines.push(`  written ${LEDGER_PATH} (+ head.json)`, '');
    if (check.problems.length) {
      lines.push(...check.problems.map((p) => `  ERROR ${p}`), '', 'FAIL', '');
      emit(flags, { ...json, verified: false, problems: check.problems }, lines.join('\n'));
      return EXIT.FAIL;
    }
    lines.push('  the replayed chain verifies', '',
      '  Review the diff and commit it as the merge resolution:', `    git add ${LEDGER_PATH} .eos/ledger/head.json`, '', 'PASS', '');
    emit(flags, { ...json, verified: true }, lines.join('\n'));
    return EXIT.OK;
  }
  lines.push('  Nothing was written. Re-run with --write once the numbers above are what you expect.', '', 'PASS', '');
  emit(flags, json, lines.join('\n'));
  return EXIT.OK;
}

export const ledgerCommands = {
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
      `  agent: ${pkg.recommended.agent || '—'}${pkg.recommended.prompt ? ` · slash command: /${pkg.recommended.prompt}` : ''}${pkg.recommended.skills.length ? ` · skills: ${pkg.recommended.skills.join(', ')}` : ''}`,
      `  files: ${pkg.files.length} (hash-bound)`,
      `  return: ${pkg.returnCommand}`, '',
    ].join('\n'));
    return EXIT.OK;
  },

  ledger(snapshot, flags) {
    if (flags.resolve) return resolveLedger(snapshot, flags);
    const { events, errors, chain } = readLedgerSnapshot(snapshot.root);
    const problems = [...errors, ...chain.problems];
    // A valid chain can still carry a history that does not follow from itself: two branches
    // moved the same story and the merge replayed both. Not tampering — but the derived state
    // rests on a sequence that never happened, so it is reported until it is reconciled.
    if (!chain.problems.length) {
      for (const c of transitionConflicts(events, snapshot.workflow)) {
        problems.push(`${c.scope.id}: the status change at seq ${c.seq} starts from ${c.recordedFrom}, but the history was already in ${c.derived} — two branches changed it concurrently. Run \`eos ledger --resolve --write\`: it resets ${c.scope.id} to ${c.agreed} and keeps every event.`);
      }
    }
    const warnings = [...chain.warnings];
    if (flags.against && flags.against !== true) {
      const r = spawnSync('git', ['show', `${flags.against}:${LEDGER_PATH}`], { cwd: snapshot.root, encoding: 'utf8' });
      if (r.status === 0) {
        const base = r.stdout;
        const current = existsSync(join(snapshot.root, LEDGER_PATH)) ? readFileSync(join(snapshot.root, LEDGER_PATH), 'utf8') : '';
        if (!current.startsWith(base)) problems.push(`the ledger is not append-only relative to ${flags.against}: earlier bytes changed`);
      }
    }
    // An unverifiable ledger is UNVERIFIED, never PASS. Announcing "the chain is intact" for a
    // ledger we have just said we cannot check for truncation would be the same "absence of proof
    // reported as proof" this whole layer exists to prevent.
    const verdict = problems.length
      ? `FAIL: the append-only ledger is broken (${problems.length} problem(s))`
      : warnings.length
        ? `UNVERIFIED: the chain is internally consistent, but ${warnings.length} property could not be checked (see above).`
        : 'PASS — the hash chain is intact.';
    const json = { events: events.length, ok: problems.length === 0 && warnings.length === 0, problems, warnings, verdict: problems.length ? 'FAIL' : warnings.length ? 'UNVERIFIED' : 'PASS' };
    emit(flags, json, [`EOS ledger · ${events.length} event(s)`, '', ...warnings.map((w) => `  WARN  ${w}`), ...problems.map((p) => `  ERROR ${p}`), '', verdict, ''].join('\n'));
    return problems.length ? EXIT.FAIL : warnings.length ? EXIT.BLOCKED : EXIT.OK;
  },
};
