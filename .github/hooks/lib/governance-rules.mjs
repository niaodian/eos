// EOS guardrail — the governance surface (eos-2.8.0, ADR-025).
//
// secret-rules.mjs stops destructive commands and leaked secrets. Nothing stopped an agent from
// writing the records the gates read (ledger, evidence, waivers, the policy lock), typing a second
// person into EOS_ACTOR, changing the repository's protection, merging its own work, or editing the
// guardrail itself: the audit's PoC P6 sent twelve such calls and all twelve were allowed.
//
// These rules close that for the agent that is not trying hard. A determined one can always find
// another path — an interpreter, a new file, git plumbing — which is why the authority stays on the
// server (manual Appendix D) and this stays a speed bump with a clear sign on it.
//
//   records   .eos/{ledger,evidence,waivers}/, .eos/policy.lock.json — only EOS's own commands write
//             them. Denied everywhere.
//   decisions docs/eos/activation.md, CODEOWNERS — what a person decides. Denied in a project; allowed
//             in EOS's own repository, where they are the template being developed.
//   judge     the engine, hooks, workflows, gate policy, keys, provider and agent configuration — a
//             person confirms ("ask") in a project; allowed in EOS's own repository, where they ARE
//             the product.
//   actions   forging an identity, approving or merging, changing protection or credentials, pushing
//             to the default branch or a release tag, git plumbing, `harden-github.mjs --apply`.
//             Denied everywhere: a person does these. The same action through `gh api` (REST or
//             GraphQL), behind git's global options or under a quoted name is the same action, and a
//             push that names no branch is judged by the branch it pushes.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executableText } from './command-words.mjs';

const SEP = String.raw`(?:^|[\s"'=:(/\\])`;
// Path bodies, written once: the same text builds the "is this path?" test and the "does a shell
// command write to it?" test.
const RECORD = [String.raw`\.eos[\\/](?:ledger|evidence|waivers)[\\/]`, String.raw`\.eos[\\/]policy\.lock\.json`];
const DECISION = [String.raw`docs[\\/]eos[\\/]activation\.md`, String.raw`(?:\.github[\\/])?CODEOWNERS(?![\w.-])`];
const JUDGE = [
  String.raw`\.github[\\/](?:eos|hooks|workflows)[\\/]`,
  String.raw`\.eos[\\/](?:gates|workflow|project|providers)\.json`,
  String.raw`\.eos[\\/](?:schemas|keys|releases)[\\/]`,
  String.raw`\.claude[\\/]`,
  String.raw`\.agents[\\/]hooks\.json`,
  String.raw`\.mcp\.json`,
  String.raw`\.vscode[\\/]`,
];
const paths = (bodies) => bodies.map((b) => ({ body: b, re: new RegExp(`${SEP}${b}`, 'i') }));
export const RECORD_PATHS = paths(RECORD);
export const DECISION_PATHS = paths(DECISION);
export const JUDGE_PATHS = paths(JUDGE);
const matches = (patterns, text) => patterns.some((p) => p.re.test(` ${text}`));

/** What a person does, in the words a refusal uses. */
const SAY = {
  merge: 'merging a pull request — a person merges',
  approve: 'approving a pull request — a person approves',
  protection: 'changing the repository\'s protection, collaborators, environments or secrets',
  repository: 'changing, renaming, transferring or deleting the repository itself — a person does that',
  credentials: 'handling GitHub credentials — the agent works with the identity it was given',
  release: 'publishing a release — a person publishes',
  deployment: 'approving a deployment — a person approves each release',
  defaultBranch: 'pushing to the default branch — changes reach it through a reviewed pull request',
  tag: 'pushing a release tag — a tag starts the release workflow; a person tags',
  everything: 'pushing tags or every branch at once — a person tags a release',
  refs: 'moving a release tag or the default branch through the API — a person tags, and changes reach the default branch through a reviewed pull request',
  branches: 'merging branches through the API — changes reach the default branch through a reviewed pull request',
  contents: 'writing straight to the default branch through the API — changes reach it through a reviewed pull request',
};

// `git` and the options that may come before its subcommand: `git -C dir`, `git -c k=v`, `git --no-pager`.
const GIT = String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path|config-env)\s+\S+|--?[\w-]+(?:=\S+)?))*\s+`;

/** Commands a person runs — never an agent, in any repository. Read from what the shell executes. [pattern, what] */
const ACTIONS = [
  [/(?:^|[\s;&|(])(?:export\s+)?EOS_ACTOR=/, 'setting EOS_ACTOR — the name approvals are recorded under; an agent never chooses who approved'],
  [/(?:\beos\b|eos\.mjs)[^\n;&|]*\sapprove(?:\s|$)/i, 'recording an approval — a second person runs `eos approve` themselves'],
  [/\bgh\s+pr\s+merge\b/i, SAY.merge],
  [/\bgh\s+pr\s+review\b[^\n;&|]*\s(?:--approve|-a)(?=\s|$)/i, SAY.approve],
  [/\bgh\s+(?:ruleset|secret|variable)\s+(?:create|edit|delete|set|remove)\b/i, 'changing the repository\'s rules or secrets'],
  [/\bgh\s+repo\s+(?:delete|edit|rename|archive|unarchive|deploy-key\s+(?:add|delete))\b/i, SAY.repository],
  [/\bgh\s+auth\s+(?:token|login|switch|refresh|setup-git)\b|\bgh\s+(?:ssh-key|gpg-key)\s+(?:add|delete)\b/i, SAY.credentials],
  [/\bgh\s+release\s+(?:create|edit|delete|upload)\b/i, SAY.release],
  [new RegExp(`${GIT}(?:update-index|commit-tree|replace|update-ref|fast-import|hash-object\\s[^\\n;&|]*-w)\\b`, 'i'), 'git plumbing — it can commit a file without the file ever being edited'],
  [/\bgit\b(?![^\n;&|]*--(?:unset|get))[^\n;&|]*\bpush\.followtags\b(?![\s=]+(?:false|no|off|0)\b)/i, 'making every push carry its tags (push.followTags) — a person tags a release'],
  [/harden-github\.mjs[^\n;&|]*\s--(?:apply|yes)\b/i, 'changing the repository\'s settings with harden-github.mjs — the owner runs --apply in their own terminal'],
];

// What a push or an API call touches is read from its own arguments, quoted ones included: the rules
// above see only the executed text, where `git push origin "eos-2.8.0"` hides its tag.
const GIT_PUSH = new RegExp(`${GIT}push\\b`, 'gi');
const GIT_TO_DEFAULT = new RegExp(`${GIT}(?:checkout|switch)\\b[^\\n;&|]*\\s(?:main|master)(?=\\s|$)`, 'i');
const GH_API = /\bgh\s+api\b/gi;
const PUSH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const DEFAULT_BRANCH = /^(?:refs\/heads\/)?(?:main|master)$|^refs\/heads\/\*$/i;
const RELEASE_TAG = /^(?:refs\/tags\/(?:v|eos-|\*)|v\d|eos-)/i;
const API_VALUE = new Set(['-X', '--method', '-H', '--header', '-f', '--raw-field', '-F', '--field', '--input', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-p', '--preview']);
const API_BODY = new Set(['-f', '--raw-field', '-F', '--field', '--input']);
const TAG_OR_DEFAULT = /\btags\/|\bheads\/(?:main|master)\b/i;
const OTHER_BRANCH = /(?:(?:^|\s)(?:-[fF]|--(?:raw-)?field)[=\s]+["']?|["']\s*)branch["']?\s*[=:]\s*["']?(?!(?:main|master)\b)[\w./-]+/i;

/** Every place the shell EXECUTES `re`, with its raw arguments up to the end of that command. */
function executedCalls(re, executed, raw) {
  const calls = [];
  for (const m of executed.matchAll(re)) {
    const from = m.index + m[0].length;
    const stop = executed.slice(from).search(/[\n;&|]/);
    calls.push({ head: raw.slice(m.index, from), args: raw.slice(from, stop === -1 ? raw.length : from + stop) });
  }
  return calls;
}

/** The words of an argument list: quotes removed, redirections and their targets dropped. */
function argWords(text) {
  const words = [];
  let target = false;
  for (const [token] of text.matchAll(/(?:"(?:\\.|[^"\\])*"?|'[^']*'?|[^\s"']+)+/g)) {
    if (target) target = false;
    else if (/^\d*[<>]/.test(token)) target = /^\d*(?:>>?|<)$/.test(token);
    else words.push(token.replace(/["'()]/g, ''));
  }
  return words;
}

/** The branch checked out in `dir`, or '' when git cannot tell (no repository, a detached HEAD). */
function checkedOut(dir) {
  const r = spawnSync('git', ['-C', dir, 'symbolic-ref', '--short', '-q', 'HEAD'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
  return r.status === 0 ? String(r.stdout).trim() : '';
}

/** The directory a `git … push` runs in: its `-C`, else the root. */
function pushDir(head, root) {
  const words = argWords(head);
  const at = words.indexOf('-C');
  return at === -1 ? root : resolve(root, words[at + 1] || '.');
}

/** What a `git push` with these words would do that a person does, or null. `branch()` names the branch it pushes when it names none. */
function pushProblem(words, branch) {
  const positional = [];
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] === '--no-verify') return 'pushing with --no-verify';
    if (/^--(?:tags|mirror|all|follow-tags)$/.test(words[i])) return SAY.everything;
    if (PUSH_VALUE.has(words[i])) i += 1;
    else if (!words[i].startsWith('-')) positional.push(words[i]);
  }
  const specs = positional.slice(1); // the first is the remote
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i].replace(/^\+/, '');
    const destination = spec.slice(spec.indexOf(':') + 1);
    if (spec === ':' || DEFAULT_BRANCH.test(destination)) return SAY.defaultBranch;
    if (RELEASE_TAG.test(destination) || (spec === 'tag' && /^(?:v|eos-)/i.test(specs[i + 1] || ''))) return SAY.tag;
  }
  return specs.every((s) => /^(?:HEAD|@)$/i.test(s)) && DEFAULT_BRANCH.test(branch()) ? SAY.defaultBranch : null;
}

/** The method and endpoint of a `gh api` call. With fields and no method, gh sends a POST. */
function apiCall(words) {
  let method = '';
  let endpoint = '';
  let body = false;
  for (let i = 0; i < words.length; i += 1) {
    const inline = /^(--?[\w-]+)=(.*)$/.exec(words[i]);
    const flag = inline ? inline[1] : words[i];
    if (/^-X./.test(flag)) method = flag.slice(2);
    else if (API_VALUE.has(flag)) {
      const value = inline ? inline[2] : words[(i += 1)] ?? '';
      if (flag === '-X' || flag === '--method') method = value;
      body ||= API_BODY.has(flag);
    } else if (!flag.startsWith('-') && !endpoint) endpoint = flag;
  }
  return { method: (method || (body ? 'POST' : 'GET')).toUpperCase(), endpoint: `/${endpoint.replace(/^\/+/, '').split('?')[0]}` };
}

/** A GraphQL mutation that does what a person does, or null. */
function graphqlProblem(text) {
  if (/\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/.test(text)) return SAY.merge;
  if (/\b(?:addPullRequestReview|submitPullRequestReview)\b/.test(text) && /\bAPPROVE\b/.test(text)) return SAY.approve;
  if (/\bmergeBranch\b/.test(text)) return SAY.branches;
  if (/\b(?:updateRef|deleteRef)\b/.test(text) || (/\b(?:createRef|updateRefs)\b/.test(text) && TAG_OR_DEFAULT.test(text))) return SAY.refs;
  if (/\bcreateCommitOnBranch\b/.test(text) && /\b(?:main|master)\b/.test(text)) return SAY.contents;
  if (/\b(?:create|update|delete)(?:BranchProtectionRule|RepositoryRuleset)\b/.test(text)) return SAY.protection;
  if (/\bapproveDeployments\b/.test(text)) return SAY.deployment;
  return null;
}

/** What a `gh api` call does that a person does, or null. `text` is the whole command: a body can arrive through a pipe. */
function apiProblem({ method, endpoint }, text) {
  if (endpoint === '/graphql') return graphqlProblem(text);
  if (method === 'GET' || method === 'HEAD') return null;
  if (/\/branches\/[^/]+\/protection\b|\/branches\/(?:main|master)\/rename$|\/(?:rulesets|collaborators|invitations|environments|hooks|(?:gpg_|ssh_signing_)?keys|secrets|variables)\b|\/actions\/permissions\b/i.test(endpoint)) return SAY.protection;
  if (/\/pulls\/\d+\/merge$/i.test(endpoint)) return SAY.merge;
  if (/\/pulls\/\d+\/reviews\b/i.test(endpoint) && /\bAPPROVE\b/.test(text)) return SAY.approve;
  if (/\/git\/refs\b/i.test(endpoint) && TAG_OR_DEFAULT.test(text)) return SAY.refs;
  if (/\/releases(?:\/(?!generate-notes)|$)/i.test(endpoint)) return SAY.release;
  if (/\/merges$/i.test(endpoint)) return SAY.branches;
  if (/\/contents\//i.test(endpoint) && !OTHER_BRANCH.test(text)) return SAY.contents;
  if (/\/actions\/runs\/\d+\/(?:pending_deployments|deployment_protection_rule)$/i.test(endpoint)) return SAY.deployment;
  if (/^\/repos\/[^/]+\/[^/]+\/?$|\/transfer$/i.test(endpoint)) return SAY.repository;
  return null;
}

/** Shell writes aimed at a path. A read of the same path stays allowed. */
const WRITERS = [
  String.raw`>{1,2}\s*["']?`,
  String.raw`\btee\b(?:\s+-a)?\s+["']?`,
  String.raw`\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*|--in-place)\b[^\n;&|]*`,
  String.raw`\bperl\s+-[a-zA-Z]*i[^\n;&|]*`,
  String.raw`\b(?:cp|mv|rm|truncate|ln|install|rsync)\b[^\n;&|]*`,
  String.raw`\bdd\b[^\n;&|]*\bof=["']?`,
  String.raw`\bgit\s+(?:checkout|restore)\b[^\n;&|]*`,
  String.raw`\b(?:node|nodejs|deno|bun)\s+(?:-e|--eval|-p)\b[^\n;&|]*`,
  String.raw`\b(?:python3?|ruby|perl)\s+-[ce]\b[^\n;&|]*`,
];
const writesTo = (command, patterns) => patterns.some((p) => WRITERS.some((w) => new RegExp(`${w}(?:[^\\s"';&|]*[\\\\/])?${p.body}`, 'i').test(command)));

/** GitHub MCP tools that act as a person, or write straight to a branch. */
const MCP_PERSON = /(?:^|[_\-.])(?:merge_pull_request|pull_request_review_write|create_pull_request_review|submit_pending_pull_request_review|approve_pull_request)$/i;
const MCP_WRITES = /(?:^|[_\-.])(?:create_or_update_file|push_files|delete_file)$/i;

/** Is this EOS's own repository (the template's declaration), where the judge is the product? */
export function isTemplateRepository(root) {
  try {
    const file = join(root, '.eos/project.json');
    return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).templateDefault === true;
  } catch { return false; }
}

const verdict = (decision, what) => ({ decision, reason: `Blocked by EOS guardrail: ${what}. ${decision === 'ask' ? 'A person must confirm this change.' : 'A person does this, not the agent'} (manual Appendix D).` });

/**
 * Judge a tool call against the governance surface.
 * @param {{toolName?:string, input?:any, strings:{key?:string,text:string,target?:string,kind:string}[], root:string}} call
 * @returns {{decision:'deny'|'ask', reason:string}|null}
 */
export function governanceVerdict({ toolName = '', input = null, strings, root = process.cwd() }) {
  const template = isTemplateRepository(root);
  const name = String(toolName || '');
  if (MCP_PERSON.test(name)) return verdict('deny', `${name} acts as a person (merging or approving)`);
  if (MCP_WRITES.test(name) && input && typeof input === 'object' && /^(?:refs\/heads\/)?(?:main|master)$/i.test(String(input.branch || ''))) {
    return verdict('deny', `${name} writes straight to ${input.branch} — changes reach it through a reviewed pull request`);
  }
  let ask = null;
  for (const { text, target, kind } of strings) {
    if (kind === 'content' && target) {
      if (matches(RECORD_PATHS, target)) return verdict('deny', `writing ${target}, a record only EOS's own commands write (run the eos command instead)`);
      if (!template && matches(DECISION_PATHS, target)) return verdict('deny', `writing ${target}, which records what a person decided`);
      if (!template && !ask && matches(JUDGE_PATHS, target)) ask = verdict('ask', `editing ${target}, part of what judges this project`);
    }
    if (kind === 'command') {
      // Who acts is read from what the shell EXECUTES (a commit message naming EOS_ACTOR is data);
      // where a write lands is read from the whole command, quoted paths included.
      const executed = executableText(text);
      for (const [re, what] of ACTIONS) if (re.test(executed)) return verdict('deny', what);
      for (const { head, args } of executedCalls(GIT_PUSH, executed, text)) {
        const problem = pushProblem(argWords(args), () => (GIT_TO_DEFAULT.test(executed) ? 'main' : checkedOut(pushDir(head, root))));
        if (problem) return verdict('deny', problem);
      }
      for (const { args } of executedCalls(GH_API, executed, text)) {
        const problem = apiProblem(apiCall(argWords(args)), text);
        if (problem) return verdict('deny', problem);
      }
      if (writesTo(text, RECORD_PATHS)) return verdict('deny', 'a shell command that writes a record only EOS\'s own commands write');
      if (!template && writesTo(text, DECISION_PATHS)) return verdict('deny', 'a shell command that writes what a person decided');
      if (!template && !ask && writesTo(text, JUDGE_PATHS)) ask = verdict('ask', 'a shell command that changes part of what judges this project');
    }
  }
  return ask;
}
