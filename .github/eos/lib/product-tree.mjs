// Tested-product-tree identity — what a VERIFIED actually verified.
//
// The defect this closes (EOS-AUD-001): a gate recorded the commit it ran at, but nothing ever
// re-derived the *content* of the product. So a story could be verified, the source rewritten and
// committed, and the story still promoted to MERGED — every recorded hash still matched, because
// the source was never one of the recorded inputs.
//
// Two properties make this identity usable as a promotion guard:
//   1. It covers EVERYTHING a change could hide in — source, tests, prompts, eval datasets, model
//      and eval config, manifests, lockfiles, runtime and deployment config, schemas — including
//      files that were ADDED, DELETED or RENAMED, which no per-file hash list can notice.
//   2. It is STABLE under EOS's own bookkeeping. Recording evidence and appending to the ledger
//      both write files; if those counted, every gate would invalidate itself the instant it
//      finished, and the guard would be worthless noise instead of a control.
//
// Fail-closed: with no git repository the identity is UNAVAILABLE, and callers must treat that as
// BLOCKED. "We could not tell what was tested" is never "what was tested is current".
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Bumping this invalidates every previously recorded product-tree identity by design. */
export const PRODUCT_TREE_VERSION = '1.0.0';

/**
 * EOS's own bookkeeping. These are the files EOS writes AS A RESULT of running a gate, so they can
 * never be part of what the gate measured — that is the self-reference the audit calls out.
 * This list is NOT configurable: making it configurable would re-open the bypass.
 */
export const SELF_REFERENCE_PREFIXES = [
  '.eos/evidence/',
  '.eos/ledger/',
  '.eos/handoffs/',
  '.eos/local/',
  '.git/',
  // Machine summaries are written BY a verification run. If they counted, embedding the tree digest
  // in a summary would be impossible to satisfy: writing the file would change the very digest it
  // just recorded. They stay reviewable in git and are bound separately, as gate INPUTS, so editing
  // one after the fact still makes the recorded result STALE.
  'docs/evidence/',
];

export const isSelfReference = (rel) => SELF_REFERENCE_PREFIXES.some((p) => rel.startsWith(p));

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? (r.stdout || '') : null;
};

const zsplit = (s) => (s === null ? null : s.split('\0').filter(Boolean));

/**
 * Every file that belongs to the product, as the working tree has it right now, with the git mode
 * of each tracked entry.
 *
 * The mode matters: content alone would make `chmod +x deploy.sh`, retargeting a symlink, or moving
 * a submodule to a different commit invisible to the identity — all of which change what the
 * product DOES. Paths are used exactly as git reports them (git always emits `/`, on every
 * platform), because rewriting separators would corrupt a legitimate POSIX filename containing a
 * backslash and could collide two distinct paths onto one.
 *
 * @returns {{files: Array<{path:string, mode:string}>}|null} null = git could not answer, which is
 *   BLOCKED, never an empty product.
 */
function productFiles(root) {
  const staged = zsplit(git(root, ['ls-files', '-s', '-z']));
  if (staged === null) return null;
  const modes = new Map();
  for (const entry of staged) {
    // "<mode> <object> <stage>\t<path>"
    const tab = entry.indexOf('\t');
    if (tab === -1) return null;
    const meta = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (meta.length < 3) return null;
    modes.set(path, { mode: meta[0], object: meta[1] });
  }
  const untracked = zsplit(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  // A failed untracked scan used to become "no untracked files", which silently drops every
  // newly added source file from the identity — the exact bypass this module exists to close.
  if (untracked === null) return null;
  for (const path of untracked) if (!modes.has(path)) modes.set(path, { mode: '100644', object: null });

  return [...modes.entries()]
    .filter(([path]) => !isSelfReference(path))
    .map(([path, meta]) => ({ path, ...meta }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Content digest of one entry.
 * @returns {string|null} null = unreadable, which makes the whole identity UNAVAILABLE rather than
 *   letting a stable "UNREADABLE" marker stand in for changing content.
 */
function entryDigest(root, entry) {
  const full = join(root, entry.path);
  // A gitlink (submodule) has no bytes here; its recorded object id IS its content.
  if (entry.mode === '160000') return `gitlink:${entry.object || 'unknown'}`;
  let st;
  try { st = lstatSync(full); } catch { return 'ABSENT'; }
  // A symlink's meaning is its target, not the bytes of whatever it points at today.
  if (st.isSymbolicLink()) {
    try { return `symlink:${createHash('sha256').update(readlinkSync(full)).digest('hex')}`; } catch { return null; }
  }
  if (st.isDirectory()) return null;
  try { return createHash('sha256').update(readFileSync(full)).digest('hex'); } catch { return null; }
}

/** Top-level grouping, so a mismatch can name WHERE it happened even with no git history to diff. */
const segmentOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '<root>');

/**
 * Compute the identity of the current product tree.
 * @returns {{available:boolean, reason:string|null, identity:object|null}}
 */
export function computeProductTree(root) {
  const files = productFiles(root);
  if (files === null) {
    return {
      available: false,
      identity: null,
      reason: 'git could not enumerate this working tree (not a git repository, or git is unavailable), so EOS cannot determine which files make up the product — verification cannot be bound to what it tested',
    };
  }
  const perSegment = new Map();
  const overall = createHash('sha256');
  for (const entry of files) {
    const digest = entryDigest(root, entry);
    if (digest === null) {
      return {
        available: false,
        identity: null,
        reason: `${entry.path} could not be read, so the product tree cannot be identified — an unreadable file must not be silently treated as unchanged`,
      };
    }
    // The MODE is part of the line: content alone cannot see `chmod +x`.
    const line = `${entry.mode}\0${entry.path}\0${digest}\n`;
    overall.update(line);
    const seg = segmentOf(entry.path);
    if (!perSegment.has(seg)) perSegment.set(seg, { hash: createHash('sha256'), count: 0 });
    const s = perSegment.get(seg);
    s.hash.update(line);
    s.count += 1;
  }
  return {
    available: true,
    reason: null,
    identity: {
      version: PRODUCT_TREE_VERSION,
      algorithm: 'sha256-mode-path-content-v1',
      digest: overall.digest('hex'),
      fileCount: files.length,
      segments: [...perSegment.entries()]
        .map(([path, s]) => ({ path, digest: s.hash.digest('hex'), fileCount: s.count }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    },
  };
}

/**
 * Per-process memo. `eos next` evaluates several gates in cheap mode and each one re-checks
 * freshness; hashing the tree once per process keeps that instant on a large repository.
 */
const cache = new Map();
export function currentProductTree(root) {
  if (!cache.has(root)) cache.set(root, computeProductTree(root));
  return cache.get(root);
}
export const clearProductTreeCache = () => cache.clear();

/**
 * Name the files behind a digest mismatch. The digest DECIDES; this only explains, so it is allowed
 * to be best-effort: it asks git what moved between the recorded commit and now, and what is
 * currently uncommitted.
 */
function changedPaths(root, recordedCommit) {
  const out = new Set();
  if (recordedCommit) {
    for (const p of (git(root, ['diff', '--name-only', recordedCommit, '--']) || '').split('\n')) {
      if (p.trim()) out.add(p.trim());
    }
  }
  for (const p of porcelainPaths(root) || []) out.add(p);
  return [...out].filter((p) => !isSelfReference(p)).sort();
}

/**
 * Working-tree changes, rename-aware. In `-z` mode a rename is emitted as `XY NEW\0OLD\0`, so a
 * naive scan would read OLD as a status line and mangle it — and both halves of a rename matter.
 */
function porcelainPaths(root) {
  const porcelain = git(root, ['status', '--porcelain', '-z']);
  if (porcelain === null) return null;
  const entries = porcelain.split('\0');
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    out.push(entry.slice(3));
    if (/[RC]/.test(code) && entries[i + 1]) out.push(entries[++i]);
  }
  return out;
}

/**
 * Compare a recorded identity against the tree as it is now.
 * @returns {{status:'MATCH'|'CHANGED'|'UNAVAILABLE'|'UNBOUND', reasons:string[]}}
 */
export function compareProductTree(root, recorded, { recordedCommit = null } = {}) {
  if (!recorded) {
    return {
      status: 'UNBOUND',
      reasons: ['this evidence predates tested-product-tree binding, so it does not record what it tested — re-run the gate'],
    };
  }
  const current = currentProductTree(root);
  if (!current.available) return { status: 'UNAVAILABLE', reasons: [current.reason] };
  if (recorded.version !== PRODUCT_TREE_VERSION || recorded.algorithm !== current.identity.algorithm) {
    return {
      status: 'CHANGED',
      reasons: [`the product-tree identity scheme changed (${recorded.algorithm}@${recorded.version} → ${current.identity.algorithm}@${PRODUCT_TREE_VERSION}) — previous results are invalidated by design`],
    };
  }
  if (recorded.digest === current.identity.digest) return { status: 'MATCH', reasons: [] };

  const reasons = [];
  const before = new Map((recorded.segments || []).map((s) => [s.path, s]));
  const after = new Map(current.identity.segments.map((s) => [s.path, s]));
  const areas = [...new Set([...before.keys(), ...after.keys()])].sort();
  const moved = areas.filter((a) => (before.get(a)?.digest || null) !== (after.get(a)?.digest || null));
  const named = changedPaths(root, recordedCommit).filter((p) => moved.includes(segmentOf(p)));
  const where = named.length ? named.slice(0, 6).join(', ') + (named.length > 6 ? `, +${named.length - 6} more` : '') : moved.join(', ');
  reasons.push(`the product tree changed since this was verified (${where}) — what was tested is not what is here now`);
  if (recorded.fileCount !== current.identity.fileCount) {
    reasons.push(`the number of product files changed (${recorded.fileCount} → ${current.identity.fileCount}): files were added, removed or renamed`);
  }
  return { status: 'CHANGED', reasons };
}

/** Uncommitted product-tree changes — a release candidate must be a committed thing. */
export function uncommittedProductChanges(root) {
  const paths = porcelainPaths(root);
  if (paths === null) return null;
  return [...new Set(paths.filter((p) => !isSelfReference(p)))].sort();
}
