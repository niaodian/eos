// Release manifests — what a release actually contains.
//
// Before this, the release gate reasoned about "every story under docs/stories/ that is not a SPIKE
// or DOC_ONLY". That is a stand-in for membership, not membership: a story finished months ago was
// re-verified against every future candidate, two release trains could not exist at the same time,
// and a hotfix dragged unrelated work along with it.
//
// A manifest states the membership explicitly and is bound to the candidate it was written for. It
// records the PLAN only. Approvals are ledger events that carry this file's digest, so editing the
// manifest invalidates them instead of letting them transfer to a different set of stories.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from './schema.mjs';

export const RELEASES_DIR = '.eos/releases';

export const manifestPath = (releaseId) =>
  `${RELEASES_DIR}/${String(releaseId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

/**
 * The identity of a manifest's DECISIONS — not of its bytes. Reformatting, reordering the story
 * list or adding a note must not invalidate an approval; changing what ships must.
 */
export function manifestDigest(manifest) {
  const canonical = {
    releaseId: String(manifest.releaseId),
    candidateCommit: manifest.candidateCommit ?? null,
    productTreeDigest: manifest.productTreeDigest ?? null,
    includedStories: [...(manifest.includedStories || [])].map(String).sort(),
    excludedStories: [...(manifest.excludedStories || [])]
      .map((e) => ({ id: String(e.id), reason: String(e.reason) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    targetEnvironments: [...(manifest.targetEnvironments || [])].map(String).sort(),
    artifactRefs: [...(manifest.artifactRefs || [])]
      .map((a) => ({ name: String(a.name), ref: String(a.ref), digest: a.digest ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    requiredEvidence: [...(manifest.requiredEvidence || [])].map(String).sort(),
    requiredApprovals: manifest.requiredApprovals?.count ?? 1,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Read + schema-validate one manifest.
 * A missing schema is an ERROR, never a silent pass: an unvalidatable manifest decides what ships.
 * @returns {{present:boolean, path:string, manifest:object|null, digest:string|null, errors:string[]}}
 */
export function readManifest(root, releaseId) {
  const rel = manifestPath(releaseId);
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, path: rel, manifest: null, digest: null, errors: [] };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, path: rel, manifest: null, digest: null, errors: [`${rel}: invalid JSON (${e.message})`] };
  }
  let schema;
  try { schema = JSON.parse(readFileSync(join(root, '.eos/schemas/release-manifest.schema.json'), 'utf8')); } catch (e) {
    return { present: true, path: rel, manifest: null, digest: null, errors: [`.eos/schemas/release-manifest.schema.json is missing or unreadable (${e.message}) — ${rel} cannot be validated, and an unvalidated manifest decides what ships`] };
  }
  const v = validate(schema, parsed, { label: rel });
  if (!v.valid) return { present: true, path: rel, manifest: null, digest: null, errors: v.errors.slice(0, 4) };
  if (String(parsed.releaseId) !== String(releaseId)) {
    return { present: true, path: rel, manifest: null, digest: null, errors: [`${rel}: declares releaseId "${parsed.releaseId}" but is being used for "${releaseId}" — a manifest belongs to exactly one release`] };
  }
  return { present: true, path: rel, manifest: parsed, digest: manifestDigest(parsed), errors: [] };
}

/**
 * Structural problems in an otherwise schema-valid manifest — the ones that need the repository to
 * answer, not the schema.
 * @returns {string[]}
 */
export function manifestProblems(snapshot, manifest) {
  const problems = [];
  const known = new Map(snapshot.stories.map((s) => [s.id, s]));
  const included = manifest.includedStories || [];

  const missing = included.filter((id) => !known.has(id));
  if (missing.length) problems.push(`included story/stories that do not exist under docs/stories/: ${missing.join(', ')}`);

  const excludedIds = new Set((manifest.excludedStories || []).map((e) => e.id));
  const both = included.filter((id) => excludedIds.has(id));
  if (both.length) problems.push(`story/stories listed as BOTH included and excluded: ${both.join(', ')}`);

  const unknownExcluded = [...excludedIds].filter((id) => !known.has(id));
  if (unknownExcluded.length) problems.push(`excluded story/stories that do not exist: ${unknownExcluded.join(', ')}`);

  // A story that ships must be a story that CAN ship. Relabelling one SPIKE/DOC_ONLY and listing it
  // here would otherwise carry unverified work into a release.
  const unshippable = included
    .map((id) => known.get(id))
    .filter((s) => s && ['SPIKE', 'DOC_ONLY'].includes(s.changeType || 'FEATURE'));
  if (unshippable.length) {
    problems.push(`included story/stories whose change type never ships: ${unshippable.map((s) => `${s.id} (${s.changeType})`).join(', ')}`);
  }

  // Every story the repository knows about must be accounted for — included, excluded with a
  // reason, or unshippable by classification. Silence about a story is the gap a manifest exists
  // to close, and it is exactly how a finished-but-forgotten story ships unnoticed.
  const accounted = new Set([...included, ...excludedIds]);
  const unaccounted = snapshot.stories
    .filter((s) => !accounted.has(s.id) && !['SPIKE', 'DOC_ONLY'].includes(s.changeType || 'FEATURE'))
    .map((s) => s.id);
  if (unaccounted.length) {
    problems.push(`story/stories neither included nor excluded: ${unaccounted.join(', ')} — decide each one (add it, or exclude it with a reason)`);
  }
  return problems;
}

/** Every manifest in the repository, so `release-status` can show the trains that exist. */
export function listManifests(root) {
  const dir = join(root, RELEASES_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      out.push({ file: `${RELEASES_DIR}/${name}`, releaseId: manifest.releaseId, manifest, digest: manifestDigest(manifest) });
    } catch { out.push({ file: `${RELEASES_DIR}/${name}`, releaseId: null, manifest: null, digest: null }); }
  }
  return out;
}

/**
 * Approvals recorded in the ledger for this release, restricted to the ones that were given for
 * THIS manifest. An approval is consent to ship a specific set of changes; letting it survive a
 * change to that set would make it consent to something nobody agreed to.
 */
export function validApprovals(events, releaseId, digest) {
  return events.filter((e) => e.type === 'approval'
    && e.scope?.type === 'release'
    && e.scope?.id === releaseId
    && e.manifestDigest === digest);
}
