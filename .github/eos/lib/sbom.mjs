// SBOM generation — CycloneDX 1.5, from the lockfiles that are actually present.
//
// WHY THIS IS NOT JUST A LIST OF DEPENDENCIES
// An SBOM that nobody can tie to a specific build is a document, not evidence. The interesting
// question at a release gate is never "what does this project depend on" in the abstract — it is
// "what did THIS artifact contain". So the generated document binds:
//
//   the product-tree digest   what source this describes
//   the commit                which revision
//   the lockfile digests      the exact resolution that produced the component list
//
// which makes it invalidatable the same way gate evidence is: change the tree, and the SBOM that
// claimed to describe it no longer does.
//
// A ZERO-DEPENDENCY PROJECT STILL GETS AN SBOM. "No third-party components" is a strong, checkable
// claim, and emitting nothing would make it indistinguishable from "nobody ran the generator".
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { currentProductTree } from './product-tree.mjs';
import { sha256File } from './evidence.mjs';

export const SBOM_PATH = '.eos/sbom.json';

/** Lockfiles worth reading, per stack. Absence is reported, never silently treated as "none". */
const LOCKFILES = {
  node: ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'],
  python: ['poetry.lock', 'Pipfile.lock', 'requirements.txt'],
  go: ['go.sum'],
  rust: ['Cargo.lock'],
  java: [],
  dotnet: ['packages.lock.json'],
};

/** Parse an npm lockfile (v2/v3). Other ecosystems are reported as unparsed rather than guessed. */
function npmComponents(root, file) {
  let lock;
  try { lock = JSON.parse(readFileSync(join(root, file), 'utf8')); } catch { return null; }
  const packages = lock.packages || {};
  const out = [];
  for (const [path, meta] of Object.entries(packages)) {
    if (!path || path === '') continue; // the root project itself is not a component of itself
    const name = meta.name || path.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/');
    if (!name || !meta.version) continue;
    out.push({
      type: 'library',
      name,
      version: meta.version,
      purl: `pkg:npm/${name.replace(/^@/, '%40')}@${meta.version}`,
      scope: meta.dev ? 'optional' : 'required',
      ...(meta.integrity ? { hashes: [{ alg: 'SHA-512', content: meta.integrity.replace(/^sha512-/, '') }] } : {}),
    });
  }
  return out;
}

/**
 * Build the SBOM.
 * @returns {{sbom: object, notes: string[]}} notes explain anything that could NOT be resolved —
 * an ecosystem whose lockfile format this generator does not read must be visible, because an
 * unexplained short component list reads as "clean" when it means "unknown".
 */
export function buildSbom(snapshot, { now = new Date() } = {}) {
  const root = snapshot.root;
  const stacks = snapshot.project?.stacks || [];
  const notes = [];
  const components = [];
  const lockInputs = [];

  for (const stack of stacks) {
    const candidates = LOCKFILES[stack];
    if (candidates === undefined) { notes.push(`stack "${stack}" has no known lockfile convention — no components resolved for it`); continue; }
    const found = candidates.filter((f) => existsSync(join(root, f)));
    if (!found.length) {
      notes.push(candidates.length
        ? `stack "${stack}": none of ${candidates.join(', ')} is present, so its components could not be enumerated`
        : `stack "${stack}": no lockfile convention is supported yet`);
      continue;
    }
    for (const file of found) {
      lockInputs.push({ path: file, sha256: sha256File(root, file) });
      if (stack === 'node' && /^(package-lock|npm-shrinkwrap)\.json$/.test(file)) {
        const parsed = npmComponents(root, file);
        if (parsed === null) notes.push(`${file} could not be parsed`);
        else components.push(...parsed);
      } else {
        notes.push(`${file} is recorded as an input but this generator does not parse ${stack} lockfiles yet — components from it are NOT in the list`);
      }
    }
  }

  if (!components.length && !notes.length) {
    notes.push('no third-party components: every declared stack resolved to an empty dependency set. For EOS itself this is the zero-dependency claim, stated rather than implied.');
  }

  const tree = currentProductTree(root);
  const pkg = existsSync(join(root, 'package.json'))
    ? (() => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return {}; } })()
    : {};

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      component: {
        type: 'application',
        name: pkg.name || 'project',
        version: pkg.version || '0.0.0',
      },
      tools: [{ vendor: 'EOS', name: 'eos sbom', version: '1' }],
      // The binding. Without these three an SBOM is a document; with them it is evidence about a
      // specific tree, invalidated by the same rules that invalidate gate evidence.
      properties: [
        { name: 'eos:commit', value: snapshot.commit || '(no git)' },
        { name: 'eos:productTreeDigest', value: tree.identity?.digest || '(unavailable)' },
        { name: 'eos:stacks', value: stacks.join(',') || '(none declared)' },
      ],
    },
    components: components.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name))),
    // Not part of the CycloneDX schema proper; kept beside it so freshness can be checked offline.
    eos: { lockInputs, notes },
  };
  return { sbom, notes };
}

/**
 * Digest over the part that must not change silently.
 *
 * Deliberately EXCLUDES both `eos:commit` and `eos:productTreeDigest`. Those two are PROVENANCE —
 * where and against what this document was produced — and neither can participate in freshness:
 *
 *   the commit does not exist until AFTER the file is written, so including it made the SBOM stale
 *   on every single commit and `--check` could never pass in CI;
 *
 *   the product tree changes on every source edit, and an SBOM's content does not depend on source
 *   at all — binding it there would demand a regenerated bill of materials for a typo fix.
 *
 * What actually determines whether this document still describes this software is the component
 * set, the lockfiles it was derived from, and the stacks that were searched.
 */
export const sbomDigest = (sbom) => createHash('sha256')
  .update(JSON.stringify({
    components: sbom.components,
    stacks: (sbom.metadata?.properties || []).find((p) => p.name === 'eos:stacks')?.value ?? null,
    lockInputs: sbom.eos?.lockInputs,
  }))
  .digest('hex');

/**
 * Is the committed SBOM still describing this tree?
 * @returns {{status:'FRESH'|'STALE'|'MISSING', reasons:string[]}}
 */
export function sbomFreshness(snapshot) {
  const full = join(snapshot.root, SBOM_PATH);
  if (!existsSync(full)) return { status: 'MISSING', reasons: [`${SBOM_PATH} does not exist — run \`eos sbom --write\``] };
  let recorded;
  try { recorded = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { status: 'STALE', reasons: [`${SBOM_PATH}: invalid JSON (${e.message})`] };
  }
  const reasons = [];
  const prop = (name) => (recorded.metadata?.properties || []).find((p) => p.name === name)?.value ?? null;
  void prop; // provenance is recorded for the reader; it is not a freshness input (see sbomDigest)
  for (const input of recorded.eos?.lockInputs || []) {
    if (sha256File(snapshot.root, input.path) !== input.sha256) reasons.push(`lockfile changed: ${input.path}`);
  }
  const { sbom: fresh } = buildSbom(snapshot);
  if (sbomDigest(fresh) !== sbomDigest(recorded)) reasons.push('regenerating the SBOM from the current lockfiles produces a different component set');
  return { status: reasons.length ? 'STALE' : 'FRESH', reasons };
}
