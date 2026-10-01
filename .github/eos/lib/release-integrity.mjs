// Release integrity: what a release ships, bound and verified offline (ADR-012).
//
// `eos release bind` records the shipped artifacts (by SHA-256), the SBOM and the ledger head in the
// release manifest. `eos release sign` signs it. `eos release verify` and the release gate's
// `manifest-signature` and `release-integrity` checks verify all of it through the functions below,
// so the command and the gate cannot disagree.
//
// The track decides only what ABSENCE means. Anything present must verify on both tracks: a
// signature that does not match, or an artifact that differs from its manifest, is a FAIL on
// Standard too. Tampering is never optional. Absent signatures, artifacts, provenance or SBOM block
// a Regulated release; on Standard they are NOT_APPLICABLE, with the command that would add them.
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, isAbsolute, relative, resolve, sep, dirname } from 'node:path';
import { sha256File } from './evidence.mjs';
import { readEvents } from './ledger.mjs';
import { SBOM_PATH, sbomDigest } from './sbom.mjs';
import { trackOf } from './track.mjs';
import { loadPublicKey, verifyDocument, keyId } from './signing.mjs';
import { provenanceSubjects } from './provenance.mjs';

const CLI = 'node .github/eos/eos.mjs';
const posix = (p) => p.split(sep).join('/');
const pass = (detail) => ({ status: 'PASS', detail });
const fail = (detail) => ({ status: 'FAIL', detail });
const blocked = (detail) => ({ status: 'BLOCKED', detail });
const na = (detail) => ({ status: 'NOT_APPLICABLE', detail });

/** The real path of `path`, resolving symlinks through its deepest existing ancestor. */
function realish(path) {
  let p = resolve(path);
  const rest = [];
  while (!existsSync(p)) { const up = dirname(p); if (up === p) break; rest.unshift(p.slice(up.length).replace(/^[\\/]/, '')); p = up; }
  let real = p;
  try { real = realpathSync(p); } catch { /* keep the resolved form */ }
  return rest.length ? join(real, ...rest) : real;
}

/**
 * Is `path` inside `root`? Compared by REAL path: on macOS the temp and home directories are often
 * reached through symlinks (/var → /private/var), and git reports the repository's real path, so a
 * plain string comparison let a path inside the repository look outside it.
 */
export function insideRoot(root, path) {
  const rel = relative(realish(root), realish(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The files a pattern names. Patterns are repository-relative; a `*` may appear in the file-name
 * part only (`dist/*.tgz`), which is what release outputs need and stays predictable.
 */
export function expandArtifacts(root, patterns) {
  const out = new Set();
  for (const pattern of patterns || []) {
    const p = posix(String(pattern)).replace(/^\.\//, '');
    if (p.includes('..') || isAbsolute(p)) continue;
    const slash = p.lastIndexOf('/');
    const dir = slash < 0 ? '' : p.slice(0, slash);
    const base = slash < 0 ? p : p.slice(slash + 1);
    if (dir.includes('*')) continue;
    if (!base.includes('*')) { if (existsSync(join(root, p)) && statSync(join(root, p)).isFile()) out.add(p); continue; }
    const re = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    let names = [];
    try { names = readdirSync(join(root, dir)); } catch { continue; }
    for (const name of names.sort()) {
      const rel = dir ? `${dir}/${name}` : name;
      if (re.test(name) && statSync(join(root, rel)).isFile()) out.add(rel);
    }
  }
  return [...out].sort();
}

export const artifactRecord = (root, rel) => ({ path: rel, sha256: sha256File(root, rel), size: statSync(join(root, rel)).size });

/** The SBOM's identity by CONTENT, so a CRLF checkout of it is the same SBOM. */
function sbomRecord(root) {
  const full = join(root, SBOM_PATH);
  if (!existsSync(full)) return null;
  try { return { path: SBOM_PATH, sha256: sbomDigest(JSON.parse(readFileSync(full, 'utf8'))) }; } catch { return null; }
}

function ledgerHead(root) {
  const { events } = readEvents(root);
  const last = events.at(-1);
  return last?.hash ? { seq: last.seq, hash: last.hash } : null;
}

/**
 * Bind a manifest to what this checkout would ship. Any signature is dropped: it was over
 * different content, and keeping it would make the file look signed while proving nothing.
 */
export function bindRelease(root, project, manifest, { artifacts = null, provenance = [] } = {}) {
  const paths = artifacts?.length ? expandArtifacts(root, artifacts) : expandArtifacts(root, project?.release?.artifacts || []);
  const { signature, ...rest } = manifest;
  const bound = { ...rest };
  if (paths.length) bound.artifacts = paths.map((p) => artifactRecord(root, p));
  else delete bound.artifacts;
  const sbom = sbomRecord(root);
  if (sbom) bound.sbom = sbom; else delete bound.sbom;
  const head = ledgerHead(root);
  if (head) bound.ledger = head; else delete bound.ledger;
  const prov = provenance.map((p) => posix(String(p)).replace(/^\.\//, '')).filter(Boolean);
  if (prov.length) bound.provenance = prov.map((path) => ({ type: /intoto/.test(path) ? 'slsa' : 'github-attestation', path }));
  return { manifest: bound, droppedSignature: !!signature, artifacts: paths };
}

/** The project's declared release key, loaded. */
export function releaseSigningKey(root, project) {
  const rel = project?.release?.signing?.publicKey;
  if (!rel) return { declared: false, path: null, key: null, keyId: null, problem: null };
  const full = join(root, rel);
  if (!existsSync(full)) return { declared: true, path: rel, key: null, keyId: null, problem: `the declared release key ${rel} does not exist` };
  try {
    const key = loadPublicKey(readFileSync(full, 'utf8'));
    return { declared: true, path: rel, key, keyId: keyId(key), problem: null };
  } catch (e) {
    return { declared: true, path: rel, key: null, keyId: null, problem: `the declared release key ${rel} cannot be used: ${e.message}` };
  }
}

function signatureVerdict(root, project, manifest, regulated) {
  const id = manifest.releaseId;
  const key = releaseSigningKey(root, project);
  if (manifest.signature) {
    if (!key.declared) return fail('the manifest is signed, but .eos/project.json declares no release.signing.publicKey to verify it against');
    if (key.problem) return fail(key.problem);
    const v = verifyDocument('manifest', manifest, key.key);
    return v.valid ? pass(`signed by the project's release key ${key.keyId.slice(0, 12)}…`) : fail(`the manifest ${v.problem.replace(/^the /, '')}`);
  }
  if (regulated) return fail(`a Regulated release needs a signed manifest — run \`${CLI} release sign --release ${id} --key <private-key-file>\``);
  return na(`Standard track: an unsigned manifest is allowed — \`${CLI} release sign --release ${id} --key <file>\` makes it tamper-evident`);
}

function artifactVerdict(root, manifest, regulated) {
  const listed = manifest.artifacts || [];
  if (!listed.length) {
    return regulated
      ? fail('a Regulated release must list the artifacts it ships — declare release.artifacts in .eos/project.json, build, then `eos release bind`')
      : na('Standard track: no artifacts are listed, so there is nothing to bind');
  }
  const absent = [];
  const mismatched = [];
  for (const a of listed) {
    const full = join(root, a.path);
    if (!existsSync(full)) { absent.push(a.path); continue; }
    const actual = sha256File(root, a.path);
    if (actual !== a.sha256) mismatched.push(`${a.path} does not match the manifest (sha256 ${actual.slice(0, 12)}… ≠ ${a.sha256.slice(0, 12)}…) — was it rebuilt after binding?`);
  }
  if (mismatched.length) return fail(mismatched.join('; '));
  if (absent.length === listed.length) {
    const why = `none of the ${listed.length} listed artifact(s) is present here — verify where they were built (CI)`;
    return regulated ? blocked(why) : na(`Standard track: ${why}`);
  }
  return pass(`${listed.length - absent.length}/${listed.length} artifact(s) match the manifest${absent.length ? ` (${absent.length} not present here)` : ''}`);
}

function provenanceVerdict(root, manifest, regulated, extraPaths) {
  const listed = manifest.artifacts || [];
  const paths = [...(manifest.provenance || []).filter((p) => p.path).map((p) => p.path), ...extraPaths.map((p) => posix(String(p)))];
  if (!paths.length) {
    if (!listed.length) return na('no artifacts are listed, so there is no provenance to bind');
    return regulated
      ? fail(`a Regulated release needs provenance for every artifact — \`${CLI} release bind --release ${manifest.releaseId} --provenance <file>\``)
      : na('Standard track: no provenance is attached — attest the build in CI (.github/workflows/eos-release.yml) to add it');
  }
  const subjects = [];
  const problems = [];
  for (const p of [...new Set(paths)]) {
    const full = join(root, p);
    if (!existsSync(full)) { problems.push(`${p} does not exist`); continue; }
    const r = provenanceSubjects(readFileSync(full, 'utf8'), p);
    subjects.push(...r.subjects);
    problems.push(...r.problems);
  }
  if (problems.length) return fail(problems.join('; '));
  if (!listed.length) return na('provenance is attached, but the manifest lists no artifact for it to cover');
  const digests = new Set(subjects.map((s) => s.sha256));
  const uncovered = listed.filter((a) => !digests.has(a.sha256));
  if (uncovered.length) return fail(uncovered.map((a) => `no provenance names ${a.path} (sha256 ${a.sha256.slice(0, 12)}…)`).join('; '));
  return pass(`provenance covers ${listed.length}/${listed.length} artifact(s) by digest — its own signature is checked by \`gh attestation verify\` (the github-attestation provider), not offline`);
}

function sbomVerdict(root, manifest, regulated) {
  if (!manifest.sbom) {
    return regulated
      ? fail(`a Regulated release must record its SBOM — \`${CLI} sbom --write\`, then \`${CLI} release bind --release ${manifest.releaseId}\``)
      : na('Standard track: no SBOM is recorded in the manifest');
  }
  const now = sbomRecord(root);
  if (!now) return fail(`the manifest records an SBOM, but ${SBOM_PATH} is missing or unreadable`);
  return now.sha256 === manifest.sbom.sha256 ? pass('the SBOM is the one the release was bound to') : fail('the dependencies changed since the release was bound — the SBOM no longer matches; re-bind');
}

function ledgerVerdict(root, manifest, regulated) {
  if (!manifest.ledger) {
    return regulated ? fail('a Regulated release must be bound to the ledger state it was cut from — run a gate, then `eos release bind`') : na('Standard track: no ledger state is recorded');
  }
  const { events } = readEvents(root);
  const at = events.find((e) => e.seq === manifest.ledger.seq);
  if (!at) return fail(`the ledger has no event ${manifest.ledger.seq} — the release was bound to a history this checkout does not have`);
  return at.hash === manifest.ledger.hash ? pass(`bound to ledger event ${manifest.ledger.seq}`) : fail(`ledger event ${manifest.ledger.seq} is not the one the release was bound to — the history was rewritten`);
}

const RANK = { FAIL: 3, BLOCKED: 2, PASS: 1, NOT_APPLICABLE: 0 };

/**
 * Verify a release manifest against this checkout.
 * @returns {{track:string, signature:object, artifacts:object, provenance:object, sbom:object, ledger:object, integrity:object}}
 */
export function verifyRelease(root, project, manifest, { provenance = [] } = {}) {
  const regulated = trackOf(project).name === 'regulated';
  const parts = {
    artifacts: artifactVerdict(root, manifest, regulated),
    provenance: provenanceVerdict(root, manifest, regulated, provenance),
    sbom: sbomVerdict(root, manifest, regulated),
    ledger: ledgerVerdict(root, manifest, regulated),
  };
  const worst = Object.values(parts).reduce((a, p) => (RANK[p.status] > RANK[a] ? p.status : a), 'NOT_APPLICABLE');
  const notes = Object.entries(parts).filter(([, p]) => p.status === worst).map(([k, p]) => `${k}: ${p.detail}`);
  return {
    track: regulated ? 'regulated' : 'standard',
    signature: signatureVerdict(root, project, manifest, regulated),
    ...parts,
    integrity: { status: worst, detail: notes.join(' · ') },
  };
}
