// The branch a change will merge into, read from LOCAL refs only.
//
// Two features need to compare "here" with "where this is going": the policy-weakening check
// (#9 — did this branch relax a gate?) and the same-story warning (#4 — has the base branch moved
// the story I am working on?). Both resolve the base the same way, so they cannot disagree about it.
//
// Strictly offline. Nothing here fetches: EOS Core never touches the network
// (offline-boundary.test.mjs), so a stale `origin/main` gives a stale-but-honest answer and the
// output names the ref it compared against. `git fetch` first if you want a fresher one.
import { spawnSync } from 'node:child_process';

/** Run a local git command. Returns stdout, or null when git fails or there is no repository. */
export function gitOut(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? (r.stdout || '') : null;
}

export function currentBranch(root) {
  const b = gitOut(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return b ? b.trim() : null;
}

/**
 * The base to compare against, and where this branch left it.
 *
 * Order: an explicit ref, then EOS_BASE_REF, then the conventional names. A candidate that IS the
 * current branch is skipped — comparing `main` with itself would always report nothing, which is the
 * one answer that must never be mistaken for "checked and clean".
 *
 * @returns {{ref:string, commit:string, mergeBase:string|null}|null}
 */
export function resolveBaseRef(root, explicit = null) {
  const branch = currentBranch(root);
  const candidates = explicit
    ? [explicit]
    : [process.env.EOS_BASE_REF, 'origin/HEAD', 'origin/main', 'origin/master', 'main', 'master'].filter(Boolean);
  for (const ref of candidates) {
    if (!explicit && ref === branch) continue;
    const sha = gitOut(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (!sha) continue;
    const commit = sha.trim();
    const mb = gitOut(root, ['merge-base', 'HEAD', commit]);
    return { ref, commit, mergeBase: mb ? mb.trim() : null };
  }
  return null;
}

/** A file's content at a revision, or null when it did not exist there. */
export function fileAt(root, rev, rel) {
  return gitOut(root, ['show', `${rev}:${rel}`]);
}
