// EOS commands — releases and the authorities they rest on: manifests, readiness, the product tree, providers.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { scopeState } from '../lib/state.mjs';
import { prepareGateRun, evaluateGate, isBlocking, gateProblems } from '../lib/gates.mjs';
import { recordGateRun } from '../lib/record.mjs';
import { appendEvent } from '../lib/ledger.mjs';
import { route } from '../lib/router.mjs';
import { renderGate } from '../lib/render.mjs';
import { currentProductTree, uncommittedProductChanges } from '../lib/product-tree.mjs';
import { readManifest, manifestPath, manifestDigest as computeManifestDigest, listManifests } from '../lib/release.mjs';
import { loadProviders, consult } from '../adapters/contract.mjs';
import { expiredWaivers } from '../lib/waivers.mjs';
import { writeFileAtomic } from '../lib/atomic.mjs';
import { EXIT, statusExit, emit, consultProviders } from './shared.mjs';

export const releaseCommands = {
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

  /** What external authorities this project consults, and what they say right now. */
  async providers(snapshot, flags) {
    const { present, providers, errors } = loadProviders(snapshot.root);
    if (errors.length) {
      emit(flags, { errors }, `EOS providers\n\n${errors.map((e) => `  ERROR ${e}`).join('\n')}\n`);
      return EXIT.ERROR;
    }
    const verdicts = [];
    for (const subject of ['enforcement-authority', 'evidence-provenance']) {
      const v = await consult(snapshot.root, subject, { providers });
      if (v) verdicts.push(v);
    }
    const lines = ['EOS providers', ''];
    if (!present) {
      lines.push('  none configured — every gate still reaches a verdict offline.',
        '  A provider can only ever RAISE a verdict EOS already reached on its own; it can never',
        '  create a new blocker. See .eos/schemas/providers.schema.json and ADR-005.', '');
    } else if (!verdicts.length) {
      lines.push('  configured, but no provider covers a known subject.', '');
    } else {
      for (const v of verdicts) {
        lines.push(`  ${v.subject.padEnd(22)} ${v.status.padEnd(11)} ${v.provider}`, `    ${v.detail}`, '');
      }
    }
    emit(flags, { configured: present, providers, verdicts }, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Scaffold or re-bind a release manifest. It PROPOSES; the human decides. EOS will not infer what
   * a release ships — inferring it is exactly the behaviour the manifest replaces.
   */
  release(snapshot, flags) {
    const sub = flags._[1];
    const id = typeof flags.release === 'string' ? flags.release : (typeof flags.id === 'string' ? flags.id : null);
    if (!['init', 'bind', 'list'].includes(sub)) {
      console.log('usage: release init|bind|list [--release <id>]');
      return EXIT.FAIL;
    }
    if (sub === 'list') {
      const all = listManifests(snapshot.root);
      const json = { releases: all.map((m) => ({ releaseId: m.releaseId, file: m.file, digest: m.digest, state: m.releaseId ? scopeState(snapshot, 'release', m.releaseId) : null, includedStories: m.manifest?.includedStories || [] })) };
      const lines = ['EOS releases', ''];
      if (!all.length) lines.push('  none — create one with `eos release init --release <id>`');
      for (const m of json.releases) lines.push(`  ${String(m.releaseId).padEnd(14)} ${String(m.state).padEnd(12)} ${m.includedStories.length} story/stories  ${m.file}`);
      lines.push('');
      emit(flags, json, lines.join('\n'));
      return EXIT.OK;
    }
    if (!id) { console.log(`release ${sub} requires --release <id>`); return EXIT.FAIL; }

    const rel = manifestPath(id);
    const full = join(snapshot.root, rel);
    const existing = readManifest(snapshot.root, id);
    if (sub === 'init' && existing.present) {
      console.log(`EOS release init · ${rel} already exists — edit it, or use \`release bind\` to re-bind it to the current candidate.`);
      return EXIT.FAIL;
    }
    if (sub === 'bind' && !existing.manifest) {
      console.log(`EOS release bind · ${rel} ${existing.present ? `is not valid: ${existing.errors.join('; ')}` : 'does not exist — run `release init` first'}`);
      return EXIT.FAIL;
    }

    const tree = currentProductTree(snapshot.root);
    const shippable = snapshot.stories.filter((s) => !['SPIKE', 'DOC_ONLY'].includes(s.changeType || 'FEATURE'));
    let manifest;
    if (sub === 'init') {
      // The proposal deliberately includes only stories that are ALREADY verified, and lists the
      // rest as exclusions with a placeholder reason the author must replace. A manifest that
      // silently swept in unfinished work would recreate the problem it exists to solve.
      const verified = shippable.filter((s) => ['VERIFIED', 'MERGED'].includes(scopeState(snapshot, 'story', s.id)));
      const rest = shippable.filter((s) => !verified.includes(s));
      manifest = {
        $schema: '../schemas/release-manifest.schema.json',
        schemaVersion: 1,
        releaseId: String(id),
        candidateCommit: snapshot.commit,
        productTreeDigest: tree.identity?.digest ?? null,
        includedStories: verified.map((s) => s.id),
        ...(rest.length ? { excludedStories: rest.map((s) => ({ id: s.id, reason: 'TODO: say why this is not in this release' })) } : {}),
        targetEnvironments: ['production'],
        requiredApprovals: { count: 1 },
      };
    } else {
      manifest = { ...existing.manifest, candidateCommit: snapshot.commit, productTreeDigest: tree.identity?.digest ?? null };
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileAtomic(full, JSON.stringify(manifest, null, 2) + '\n');
    const digest = computeManifestDigest(manifest);
    const lines = [`EOS release ${sub} · ${rel}`, '',
      `  candidate   ${snapshot.commit ? snapshot.commit.slice(0, 8) : '(no git)'}`,
      `  tree        ${tree.identity ? tree.identity.digest.slice(0, 12) : '(unavailable)'}`,
      `  included    ${manifest.includedStories.length ? manifest.includedStories.join(', ') : '(none)'}`,
      `  excluded    ${(manifest.excludedStories || []).length}`,
      `  digest      ${digest.slice(0, 12)}`, ''];
    if (sub === 'init') {
      lines.push('  This is a PROPOSAL. Decide what belongs in the release: replace every TODO reason,',
        '  and move stories between included/excluded. EOS records the decision; it does not make it.', '');
    } else {
      lines.push('  Re-bound to the current candidate. Any approval given for the previous manifest no',
        '  longer applies — that is deliberate.', '');
    }
    emit(flags, { file: rel, manifest, digest }, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * The identity of the tree a verification applies to. Test runners embed this digest in their
   * machine summary, which is how EOS can tell "these results describe this code" from "these
   * results describe some code".
   */
  'product-tree'(snapshot, flags) {
    const tree = currentProductTree(snapshot.root);
    if (!tree.available) {
      emit(flags, { available: false, reason: tree.reason }, `EOS product tree\n\n  BLOCKED  ${tree.reason}\n`);
      return EXIT.BLOCKED;
    }
    const dirty = uncommittedProductChanges(snapshot.root) || [];
    const json = { available: true, commit: snapshot.commit, productTree: tree.identity, uncommitted: dirty };
    const lines = ['EOS product tree', '',
      `  digest      ${tree.identity.digest}`,
      `  algorithm   ${tree.identity.algorithm}@${tree.identity.version}`,
      `  files       ${tree.identity.fileCount}`,
      `  commit      ${snapshot.commit || '(none)'}`,
      dirty.length ? `  uncommitted ${dirty.length} product file(s) — a release candidate must be committed` : '  uncommitted none', ''];
    emit(flags, json, lines.join('\n'));
    return EXIT.OK;
  },

  async 'verify-release'(snapshot, flags) {
    const id = flags.release === true || !flags.release ? null : flags.release;
    if (!id) { console.log('verify-release requires --release <id>'); return EXIT.FAIL; }
    const providerVerdicts = await consultProviders(snapshot, 'release-ready');
    const { result, evidence, evidenceFile } = prepareGateRun(snapshot, 'release-ready', 'release', id, { providerVerdicts });
    // Bound to the candidate when the evidence names the commit being released. Read from the
    // prepared evidence rather than re-read from disk: it is the same object that gets written.
    const boundToCandidate = !!snapshot.commit && evidence?.commit === snapshot.commit;
    const expired = expiredWaivers(snapshot.root);
    const status = result.status === 'PASS' && !boundToCandidate ? 'BLOCKED' : result.status;
    // The SAME event shape `check` writes. Recording a different type here left the release
    // evidence with no matching gate entry, so the very next transition rejected it as
    // "evidence without a ledger entry" — verify-release could never promote anything.
    recordGateRun(snapshot.root, {
      evidence,
      evidenceFile,
      event: { type: 'gate', scope: { type: 'release', id: String(id) }, changeType: result.changeType, gate: 'release-ready', status, commit: snapshot.commit },
    });
    appendEvent(snapshot.root, { type: 'release', scope: { type: 'release', id }, gate: 'release-ready', status, commit: snapshot.commit, detail: evidenceFile || '' });
    const lines = [renderGate(result, { evidenceFile }),
      boundToCandidate ? `  evidence is bound to the candidate commit ${String(snapshot.commit).slice(0, 8)}` : '  BLOCKED: the evidence is not bound to a candidate commit (no git repository, or HEAD moved)',
      expired.length ? `  BLOCKED: ${expired.length} expired waiver(s)` : '', ''];
    emit(flags, { release: id, status, boundToCandidate, expiredWaivers: expired.map((w) => w.file), result, problems: gateProblems(result) }, lines.filter(Boolean).join('\n'));
    return statusExit(status);
  },
};
