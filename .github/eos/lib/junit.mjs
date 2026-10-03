// JUnit XML — the one test-result format EOS reads. (ADR-016)
//
// Up to 2.1 EOS read no runner output at all: every project wrote its own "~30-line mapping step"
// from its runner's JSON into docs/evidence/test-run.json, and the template shipped none of them.
// That was the fixed cost of every story. JUnit XML is the one format nearly every runner already
// writes — node:test, vitest, Playwright, pytest, Maven/Gradle, gotestsum, .NET, nextest, jest-junit —
// so EOS reads exactly that one, and never a runner-specific format.
//
// The parser below is a deliberately small SUBSET of XML, because a governance gate must not grow a
// general XML engine:
//   - elements, attributes, comments, CDATA, processing instructions, the five predefined entities and
//     numeric character references;
//   - NO <!DOCTYPE> and NO <!ENTITY>: they are refused outright, which is what makes entity-expansion
//     attacks ("billion laughs") impossible rather than mitigated;
//   - a size cap and a depth cap.
// Anything it cannot read with certainty is an ERROR, never a pass: a report that parses "mostly" is
// exactly the kind of evidence that would let a failing test through.
//
// Pure: no file system, no process. test-evidence.mjs does the I/O.

/** A report larger than this is refused rather than read. Real reports are a few MB at most. */
export const JUNIT_MAX_BYTES = 32 * 1024 * 1024;
const MAX_DEPTH = 64;

const NAME = /[A-Za-z_:][\w.:-]*/y;
const ENTITY = /&(?:(lt|gt|amp|quot|apos)|#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6}));/y;
const NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

const legalChar = (cp) => cp === 0x9 || cp === 0xA || cp === 0xD || (cp >= 0x20 && cp <= 0xD7FF)
  || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);

/** Decode the references in attribute or text content; null when one is not a legal reference. */
function decode(raw) {
  if (!raw.includes('&')) return raw;
  let out = '';
  let i = 0;
  for (;;) {
    const amp = raw.indexOf('&', i);
    if (amp === -1) return out + raw.slice(i);
    out += raw.slice(i, amp);
    ENTITY.lastIndex = amp;
    const m = ENTITY.exec(raw);
    if (!m) return null;
    if (m[1]) out += NAMED[m[1]];
    else {
      const cp = m[2] ? parseInt(m[2], 10) : parseInt(m[3], 16);
      if (!legalChar(cp)) return null;
      out += String.fromCodePoint(cp);
    }
    i = ENTITY.lastIndex;
  }
}

/**
 * Parse the XML subset into an element tree (text is validated, then dropped: no gate reads it).
 * @returns {{root: object|null, error: string|null}}
 */
function parseXml(text) {
  const err = (message, at) => ({ root: null, error: `${message}${at === undefined ? '' : ` (offset ${at})`}` });
  const n = text.length;
  const stack = [];
  let root = null;
  let rootClosed = false;
  let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const skipWs = (j) => { while (j < n && /\s/.test(text[j])) j++; return j; };

  while (i < n) {
    const lt = text.indexOf('<', i);
    const chunk = lt === -1 ? text.slice(i) : text.slice(i, lt);
    if (chunk) {
      if (!stack.length && chunk.trim()) return err('text outside the root element', i);
      if (stack.length && decode(chunk) === null) return err('an "&" that is not a legal entity or character reference', i);
    }
    if (lt === -1) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) return err('unterminated comment', i);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      if (!stack.length) return err('CDATA outside the root element', i);
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) return err('unterminated CDATA section', i);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) return err('unterminated processing instruction', i);
      i = end + 2;
      continue;
    }
    // <!DOCTYPE …>, <!ENTITY …> and every other declaration. Refusing them is the whole defence
    // against entity expansion: there is no entity table to expand.
    if (text.startsWith('<!', i)) return err(`"${text.slice(i, i + 10)}…" — DOCTYPE and ENTITY declarations are refused`, i);
    if (text.startsWith('</', i)) {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(text);
      if (!m) return err('malformed end tag', i);
      const j = skipWs(i + 2 + m[0].length);
      if (text[j] !== '>') return err(`malformed end tag </${m[0]}`, i);
      const open = stack.pop();
      if (!open || open.name !== m[0]) return err(`</${m[0]}> does not close ${open ? `<${open.name}>` : 'any open element'}`, i);
      if (!stack.length) rootClosed = true;
      i = j + 1;
      continue;
    }
    NAME.lastIndex = i + 1;
    const m = NAME.exec(text);
    if (!m) return err('malformed tag', i);
    if (rootClosed) return err('content after the root element', i);
    const el = { name: m[0], attrs: Object.create(null), children: [] };
    let j = i + 1 + m[0].length;
    let selfClosing = false;
    for (;;) {
      const k = skipWs(j);
      if (text[k] === '>') { j = k + 1; break; }
      if (text.startsWith('/>', k)) { j = k + 2; selfClosing = true; break; }
      if (k >= n) return err(`<${el.name}> is never closed`, i);
      if (k === j) return err(`attributes of <${el.name}> must be separated by whitespace`, k);
      NAME.lastIndex = k;
      const a = NAME.exec(text);
      if (!a) return err(`malformed attribute in <${el.name}>`, k);
      let v = skipWs(k + a[0].length);
      if (text[v] !== '=') return err(`attribute "${a[0]}" of <${el.name}> has no value`, v);
      v = skipWs(v + 1);
      const quote = text[v];
      if (quote !== '"' && quote !== "'") return err(`attribute "${a[0]}" of <${el.name}> is not quoted`, v);
      const end = text.indexOf(quote, v + 1);
      if (end === -1) return err(`attribute "${a[0]}" of <${el.name}> is never closed`, v);
      const raw = text.slice(v + 1, end);
      if (raw.includes('<')) return err(`"<" inside attribute "${a[0]}" of <${el.name}>`, v);
      const value = decode(raw);
      if (value === null) return err(`attribute "${a[0]}" of <${el.name}> contains an "&" that is not a legal reference`, v);
      if (a[0] in el.attrs) return err(`duplicate attribute "${a[0]}" in <${el.name}>`, k);
      el.attrs[a[0]] = value;
      j = end + 1;
    }
    if (stack.length) stack.at(-1).children.push(el);
    else if (root) return err('more than one root element', i);
    else root = el;
    if (stack.length >= MAX_DEPTH) return err(`elements nested deeper than ${MAX_DEPTH} levels`, i);
    if (selfClosing) { if (!stack.length) rootClosed = true; } else stack.push(el);
    i = j;
  }
  if (stack.length) return err(`<${stack.at(-1).name}> is never closed`);
  if (!root) return err('no root element');
  return { root, error: null };
}

const STRUCTURAL = new Set(['testsuites', 'testsuite']);

const containsTestcase = (el) => el.children.some((c) => c.name === 'testcase' || containsTestcase(c));

function outcome(tc) {
  const kinds = new Set(tc.children.map((c) => c.name));
  if (kinds.has('failure') || tc.attrs.failure !== undefined) return 'FAIL';
  if (kinds.has('error')) return 'ERROR';
  if (kinds.has('skipped')) return 'SKIP';
  return 'PASS';
}

/**
 * Parse one JUnit XML report into the testcases it records.
 *
 * Each case carries what a report can say about it: its name, its classname, a `file` attribute
 * (its own or the nearest enclosing suite's), the names of the suites enclosing it, its outcome and
 * its duration. Text — failure messages, captured output — is never kept: it can hold anything the
 * product printed, and none of it belongs in a committed evidence file.
 *
 * @returns {{ok: true, cases: object[]} | {ok: false, error: string}}
 */
export function parseJUnit(text) {
  if (typeof text !== 'string') return { ok: false, error: 'not text' };
  if (Buffer.byteLength(text, 'utf8') > JUNIT_MAX_BYTES) {
    return { ok: false, error: `larger than ${JUNIT_MAX_BYTES / (1024 * 1024)} MB — refused rather than read` };
  }
  const { root, error } = parseXml(text);
  if (error) return { ok: false, error };
  if (!STRUCTURAL.has(root.name)) {
    return { ok: false, error: `the root element is <${root.name}>, not <testsuites> or <testsuite> — this is not a JUnit report` };
  }
  const cases = [];
  let problem = null;
  const walk = (el, suites, file) => {
    for (const child of el.children) {
      if (problem) return;
      if (child.name === 'testcase') {
        if (typeof child.attrs.name !== 'string' || !child.attrs.name.trim()) { problem = 'a <testcase> has no name'; return; }
        const seconds = Number.parseFloat(child.attrs.time);
        cases.push({
          name: child.attrs.name,
          classname: child.attrs.classname || '',
          file: child.attrs.file || file || null,
          suites,
          status: outcome(child),
          ...(Number.isFinite(seconds) && seconds >= 0 ? { durationMs: Math.round(seconds * 1000) } : {}),
        });
        if (containsTestcase(child)) { problem = `<testcase name="${child.attrs.name}"> contains another <testcase>`; return; }
      } else if (child.name === 'testsuite') {
        walk(child, [...suites, child.attrs.name || ''], child.attrs.file || file);
      } else if (child.name === 'testsuites') {
        walk(child, suites, file);
      } else if (containsTestcase(child)) {
        // A testcase somewhere EOS does not expect it: guessing what <foo> means is how a parser
        // ends up counting results nobody reported.
        problem = `a <testcase> inside <${child.name}> — not a structure EOS recognises`;
        return;
      }
    }
  };
  walk(root, root.name === 'testsuite' ? [root.attrs.name || ''] : [], root.attrs.file || null);
  if (problem) return { ok: false, error: problem };
  return { ok: true, cases };
}

// ------------------------------------------------------------------------------------- matching
//
// docs/trace-matrix.md stays the authority on WHICH test proves WHICH criterion; a report only says
// what ran. A row `tests/login.test.mjs::valid password` is answered by the testcases named
// "valid password" — and, when the report says where a testcase lives, only by those that live in
// tests/login.test.mjs. Reports that do not say (node:test writes classname="test" and no file) are
// matched by name and marked `match: "name"`; the gate's static check that the selector appears in
// the file the matrix names is what then ties the name to that file.

/** Extensions a report may name a test file with. Lower case on purpose: `com.example.Rs` is a class. */
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go|java|kt|kts|scala|groovy|cs|fs|vb|rb|rs|php|swift|exs?|dart|clj[cs]?)$/;
const DOTTED = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const slash = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');
const stripExt = (p) => p.replace(/\.[^./]+$/, '');
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
const baseOf = (p) => stripExt(p.slice(p.lastIndexOf('/') + 1));
const pathish = (s) => !!s && !/\s/.test(s) && (/[\\/]/.test(s) || SOURCE_EXT.test(s));

/** A path a report gives agrees with a test file when one ends with the other (or names its directory). */
function pathAgrees(loc, testPath) {
  const l = slash(loc);
  const t = slash(testPath);
  if (l === t || l.endsWith(`/${t}`) || t.endsWith(`/${l}`)) return true;
  // gotestsum and friends name the PACKAGE (a directory), not the file.
  if (!SOURCE_EXT.test(l)) {
    const d = dirOf(t);
    return d === '.' || l === d || l.endsWith(`/${d}`);
  }
  return false;
}

/** `tests.test_login.TestSession` agrees with tests/test_login.py; `com.example.LoginTest` with …/com/example/LoginTest.java. */
function moduleAgrees(mod, testPath) {
  const t = stripExt(slash(testPath));
  const segs = mod.split('.');
  for (let len = segs.length; len >= 1; len--) {
    const p = segs.slice(0, len).join('/');
    if (t === p || t.endsWith(`/${p}`)) return true;
  }
  // Java/.NET convention: the class is named after its file (nested classes after a `$`).
  return segs.at(-1).split('$')[0] === baseOf(slash(testPath));
}

/**
 * Does the report place this testcase in `testPath`?
 * @returns {'agrees'|'contradicts'|'unknown'}
 */
export function locationVerdict(tc, testPath) {
  const strong = [];
  if (tc.file) strong.push(['path', tc.file]);
  if (pathish(tc.classname)) strong.push(['path', tc.classname]);
  else if (DOTTED.test(tc.classname)) strong.push(['module', tc.classname]);
  const suiteFile = [...tc.suites].reverse().find(pathish);
  if (suiteFile) strong.push(['path', suiteFile]);
  if (strong.some(([kind, v]) => (kind === 'path' ? pathAgrees(v, testPath) : moduleAgrees(v, testPath)))) return 'agrees';
  // A bare identifier is weak: node:test writes "test" for every case, so it may confirm a file
  // (pytest's root-level module, a default-package Java class) but never contradict one.
  if (IDENT.test(tc.classname) && tc.classname === baseOf(slash(testPath))) return 'agrees';
  return strong.length ? 'contradicts' : 'unknown';
}

/** Where a report says a case is, for a message. */
export const describeLocation = (tc) => tc.file || (pathish(tc.classname) || DOTTED.test(tc.classname) ? tc.classname : null)
  || [...tc.suites].reverse().find(pathish) || 'no recorded location';

const SEPARATORS = [' > ', ' › ', '::', '#', '.'];
const withoutParameters = (name) => name.replace(/(?:\s*(?:\[[^\]]*\]|\([^)]*\)))+\s*$/, '');

/**
 * Is this testcase the one a trace-matrix selector names?
 *
 * Exact name, or the name without its parameter suffix (`test_x[1]`, `validPassword(String)[2]`), or a
 * name that embeds its ancestry (`suite > leaf`, as vitest and Playwright write it). A selector that
 * qualifies the name (`TestSession::test_expires`, `session > expires`, `LoginTest#valid`) matches
 * when every qualifier appears among the case's suites or classname segments. Never a substring: the
 * selector "valid password" must not be answered by a test called "invalid password".
 */
export function nameMatches(tc, selector) {
  const s = selector.trim();
  if (!s) return false;
  const names = new Set([tc.name, withoutParameters(tc.name)]);
  if (names.has(s)) return true;
  for (const sep of [' > ', ' › ']) {
    for (const name of names) if (name.endsWith(`${sep}${s}`)) return true;
  }
  const context = new Set([
    ...tc.suites,
    tc.classname,
    ...tc.classname.split(/[./]|::/),
  ].map((x) => x.trim()).filter(Boolean));
  for (const sep of SEPARATORS) {
    const at = s.lastIndexOf(sep);
    if (at <= 0) continue;
    const leaf = s.slice(at + sep.length).trim();
    if (!names.has(leaf)) continue;
    const qualifiers = s.slice(0, at).split(/\s+>\s+|\s+›\s+|::|#|\./).map((x) => x.trim()).filter(Boolean);
    if (qualifiers.length && qualifiers.every((q) => context.has(q))) return true;
  }
  return false;
}

const RANK = { FAIL: 3, ERROR: 2, SKIP: 1, PASS: 0 };

/**
 * Answer one trace-matrix reference from the testcases of every report.
 *
 * Several testcases may answer one reference — a parametrised test, or two runners that both name a
 * test "returns 200". All of them count, and the worst outcome wins: one failing instance makes the
 * row FAIL, and a skipped test is never a PASS.
 *
 * @param {object[]} cases  parsed testcases, each with a `report` path
 * @param {string} testPath the file the matrix names
 * @param {string} selector the test the matrix names inside it ('' when the row names only a file)
 * @returns {{status: 'PASS'|'FAIL'|'ERROR'|'SKIP', match?: 'file'|'name', durationMs?: number, detail: string}}
 */
export function answerReference(cases, testPath, selector) {
  const reports = [...new Set(cases.map((c) => c.report))];
  const where = `${reports.length} JUnit report(s)`;
  if (!selector) {
    const located = cases.filter((c) => locationVerdict(c, testPath) === 'agrees');
    if (!located.length) {
      const anyLocation = cases.some((c) => locationVerdict(c, testPath) !== 'unknown');
      return {
        status: 'ERROR',
        detail: anyLocation
          ? `the trace-matrix row names only the file ${testPath}, and no testcase in the ${where} is located in it — name the test: \`${testPath}::<test name>\``
          : `the trace-matrix row names only the file ${testPath}, and the ${where} do not record which file a testcase ran from — name the test: \`${testPath}::<test name>\``,
      };
    }
    return summarise(located, 'file', `${located.length} testcase(s) located in ${testPath}`);
  }
  const named = cases.filter((c) => nameMatches(c, selector));
  const verdicts = named.map((c) => ({ c, v: locationVerdict(c, testPath) }));
  const agreeing = verdicts.filter((x) => x.v === 'agrees').map((x) => x.c);
  const unknown = verdicts.filter((x) => x.v === 'unknown').map((x) => x.c);
  const elsewhere = verdicts.filter((x) => x.v === 'contradicts').map((x) => x.c);
  const answer = [...agreeing, ...unknown];
  if (!answer.length) {
    return {
      status: 'ERROR',
      detail: elsewhere.length
        ? `a testcase named "${selector}" ran, but the report places it in ${describeLocation(elsewhere[0])}, not ${testPath} — point the trace-matrix row at the file that declares it`
        : `no testcase named "${selector}" in the ${where} (${reports.join(', ')})`,
    };
  }
  const match = unknown.length ? 'name' : 'file';
  return summarise(answer, match, `${answer.length} testcase(s) named "${selector}"${match === 'name' ? ' (matched by name: the report records no file)' : ''}`);
}

function summarise(cases, match, what) {
  const status = cases.reduce((worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst), 'PASS');
  const counted = (s) => cases.filter((c) => c.status === s).length;
  const durations = cases.map((c) => c.durationMs).filter((d) => d !== undefined);
  const notPassing = status === 'PASS' ? '' : ` — ${['FAIL', 'ERROR', 'SKIP'].filter(counted).map((s) => `${counted(s)} ${s}`).join(', ')}`;
  return {
    status,
    match,
    ...(durations.length ? { durationMs: durations.reduce((a, b) => a + b, 0) } : {}),
    detail: `${what}${notPassing}`,
  };
}
