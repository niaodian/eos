// The GitHub governance adapter — does the server enforce what the repository claims? (ADR-005, ADR-025)
//
// eos-2.8.0 fixed three defects, each pinned here: a branch protected by a RULESET read as
// unprotected (only the classic endpoint was asked), `options.repo` never worked (`gh api` has no
// `-R`), and an unprotected branch read as "admin rights are required". The evaluation is a pure
// function, so every combination is checked offline; `check()` is driven through a stand-in for `gh`.
//
//   node --test .github/eos/github-governance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGh, evaluateBranchProtection, rulesetBypass, repoPath, getJson, check } from './adapters/github-governance.mjs';

const PR = (p = {}) => ({ type: 'pull_request', ruleset_id: 7, parameters: { required_approving_review_count: 1, require_code_owner_review: true, require_last_push_approval: true, dismiss_stale_reviews_on_push: true, required_review_thread_resolution: false, ...p } });
const CHECKS = (...contexts) => ({ type: 'required_status_checks', ruleset_id: 7, parameters: { strict_required_status_checks_policy: true, required_status_checks: contexts.map((context) => ({ context, integration_id: 15368 })) } });
const RULESET = (bypass, extra = {}) => ({ id: 7, name: 'eos-main-protection', enforcement: 'active', bypass_actors: bypass, current_user_can_bypass: 'never', ...extra });
const ADMIN_PR_ONLY = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }];
// EOS's own repository on 2026-10-31: a required check, a pull request, no approval, no Code Owners, admins exempt.
const CLASSIC_TODAY = {
  required_status_checks: { strict: true, contexts: ['verify'], checks: [{ context: 'verify', app_id: 15368 }] },
  required_pull_request_reviews: { required_approving_review_count: 0, require_code_owner_reviews: false, require_last_push_approval: false },
  enforce_admins: { enabled: false },
};

test('gh outcomes: a 404 is an answer, "not allowed to ask" is not — even when it arrives as a 404', () => {
  assert.deepEqual(classifyGh(0, '{"a":1}'), { ok: true, out: '{"a":1}' });
  assert.match(classifyGh(1, 'To get started with GitHub CLI, please run:  gh auth login').why, /not authenticated/);
  assert.equal(classifyGh(1, 'gh: Must have admin rights to Repository. (HTTP 404)').forbidden, true);
  assert.equal(classifyGh(1, 'gh: Resource not accessible by integration (HTTP 403)').forbidden, true);
  assert.equal(classifyGh(1, 'gh: Branch not protected (HTTP 404)').notFound, true);
  assert.equal(classifyGh(1, 'gh: Not Found (HTTP 404)').notFound, true);
  assert.equal(classifyGh(1, 'dial tcp: lookup api.github.com: no such host').transient, true);
  assert.equal(classifyGh(1, 'something odd\nlast line').why, 'last line');
  assert.equal(classifyGh(2, '').why, 'gh exited 2');
});

test('the repository is named in the path — `gh api` has no -R flag', () => {
  assert.equal(repoPath('acme/app'), 'repos/acme/app');
  assert.equal(repoPath(null), 'repos/{owner}/{repo}');
  assert.match(getJson(() => ({ ok: true, out: 'not json' }), '.', 'x', 1).why, /could not parse x/);
});

test('no protection at all is a verified FAIL, not "admin rights are required"', () => {
  const v = evaluateBranchProtection({});
  assert.equal(v.status, 'FAIL');
  assert.match(v.problems[0], /no branch protection and no ruleset/);
  assert.equal(evaluateBranchProtection({ classicHidden: true }).status, 'UNVERIFIED', 'unreadable classic protection is "I cannot know"');
});

test('EOS\'s own repository as audited: a required check alone does not make the gates authoritative', () => {
  const v = evaluateBranchProtection({ classic: CLASSIC_TODAY });
  assert.equal(v.status, 'FAIL');
  assert.deepEqual(v.problems, ['only 0 approving review(s) required, expected 1', 'Code Owner review is not required']);
});

test('classic protection holds only when administrators are bound by it too', () => {
  const strict = { ...CLASSIC_TODAY, required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true }, enforce_admins: { enabled: true } };
  assert.equal(evaluateBranchProtection({ classic: strict }).status, 'PASS');
  const loose = { ...strict, enforce_admins: { enabled: false } };
  assert.deepEqual(evaluateBranchProtection({ classic: loose }).problems, ['administrators can bypass these rules']);
});

test('a ruleset is read as protection — the defect that made the recommended setup look unprotected', () => {
  const v = evaluateBranchProtection({ rules: [PR(), CHECKS('verify')], rulesets: [RULESET(ADMIN_PR_ONLY)] });
  assert.equal(v.status, 'PASS', JSON.stringify(v));
  assert.match(v.notes[0], /may merge a pull request around the rules, never push directly: repository role #5/);
});

test('a ruleset anyone can push around is a gap; a hidden bypass list is "cannot confirm"', () => {
  const always = evaluateBranchProtection({ rules: [PR(), CHECKS('verify')], rulesets: [RULESET([{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }])] });
  assert.equal(always.status, 'FAIL');
  assert.match(always.problems[0], /can push around the rules: repository role #5/);
  const hidden = evaluateBranchProtection({ rules: [PR(), CHECKS('verify')], rulesets: [{ id: 7, name: 'eos-main-protection' }] });
  assert.equal(hidden.status, 'UNVERIFIED');
  assert.match(hidden.notes.at(-1), /bypass list is not visible/);
});

test('the credentials running the check are told when they could bypass the rules', () => {
  const v = evaluateBranchProtection({ rules: [PR(), CHECKS('verify')], rulesets: [RULESET(ADMIN_PR_ONLY, { current_user_can_bypass: 'pull_requests_only' })] });
  assert.equal(v.status, 'PASS');
  assert.match(v.notes.join(' '), /credentials that ran this check can bypass the rules \(pull_requests_only\)/);
  assert.equal(rulesetBypass([RULESET([], { current_user_can_bypass: 'always' }), RULESET([], { current_user_can_bypass: 'never' })]).currentUser, 'always');
});

test('every requirement is checked, including the ones only the hardening tool asks for', () => {
  const weak = evaluateBranchProtection({ rules: [PR({ required_approving_review_count: 0, require_code_owner_review: false, require_last_push_approval: false })], rulesets: [RULESET(ADMIN_PR_ONLY)], requireLastPushApproval: true });
  assert.deepEqual(weak.problems, [
    'required status check(s) not enforced: verify',
    'only 0 approving review(s) required, expected 1',
    'Code Owner review is not required',
    'the most recent push does not need someone else\'s approval',
  ]);
  const noPr = evaluateBranchProtection({ rules: [CHECKS('verify')], rulesets: [RULESET([])] });
  assert.deepEqual(noPr.problems, ['a pull request review is not required']);
  assert.equal(evaluateBranchProtection({ rules: [CHECKS('verify')], rulesets: [RULESET([])], requireCodeOwnerReview: false, minApprovals: 0, requiredChecks: [] }).status, 'FAIL',
    'a pull request is always required');
});

test('requirements split across classic protection and a ruleset do not bind administrators', () => {
  const v = evaluateBranchProtection({ rules: [PR()], classic: { ...CLASSIC_TODAY, required_pull_request_reviews: undefined }, rulesets: [RULESET(ADMIN_PR_ONLY)] });
  assert.deepEqual(v.problems, ['administrators can bypass these rules']);
  const unreadable = evaluateBranchProtection({ rules: [PR()], classicHidden: true, rulesets: [RULESET(ADMIN_PR_ONLY)] });
  assert.equal(unreadable.status, 'UNVERIFIED', 'a classic rule this identity cannot read might close the gap');
});

/** A stand-in for `gh`: answers by path, records what was asked. */
function fakeGh(answers) {
  const asked = [];
  const run = (root, args) => {
    asked.push(args.join(' '));
    const path = args[1];
    const hit = Object.entries(answers).find(([suffix]) => path.endsWith(suffix));
    if (!hit) return { ok: false, notFound: true, why: 'not found' };
    const a = hit[1];
    return typeof a === 'function' ? a() : a;
  };
  return { run, asked };
}
const ok = (json) => ({ ok: true, out: JSON.stringify(json) });
const ask = (answers, options = { repo: 'acme/app' }) => {
  const g = fakeGh(answers);
  return check({ root: '.', subject: 'enforcement-authority', options, now: new Date('2026-11-01T00:00:00Z') }, { run: g.run }).then((v) => ({ v, asked: g.asked }));
};

test('check(): a ruleset-protected branch PASSES, and the repository is named in every path', async () => {
  const { v, asked } = await ask({ '/rules/branches/main': ok([PR(), CHECKS('verify')]), '/rulesets/7': ok(RULESET(ADMIN_PR_ONLY)) });
  assert.equal(v.status, 'PASS', v.detail);
  assert.match(v.detail, /nobody can push around it/);
  assert.deepEqual(asked, ['api repos/acme/app/rules/branches/main', 'api repos/acme/app/branches/main/protection', 'api repos/acme/app/rulesets/7']);
});

test('check(): the audited repository FAILS with the reason; an unreadable branch is UNVERIFIED', async () => {
  const fail = await ask({ '/rules/branches/main': ok([]), '/branches/main/protection': ok(CLASSIC_TODAY) }, {});
  assert.equal(fail.v.status, 'FAIL');
  assert.match(fail.v.detail, /does not enforce: only 0 approving review\(s\) required, expected 1; Code Owner review is not required/);
  assert.equal(fail.asked[0], 'api repos/{owner}/{repo}/rules/branches/main');

  const offline = await ask({ '/rules/branches/main': { ok: false, why: 'GitHub is unreachable from here', transient: true } });
  assert.equal(offline.v.status, 'UNVERIFIED');
  assert.equal(offline.v.transient, true);
  const odd = await ask({ '/rules/branches/main': ok([]), '/branches/main/protection': { ok: false, why: 'gh exited 1' } });
  assert.equal(odd.v.status, 'UNVERIFIED');
});

test('check(): a ruleset configured above the repository has an unknown bypass list', async () => {
  const { v } = await ask({ '/rules/branches/main': ok([PR(), CHECKS('verify')]), '/branches/main/protection': { ok: false, forbidden: true, why: 'x' } });
  assert.equal(v.status, 'UNVERIFIED', v.detail);
  assert.match(v.detail, /bypass list is not visible/);
});
