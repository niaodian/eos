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
//             Denied everywhere: a person does these.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Commands a person runs — never an agent, in any repository. [pattern, what] */
const ACTIONS = [
  [/(?:^|[\s;&|(])(?:export\s+)?EOS_ACTOR=/, 'setting EOS_ACTOR — the name approvals are recorded under; an agent never chooses who approved'],
  [/(?:\beos\b|eos\.mjs)[^\n;&|]*\sapprove(?:\s|$)/i, 'recording an approval — a second person runs `eos approve` themselves'],
  [/\bgh\s+pr\s+merge\b/i, 'merging a pull request — a person merges'],
  [/\bgh\s+pr\s+review\b[^\n;&|]*--approve\b/i, 'approving a pull request — a person approves'],
  [/\bgh\s+api\b(?=[^\n;&|]*(?:-X|--method)[=\s]*(?:PUT|POST|PATCH|DELETE)\b)(?=[^\n;&|]*\/(?:branches\/[^\s/]+\/protection|rulesets|collaborators|environments|actions\/permissions|hooks|keys|secrets|actions\/secrets)\b)/i, 'changing the repository\'s protection, collaborators, environments or secrets'],
  [/\bgh\s+(?:ruleset|secret|variable)\s+(?:create|edit|delete|set|remove)\b/i, 'changing the repository\'s rules or secrets'],
  [/\bgh\s+auth\s+(?:token|login|switch|refresh|setup-git)\b/i, 'handling GitHub credentials — the agent works with the identity it was given'],
  [/\bgh\s+release\s+(?:create|edit|delete|upload)\b/i, 'publishing a release — a person publishes'],
  [/\bgit\s+push\b[^\n;&|]*\s--no-verify\b/i, 'pushing with --no-verify'],
  [/\bgit\s+push\b[^\n;&|]*\s(?:--tags|--mirror|--all)\b/i, 'pushing every tag or ref at once'],
  [/\bgit\s+push\b[^\n;&|]*\s(?:\S+:)?(?:refs\/heads\/)?(?:main|master)(?=\s|$)/i, 'pushing to the default branch — changes reach it through a reviewed pull request'],
  [/\bgit\s+push\b[^\n;&|]*\s(?:\S+:)?(?:refs\/tags\/)?(?:v\d|eos-)\S*/i, 'pushing a release tag — a tag starts the release workflow; a person tags'],
  [/\bgit\s+(?:update-index|commit-tree|replace|update-ref|hash-object\s[^\n;&|]*-w)\b/i, 'git plumbing — it can commit a file without the file ever being edited'],
  [/harden-github\.mjs[^\n;&|]*\s--(?:apply|yes)\b/i, 'changing the repository\'s settings with harden-github.mjs — the owner runs --apply in their own terminal'],
];

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
export function governanceVerdict({ toolName = '', input = null, strings, root }) {
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
      if (writesTo(text, RECORD_PATHS)) return verdict('deny', 'a shell command that writes a record only EOS\'s own commands write');
      if (!template && writesTo(text, DECISION_PATHS)) return verdict('deny', 'a shell command that writes what a person decided');
      if (!template && !ask && writesTo(text, JUDGE_PATHS)) ask = verdict('ask', 'a shell command that changes part of what judges this project');
    }
  }
  return ask;
}
