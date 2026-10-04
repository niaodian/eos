// EOS commands — where the project is: status, the next action, resuming a session, health, local focus.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gatePolicy, changeTypeOf, scopeState, gateInputs, gateCollections } from '../lib/state.mjs';
import { recordedGateStatus } from '../lib/gates.mjs';
import { crossBranchActivity, crossBranchLines } from '../lib/cross-branch.mjs';
import { deriveProductState } from '../lib/transitions.mjs';
import { readEvents } from '../lib/ledger.mjs';
import { route } from '../lib/router.mjs';
import { renderCard } from '../lib/render.mjs';
import { listEvidence, evidenceFreshness } from '../lib/evidence.mjs';
import { listManifests } from '../lib/release.mjs';
import { loadProviders } from '../adapters/contract.mjs';
import { testDurationTrend } from '../lib/test-history.mjs';
import { loadWaivers, expiredWaivers, waiverStatus } from '../lib/waivers.mjs';
import { activeWorkPath } from '../lib/registry.mjs';
import { trackSummary } from '../lib/track.mjs';
import { policyDrift } from '../lib/policy.mjs';
import { releasePreview, previewLines } from '../lib/release-preview.mjs';
import { EXIT, emit } from './shared.mjs';

const CLI = 'node .github/eos/eos.mjs';

/**
 * `next --exit-zero` / `resume --exit-zero`: for a caller that wants the card, not a verdict — a
 * prompt, a session hook, an `&&` chain — a blocked step (2) or a failed check (1) exits 0. An EOS
 * that cannot evaluate (3) still exits 3, so a broken configuration is never hidden. The JSON keeps
 * the real exitCode. Opt-in only: it never switches on by itself, on a terminal or in CI.
 */
const cardExit = (flags, code) => (flags['exit-zero'] && code !== EXIT.ERROR ? EXIT.OK : code);

/** The governance track and what a release on it will require — said up front, not at tag time. */
function trackLines(track) {
  return ['Track', `  ${track.title} track · ${track.profile || '—'} — ${track.summary}`, '  A release needs:',
    ...track.releaseRequires.map((r) => `    · ${r}`), ''];
}

/** A policy that moved since the lock, with the exact command that records it. */
function policyDriftLines(drift) {
  if (!drift) return [];
  const out = ['Policy changed since .eos/policy.lock.json'];
  if (drift.weakenings.length) {
    for (const w of drift.weakenings) out.push(`  WEAKENING  ${w}`);
    out.push(`  Record it:  ${CLI} policy lock --write --reason "<why>"`,
      '              then a second person fills in "approver" — weakening a control is never self-approved');
  } else {
    out.push('  Nothing here weakens a gate.', `  Record it:  ${CLI} policy lock --write`);
  }
  out.push(`  See all:    ${CLI} policy diff`, '');
  return out;
}

export const stateCommands = {
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

    // A repository with no declared product code can satisfy every gate EOS has and still have had
    // nothing about a product verified. Saying so on every `status` is the difference between
    // "green" and "green, and here is exactly what that green does not cover".
    const declaredType = snapshot.project?.projectType ?? null;
    const productCodeVerified = snapshot.projectPresent && declaredType !== 'config-only';

    const json = {
      schemaVersion: 1,
      repo: { commit: snapshot.commit, root: snapshot.root },
      product: { state: product.state, blockedBy: product.blockedBy ? product.blockedBy.reason : null },
      projectType: declaredType,
      productCodeVerified,
      profile: snapshot.profileName,
      track: snapshot.workflow ? trackSummary(snapshot) : null,
      stories,
      active: decision.current,
      blockers: decision.blockers,
      warnings: snapshot.warnings,
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
    if (snapshot.warnings.length) {
      // A property EOS could not check has to be visible here too, or `status` would quietly look
      // as authoritative as a fully verified one.
      lines.push('Unverified');
      for (const w of snapshot.warnings) lines.push(`  WARN  ${w}`);
      lines.push('');
    }
    lines.push('Product', `  ${product.state}${product.blockedBy ? ` — next guard: ${product.blockedBy.reason}` : ''}`, '');
    if (json.track) lines.push(...trackLines(json.track));
    // What the release gate will need, said from the first status on — not discovered at the release.
    const preview = releasePreview(snapshot);
    if (preview) { json.releasePreview = preview; lines.push(...previewLines(preview)); }
    if (!productCodeVerified) {
      lines.push('Scope of this verdict',
        snapshot.projectPresent
          ? '  NO PRODUCT CODE VERIFIED — .eos/project.json declares "config-only", so no test, lint or'
          : '  NO PRODUCT CODE VERIFIED — there is no .eos/project.json, so no test, lint or',
        '  eval command is executed. Every gate below is about documents and governance only.',
        '  Declare projectType "application" (or "library") with commands.test when code lands.',
        '');
    }
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
    const cross = crossBranchActivity(snapshot.root, {
      focus: decision.current?.scopeId ? [{ type: decision.current.scopeType, id: decision.current.scopeId }] : [],
    });
    json.crossBranch = { checked: cross.checked, base: cross.base?.ref ?? null, overlaps: cross.overlaps };
    lines.push(...crossBranchLines(cross));
    const drift = policyDrift(snapshot.root);
    if (drift) json.policyDrift = drift;
    lines.push(...policyDriftLines(drift));
    lines.push(`Recommended next`, `  ${decision.recommendedAction?.title || '—'}`, '', `  ${decision.recommendedAction?.command || ''}`, '');
    emit(flags, json, lines.join('\n'));
    return snapshot.errors.length ? EXIT.ERROR : EXIT.OK;
  },

  next(snapshot, flags) {
    const decision = route(snapshot);
    const focus = decision.current?.scopeId ? [{ type: decision.current.scopeType, id: decision.current.scopeId }] : [];
    const cross = crossBranchActivity(snapshot.root, { focus });
    // Only present when there is something to say, so the common case's JSON is unchanged.
    if (cross.overlaps.length) decision.crossBranch = { base: cross.base.ref, overlaps: cross.overlaps };
    const drift = policyDrift(snapshot.root);
    if (drift) decision.policyDrift = drift;
    // Only when something is missing, once there is product code to prepare a release of, and not
    // while a release is the focus (its real G8 blockers are already the card): the common case's
    // JSON is unchanged. `eos status` shows the full list from day one.
    const preview = decision.current?.scopeType === 'release' || snapshot.project?.projectType === 'config-only' ? null : releasePreview(snapshot);
    const ahead = preview && preview.items.some((i) => !i.ready) ? preview : null;
    if (ahead) decision.releasePreview = ahead;
    const extra = [...previewLines(ahead, { compact: true }), ...crossBranchLines(cross), ...policyDriftLines(drift)];
    emit(flags, decision, renderCard(decision, { why: !!flags.why, all: !!flags.all }) + (extra.length ? `\n${extra.join('\n')}` : ''));
    return cardExit(flags, decision.exitCode);
  },

  resume(snapshot, flags) {
    const decision = route(snapshot);
    // Record the focus locally so a new chat session starts where the last one stopped. This file
    // is gitignored and carries no authority — only a scope id and a change type. The product is
    // never pinned: it is where `next` starts anyway, and a pinned one outlived the baseline.
    if (decision.current.scopeId && decision.current.scopeType !== 'product') {
      const { path, branch } = activeWorkPath(snapshot.root);
      const full = join(snapshot.root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify({
        schemaVersion: 1,
        scopeType: decision.current.scopeType,
        scopeId: decision.current.scopeId,
        ...(branch ? { branch } : {}),
        updatedAt: new Date().toISOString(),
      }, null, 2) + '\n', 'utf8');
    }
    const lastGate = [...snapshot.events].reverse().find((e) => e.type === 'gate' && e.scope?.id === decision.current.scopeId && e.status === 'PASS');
    const card = renderCard(decision, { why: !!flags.why, all: !!flags.all });
    const extra = lastGate ? `\nLast verified gate\n  ${lastGate.gate} — PASS at ${lastGate.ts}\n` : '';
    emit(flags, decision, card + extra);
    return cardExit(flags, decision.exitCode);
  },

  /**
   * One screen answering "what state is this project actually in?".
   *
   * `status` answers "what do I do next" and deliberately shows one thing. This answers the other
   * question a lead asks — how much is blocked, how much of what is green is actually stale, what
   * exceptions are outstanding, and is the trend getting better or worse. Every number here is
   * derived from records that already existed (evidence, the ledger, waivers); none of it is a new
   * source of truth, because a dashboard that can disagree with the engine is worse than no
   * dashboard.
   */
  async health(snapshot, flags) {
    const gates = snapshot.gates?.gates || [];
    const events = readEvents(snapshot.root).events;

    // --- workflow progress: the product spine, in order
    const productGates = gates.filter((g) => g.scope === 'product');
    const progress = productGates.map((def) => {
      const policy = gatePolicy(snapshot, 'PRODUCT_BASELINE', def.id);
      const recorded = recordedGateStatus(snapshot, def.id, 'product', 'product');
      return { gate: def.id, code: def.code, policy, status: policy === 'not_applicable' ? 'NOT_APPLICABLE' : (recorded?.status || 'PENDING') };
    });
    const done = progress.filter((p) => ['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(p.status)).length;

    // --- stale evidence: green that has stopped meaning anything
    const stale = [];
    for (const { file, evidence } of listEvidence(snapshot.root)) {
      if (!evidence) { stale.push({ file, gate: null, scope: null, reason: 'unreadable' }); continue; }
      const def = gates.find((g) => g.id === evidence.gate);
      const f = evidenceFreshness(snapshot.root, evidence, {
        gateDefinition: def,
        expectedInputs: gateInputs(snapshot, evidence.gate, evidence.scope.type, evidence.scope.id),
        collections: gateCollections(snapshot, evidence.gate, evidence.scope.type, evidence.scope.id),
      });
      if (f.status === 'STALE') stale.push({ file, gate: evidence.gate, scope: evidence.scope.id, reason: f.reasons[0] });
    }

    // --- waivers: every exception currently in force, and every one that has outlived itself
    const { waivers, errors: waiverErrors } = loadWaivers(snapshot.root);
    const expired = expiredWaivers(snapshot.root);
    const waiverRows = waivers.map((w) => {
      const s = waiverStatus(w.waiver, {
        gateId: w.waiver?.gate, scopeType: w.waiver?.scope?.type, scopeId: w.waiver?.scope?.id,
      });
      return {
        gate: w.waiver?.gate ?? null,
        scope: w.waiver?.scope?.id ?? null,
        riskOwner: w.waiver?.riskOwner ?? null,
        approver: w.waiver?.approver || null,
        expiresOn: w.waiver?.expiresOn ?? null,
        expired: expired.some((e) => e.file === w.file),
        // A drafted waiver is NOT in effect but IS an outstanding exception someone intends to
        // take. Hiding it until approval would mean the one moment it is worth reviewing — before
        // it starts lifting a gate — is the one moment it is invisible.
        inEffect: s.honored,
        why: s.reason,
        file: w.file,
      };
    });

    // --- gate trend: is the first-pass rate improving or degrading?
    const gateEvents = events.filter((e) => e.type === 'gate');
    const recent = gateEvents.slice(-20);
    const rate = (list) => (list.length ? Math.round((list.filter((e) => e.status === 'PASS').length / list.length) * 100) : null);
    const trend = { total: gateEvents.length, allTimePassRate: rate(gateEvents), recentPassRate: rate(recent), recentWindow: recent.length };
    // Local only: this machine's suite timings, from run-tests.mjs. The enforced number is the CI
    // baseline; this answers "is it getting slower here, and since when?".
    const testDurations = testDurationTrend(snapshot.root);

    // --- remote governance: what EOS could not verify by itself
    const { providers, errors: providerErrors } = loadProviders(snapshot.root);
    const remote = { configured: providers.map((p) => ({ adapter: p.adapter, subjects: p.subjects })), errors: providerErrors };

    // --- releases
    const releases = listManifests(snapshot.root)
      .filter((m) => m.releaseId)
      .map((m) => ({ releaseId: m.releaseId, state: scopeState(snapshot, 'release', m.releaseId), stories: m.manifest?.includedStories?.length ?? 0 }));

    const decision = route(snapshot);
    const blockers = decision.blockers || [];

    const json = {
      schemaVersion: 1,
      profile: snapshot.profileName,
      productCodeVerified: snapshot.projectPresent && snapshot.project?.projectType !== 'config-only',
      progress: { done, total: progress.length, gates: progress },
      blockers,
      staleEvidence: stale,
      waivers: waiverRows,
      waiverErrors,
      remoteGovernance: remote,
      releases,
      trend,
      testDurations,
      stories: snapshot.stories.map((s) => ({ id: s.id, state: scopeState(snapshot, 'story', s.id) })),
    };

    const bar = `${'█'.repeat(done)}${'░'.repeat(Math.max(0, progress.length - done))}`;
    const lines = [`EOS health · ${snapshot.profileName}`, ''];
    lines.push('Product baseline', `  ${bar}  ${done}/${progress.length} gates satisfied`);
    for (const p of progress) lines.push(`  ${p.status.padEnd(15)} ${p.gate}`);
    lines.push('');
    if (!json.productCodeVerified) lines.push('Scope', '  NO PRODUCT CODE VERIFIED — every gate above is about documents and governance only', '');
    lines.push(`Blockers (${blockers.length})`);
    if (!blockers.length) lines.push('  none');
    for (const b of blockers.slice(0, 8)) lines.push(`  ${String(b.status).padEnd(10)} ${b.gate}/${b.check} — ${b.detail}`);
    lines.push('');
    lines.push(`Stale evidence (${stale.length})`);
    if (!stale.length) lines.push('  none — every recorded result still describes its inputs');
    for (const s of stale.slice(0, 8)) lines.push(`  ${String(s.gate).padEnd(20)} ${String(s.scope).padEnd(14)} ${s.reason}`);
    lines.push('');
    lines.push(`Waivers (${waiverRows.length} · ${waiverRows.filter((w) => w.inEffect).length} in effect · ${waiverRows.filter((w) => w.expired).length} expired)`);
    if (!waiverRows.length) lines.push('  none — nothing is being carried as an exception');
    for (const w of waiverRows) {
      const state = w.expired ? 'EXPIRED' : w.inEffect ? 'IN EFFECT' : 'DRAFT';
      lines.push(`  ${state.padEnd(9)} ${String(w.gate).padEnd(18)} ${String(w.scope).padEnd(14)} owner ${w.riskOwner} until ${w.expiresOn}`);
      if (!w.inEffect) lines.push(`            ${w.why}`);
    }
    for (const e of waiverErrors) lines.push(`  ERROR ${e}`);
    lines.push('');
    lines.push('Remote governance');
    if (!remote.configured.length) lines.push('  no provider configured — anything EOS cannot verify locally stays BLOCKED/UNVERIFIED by design');
    for (const p of remote.configured) lines.push(`  ${p.adapter} → ${(p.subjects || []).join(', ')}`);
    for (const e of remote.errors) lines.push(`  ERROR ${e}`);
    lines.push('');
    lines.push('Releases');
    if (!releases.length) lines.push('  none');
    for (const r of releases) lines.push(`  ${String(r.releaseId).padEnd(14)} ${String(r.state).padEnd(12)} ${r.stories} story/stories`);
    lines.push('');
    lines.push('Gate trend',
      trend.total ? `  ${trend.total} gate run(s) recorded · first-pass rate ${trend.allTimePassRate}% all time · ${trend.recentPassRate}% over the last ${trend.recentWindow}` : '  no gate has been run yet');
    lines.push('');
    lines.push('Test duration trend (this machine)');
    if (!testDurations.runs) lines.push('  no local history yet — run `node .github/eos/run-tests.mjs` to start one');
    for (const [name, d] of Object.entries(testDurations.layers)) {
      const change = d.changePct === null
        ? `${d.samples} run(s) so far — a trend needs 6`
        : `${d.changePct >= 0 ? '+' : ''}${d.changePct}% vs the previous 5 runs`;
      lines.push(`  ${name.padEnd(18)} latest ${String(d.latestMs).padStart(6)}ms · median ${String(d.recentMedianMs).padStart(6)}ms · ${change}`);
    }
    lines.push('');
    emit(flags, json, lines.join('\n'));
    // Health REPORTS; it does not gate. Exit stays 0 unless the state source itself is broken, so
    // it is safe in a shell prompt or a watch loop.
    return EXIT.OK;
  },

  focus(snapshot, flags) {
    const scopeType = flags.scope === true || !flags.scope ? 'story' : flags.scope;
    const scopeId = flags.id;
    if (!scopeId || scopeId === true) { console.log('focus requires --scope <type> --id <id>'); return EXIT.FAIL; }
    const { path, branch } = activeWorkPath(snapshot.root);
    const full = join(snapshot.root, path);
    mkdirSync(dirname(full), { recursive: true });
    if (flags['change-type']) {
      console.log('focus does not accept --change-type: a change type selects the gate policy, so it belongs in the tracked story file, not in a gitignored local file.');
      return EXIT.FAIL;
    }
    const body = { schemaVersion: 1, scopeType, scopeId: String(scopeId), ...(branch ? { branch } : {}), updatedAt: new Date().toISOString() };
    writeFileSync(full, JSON.stringify(body, null, 2) + '\n', 'utf8');
    emit(flags, body, `EOS focus · ${scopeType}/${scopeId}${branch ? ` on ${branch}` : ''} (local only — ${path} is gitignored and carries no authority)\n`);
    return EXIT.OK;
  },
};
