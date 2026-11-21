// The GitHub hardening tool (ADR-025) — the one command a person runs per repository.
//
// Driven against an in-memory GitHub, so every path — plan, check, apply, refusal, failure — is
// exercised offline and nothing real is ever changed. The real runner and the confirmation prompt are
// covered through their seams (a binary that is not `gh`, streams that are not a terminal).
//
//   node --test .github/eos/harden-github.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './test-support.mjs';
import {
  main, readState, assess, applyFixes, render, rulesetBodies, environmentBody, ghRunner, askYesNo,
  MAIN_RULESET, TAG_RULESET,
} from './harden-github.mjs';

/** EOS's own repository on 2026-10-31: classic protection with no approval, nothing else. */
const CLASSIC_TODAY = {
  required_status_checks: { strict: true, contexts: ['verify'], checks: [{ context: 'verify', app_id: 15368 }] },
  required_pull_request_reviews: { required_approving_review_count: 0, require_code_owner_reviews: false, require_last_push_approval: false },
  enforce_admins: { enabled: false },
};

/**
 * A small GitHub: rulesets, an environment, collaborators and invitations, answering GETs and
 * applying writes the way the REST API does. `fail` makes a matching write fail.
 */
function fakeGitHub({ admin = true, visibility = 'public', classic = CLASSIC_TODAY, rulesets = [], environment = null, collaborators = {}, invitations = [], fail = null, missing = false } = {}) {
  const state = { rulesets: rulesets.map((r) => ({ ...r })), environment, policies: [], collaborators: { ...collaborators }, invitations: [...invitations], writes: [] };
  let nextId = 100;
  const json = (x) => ({ ok: true, out: JSON.stringify(x) });
  const notFound = { ok: false, notFound: true, why: 'not found' };
  const rulesFor = (target) => state.rulesets.filter((r) => r.target === target && r.enforcement === 'active')
    .flatMap((r) => (r.rules || []).map((rule) => ({ ...rule, ruleset_id: r.id })));
  const run = (root, args, timeoutMs, input) => {
    const method = args[1] === '--method' ? args[2] : 'GET';
    const path = method === 'GET' ? args[1] : args[3];
    if (method !== 'GET') {
      state.writes.push(`${method} ${path}`);
      if (fail && `${method} ${path}`.includes(fail)) return { ok: false, why: 'gh: Validation Failed (HTTP 422)' };
      const body = JSON.parse(input);
      if (path.endsWith('/rulesets') && method === 'POST') state.rulesets.push({ ...body, id: nextId++ });
      else if (/\/rulesets\/\d+$/.test(path)) Object.assign(state.rulesets.find((r) => path.endsWith(`/${r.id}`)), body);
      else if (path.endsWith('/environments/release')) state.environment = { name: 'release', protection_rules: [{ type: 'required_reviewers', reviewers: body.reviewers.map((r) => ({ type: r.type, reviewer: { login: 'owner', id: r.id } })) }] };
      else if (path.endsWith('/deployment-branch-policies')) state.policies.push(body);
      else if (/\/collaborators\//.test(path)) state.invitations.push({ invitee: { login: decodeURIComponent(path.split('/').pop()) } });
      return { ok: true, out: '{}' };
    }
    if (path === 'repos/{owner}/{repo}') return missing ? notFound : json({ full_name: 'acme/app', default_branch: 'main', visibility, permissions: { admin } });
    if (path === 'user') return json({ login: admin ? 'owner' : 'acme-bot', id: admin ? 7 : 8 });
    if (path === 'apps/github-actions') return json({ id: 15368 });
    if (path.endsWith('/rules/branches/main')) return json(rulesFor('branch'));
    if (path.endsWith('/branches/main/protection')) return classic ? json(classic) : notFound;
    if (path.endsWith('/rulesets')) return json(state.rulesets.map(({ id, name, target, enforcement }) => ({ id, name, target, enforcement })));
    const rs = path.match(/\/rulesets\/(\d+)$/);
    if (rs) return json(state.rulesets.find((r) => r.id === Number(rs[1])));
    if (path.endsWith('/environments/release')) return state.environment ? json(state.environment) : notFound;
    if (path.endsWith('/deployment-branch-policies')) return json({ branch_policies: state.policies });
    const perm = path.match(/\/collaborators\/([^/]+)\/permission$/);
    if (perm) return state.collaborators[perm[1]] ? json({ permission: state.collaborators[perm[1]] }) : notFound;
    if (path.endsWith('/invitations')) return json(state.invitations);
    return notFound;
  };
  return { run, state };
}

const capture = () => { const chunks = []; return { out: (s) => chunks.push(s), text: () => chunks.join('') }; };

test('the rulesets are exactly what the manual promises — and what the REST API accepts', () => {
  const { main: m, tags } = rulesetBodies({ checkName: 'verify', actionsAppId: 15368 });
  assert.equal(m.name, MAIN_RULESET);
  assert.deepEqual(m.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }], 'administrators merge a pull request around it, never push');
  assert.deepEqual(m.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
  const pr = m.rules.find((r) => r.type === 'pull_request').parameters;
  for (const k of ['dismiss_stale_reviews_on_push', 'require_code_owner_review', 'require_last_push_approval', 'required_approving_review_count', 'required_review_thread_resolution']) assert.ok(k in pr, `${k} is required by the API`);
  assert.equal(pr.required_approving_review_count, 1);
  assert.deepEqual(m.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks, [{ context: 'verify', integration_id: 15368 }]);
  assert.equal(tags.name, TAG_RULESET);
  assert.deepEqual(tags.conditions.ref_name.include, ['refs/tags/v*', 'refs/tags/eos-*']);
  assert.deepEqual(tags.rules.map((r) => r.type), ['creation', 'update', 'deletion']);
  assert.deepEqual(environmentBody(7), { reviewers: [{ type: 'User', id: 7 }], prevent_self_review: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
});

test('the audited repository: three gaps, each with the change that closes it', () => {
  const gh = fakeGitHub();
  const state = readState(gh.run, '.', { bot: 'acme-bot' });
  const items = assess(state);
  assert.deepEqual(items.map((i) => [i.id, i.ok]), [['main-branch', false], ['release-tags', false], ['release-environment', false], ['agent-identity', false]]);
  assert.match(items[0].detail, /only 0 approving review\(s\) required, expected 1; Code Owner review is not required; the most recent push does not need someone else's approval/);
  const plan = render(state, items, { mode: 'plan', bot: 'acme-bot' });
  assert.match(plan, /you: owner — an administrator/);
  assert.match(plan, /4 change\(s\)\. Make them in YOUR OWN terminal, not in an agent:\n {4}node \.github\/eos\/harden-github\.mjs --bot acme-bot --apply/);
  assert.equal(gh.state.writes.length, 0, 'reading the state writes nothing');
});

test('plan and check are read-only, and check exits non-zero until the repository is hardened', async () => {
  const gh = fakeGitHub();
  const plan = capture();
  assert.equal(await main(['--bot', 'acme-bot'], { run: gh.run, out: plan.out }), 0);
  const check = capture();
  assert.equal(await main(['--check'], { run: gh.run, out: check.out }), 1);
  assert.match(check.text(), /NOT HARDENED — 3 item\(s\) missing/);
  assert.match(check.text(), /agent account: not checked — pass --bot <login>/);
  assert.equal(gh.state.writes.length, 0);
});

test('--apply as the owner makes exactly the missing changes, then verifies them', async () => {
  const gh = fakeGitHub();
  const out = capture();
  const code = await main(['--bot', 'acme-bot', '--apply'], { run: gh.run, out: out.out, interactive: true, confirm: async () => true });
  assert.equal(code, 0, out.text());
  assert.deepEqual(gh.state.writes, [
    'POST repos/acme/app/rulesets',
    'POST repos/acme/app/rulesets',
    'PUT repos/acme/app/environments/release',
    'POST repos/acme/app/environments/release/deployment-branch-policies',
    'POST repos/acme/app/environments/release/deployment-branch-policies',
    'PUT repos/acme/app/collaborators/acme-bot',
  ]);
  assert.match(out.text(), /✓ main branch/);
  assert.match(out.text(), /\? agent account {5}acme-bot is invited/);
  assert.match(out.text(), /Last step, by hand: sign in to GitHub as acme-bot and accept the invitation/);

  // Once the bot accepted, the same repository checks clean — and a second --apply changes nothing.
  gh.state.collaborators['acme-bot'] = 'write';
  const check = capture();
  assert.equal(await main(['--check', '--bot', 'acme-bot'], { run: gh.run, out: check.out }), 0, check.text());
  assert.match(check.text(), /\nHARDENED\n/);
  const again = capture();
  assert.equal(await main(['--bot', 'acme-bot', '--apply', '--yes'], { run: gh.run, out: again.out }), 0);
  assert.match(again.text(), /Nothing to change/);
});

test('a ruleset with EOS\'s name is updated in place, never duplicated', () => {
  const stale = { id: 41, name: MAIN_RULESET, target: 'branch', enforcement: 'disabled', bypass_actors: [], rules: [] };
  const gh = fakeGitHub({ rulesets: [stale] });
  const state = readState(gh.run, '.', {});
  const results = applyFixes(gh.run, '.', state, assess(state));
  assert.ok(results.every((r) => r.ok));
  assert.ok(gh.state.writes.includes('PUT repos/acme/app/rulesets/41'), gh.state.writes.join('\n'));
  assert.equal(gh.state.rulesets.filter((r) => r.name === MAIN_RULESET).length, 1);
});

test('--apply refuses without an owner, without a terminal, or without a yes', async () => {
  const notOwner = capture();
  assert.equal(await main(['--apply', '--yes'], { run: fakeGitHub({ admin: false }).run, out: notOwner.out }), 1);
  assert.match(notOwner.text(), /only be changed by an administrator/);
  assert.match(notOwner.text(), /not an administrator\. Right for an agent's account/);

  const gh = fakeGitHub();
  const headless = capture();
  assert.equal(await main(['--apply'], { run: gh.run, out: headless.out, interactive: false }), 2);
  assert.match(headless.text(), /asks before it changes anything/);
  const declined = capture();
  assert.equal(await main(['--apply'], { run: gh.run, out: declined.out, interactive: true, confirm: async () => false }), 2);
  assert.match(declined.text(), /Nothing was changed/);
  assert.equal(gh.state.writes.length, 0);
});

test('a change GitHub refuses is reported, and the run fails', async () => {
  const gh = fakeGitHub({ fail: 'deployment-branch-policies' });
  const out = capture();
  assert.equal(await main(['--apply', '--yes'], { run: gh.run, out: out.out }), 1);
  assert.match(out.text(), /FAILED release-environment — gh: Validation Failed \(HTTP 422\)/);
});

test('what counts as protected release tags — and what does not', () => {
  const tagRuleset = (extra = {}) => ({ id: 9, name: 'tags', target: 'tag', enforcement: 'active', bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
    conditions: { ref_name: { include: ['refs/tags/v*', 'refs/tags/eos-*'] } }, rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }], ...extra });
  const tags = (rs) => assess(readState(fakeGitHub({ rulesets: [rs] }).run, '.', {})).find((i) => i.id === 'release-tags').ok;
  assert.equal(tags(tagRuleset()), true);
  assert.equal(tags(tagRuleset({ conditions: { ref_name: { include: ['~ALL'] } } })), true);
  assert.equal(tags(tagRuleset({ enforcement: 'evaluate' })), false, 'evaluate mode enforces nothing');
  assert.equal(tags(tagRuleset({ rules: [{ type: 'creation' }] })), false);
  assert.equal(tags(tagRuleset({ bypass_actors: [{ actor_id: 4, actor_type: 'RepositoryRole', bypass_mode: 'always' }] })), false, 'a writer who can bypass is anyone with write');
});

test('the agent account: write is right, admin is refused, an invitation is pending', () => {
  const agent = (collaborators, invitations = []) => assess(readState(fakeGitHub({ collaborators, invitations }).run, '.', { bot: 'acme-bot' })).find((i) => i.id === 'agent-identity');
  assert.equal(agent({ 'acme-bot': 'write' }).ok, true);
  const admin = agent({ 'acme-bot': 'admin' });
  assert.equal(admin.ok, false);
  assert.equal(admin.fix, null, 'demoting an account is done by hand');
  assert.match(admin.detail, /admin rights — an agent's account must have write access only/);
  const pending = agent({}, [{ invitee: { login: 'ACME-BOT' } }]);
  assert.equal(pending.pending, true);
  assert.equal(pending.fix, null);
});

test('a repository that cannot be read is "cannot tell", and the private-repository limit is said up front', async () => {
  const out = capture();
  assert.equal(await main(['--check'], { run: fakeGitHub({ missing: true }).run, out: out.out }), 3);
  assert.match(out.text(), /this repository was not found on GitHub/);
  const gh = fakeGitHub({ visibility: 'private', classic: null });
  const state = readState(gh.run, '.', {});
  assert.match(render(state, assess(state), { mode: 'check' }), /private repository: on GitHub Free, rulesets and environment reviewers are not enforced/);
  // Nothing readable about the branch: protection cannot be confirmed either way.
  const unreadable = { ...state, rules: [], rulesUnreadable: true };
  assert.equal(assess(unreadable)[0].unknown, true);
});

test('--json and --help are machine- and person-readable; a stray argument is refused', async () => {
  const json = capture();
  assert.equal(await main(['--check', '--json', '--check-name', 'ci'], { run: fakeGitHub().run, out: json.out }), 1);
  const parsed = JSON.parse(json.text());
  assert.equal(parsed.repository, 'acme/app');
  assert.match(parsed.items[0].detail, /required status check\(s\) not enforced: ci/);
  assert.ok('change' in parsed.items[0] && !('fix' in parsed.items[0]));
  const help = capture();
  assert.equal(await main(['--help'], { out: help.out }), 0);
  assert.match(help.text(), /run it yourself, once per repository/);
  assert.equal(await main(['oops'], { out: () => {} }), 3);
});

test('the real runner: a missing binary and a request body are handled, and the answer is asked once', async () => {
  const missing = ghRunner('.', ['api', 'user'], 5000, undefined, { bin: 'eos-no-such-gh-binary' });
  assert.equal(missing.ok, false);
  assert.match(missing.why, /not installed/);
  const echo = ghRunner('.', ['-e', 'process.stdin.pipe(process.stdout)'], 10000, '{"ok":1}', { bin: process.execPath });
  assert.deepEqual(echo, { ok: true, out: '{"ok":1}' });

  for (const [typed, expected] of [['y\n', true], ['yes\n', true], ['\n', false], ['nope\n', false]]) {
    const input = new PassThrough();
    const output = new PassThrough();
    const answer = askYesNo('Apply? ', { input, output });
    input.end(typed);
    assert.equal(await answer, expected, JSON.stringify(typed));
  }
});

test('nothing in EOS\'s engine, its MCP server or its skills runs this tool — a person does (ADR-025)', () => {
  const engine = ['.github/eos/lib', '.github/eos/lib/evaluators', '.github/eos/commands', '.github/eos/adapters'];
  const offenders = [];
  for (const dir of engine) {
    for (const name of readdirSync(join(REPO_ROOT, dir)).filter((n) => n.endsWith('.mjs'))) {
      if (/harden-github/.test(readFileSync(join(REPO_ROOT, dir, name), 'utf8'))) offenders.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(offenders, [], 'EOS Core and its adapters stay read-only against GitHub (ADR-005 D5)');
  for (const skill of readdirSync(join(REPO_ROOT, '.agents/skills'))) {
    const text = readFileSync(join(REPO_ROOT, '.agents/skills', skill, 'SKILL.md'), 'utf8');
    for (const line of text.split('\n').filter((l) => /harden-github\.mjs[^\n]*--apply/.test(l))) {
      assert.match(line, /(person|human|your own terminal|yourself|they run|the user runs|ask the user|developer runs)/i, `${skill}: an --apply line must hand it to a person: ${line.trim()}`);
    }
  }
});
