// GitHub governance adapter — does the server actually enforce what the repository claims?
//
// `activation-authority` is permanently BLOCKED without this: EOS runs on your machine and cannot
// see branch protection, so it says "I cannot know" and refuses to issue itself a PASS. This adapter
// is how a project that can reach GitHub gets a real answer.
//
// It obeys the boundary rules literally:
//   D3  it never handles a credential. `gh` is already authenticated and holds the token in its own
//       store; this process passes none, reads none and can leak none.
//   D5  it is read-only. `gh api` with no `-X` is a GET, and there is no code path here that writes.
//   D4  every failure — gh absent, not logged in, no permission, network down, repo unknown — is a
//       non-PASS that leaves EOS's own verdict untouched.
import { spawnSync } from 'node:child_process';
import { result } from './contract.mjs';

const PROVIDER = 'github-governance';

/** Run `gh` read-only. A missing or unauthenticated gh is a verdict, never an exception. */
function gh(root, args, timeoutMs) {
  const r = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs });
  if (r.error) {
    const why = r.error.code === 'ENOENT'
      ? 'the GitHub CLI (`gh`) is not installed'
      : r.error.code === 'ETIMEDOUT' ? `\`gh\` timed out after ${timeoutMs}ms` : r.error.message;
    return { ok: false, why };
  }
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    if (/not logged|authentication|gh auth login/i.test(out)) return { ok: false, why: 'the GitHub CLI is not authenticated (`gh auth login`)' };
    if (/HTTP 40[34]|Resource not accessible|Must have admin/i.test(out)) return { ok: false, why: 'this account cannot read branch protection on that repository (admin rights are required)' };
    if (/HTTP 404|Branch not protected/i.test(out)) return { ok: false, notProtected: true, why: 'the branch has no protection rule' };
    if (/dial tcp|no such host|network|timeout|ENOTFOUND/i.test(out)) return { ok: false, why: 'GitHub is unreachable from here' };
    return { ok: false, why: out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 160) || `gh exited ${r.status}` };
  }
  return { ok: true, out: r.stdout || '' };
}

export async function check({ root, subject, options, now }) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const repo = options.repo || null;
  const branch = options.branch || 'main';
  // What the project says it requires. EOS does not invent a standard; it checks the one you stated.
  const requiredChecks = options.requiredChecks || ['verify'];
  const requireCodeOwnerReview = options.requireCodeOwnerReview !== false;
  const minApprovals = options.minApprovals ?? 1;

  const target = repo ? ['-R', repo] : [];
  const slug = repo || '(the current repository)';
  const r = gh(root, ['api', ...target, `repos/{owner}/{repo}/branches/${branch}/protection`], timeoutMs);

  if (!r.ok) {
    // "The branch is not protected" is a real, verified answer: FAIL.
    if (r.notProtected) {
      return result({ provider: PROVIDER, subject, status: 'FAIL', now, evidenceRef: `${slug}@${branch}`,
        detail: `${branch} on ${slug} has no branch-protection rule, so the CI gates are advisory` });
    }
    // Everything else is "I could not find out", which must never become a pass and must never
    // become a new blocker either — EOS's own verdict stands.
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: r.why });
  }

  let p;
  try { p = JSON.parse(r.out); } catch (e) {
    return result({ provider: PROVIDER, subject, status: 'ERROR', now, detail: `could not parse the protection rule (${e.message})` });
  }

  const problems = [];
  const contexts = p.required_status_checks?.contexts || p.required_status_checks?.checks?.map((c) => c.context) || [];
  const missingChecks = requiredChecks.filter((c) => !contexts.includes(c));
  if (missingChecks.length) problems.push(`required status check(s) not enforced: ${missingChecks.join(', ')}`);

  const review = p.required_pull_request_reviews;
  if (!review) problems.push('a pull request review is not required');
  else {
    if (requireCodeOwnerReview && !review.require_code_owner_reviews) problems.push('Code Owner review is not required');
    if ((review.required_approving_review_count ?? 0) < minApprovals) {
      problems.push(`only ${review.required_approving_review_count ?? 0} approving review(s) required, expected ${minApprovals}`);
    }
  }
  // An enforcement rule administrators can walk around is a request, not a rule.
  if (p.enforce_admins && p.enforce_admins.enabled === false) problems.push('administrators can bypass these rules');

  return problems.length
    ? result({ provider: PROVIDER, subject, status: 'FAIL', now, evidenceRef: `${slug}@${branch}`,
        detail: `branch protection on ${branch} does not enforce: ${problems.join('; ')}` })
    : result({ provider: PROVIDER, subject, status: 'PASS', now, evidenceRef: `${slug}@${branch}`,
        detail: `${branch} on ${slug} requires ${requiredChecks.join(', ')}, ${minApprovals} approval(s)${requireCodeOwnerReview ? ' and Code Owner review' : ''}` });
}
