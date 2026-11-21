#!/usr/bin/env node
// EOS GitHub hardening — the one command a person runs, once per repository, so the gates hold
// against an agent (manual Appendix D, ADR-025).
//
// NOT PART OF EOS'S ENGINE. EOS Core and its adapters stay read-only against GitHub (ADR-005 D5):
// nothing in .github/eos/lib, commands or adapters, no MCP tool and no skill runs this file, and the
// guardrail refuses an agent that tries `--apply`. It exists because the alternative — a person
// clicking through a dozen settings in every repository — demonstrably fails: the audit found EOS's
// own repository requiring no approval at all. A person reads the plan, confirms, and the changes are
// made with THEIR credentials; anyone, an agent included, can then verify the result read-only.
//
//   node .github/eos/harden-github.mjs [--bot <login>]            what is in place, what --apply would change (read-only)
//   node .github/eos/harden-github.mjs --bot <login> --apply      make the changes, after you confirm
//   node .github/eos/harden-github.mjs --check [--bot <login>]    verify, read-only: exit 0 hardened, 1 not, 3 cannot tell
//
// What it sets up:
//   1. the default branch: a ruleset requiring a pull request, one approval from a Code Owner, the
//      latest push approved by someone else, and the `verify` check. Administrators may merge a pull
//      request around it (recorded in the audit log) but never push directly.
//   2. release tags (v*, eos-*): only administrators create, move or delete them — a tag starts the
//      release workflow.
//   3. environment "release": a person approves every release job before it can attest or publish.
//   4. the agent's account (--bot): a collaborator with write access, never an administrator.
// Credentials stay in gh's own store; this program never reads one.
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { evaluateBranchProtection, classifyGh, getJson } from './adapters/github-governance.mjs';

export const MAIN_RULESET = 'eos-main-protection';
export const TAG_RULESET = 'eos-release-tags';
export const RELEASE_ENVIRONMENT = 'release';
export const TAG_PATTERNS = ['v*', 'eos-*'];
/** The built-in "Repository admin" role, as GitHub's own provisioning scripts write it. */
const ADMIN_ROLE = 5;
/** GitHub Actions' app id, used when /apps/github-actions cannot be read. */
const GITHUB_ACTIONS_APP = 15368;
const TIMEOUT_MS = 20000;
const CLI = 'node .github/eos/harden-github.mjs';

/** Run `gh` (or `bin`); `input` is sent on stdin as the request body. */
export function ghRunner(root, args, timeoutMs, input, { bin = 'gh' } = {}) {
  const r = spawnSync(bin, args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, input });
  if (r.error) {
    return { ok: false, why: r.error.code === 'ENOENT' ? 'the GitHub CLI (`gh`) is not installed' : r.error.message, transient: r.error.code === 'ETIMEDOUT' };
  }
  return classifyGh(r.status, (r.stdout || '') + (r.stderr || ''), r.stdout || '');
}

/** Ask a yes/no question on a terminal. Anything but "y"/"yes" is a no. */
export function askYesNo(question, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output });
    rl.question(question, (answer) => { rl.close(); resolve(/^y(es)?$/i.test(String(answer).trim())); });
  });
}

/** The two rulesets, exactly as they are sent. */
export function rulesetBodies({ checkName = 'verify', actionsAppId = GITHUB_ACTIONS_APP } = {}) {
  return {
    main: {
      name: MAIN_RULESET,
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 1,
            dismiss_stale_reviews_on_push: true,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_review_thread_resolution: false,
          },
        },
        {
          type: 'required_status_checks',
          parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: checkName, integration_id: actionsAppId }] },
        },
      ],
    },
    tags: {
      name: TAG_RULESET,
      target: 'tag',
      enforcement: 'active',
      bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
      conditions: { ref_name: { include: TAG_PATTERNS.map((p) => `refs/tags/${p}`), exclude: [] } },
      rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
    },
  };
}

/** Who approves release jobs: the person running --apply. */
export const environmentBody = (reviewerId) => ({
  reviewers: [{ type: 'User', id: reviewerId }],
  prevent_self_review: false,
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
});

/** Everything the assessment needs, read with GETs only. */
export function readState(run, root, { bot = null, checkName = 'verify' } = {}) {
  const get = (path) => getJson(run, root, path, TIMEOUT_MS);
  const repo = get('repos/{owner}/{repo}');
  if (!repo.ok) return { ok: false, why: repo.notFound ? 'this repository was not found on GitHub' : repo.why };
  const slug = repo.json.full_name;
  const base = `repos/${slug}`;
  const branch = repo.json.default_branch || 'main';
  const user = get('user');
  const rules = get(`${base}/rules/branches/${encodeURIComponent(branch)}`);
  const classic = get(`${base}/branches/${encodeURIComponent(branch)}/protection`);
  const list = get(`${base}/rulesets`);
  const rulesets = (list.ok && Array.isArray(list.json) ? list.json : []).map((rs) => {
    const detail = get(`${base}/rulesets/${rs.id}`);
    return detail.ok ? detail.json : rs;
  });
  const env = get(`${base}/environments/${RELEASE_ENVIRONMENT}`);
  const policies = env.ok ? get(`${base}/environments/${RELEASE_ENVIRONMENT}/deployment-branch-policies`) : null;
  const app = get('apps/github-actions');
  let agent = null;
  if (bot) {
    const perm = get(`${base}/collaborators/${encodeURIComponent(bot)}/permission`);
    const permission = perm.ok ? perm.json.permission : null;
    const invites = ['write', 'admin', 'maintain'].includes(permission) ? null : get(`${base}/invitations`);
    agent = {
      login: bot,
      permission,
      invited: !!(invites?.ok && Array.isArray(invites.json) && invites.json.some((i) => String(i.invitee?.login || '').toLowerCase() === bot.toLowerCase())),
    };
  }
  return {
    ok: true,
    slug,
    base,
    branch,
    visibility: repo.json.visibility || (repo.json.private ? 'private' : 'public'),
    viewer: { login: user.ok ? user.json.login : null, id: user.ok ? user.json.id : null, admin: !!repo.json.permissions?.admin },
    rules: rules.ok && Array.isArray(rules.json) ? rules.json : [],
    rulesUnreadable: !rules.ok,
    classic: classic.ok ? classic.json : null,
    classicHidden: !!classic.forbidden,
    rulesets,
    environment: env.ok ? env.json : null,
    environmentPolicies: policies?.ok ? (policies.json.branch_policies || []) : [],
    actionsAppId: app.ok && Number.isInteger(app.json.id) ? app.json.id : GITHUB_ACTIONS_APP,
    agent,
    checkName,
  };
}

/** Does an active tag ruleset stop everyone but administrators from creating, moving or deleting release tags? */
function protectsReleaseTags(rs) {
  if (rs?.target !== 'tag' || rs.enforcement !== 'active') return false;
  const include = rs.conditions?.ref_name?.include || [];
  const covers = (p) => include.includes('~ALL') || include.includes(`refs/tags/${p}`) || include.includes(p);
  const types = new Set((rs.rules || []).map((r) => r.type));
  const others = (rs.bypass_actors || []).some((a) => !(a.actor_type === 'RepositoryRole' && a.actor_id === ADMIN_ROLE));
  return TAG_PATTERNS.every(covers) && ['creation', 'update', 'deletion'].every((t) => types.has(t)) && !others;
}

/**
 * What is in place, and what --apply would do about what is not.
 * @returns {{id:string, title:string, ok:boolean, unknown?:boolean, detail:string, fix:object|null}[]}
 */
export function assess(state) {
  const bodies = rulesetBodies({ checkName: state.checkName, actionsAppId: state.actionsAppId });
  const items = [];

  const applying = new Set(state.rules.map((r) => r.ruleset_id));
  const verdict = evaluateBranchProtection({
    rules: state.rules,
    classic: state.classic,
    classicHidden: state.classicHidden,
    rulesets: state.rulesets.filter((rs) => applying.has(rs.id)),
    requiredChecks: [state.checkName],
    requireCodeOwnerReview: true,
    minApprovals: 1,
    requireLastPushApproval: true,
  });
  items.push({
    id: 'main-branch',
    title: `${state.branch} branch`,
    ok: verdict.status === 'PASS' && !state.rulesUnreadable,
    unknown: verdict.status === 'UNVERIFIED' || state.rulesUnreadable,
    detail: verdict.status === 'PASS'
      ? `a pull request, a Code Owner's approval, approval of the latest push and the ${state.checkName} check are required, and nobody can push around them`
      : [...verdict.problems, ...verdict.notes].join('; '),
    fix: { kind: 'ruleset', body: bodies.main, summary: `ruleset "${MAIN_RULESET}": a pull request, 1 approval from a Code Owner, the latest push approved by someone else, the ${state.checkName} check — administrators may merge a pull request around it, never push directly` },
  });

  const tagsOk = state.rulesets.some(protectsReleaseTags);
  items.push({
    id: 'release-tags',
    title: 'release tags',
    ok: tagsOk,
    detail: tagsOk
      ? `only administrators create, move or delete ${TAG_PATTERNS.join(', ')} tags`
      : `anyone who can push can create ${TAG_PATTERNS.join(', ')} tags, and a tag starts the release workflow`,
    fix: { kind: 'ruleset', body: bodies.tags, summary: `ruleset "${TAG_RULESET}": only administrators create, move or delete ${TAG_PATTERNS.join(', ')} tags` },
  });

  const reviewers = (state.environment?.protection_rules || [])
    .filter((r) => r.type === 'required_reviewers')
    .flatMap((r) => r.reviewers || [])
    .map((r) => r.reviewer?.login || r.reviewer?.name || r.reviewer?.slug || r.type);
  const have = new Set(state.environmentPolicies.filter((p) => p.type === 'tag').map((p) => p.name));
  const patterns = TAG_PATTERNS.filter((p) => !have.has(p));
  items.push({
    id: 'release-environment',
    title: 'release approval',
    ok: reviewers.length > 0,
    detail: reviewers.length
      ? `environment "${RELEASE_ENVIRONMENT}": ${reviewers.join(', ')} approve(s) every release job`
      : state.environment ? `environment "${RELEASE_ENVIRONMENT}" exists, but nobody has to approve a release job` : `environment "${RELEASE_ENVIRONMENT}" does not exist, so release jobs run without anyone approving them`,
    fix: state.viewer.id
      ? { kind: 'environment', body: environmentBody(state.viewer.id), patterns, summary: `environment "${RELEASE_ENVIRONMENT}": ${state.viewer.login} approves every release job; only ${TAG_PATTERNS.join(', ')} tags may use it` }
      : null,
  });

  if (state.agent) {
    const { login, permission, invited } = state.agent;
    const tooMuch = permission === 'admin' || permission === 'maintain';
    items.push({
      id: 'agent-identity',
      title: 'agent account',
      ok: permission === 'write',
      pending: !tooMuch && permission !== 'write' && invited,
      detail: tooMuch
        ? `${login} has ${permission} rights — an agent's account must have write access only (change it under Settings → Collaborators)`
        : permission === 'write'
          ? `${login} can push branches and open pull requests, and nothing more`
          : invited ? `${login} is invited — sign in as ${login} and accept it: https://github.com/${state.slug}/invitations` : `${login} is not a collaborator`,
      fix: tooMuch || permission === 'write' || invited ? null : { kind: 'invite', summary: `invite ${login} as a collaborator (write access, never admin)` },
    });
  }
  return items;
}

/** Make the changes the assessment proposed. Only what is missing is touched; rulesets are updated in place. */
export function applyFixes(run, root, state, items) {
  const send = (method, path, body) => run(root, ['api', '--method', method, path, '--input', '-'], TIMEOUT_MS, JSON.stringify(body));
  const results = [];
  for (const item of items) {
    if (item.ok || !item.fix) continue;
    let r;
    if (item.fix.kind === 'ruleset') {
      const existing = state.rulesets.find((rs) => rs.name === item.fix.body.name);
      r = existing ? send('PUT', `${state.base}/rulesets/${existing.id}`, item.fix.body) : send('POST', `${state.base}/rulesets`, item.fix.body);
    } else if (item.fix.kind === 'environment') {
      r = send('PUT', `${state.base}/environments/${RELEASE_ENVIRONMENT}`, item.fix.body);
      for (const name of item.fix.patterns) {
        if (!r.ok) break;
        r = send('POST', `${state.base}/environments/${RELEASE_ENVIRONMENT}/deployment-branch-policies`, { name, type: 'tag' });
      }
    } else {
      r = send('PUT', `${state.base}/collaborators/${encodeURIComponent(state.agent.login)}`, {});
    }
    results.push({ id: item.id, ok: !!r.ok, why: r.ok ? null : r.why });
  }
  return results;
}

/** The report a person reads. */
export function render(state, items, { mode = 'plan', bot = null } = {}) {
  const mark = (i) => (i.ok ? '✓' : i.unknown || i.pending ? '?' : '✗');
  const lines = [`EOS GitHub hardening · ${state.slug} (${state.visibility}, default branch ${state.branch})`];
  lines.push(state.viewer.admin
    ? `  you: ${state.viewer.login} — an administrator. You can change these settings; an agent must never work with these credentials.`
    : `  you: ${state.viewer.login || 'unknown'} — not an administrator. Right for an agent's account; --apply needs the repository's owner.`);
  if (state.visibility === 'private') lines.push('  private repository: on GitHub Free, rulesets and environment reviewers are not enforced here (manual D.1).');
  lines.push('');
  for (const i of items) {
    lines.push(`  ${mark(i)} ${i.title.padEnd(17)} ${i.detail}`);
    if (mode !== 'check' && !i.ok && i.fix) lines.push(`    → --apply: ${i.fix.summary}`);
  }
  if (!bot) lines.push('', '  agent account: not checked — pass --bot <login> for the account your agent works as (manual D.5).');
  const todo = items.filter((i) => !i.ok && i.fix);
  lines.push('');
  if (mode === 'check') {
    const failing = items.filter((i) => !i.ok && !i.unknown && !i.pending);
    lines.push(failing.length ? `NOT HARDENED — ${failing.length} item(s) missing` : items.every((i) => i.ok) ? 'HARDENED' : 'CANNOT CONFIRM — see the ? lines');
  } else if (mode === 'plan') {
    lines.push(todo.length
      ? `  ${todo.length} change(s). Make them in YOUR OWN terminal, not in an agent:\n    ${CLI}${bot ? ` --bot ${bot}` : ''} --apply`
      : '  Nothing to change.');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { flags._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (['bot', 'check-name'].includes(key) && next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
  }
  return flags;
}

const USAGE = `EOS GitHub hardening (run it yourself, once per repository — manual Appendix D)

  ${CLI} [--bot <login>]             what is in place, and what --apply would change (read-only)
  ${CLI} --bot <login> --apply       make the changes, after you confirm (--yes skips the question)
  ${CLI} --check [--bot <login>]     verify, read-only: exit 0 hardened, 1 not, 3 cannot tell
  --check-name <name>   the required CI check (default: verify)   --json   machine-readable output
`;

/** Exit codes: 0 done/hardened · 1 not hardened or a change failed · 2 not confirmed · 3 cannot read GitHub. */
export async function main(argv = process.argv.slice(2), io = {}) {
  const { run = ghRunner, root = process.cwd(), out = (s) => process.stdout.write(s), confirm = askYesNo, interactive = !!process.stdin.isTTY } = io;
  const flags = parseArgs(argv);
  if (flags.help || flags._.length) { out(USAGE); return flags.help ? 0 : 3; }
  const bot = typeof flags.bot === 'string' ? flags.bot : null;
  const checkName = typeof flags['check-name'] === 'string' ? flags['check-name'] : 'verify';
  const mode = flags.check ? 'check' : flags.apply ? 'apply' : 'plan';

  const state = readState(run, root, { bot, checkName });
  if (!state.ok) {
    out(`EOS GitHub hardening · cannot read this repository: ${state.why}\n  Run it inside a clone of your GitHub repository, after \`gh auth login\`.\n`);
    return 3;
  }
  const items = assess(state);
  if (flags.json && mode !== 'apply') {
    out(`${JSON.stringify({ repository: state.slug, viewer: state.viewer, items: items.map(({ fix, ...rest }) => ({ ...rest, change: fix?.summary || null })) }, null, 2)}\n`);
  } else {
    out(render(state, items, { mode, bot }));
  }
  if (mode === 'check') {
    if (items.some((i) => !i.ok && !i.unknown && !i.pending)) return 1;
    return items.every((i) => i.ok) ? 0 : 3;
  }
  if (mode === 'plan') return 0;

  const todo = items.filter((i) => !i.ok && i.fix);
  if (!todo.length) { out('  Nothing to change.\n'); return 0; }
  if (!state.viewer.admin) {
    out('  These settings can only be changed by an administrator of the repository. Run --apply as its owner, in your own terminal.\n');
    return 1;
  }
  if (!flags.yes) {
    if (!interactive) { out('  --apply asks before it changes anything. Run it in your own terminal, or pass --yes.\n'); return 2; }
    if (!(await confirm(`  Apply these ${todo.length} change(s) to ${state.slug}? [y/N] `))) { out('  Nothing was changed.\n'); return 2; }
  }
  const results = applyFixes(run, root, state, items);
  for (const r of results) out(`  ${r.ok ? 'done  ' : 'FAILED'} ${r.id}${r.ok ? '' : ` — ${r.why}`}\n`);
  const after = readState(run, root, { bot, checkName });
  const again = after.ok ? assess(after) : [];
  if (after.ok) out(`\n${render(after, again, { mode: 'check', bot })}`);
  if (results.some((r) => !r.ok) || !after.ok) return 1;
  if (again.some((i) => i.pending)) out(`  Last step, by hand: sign in to GitHub as ${bot} and accept the invitation (https://github.com/${after.slug}/invitations).\n`);
  return again.every((i) => i.ok || i.pending) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
