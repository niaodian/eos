// Does a test file declare the test a trace-matrix row names? (ADR-016)
//
// Some JUnit reports record only a test's NAME: node:test writes classname="test" and no file. A
// name-only match proves that SOME test of that name ran. Which file it ran from is settled here,
// from the source, by two rules:
//
//   1. the file the matrix names declares it — as a string literal or a function name, and never
//      inside a comment (a commented-out test, or "valid password" inside "invalid password", is no
//      declaration);
//   2. no other test file declares the same name — otherwise the passing case could be that file's,
//      while the named file's test did not run at all.
//
// Reading source is a heuristic, so it errs one way only: what it cannot settle is an ERROR that
// asks for a unique name or a qualified selector, never a PASS.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { productFilePaths } from './product-tree.mjs';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SCANNED_FILES = 20000;
const HASH_COMMENTS = new Set(['py', 'rb', 'sh', 'bash', 'zsh', 'r', 'pl', 'ex', 'exs', 'jl', 'cr', 'ps1', 'coffee', 'nim', 'tcl', 'yaml', 'yml', 'toml']);
const SLASH_AND_HASH = new Set(['php']);
const JS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx']);
/** Paths that look like tests: only these are searched for a second declaration. */
export const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|specs?|e2e)\/|[._-](?:test|spec|tests|e2e)\.[A-Za-z0-9]+$|(?:^|\/)test_[^/]+$|_test\.[A-Za-z0-9]+$|Tests?\.[A-Za-z0-9]+$|Spec\.[A-Za-z0-9]+$/;
/** EOS's own engine, hooks and documentation examples are not the product's tests. */
const EOS_OWN = ['.github/eos/', '.github/hooks/', 'docs/eos/', '.agents/', '.claude/'];
/** printf-style, `$var`, `${expr}` and `{name}` placeholders: a parametrised test's name template. */
const PLACEHOLDERS = () => /%[sdifjoOpc#]|\$\{[^}]*\}|\$[A-Za-z_][\w.]*|\{[^{}\n]*\}/g;

export const extOf = (rel) => (/\.([A-Za-z0-9]+)$/.exec(rel)?.[1] || '').toLowerCase();

const UNESCAPE = { n: '\n', t: '\t', r: '\r' };

/**
 * The string literals of a source file, and its code with comments removed and every literal
 * reduced to `""`. A small scanner, not a parser: enough to tell a declaration from a comment.
 * @returns {{literals: Set<string>, code: string}}
 */
export function sourceTokens(text, ext) {
  const hash = HASH_COMMENTS.has(ext) || SLASH_AND_HASH.has(ext);
  const slash = !HASH_COMMENTS.has(ext);
  const literals = new Set();
  let code = '';
  const regexCanStart = () => {
    const t = code.trimEnd();
    if (!t) return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(t[t.length - 1])) return true;
    return /(?:^|[^\w$])(?:return|typeof|in|of|case|do|else|void|yield|await)$/.test(t);
  };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (slash && c === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e === -1 ? text.length : e; continue; }
    if (slash && c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? text.length : e + 2; code += ' '; continue; }
    if (hash && c === '#' && !(ext === 'php' && text[i + 1] === '[')) { const e = text.indexOf('\n', i); i = e === -1 ? text.length : e; continue; }
    if (JS.has(ext) && c === '/' && regexCanStart()) {
      // A regex literal: skipped whole, so a quote inside it does not open a string.
      let j = i + 1;
      let inClass = false;
      for (; j < text.length && text[j] !== '\n'; j += 1) {
        if (text[j] === '\\') { j += 1; continue; }
        if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        else if (text[j] === '/' && !inClass) break;
      }
      if (j < text.length && text[j] === '/') { code += '/./'; i = j + 1; continue; }
    }
    if (c === '"' || c === "'" || c === '`') {
      const triple = ext === 'py' && text.startsWith(c.repeat(3), i);
      const quote = triple ? c.repeat(3) : c;
      let j = i + quote.length;
      let s = '';
      let closed = false;
      while (j < text.length) {
        if (text.startsWith(quote, j)) { closed = true; break; }
        if (text[j] === '\\' && j + 1 < text.length) { s += UNESCAPE[text[j + 1]] ?? text[j + 1]; j += 2; continue; }
        if (!triple && c !== '`' && text[j] === '\n') break; // an apostrophe, not a string
        s += text[j];
        j += 1;
      }
      if (closed) { literals.add(s); code += '""'; i = j + quote.length; continue; }
      code += c;
      i += 1;
      continue;
    }
    code += c;
    i += 1;
  }
  return { literals, code };
}

/** A literal with placeholders, as a pattern over the names it produces (null when it has none). */
function templateOf(literal) {
  const fixed = literal.replace(PLACEHOLDERS(), '');
  if (fixed === literal || fixed.replace(/\s/g, '').length < 3) return null;
  const re = literal.replace(PLACEHOLDERS(), '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u0000/g, '.+?');
  return new RegExp(`^${re}$`, 's');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARING = '(?:\\bdef|\\bfunc(?:\\s*\\([^)]*\\))?|\\bfn|\\bfunction\\*?|\\bfun|\\bvoid|\\bsub|\\btask)';

/**
 * Does this source declare a test called `name`?
 * `strict` (used for OTHER files) counts only an exact literal or a function declaration; the named
 * file is also allowed a parametrised template or a call, so a real declaration is not missed.
 */
export function declaresName(tokens, name, { strict = false } = {}) {
  if (!name) return false;
  const bare = name.replace(/(?:\s*(?:\[[^\]]*\]|\([^)]*\)))+\s*$/, '');
  for (const n of new Set([name, bare])) {
    if (!n) continue;
    if (tokens.literals.has(n)) return true;
    if (IDENTIFIER.test(n)) {
      const id = escapeRe(n);
      if (new RegExp(`${DECLARING}\\s+${id}\\s*\\(`).test(tokens.code)) return true;
      if (!strict && new RegExp(`(?<![\\w$])${id}\\s*\\(`).test(tokens.code)) return true;
    }
    if (!strict) for (const l of tokens.literals) if (templateOf(l)?.test(n)) return true;
  }
  return false;
}

const SEPARATORS = [' > ', ' › ', '::', '#', '.'];

/** Is the selector declared — whole, or as a qualified name whose every part is? */
export function declaresSelector(tokens, selector, opts = {}) {
  const s = selector.trim();
  if (declaresName(tokens, s, opts)) return true;
  for (const sep of SEPARATORS) {
    const at = s.lastIndexOf(sep);
    if (at <= 0) continue;
    const leaf = s.slice(at + sep.length).trim();
    const qualifiers = s.slice(0, at).split(/\s+>\s+|\s+›\s+|::|#|\./).map((x) => x.trim()).filter(Boolean);
    if (declaresName(tokens, leaf, opts)
      && qualifiers.every((q) => tokens.literals.has(q) || (IDENTIFIER.test(q) && new RegExp(`(?<![\\w$])${escapeRe(q)}(?![\\w$])`).test(tokens.code)))) return true;
  }
  return false;
}

const tokenCache = new Map();
/** Tokens of one repository file, or null when it is not readable text. Memoised per process. */
export function fileTokens(root, rel) {
  const key = `${root}\0${rel}`;
  if (tokenCache.has(key)) return tokenCache.get(key);
  let tokens = null;
  try {
    const full = join(root, rel);
    if (statSync(full).size <= MAX_SOURCE_BYTES) {
      const text = readFileSync(full, 'utf8');
      if (!text.slice(0, 4096).includes('\u0000')) tokens = sourceTokens(text, extOf(rel));
    }
  } catch { /* unreadable: null */ }
  tokenCache.set(key, tokens);
  return tokens;
}
export const clearTokenCache = () => tokenCache.clear();

/**
 * Settle a name-only match from the source.
 * @returns {{ok: true}|{ok: false, detail: string}}
 */
export function nameOnlyOwnership(root, testPath, selector) {
  const own = fileTokens(root, testPath);
  if (!own) return { ok: false, detail: `the report records no file for "${selector}", and ${testPath} cannot be read as text to confirm it declares that test` };
  if (!declaresSelector(own, selector)) {
    return { ok: false, detail: `a testcase named "${selector}" ran, but ${testPath} does not declare a test of that name (outside comments) — the report records no file, so the name must be declared in the file the trace matrix names` };
  }
  const files = productFilePaths(root);
  if (files === null) return { ok: false, detail: 'git could not list the product files, so it cannot be ruled out that another test file declares the same name' };
  const ext = extOf(testPath);
  const candidates = files.filter((f) => f !== testPath && extOf(f) === ext && TEST_PATH.test(f) && !EOS_OWN.some((p) => f.startsWith(p)));
  if (candidates.length > MAX_SCANNED_FILES) {
    return { ok: false, detail: `the report records no file for "${selector}", and ${candidates.length} other test files are too many to rule out a second declaration — use a JUnit reporter that records each test's file` };
  }
  const elsewhere = candidates.filter((f) => { const t = fileTokens(root, f); return t && declaresSelector(t, selector, { strict: true }); });
  if (elsewhere.length) {
    return { ok: false, detail: `"${selector}" is declared in ${testPath} and also in ${elsewhere.slice(0, 3).join(', ')}${elsewhere.length > 3 ? ` (+${elsewhere.length - 3} more)` : ''}, and the report records no file — so the passing case may not be ${testPath}'s. Give the test a unique name, or qualify the selector with its suite (\`${testPath}::<suite> > ${selector}\`)` };
  }
  return { ok: true };
}
