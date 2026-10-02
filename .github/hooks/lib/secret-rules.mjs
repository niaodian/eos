// EOS secret & danger rules — ONE copy for the two guards that used to keep their own.
//
//   .github/hooks/deny-dangerous.js  the real-time PreToolUse hook (defense in depth, fails open)
//   .github/hooks/secret-scan.mjs    the batch scanner run by CI and by the release-ready
//                                    `secret-scan` check (an authority: a miss here is a false PASS)
//
// The two copies had drifted (the hook lacked the Google and Slack rules), and both had blind spots
// that eos-2.0.1 closes, each pinned by .github/eos/audit-secrets.test.mjs:
//   - the scanner skipped every line that mentioned an environment variable, so a literal fallback
//     such as `process.env.X || "<LITERAL>"` (or an env var named in a comment) was never read;
//   - the hook matched a JSON re-encoding of the whole tool call, which escaped every double quote
//     (a double-quoted credential never matched) and joined all lines into one (a word on one line
//     and a flag on a later line looked like a single command);
//   - a credential written as a JSON key (`"password": "<VALUE>"`) matched neither guard;
//   - current key formats (project-scoped OpenAI keys, Anthropic keys, fine-grained GitHub tokens,
//     Stripe live keys) slipped past the older vendor patterns.
//
// Zero dependencies by design (package.json comments.zeroDependency). Both guards are heuristics: a
// determined author can always obfuscate a literal. Their job is to catch the honest mistake — above
// all the one an AI assistant makes while it writes code — not to replace review.

/** An environment-variable name that holds a secret: a literal fallback for one is a hardcoded secret. */
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/i;
/** ...unless the name says it holds something else: a path, an id, a header name. */
const NOT_SECRET_SUFFIX = /(?:^|[_.-])(?:PATH|FILE|DIR|URL|URI|ID|NAME|HEADER|PREFIX|TYPE|LENGTH|SIZE|COUNT)$/i;

export function isSecretName(name) {
  return SECRET_NAME.test(String(name)) && !NOT_SECRET_SUFFIX.test(String(name));
}

/**
 * A matched VALUE that is an obvious placeholder is skipped — that match only, not the whole line,
 * so a real secret sharing a line with a `# example` comment is still caught. Strong markers
 * (${...}, <UPPER>, example, placeholder...) match as substrings; generic words that could appear
 * inside a real secret (xxx/dummy/sample/redacted/replace/todo) are word-bounded. [audit D4, round-2 N3]
 */
export const PLACEHOLDER = /\$\{|<[A-Z_]+>|example|placeholder|change[_-]?me|your[_-]|\*{3,}|\b(?:x{3,}|dummy|sample|redacted|replace|todo)\b/i;

const vendor = (kind, re) => ({ kind, re, value: (m) => m[0] });

/** High-signal vendor formats, applied to every line of every text file. */
const VENDOR_RULES = [
  vendor('OpenAI-style key', /sk-[A-Za-z0-9]{16,}/g),
  vendor('OpenAI project or service key', /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g),
  vendor('Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/g),
  vendor('AWS access key id', /AKIA[0-9A-Z]{16}/g),
  vendor('GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/g),
  vendor('GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{22,}/g),
  vendor('Google API key', /AIza[0-9A-Za-z_-]{35}/g),
  vendor('Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/g),
  vendor('Stripe live key', /[sr]k_live_[A-Za-z0-9]{20,}/g),
  vendor('private key block', /-----BEGIN\s+(?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED|PGP)\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/g),
];
const FALLBACK = 'hardcoded fallback for a secret environment variable';

/**
 * A literal default for a secret-named environment variable. The old scanner skipped every line that
 * read an environment variable, which is exactly where this lives.
 */
const FALLBACK_RULES = [
  // JS / TS:  process.env.NAME || "<LITERAL>"   process.env["NAME"] ?? '<LITERAL>'   import.meta.env.NAME || `<LITERAL>`
  { re: /(?:process\.env|import\.meta\.env)(?:\.([A-Za-z_]\w*)|\[\s*["'`]([A-Za-z_]\w*)["'`]\s*\])\s*(?:\|\||\?\?)\s*(["'`])([^"'`\n]{6,})\3/g,
    name: (m) => m[1] || m[2], value: (m) => m[4] },
  // A call that reads NAME with a literal default: Python os.environ.get / os.getenv / setdefault,
  // PHP env(), Ruby ENV.fetch, Go-style getEnv helpers, Java System.getenv().getOrDefault
  { re: /(?:\b(?:environ\.get|environ\.setdefault|getenv|getEnv|GetEnv|get_env|env)|\bENV\.fetch|getenv\(\)\.getOrDefault)\(\s*(["'])([A-Za-z_]\w*)\1\s*,\s*(["'])([^"'\n]{6,})\3/g,
    name: (m) => m[2], value: (m) => m[4] },
  // Ruby:  ENV["NAME"] || "<LITERAL>"
  { re: /\bENV\[\s*(["'])([A-Za-z_]\w*)\1\s*\]\s*\|\|\s*(["'])([^"'\n]{6,})\3/g,
    name: (m) => m[2], value: (m) => m[4] },
  // Shell / Docker Compose ${NAME:-<LITERAL>}  and Spring ${name:<LITERAL>}
  { re: /\$\{([A-Za-z_][\w.-]*):-?([^}\s"'$]{6,})\}/g,
    name: (m) => m[1], value: (m) => m[2] },
].map((r) => ({ kind: FALLBACK, ...r }));

const CREDENTIAL_WORD = '(?:password|passwd|secret(?:[_-]?key)?|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)';

/** `word = "<VALUE>"`, `word: '<VALUE>'` and, since 2.0.1, the JSON-key form `"word": "<VALUE>"`. */
const GENERIC_RULE = {
  kind: 'hardcoded credential',
  re: new RegExp(`${CREDENTIAL_WORD}["']?\\s*[:=]\\s*["']([^"'\${}\\n]{6,})["']`, 'gi'),
  value: (m) => m[1],
};

/** Unquoted `key=value` credentials — only in config formats whose values are never quoted. */
const UNQUOTED_RULE = {
  kind: 'hardcoded credential',
  re: new RegExp(`^\\s*[\\w.-]*?${CREDENTIAL_WORD}\\s*[:=]\\s*([^\\s"'#;\${}][^\\s"'#;]{5,})\\s*$`, 'gi'),
  value: (m) => m[1],
};
const CONFIG_FILE = /\.(?:properties|ini|cfg|conf|cnf)$/i;

/** Java .properties, INI and similar: the formats where UNQUOTED_RULE applies. */
export function isConfigFile(path) {
  return CONFIG_FILE.test(String(path || ''));
}

const LINE_RULES = [...VENDOR_RULES, ...FALLBACK_RULES, GENERIC_RULE];

/**
 * The first secret on one line, or null. Each rule is tried match by match, so a placeholder early
 * in the line cannot hide a real value later in it.
 * @param {string} line
 * @param {{configFile?: boolean}} [opts]  configFile: also flag unquoted `key=value` credentials
 * @returns {{kind: string, value: string} | null}
 */
export function findSecret(line, { configFile = false } = {}) {
  const rules = configFile ? [...LINE_RULES, UNQUOTED_RULE] : LINE_RULES;
  for (const rule of rules) {
    for (const m of String(line).matchAll(rule.re)) {
      if (rule.name && !isSecretName(rule.name(m))) continue;
      const value = rule.value(m);
      if (PLACEHOLDER.test(value)) continue;
      return { kind: rule.kind, value };
    }
  }
  return null;
}

/** The first secret in a multi-line text, with its 1-based line number, or null. */
export function findSecretInText(text, opts) {
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const hit = findSecret(lines[i], opts);
    if (hit) return { ...hit, line: i + 1 };
  }
  return null;
}

/** Never print the secret itself. */
export function redact(value) {
  const v = String(value);
  return v.length > 8 ? `${v.slice(0, 4)}***${v.slice(-2)}` : '***';
}
/**
 * Destructive, supply-chain-poisoning and safety-disabling commands. Applied to a COMMAND a tool will
 * run, and to content written to a non-documentation file (a script, a workflow, a Makefile) — never
 * to prose, and never to the old text an edit replaces. The patterns are the pre-2.0.1 hook's,
 * unchanged; what changed is that they now see real line breaks.
 */
export const DESTRUCTIVE_RULES = [
  [/\brm\s+(-[a-z]*[rf]|--(?:recursive|force))/i, 'recursive or forced file removal'],
  [/\bfind\b[^\n]*-delete/i, 'mass deletion through a file search'],
  [/DROP\s+TABLE/i, 'a destructive SQL statement'],
  [/\bgit\s+push\b[^\n]*\s(-f|--force)(?![\w-])/i, 'a force push (the lease-checked variant is allowed)'],
  [/\bgit\s+reset\s+--hard\b/, 'discarding local work'],
  [/:\s*>\s*\//, 'truncating a file at the filesystem root'],
  [/\bdd\s+if=/i, 'a raw disk write'],
  [/\bmkfs\b|>\s*\/dev\/sd[a-z]/i, 'formatting or writing a block device'],
  [/\bchmod\s+-?R?\s*777\b/i, 'making files world-writable'],
  [/(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba|z|k|c)?sh/i, 'a remote script piped into a shell'],
  [/(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b/i, 'a remote script piped into an interpreter'],
  [/base64\s+-d[^\n]*\|\s*(sudo\s+)?(ba|z)?sh/i, 'decoded content piped into a shell'],
  [/\bnpm\s+(i|install|ci)\b[^\n]*--(unsafe-perm|no-verify)/i, 'disabling install-script safety'],
  [/\bpip\s+install\b[^\n]*--(trusted-host|index-url\s+http:)/i, 'installing from an untrusted index'],
];

// How a tool call's fields are read. Harnesses differ (VS Code Local, Copilot CLI/SDK, Claude Code,
// Codex), so fields are recognised by name wherever they sit, and anything unrecognised is treated as
// content — the conservative choice.
const META_KEYS = new Set(['tool_name', 'toolName', 'hookEventName', 'hook_event_name', 'session_id', 'sessionId', 'transcript_path', 'transcriptPath', 'cwd', 'timestamp', 'permission_mode']);
const PATH_KEY = /^(?:path|file_?path|filename|file|target_?file|notebook_?path|uri)$/i;
const OLD_TEXT_KEY = /^old_?(?:str(?:ing)?|text)$/i;
const COMMAND_KEY = /^(?:command|cmd|command_?line|script|args|argv)$/i;
const PROSE_KEY = /^(?:description|explanation|reason|summary|title|goal|prompt|query|search|pattern|url|message|label|intent)$/i;
const DOC_FILE = /\.(?:md|mdx|markdown|txt|rst|adoc|asciidoc)$/i;

function collect(node, key, target, out) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') { out.push({ key, text: node, target }); return; }
  if (Array.isArray(node)) {
    if (key && COMMAND_KEY.test(key) && node.every((x) => typeof x === 'string')) {
      out.push({ key, text: node.join(' '), target }); // ["bash", "-lc", "..."] is one command
      return;
    }
    for (const item of node) collect(item, key, target, out);
    return;
  }
  if (typeof node !== 'object') return;
  let local = target;
  for (const [k, v] of Object.entries(node)) if (PATH_KEY.test(k) && typeof v === 'string') local = v;
  for (const [k, v] of Object.entries(node)) {
    if (META_KEYS.has(k) || PATH_KEY.test(k) || OLD_TEXT_KEY.test(k)) continue; // removed text is not written
    collect(v, k, local, out);
  }
}

const PATCH = /^\*\*\* Begin Patch|^diff --git |^@@ [^\n]*@@/m;
const PATCH_TARGET = /^(?:\*\*\* (?:Add|Update) File: |\+\+\+ (?:b\/)?)(.+)$/gm;
const SEARCH_REPLACE = /<<<<<<< SEARCH\r?\n[\s\S]*?\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;

/** For a patch or a SEARCH/REPLACE edit, only the text being ADDED is written. */
function writtenPart(text) {
  if (text.includes('<<<<<<< SEARCH')) {
    const kept = [...text.matchAll(SEARCH_REPLACE)].map((m) => m[1]);
    if (kept.length) return { text: kept.join('\n'), targets: [] };
  }
  if (!PATCH.test(text)) return null;
  const targets = [...text.matchAll(PATCH_TARGET)].map((m) => m[1].trim());
  const added = text.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  return { text: added.join('\n'), targets };
}

const where = (key, targets) => `${key ? `the ${key} field` : 'the tool call'}${targets.length ? ` (${targets[0]})` : ''}`;
const deny = (reason) => ({ decision: 'deny', reason: `Blocked by EOS guardrail: ${reason}` });

function judge(strings) {
  for (const { key, text, target } of strings) {
    const kind = key && COMMAND_KEY.test(key) ? 'command' : key && PROSE_KEY.test(key) ? 'prose' : 'content';
    let body = text;
    let targets = target ? [target] : [];
    if (kind === 'content') {
      const part = writtenPart(text);
      if (part) { body = part.text; if (part.targets.length) targets = part.targets; }
    }
    const secret = findSecretInText(body, { configFile: targets.some(isConfigFile) });
    if (secret) {
      return deny(`a hardcoded secret (${secret.kind}) in ${where(key, targets)}. Move it to an environment variable or a secret store, and keep only a placeholder in examples.`);
    }
    const docsOnly = targets.length > 0 && targets.every((t) => DOC_FILE.test(t));
    if (kind === 'command' || (kind === 'content' && !docsOnly)) {
      for (const [re, what] of DESTRUCTIVE_RULES) {
        if (re.test(body)) return deny(`${what} in ${where(key, targets)}. If it is really intended, run it yourself; the agent may not.`);
      }
    }
  }
  return { decision: 'allow' };
}

/**
 * Judge one PreToolUse payload (the hook's stdin). Strings are scanned the way the tool will use
 * them — field by field, line by line — not as a JSON re-encoding of the whole call.
 * @param {string} raw
 * @returns {{decision: 'allow'|'deny', reason?: string}}
 */
export function evaluateToolCall(raw) {
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    // The fields cannot be told apart, so every rule applies to the raw text. Before 2.0.1 an
    // unparseable payload was read as an empty one, and allowed.
    return judge([{ key: 'command', text: String(raw), target: undefined }]);
  }
  let input = payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    input = payload.tool_input ?? payload.toolArgs ?? payload.tool_args ?? payload.toolInput ?? payload;
  }
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { /* plain text: scanned as content */ }
  }
  const strings = [];
  collect(input, typeof input === 'string' ? 'input' : undefined, undefined, strings);
  return judge(strings);
}
