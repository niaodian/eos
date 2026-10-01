// Test hygiene — rules the test suite itself must obey, enforced as tests.
//
// A test that can hang is worse than a test that fails: it reports nothing, holds a CI runner for
// as long as the job allows, and when it is finally killed the log says only that time ran out.
// Every process a test starts therefore carries a timeout that is VISIBLE AT THE CALL SITE, and the
// runner gives every test its own time limit. Both used to be true of the engine suites and false
// of the hook suites; these assertions are what keep it true of all of them.
//
//   node --test .github/eos/test-hygiene.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './test-support.mjs';
import { boundedSpawnSync } from './test-spawn.mjs';

/** Every file that is a test or that tests import to run things. */
function testSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.git')) continue;
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.test\.mjs$/.test(name) || /^(test-support|audit-support|test-spawn)\.mjs$/.test(name)) out.push(full);
    }
  };
  walk(join(REPO_ROOT, '.github'));
  return out;
}

/**
 * The argument text of a call starting at `open` (the index of its opening parenthesis), skipping
 * string, template and comment contents so a ')' inside them cannot end the call early.
 */
function callArguments(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < src.length && src[i] !== c; i += 1) if (src[i] === '\\') i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 1; continue; }
    if (c === '(') depth += 1;
    if (c === ')') { depth -= 1; if (depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}

// The child_process entry points. A preceding '.' or identifier character means it is something
// else — `re.exec(…)`, `boundedSpawnSync(…)` — which is exactly what must not be counted.
const SPAWNERS = /(?<![.\w$])(spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(/g;

/**
 * A copy of the source with string, template, comment and regex-literal CONTENTS replaced by spaces.
 * Positions are preserved, so a match found here maps straight back onto the original text. Without
 * this, a pattern such as `/\bexec\s*\(/` or an example inside a string reads as a real call.
 */
function codeOnly(src) {
  const out = src.split('');
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  // A '/' starts a regex literal when the previous meaningful character could not end an operand.
  const regexCanStart = (i) => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j -= 1;
    if (j < 0) return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(src[j])) return true;
    return /\b(return|typeof|in|of|case|do|else|void|yield|await)$/.test(src.slice(Math.max(0, j - 6), j + 1));
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      for (i += 1; i < src.length && src[i] !== c; i += 1) if (src[i] === '\\') i += 1;
      blank(start + 1, i);
    } else if (c === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < src.length && src[i] !== '\n') i += 1;
      blank(start, i);
    } else if (c === '/' && src[i + 1] === '*') {
      const start = i;
      i = src.indexOf('*/', i + 2);
      if (i < 0) i = src.length;
      blank(start, i + 2);
      i += 1;
    } else if (c === '/' && regexCanStart(i)) {
      const start = i;
      let inClass = false;
      for (i += 1; i < src.length && src[i] !== '\n'; i += 1) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) break;
      }
      blank(start + 1, i);
    }
  }
  return out.join('');
}

/** Every child_process call in `src` whose arguments do not carry a timeout. */
function unboundedCalls(src) {
  const code = codeOnly(src);
  const found = [];
  for (const m of code.matchAll(SPAWNERS)) {
    const args = callArguments(src, m.index + m[0].length - 1);
    if (!/\btimeout\s*:/.test(args)) found.push({ index: m.index, name: m[1] });
  }
  return found;
}

test('every process a test starts has a timeout visible at the call site', () => {
  const offenders = [];
  for (const file of testSources()) {
    const src = readFileSync(file, 'utf8');
    for (const call of unboundedCalls(src)) {
      // An import list mentions the names without calling them.
      const lineStart = src.lastIndexOf('\n', call.index) + 1;
      const line = src.slice(lineStart, src.indexOf('\n', call.index));
      if (/^\s*import\b/.test(line)) continue;
      const lineNo = src.slice(0, call.index).split('\n').length;
      offenders.push(`${relative(REPO_ROOT, file)}:${lineNo}  ${call.name}(…) has no timeout`);
    }
  }
  assert.deepEqual(offenders, [],
    'A process started without a timeout can hang a CI job silently until the runner kills it. '
    + 'Use boundedSpawnSync from .github/eos/test-spawn.mjs, or pass `timeout:` explicitly.');
});

test('the runner gives every test its own time limit', () => {
  const runner = readFileSync(join(REPO_ROOT, '.github/eos/run-tests.mjs'), 'utf8');
  assert.match(runner, /--test-timeout/, 'without --test-timeout a single stuck test holds its whole layer');
});

test('the runner bounds each layer process as a backstop', () => {
  const runner = readFileSync(join(REPO_ROOT, '.github/eos/run-tests.mjs'), 'utf8');
  assert.ok([...codeOnly(runner).matchAll(SPAWNERS)].length > 0, 'the runner must start layer processes');
  assert.deepEqual(unboundedCalls(runner), [], 'every layer process needs a backstop timeout');
});

test('the scanner itself catches an unbounded call and accepts a bounded one', () => {
  // Guard against the rule passing vacuously because the matcher stopped matching.
  const bad = "const r = spawnSync(process.execPath, [HOOK], { cwd: dir, encoding: 'utf8' });";
  const good = "const r = spawnSync(process.execPath, [HOOK], { cwd: dir, timeout: 1000 });";
  const tricky = "const r = spawnSync(cmd, ['a)b'], { cwd: dir, timeout: 5 }); re.exec(x);";
  assert.equal(unboundedCalls(bad).length, 1);
  assert.equal(unboundedCalls(good).length, 0);
  assert.equal(unboundedCalls(tricky).length, 0, 'a ")" inside a string must not end the call early, and re.exec is not a spawn');
  assert.equal(unboundedCalls('boundedSpawnSync(x, [], {})').length, 0, 'the bounded helper is the approved path');
  assert.equal(unboundedCalls("const s = 'spawnSync(a)'; // spawnSync(b)\nconst re = /exec\\s*\\(/;").length, 0,
    'a mention inside a string, a comment or a regex literal is not a call');
});

// ------------------------------------------------------------- the mechanisms, not just the text
// A grep for "--test-timeout" proves the flag is written down, not that a stuck test is stopped.
// These run a genuinely hanging test and a genuinely hanging process and assert both are cut off.
test('a hanging test is killed by the per-test limit, not left to the job timeout', { timeout: 60000 }, () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major > 20 || (major === 20 && minor >= 11))) return; // the runner reports this case itself
  const dir = mkdtempSync(join(tmpdir(), 'eos-hang-'));
  try {
    const file = join(dir, 'hang.test.mjs');
    writeFileSync(file, "import { test } from 'node:test';\ntest('hangs', () => new Promise(() => {}));\n", 'utf8');
    const started = Date.now();
    // NODE_TEST_CONTEXT is how the outer runner marks its own children. A nested `node --test` that
    // inherits it behaves as a reporting child and exits 0 regardless — so it must not be inherited.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = boundedSpawnSync(process.execPath, ['--test', '--test-timeout=500', file], { cwd: dir, env, timeout: 30000 });
    assert.notEqual(r.status, 0, 'a test that never settles must fail');
    assert.match(`${r.stdout}${r.stderr}`, /timed out|cancelled/i);
    assert.ok(Date.now() - started < 20000, 'it must be stopped by the 500ms limit, not by anything slower');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a hanging subprocess fails with a diagnosis, not a bare ETIMEDOUT', { timeout: 30000 }, () => {
  assert.throws(
    () => boundedSpawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 300 }),
    (e) => /exceeded 300ms/.test(e.message) && /test file/.test(e.message) && /directory/.test(e.message),
  );
});

test('a process a test starts never inherits the outer runner\'s context', { timeout: 30000 }, () => {
  // Inherited, NODE_TEST_CONTEXT makes a nested `node --test` exit 0 whatever its tests did — so a
  // sandbox whose product test command is `node --test` would pass without proving anything.
  const r = boundedSpawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.env.NODE_TEST_CONTEXT))'], { timeout: 10000 });
  assert.equal(r.stdout, 'undefined');
  const withExplicitEnv = boundedSpawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.env.NODE_TEST_CONTEXT))'],
    { env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' }, timeout: 10000 });
  assert.equal(withExplicitEnv.stdout, 'undefined', 'even an explicitly passed environment is cleaned');
});
