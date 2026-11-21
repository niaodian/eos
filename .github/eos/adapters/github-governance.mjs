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
//
// eos-2.8.0 (ADR-025) — three defects fixed:
//   - A branch protected by a RULESET (what the manual recommends) read as unprotected: only the
//     classic `/protection` endpoint was asked, and it is a 404 for a ruleset. The rules that apply to
//     the branch now come from `/rules/branches/<branch>`, whatever level configured them.
//   - `options.repo` never worked: `gh api` has no `-R` flag. The path names the repository instead.
//   - An unprotected branch read as "admin rights are required" (the 403 pattern also matched 404),
//     so the adapter could only ever say UNVERIFIED, never "not protected".
// It also says who can walk around the rules: a ruleset bypass that lets anyone push directly is a
// gap, a pull-request-only bypass is reported, and `current_user_can_bypass` tells whoever runs the
// check — an agent included — whether THEIR credentials can get around it.
import { spawnSync } from 'node:child_process';
import { result } from './contract.mjs';

const PROVIDER = 'github-governance';

/** Run `gh` read-only. A missing or unauthenticated gh is a verdict, never an exception. */
function gh(root, args, timeoutMs) {
  const r = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs });
  if (r.error) {
    // A missing binary is a permanent fact about this machine; a timeout is not. Only the second
    // is worth asking again.
    const timedOut = r.error.code === 'ETIMEDOUT';
    const why = r.error.code === 'ENOENT'
      ? 'the GitHub CLI (`gh`) is not installed'
      : timedOut ? `\`gh\` timed out after ${timeoutMs}ms` : r.error.message;
    return { ok: false, why, transient: timedOut };
  }
  return classifyGh(r.status, (r.stdout || '') + (r.stderr || ''), r.stdout || '');
}

/** What a finished `gh` run means. Order matters: "not allowed to ask" can come with a 404 status. */
export function classifyGh(status, out, stdout = out) {
  if (status === 0) return { ok: true, out: stdout };
  if (/not logged|authentication|gh auth login/i.test(out)) return { ok: false, why: 'the GitHub CLI is not authenticated (`gh auth login`)' };
  if (/Must have admin|Resource not accessible|HTTP 403/i.test(out)) return { ok: false, forbidden: true, why: 'this account is not allowed to read it (admin rights may be required)' };
  if (/HTTP 404|Branch not protected|Not Found/i.test(out)) return { ok: false, notFound: true, why: 'not found' };
  if (/dial tcp|no such host|network|timeout|ENOTFOUND/i.test(out)) return { ok: false, why: 'GitHub is unreachable from here', transient: true };
  return { ok: false, why: out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 160) || `gh exited ${status}` };
}

/** GET one endpoint as JSON through `run` (`gh`, or a stand-in in the tests). */
export function getJson(run, root, path, timeoutMs) {
  const r = run(root, ['api', path], timeoutMs);
  if (!r.ok) return r;
  try { return { ok: true, json: JSON.parse(r.out) }; } catch (e) { return { ok: false, why: `could not parse ${path} (${e.message})` }; }
}

/** `repos/<owner>/<repo>` for a configured repository; gh's placeholders for the current one. */
export const repoPath = (repo) => (repo ? `repos/${repo}` : 'repos/{owner}/{repo}');

const EMPTY = () => ({ pr: false, approvals: 0, codeOwners: false, lastPush: false, checks: new Set() });

/** What the rules applying to a branch (rulesets, any level) require. */
function fromRules(rules) {
  const req = EMPTY();
  for (const r of Array.isArray(rules) ? rules : []) {
    const p = r?.parameters || {};
    if (r?.type === 'pull_request') {
      req.pr = true;
      req.approvals = Math.max(req.approvals, p.required_approving_review_count ?? 0);
      req.codeOwners ||= !!p.require_code_owner_review;
      req.lastPush ||= !!p.require_last_push_approval;
    }
    if (r?.type === 'required_status_checks') for (const c of p.required_status_checks || []) req.checks.add(c.context);
  }
  return req;
}

/** What classic branch protection requires. */
function fromClassic(classic) {
  const req = EMPTY();
  if (!classic) return req;
  for (const c of classic.required_status_checks?.contexts || []) req.checks.add(c);
  for (const c of classic.required_status_checks?.checks || []) req.checks.add(c.context);
  const review = classic.required_pull_request_reviews;
  if (review) {
    req.pr = true;
    req.approvals = review.required_approving_review_count ?? 0;
    req.codeOwners = !!review.require_code_owner_reviews;
    req.lastPush = !!review.require_last_push_approval;
  }
  return req;
}

/** Who can get around the rulesets that apply, as far as this identity can see. */
export function rulesetBypass(rulesets) {
  const always = [];
  const pullRequestOnly = [];
  let hidden = false;
  let currentUser = 'never';
  const rank = { never: 0, pull_requests_only: 1, always: 2, exempt: 2 };
  for (const rs of Array.isArray(rulesets) ? rulesets : []) {
    if (!Array.isArray(rs?.bypass_actors)) hidden = true;
    for (const a of rs?.bypass_actors || []) {
      const who = a.actor_type === 'RepositoryRole' ? `repository role #${a.actor_id}` : `${a.actor_type}${a.actor_id ? ` #${a.actor_id}` : ''}`;
      (a.bypass_mode === 'pull_request' ? pullRequestOnly : always).push(`${who} (ruleset "${rs.name}")`);
    }
    if ((rank[rs?.current_user_can_bypass] ?? 0) > rank[currentUser]) currentUser = rs.current_user_can_bypass;
  }
  return { always, pullRequestOnly, hidden, currentUser };
}

/**
 * Does the protection that applies to a branch hold what the project requires — for everyone?
 *
 * Pure, so every combination is testable offline. The requirements are met if rulesets and classic
 * protection TOGETHER demand them; they are binding only if one mechanism demands them all on its
 * own and nobody can push around it (classic: `enforce_admins`; rulesets: no "always" bypass).
 *
 * @returns {{status:'PASS'|'FAIL'|'UNVERIFIED', problems:string[], notes:string[], bypass:object}}
 */
export function evaluateBranchProtection({ rules = [], classic = null, classicHidden = false, rulesets = [], requiredChecks = ['verify'], requireCodeOwnerReview = true, minApprovals = 1, requireLastPushApproval = false } = {}) {
  const gaps = (req) => {
    const g = [];
    const missing = requiredChecks.filter((c) => !req.checks.has(c));
    if (missing.length) g.push(`required status check(s) not enforced: ${missing.join(', ')}`);
    if (!req.pr) g.push('a pull request review is not required');
    else {
      if (req.approvals < minApprovals) g.push(`only ${req.approvals} approving review(s) required, expected ${minApprovals}`);
      if (requireCodeOwnerReview && !req.codeOwners) g.push('Code Owner review is not required');
      if (requireLastPushApproval && !req.lastPush) g.push('the most recent push does not need someone else\'s approval');
    }
    return g;
  };
  const r = fromRules(rules);
  const c = fromClassic(classic);
  const union = {
    pr: r.pr || c.pr,
    approvals: Math.max(r.approvals, c.approvals),
    codeOwners: r.codeOwners || c.codeOwners,
    lastPush: r.lastPush || c.lastPush,
    checks: new Set([...r.checks, ...c.checks]),
  };
  const bypass = rulesetBypass(rulesets);
  const notes = [];
  if (bypass.pullRequestOnly.length) notes.push(`may merge a pull request around the rules, never push directly: ${bypass.pullRequestOnly.join(', ')}`);
  if (bypass.currentUser !== 'never') notes.push(`the credentials that ran this check can bypass the rules (${bypass.currentUser}) — an agent must never run with them`);

  if (!rules.length && !classic) {
    if (classicHidden) return { status: 'UNVERIFIED', problems: [], notes: [...notes, 'no ruleset applies, and classic protection is not readable with these credentials'], bypass };
    return { status: 'FAIL', problems: ['the branch has no branch protection and no ruleset, so the CI gates are advisory'], notes, bypass };
  }
  const problems = gaps(union);
  if (problems.length) {
    // A classic rule this identity cannot read might still close the gap: that is "I cannot know".
    if (classicHidden) return { status: 'UNVERIFIED', problems, notes: [...notes, 'classic protection is not readable with these credentials, so these gaps are unconfirmed'], bypass };
    return { status: 'FAIL', problems, notes, bypass };
  }
  const classicBinding = !!classic && !gaps(c).length && classic.enforce_admins?.enabled === true;
  const rulesBinding = !!rules.length && !gaps(r).length && !bypass.always.length;
  if (classicBinding || rulesBinding) {
    if (rulesBinding && bypass.hidden && !classicBinding) {
      return { status: 'UNVERIFIED', problems: [], notes: [...notes, 'the ruleset bypass list is not visible to these credentials — run the check as an administrator to confirm nobody can push around it'], bypass };
    }
    return { status: 'PASS', problems: [], notes, bypass };
  }
  const who = bypass.always.length ? `can push around the rules: ${bypass.always.join(', ')}` : 'administrators can bypass these rules';
  return { status: 'FAIL', problems: [who], notes, bypass };
}

export async function check({ root, subject, options, now }, { run = gh } = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const repo = options.repo || null;
  const branch = options.branch || 'main';
  const slug = repo || '(the current repository)';
  const base = repoPath(repo);
  const ref = `${slug}@${branch}`;

  const rules = getJson(run, root, `${base}/rules/branches/${encodeURIComponent(branch)}`, timeoutMs);
  if (!rules.ok) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: `the rules for ${branch} could not be read: ${rules.why}`, transient: !!rules.transient });
  }
  const classic = getJson(run, root, `${base}/branches/${encodeURIComponent(branch)}/protection`, timeoutMs);
  if (!classic.ok && !classic.notFound && !classic.forbidden) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: classic.why, transient: !!classic.transient });
  }
  const rulesets = [];
  for (const id of [...new Set((rules.json || []).map((x) => x.ruleset_id).filter(Number.isInteger))]) {
    const rs = getJson(run, root, `${base}/rulesets/${id}`, timeoutMs);
    // A ruleset configured above the repository is not readable here: its bypass list is unknown.
    rulesets.push(rs.ok ? rs.json : { id, name: `#${id}` });
  }
  const verdict = evaluateBranchProtection({
    rules: rules.json || [],
    classic: classic.ok ? classic.json : null,
    classicHidden: !!classic.forbidden,
    rulesets,
    requiredChecks: options.requiredChecks || ['verify'],
    requireCodeOwnerReview: options.requireCodeOwnerReview !== false,
    minApprovals: options.minApprovals ?? 1,
  });
  const tail = verdict.notes.length ? ` (${verdict.notes.join('; ')})` : '';
  if (verdict.status === 'PASS') {
    return result({ provider: PROVIDER, subject, status: 'PASS', now, evidenceRef: ref,
      detail: `${branch} on ${slug} requires ${(options.requiredChecks || ['verify']).join(', ')}, ${options.minApprovals ?? 1} approval(s)${options.requireCodeOwnerReview !== false ? ' and Code Owner review' : ''}, and nobody can push around it${tail}` });
  }
  if (verdict.status === 'FAIL') {
    return result({ provider: PROVIDER, subject, status: 'FAIL', now, evidenceRef: ref,
      detail: `branch protection on ${branch} does not enforce: ${verdict.problems.join('; ')}${tail}` });
  }
  return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now,
    detail: `branch protection on ${branch} could not be confirmed: ${[...verdict.problems, ...verdict.notes].join('; ')}` });
}
