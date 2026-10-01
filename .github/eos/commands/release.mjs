// EOS commands — releases and the authorities they rest on: manifests, readiness, the product tree, providers.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
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
import { generateSigningKey, loadPrivateKey, signDocument, keyId } from '../lib/signing.mjs';
import { bindRelease, verifyRelease, releaseSigningKey, insideRoot } from '../lib/release-integrity.mjs';

const CLI = 'node .github/eos/eos.mjs';
const list = (v) => (v === undefined || v === true ? [] : [].concat(v).map(String));
const STATUS_EXIT = { FAIL: EXIT.FAIL, BLOCKED: EXIT.BLOCKED };

/**
 * A release signing key: the public half in the repository, the private half outside it. A private
 * key inside the working tree is one `git add -A` from being published, so EOS refuses to write one
 * there; secret-scan would catch the commit, but refusing is cheaper than catching. (ADR-012)
 */
function releaseKeygen(snapshot, flags) {
  const root = snapshot.root;
  if (!snapshot.projectPresent || snapshot.project?.templateDefault) {
    console.log(`EOS release keygen · declare the project first (\`${CLI} init <pack> --write\`) — a release key belongs to a project.`);
    return EXIT.FAIL;
  }
  const publicRel = typeof flags.public === 'string' ? flags.public.replace(/\\/g, '/') : '.eos/keys/release.pub';
  const privatePath = typeof flags.out === 'string' ? resolve(flags.out) : join(homedir(), '.config', 'eos', 'keys', `${basename(root)}-release.pem`);
  const lines = ['EOS release keygen', ''];
  const refuse = (why) => { lines.push(`  refused  ${why}`, ''); emit(flags, { written: false, reason: why }, lines.join('\n')); return EXIT.FAIL; };
  if (insideRoot(root, privatePath)) return refuse(`${privatePath} is inside the repository — keep the private key outside it (the default is ~/.config/eos/keys/).`);
  if (!insideRoot(root, join(root, publicRel))) return refuse(`${publicRel} is outside the repository — the public key is committed with the project.`);
  if (existsSync(privatePath)) return refuse(`${privatePath} already exists — EOS never overwrites a key.`);
  if (existsSync(join(root, publicRel))) return refuse(`${publicRel} already exists — rotating a release key is a decision; remove the old key deliberately first.`);

  let id = '(generated with --write)';
  if (flags.write) {
    const k = generateSigningKey();
    id = k.keyId;
    mkdirSync(dirname(privatePath), { recursive: true });
    writeFileSync(privatePath, k.privatePem, { mode: 0o600, flag: 'wx' });
    mkdirSync(dirname(join(root, publicRel)), { recursive: true });
    writeFileSync(join(root, publicRel), k.publicPem, { flag: 'wx' });
    const projectFile = join(root, '.eos/project.json');
    const declared = JSON.parse(readFileSync(projectFile, 'utf8'));
    declared.release = { ...(declared.release || {}), signing: { publicKey: publicRel } };
    writeFileAtomic(projectFile, `${JSON.stringify(declared, null, 2)}\n`);
  }
  lines.push(`  keyId        ${id}`,
    `  public key   ${publicRel}   ${flags.write ? 'written — commit it' : 'would write'}`,
    `  private key  ${privatePath}   ${flags.write ? 'written (mode 600) — never commit it' : 'would write'}`,
    `  declared     .eos/project.json → release.signing.publicKey${flags.write ? '' : ' (would set)'}`, '',
    '  Sign a bound release:',
    `    ${CLI} release sign --release <id> --key ${privatePath}`,
    '  In CI, write the private key from a secret to a temporary file and pass it with --key.',
    '  EOS reads a key only when it is handed one; never from the environment.', '');
  if (!flags.write) lines.push('  Nothing was written. Re-run with --write to generate the key pair.', '');
  emit(flags, { written: !!flags.write, keyId: flags.write ? id : null, publicKey: publicRel, privateKey: privatePath }, lines.join('\n'));
  return EXIT.OK;
}

function releaseSign(snapshot, flags, id) {
  const root = snapshot.root;
  const m = readManifest(root, id);
  if (!m.manifest) { console.log(`EOS release sign · ${m.path} ${m.present ? `is not valid: ${m.errors.join('; ')}` : 'does not exist — run `release init` first'}`); return EXIT.FAIL; }
  if (typeof flags.key !== 'string') { console.log('release sign requires --key <private-key-file> — the private half of release.signing.publicKey'); return EXIT.FAIL; }
  const declared = releaseSigningKey(root, snapshot.project);
  if (!declared.declared) { console.log(`EOS release sign · .eos/project.json declares no release.signing.publicKey — run \`${CLI} release keygen --write\` first`); return EXIT.FAIL; }
  if (declared.problem) { console.log(`EOS release sign · ${declared.problem}`); return EXIT.FAIL; }
  let privateKey;
  try { privateKey = loadPrivateKey(readFileSync(resolve(flags.key), 'utf8')); } catch (e) {
    console.log(`EOS release sign · cannot use ${flags.key}: ${e.message}`);
    return EXIT.FAIL;
  }
  if (keyId(privateKey) !== declared.keyId) {
    console.log(`EOS release sign · ${flags.key} is not the project's release key (keyId ${keyId(privateKey).slice(0, 12)}… ≠ declared ${declared.keyId.slice(0, 12)}…)`);
    return EXIT.FAIL;
  }
  const signed = signDocument('manifest', m.manifest, privateKey);
  writeFileAtomic(join(root, m.path), `${JSON.stringify(signed, null, 2)}\n`);
  const lines = [`EOS release sign · ${m.path}`, '',
    `  signed by    ${declared.keyId}`,
    `  digest       ${m.digest.slice(0, 12)} (unchanged — approvals bound to it still apply)`, '',
    `  Verify:  ${CLI} release verify --release ${id}`, ''];
  emit(flags, { file: m.path, keyId: declared.keyId, digest: m.digest, signature: signed.signature }, lines.join('\n'));
  return EXIT.OK;
}

function releaseVerify(snapshot, flags, id) {
  const root = snapshot.root;
  const m = readManifest(root, id);
  if (!m.manifest) { console.log(`EOS release verify · ${m.path} ${m.present ? `is not valid: ${m.errors.join('; ')}` : 'does not exist'}`); return EXIT.FAIL; }
  const v = verifyRelease(root, snapshot.project, m.manifest, { provenance: list(flags.provenance) });
  const parts = ['signature', 'artifacts', 'provenance', 'sbom', 'ledger'];
  const lines = [`EOS release verify · ${m.path} · ${v.track === 'regulated' ? 'Regulated' : 'Standard'} track`, ''];
  for (const p of parts) lines.push(`  ${p.padEnd(11)} ${v[p].status.padEnd(15)} ${v[p].detail}`);
  const statuses = parts.map((p) => v[p].status);
  const worst = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('BLOCKED') ? 'BLOCKED' : 'PASS';
  lines.push('', worst === 'PASS' ? 'PASS — nothing present fails to verify' : worst, '');
  emit(flags, { release: id, file: m.path, ...v, status: worst }, lines.join('\n'));
  return STATUS_EXIT[worst] ?? EXIT.OK;
}

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
    if (!['init', 'bind', 'list', 'keygen', 'sign', 'verify'].includes(sub)) {
      console.log('usage: release init|bind|list|keygen|sign|verify [--release <id>]');
      return EXIT.FAIL;
    }
    if (sub === 'keygen') return releaseKeygen(snapshot, flags);
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
    if (sub === 'sign') return releaseSign(snapshot, flags, id);
    if (sub === 'verify') return releaseVerify(snapshot, flags, id);

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
    let binding = null;
    if (sub === 'bind') {
      // 2.0: what ships, by digest — the artifacts, the SBOM, the provenance — and the ledger event
      // that records this binding. The event carries the manifest's decision digest, which does not
      // include the ledger field, so the manifest can point at the event that points at it.
      binding = bindRelease(snapshot.root, snapshot.project, manifest, { artifacts: list(flags.artifact), provenance: list(flags.provenance) });
      manifest = binding.manifest;
      const event = appendEvent(snapshot.root, { type: 'release', scope: { type: 'release', id: String(id) }, commit: snapshot.commit, manifestDigest: computeManifestDigest(manifest), detail: `bound ${binding.artifacts.length} artifact(s)` });
      manifest = { ...manifest, ledger: { seq: event.seq, hash: event.hash } };
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
      lines.push(`  artifacts   ${binding.artifacts.length ? binding.artifacts.join(', ') : '(none — declare release.artifacts, or pass --artifact <path>)'}`,
        `  sbom        ${manifest.sbom ? manifest.sbom.sha256.slice(0, 12) : '(none — run eos sbom --write first)'}`,
        `  ledger      event ${manifest.ledger.seq}`, '',
        '  Re-bound to the current candidate. Any approval given for the previous manifest no',
        '  longer applies — that is deliberate.', ...(binding.droppedSignature ? ['  The previous signature was over different content and has been removed — sign again.'] : []), '');
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
