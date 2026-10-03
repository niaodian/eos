// Test evidence from JUnit reports — the gate writes docs/evidence/test-run.json itself. (ADR-016)
//
// G7 reads two things and requires them to agree: docs/trace-matrix.md (which test proves which
// criterion — a human decision) and docs/evidence/test-run.json (that the test ran, against this
// tree). Until 2.2 every project produced the second with a mapping script of its own. Now a project
// declares where its runner writes JUnit XML:
//
//   ".eos/project.json": { "evidence": { "junit": ["reports/junit/*.xml"] } }
//
// and the `verified` gate does the rest in the same execution that runs `commands.test`:
//   1. inventory the reports that match BEFORE the run;
//   2. run the declared quality commands (project-gate.mjs, unchanged);
//   3. read only the reports this run wrote — new, or changed since step 1. A report left over from
//      an earlier run cannot describe this one, so freshness is a property of the mechanism, not of
//      anyone's discipline;
//   4. answer every trace-matrix reference from them (junit.mjs) and write test-run.json, bound to
//      the product tree, the command and its producer.
//
// When the tests run in another CI step, `eos evidence junit <files…> --write` is the same conversion
// with a different freshness rule: a report older than any product file is refused.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, isAbsolute, relative } from 'node:path';
import { parseJUnit, answerReference, JUNIT_MAX_BYTES } from './junit.mjs';
import { parseTraceMatrix, insideRepo, repoFileExists } from './gate-primitives.mjs';
import { nameOnlyOwnership } from './test-source.mjs';
import { currentProductTree, productTreeMembers, newestProductFile } from './product-tree.mjs';
import { SUMMARY_PATHS, commandDigestOf } from './machine-summary.mjs';
import { ARTIFACTS } from './state.mjs';
import { loadSchema, validate } from './schema.mjs';
import { writeFileAtomic } from './atomic.mjs';
import { posix } from './registry.mjs';

/**
 * Bounds on discovery and reading. Discovery follows the pattern, so only `**` can walk far, and
 * that walk is bounded. Reading is bounded by size rather than count: Surefire and Gradle write one
 * report per test class, so a large service legitimately has thousands of small files.
 */
const MAX_REPORTS = 20000;
const MAX_SCANNED = 50000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** The declared report patterns, or null when the project does not use JUnit evidence. */
export const junitPatterns = (project) => (Array.isArray(project?.evidence?.junit) && project.evidence.junit.length ? project.evidence.junit : null);

/** `*` within one path segment, `**` across segments, `?` one character. Nothing else is special. */
export function globToRegExp(glob) {
  const segs = glob.split('/');
  let re = '';
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') { re += last ? '.*' : '(?:[^/]+/)*'; return; }
    re += seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    if (!last) re += '/';
  });
  return new RegExp(`^${re}$`);
}

/** The directory part of a pattern before its first wildcard ('' when it starts with one). */
const literalDir = (pattern) => {
  const literal = [];
  for (const s of pattern.split('/').slice(0, -1)) { if (/[*?]/.test(s)) break; literal.push(s); }
  return literal.join('/');
};

const segmentRe = (seg) => new RegExp(`^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);

/**
 * Every file matching the patterns, repository-relative and sorted.
 *
 * The walk follows the pattern one segment at a time: a literal segment is looked up, a wildcard
 * segment reads one directory, and only `**` descends further. So `junit.xml` reads the repository
 * root and nothing below it, and `reports/junit/*.xml` reads one directory.
 * @returns {{files: string[], error: string|null}}
 */
export function findReports(root, patterns, { maxScanned = MAX_SCANNED } = {}) {
  const found = new Set();
  let scanned = 0;
  const list = (rel) => { try { return readdirSync(rel ? join(root, rel) : root, { withFileTypes: true }); } catch { return []; } };
  const counted = () => {
    if (++scanned > maxScanned) throw new Error(`more than ${maxScanned} files under the evidence.junit patterns — narrow the ** in them to the directory your runner writes to`);
  };
  const childOf = (rel, name) => (rel ? `${rel}/${name}` : name);
  for (const pattern of patterns) {
    const segs = pattern.split('/');
    const walk = (rel, i) => {
      const seg = segs[i];
      const last = i === segs.length - 1;
      if (seg === '**') {
        if (!last) walk(rel, i + 1); // `**` may stand for no directory at all
        for (const e of list(rel)) {
          if (last && e.isFile()) { counted(); found.add(childOf(rel, e.name)); continue; }
          if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
          counted();
          walk(childOf(rel, e.name), i);
        }
        return;
      }
      if (!/[*?]/.test(seg)) {
        const child = childOf(rel, seg);
        let st;
        try { st = statSync(join(root, child)); } catch { return; }
        if (last ? st.isFile() : st.isDirectory()) { if (last) found.add(child); else walk(child, i + 1); }
        return;
      }
      const re = segmentRe(seg);
      for (const e of list(rel)) {
        if (!re.test(e.name)) continue;
        counted();
        if (last && e.isFile()) found.add(childOf(rel, e.name));
        else if (!last && e.isDirectory()) walk(childOf(rel, e.name), i + 1);
      }
    };
    try { walk('', 0); } catch (e) { return { files: [], error: e.message }; }
  }
  const files = [...found].sort();
  if (files.length > MAX_REPORTS) return { files: [], error: `${files.length} files match evidence.junit — more than ${MAX_REPORTS}; narrow the patterns` };
  return { files, error: null };
}

const stampOf = (root, rel) => {
  try { const st = statSync(join(root, rel)); return `${st.mtimeMs}:${st.size}`; } catch { return null; }
};

/**
 * Read and parse reports. One unreadable or malformed report fails the whole set: dropping it would
 * silently drop whatever failures it recorded.
 * @returns {{cases: object[], error: string|null}}
 */
export function readReports(root, files) {
  const cases = [];
  let total = 0;
  for (const rel of files) {
    const full = join(root, rel);
    let size;
    try { size = statSync(full).size; } catch (e) { return { cases: [], error: `${rel}: cannot be read (${e.code || e.message})` }; }
    if (size > JUNIT_MAX_BYTES) return { cases: [], error: `${rel}: larger than ${JUNIT_MAX_BYTES / (1024 * 1024)} MB — refused rather than read` };
    total += size;
    if (total > MAX_TOTAL_BYTES) return { cases: [], error: `the ${files.length} matching reports add up to more than ${MAX_TOTAL_BYTES / (1024 * 1024)} MB — refused rather than read; narrow evidence.junit` };
    const parsed = parseJUnit(readFileSync(full, 'utf8'));
    if (!parsed.ok) return { cases: [], error: `${rel}: not a JUnit report EOS can read — ${parsed.error}` };
    for (const c of parsed.cases) cases.push({ ...c, report: rel });
  }
  return { cases, error: null };
}

/**
 * Who produced this evidence. Self-reported, like every producer (machine-summary.mjs producerTrust):
 * a CI run says so, which a policy can require, and nothing here pretends it is attested.
 */
export function producerFromEnv(env, localName) {
  if (env.GITHUB_ACTIONS === 'true') {
    const runRef = env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
    return { type: 'ci', name: 'github-actions', ...(runRef ? { runRef } : {}) };
  }
  if (env.GITLAB_CI === 'true') return { type: 'ci', name: 'gitlab-ci', ...(env.CI_JOB_URL ? { runRef: env.CI_JOB_URL } : {}) };
  if (env.CI && !['false', '0'].includes(String(env.CI).toLowerCase())) return { type: 'ci', name: 'ci' };
  return { type: 'local', name: localName };
}

const runIdOf = (env, now) => (env.GITHUB_RUN_ID ? `github-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || '1'}` : `local-${now.toISOString()}`);

/** Split a matrix reference into the file and the test inside it ('' when it names only a file). */
function splitRef(ref) {
  const at = ref.indexOf('::');
  return at === -1 ? { testPath: ref, selector: '' } : { testPath: ref.slice(0, at), selector: ref.slice(at + 2).trim() };
}

/**
 * Answer every trace-matrix reference from the parsed testcases.
 *
 * A row's references come from the header's "Test" column(s) when the table has one, otherwise from
 * every cell. Given `exists`, a file-only reference that names no file is prose that looks like one
 * ("e.g.", "Node.js") and is dropped — unless it is all the row has, so its ERROR says what is wrong.
 */
export function deriveResults(rows, cases, { exists = null } = {}) {
  const results = [];
  for (const [ac, row] of rows) {
    const named = row.testColumnRefs?.length ? row.testColumnRefs : row.testRefs;
    const real = exists ? named.filter((ref) => ref.includes('::') || exists(ref)) : named;
    for (const ref of real.length ? real : named) {
      const { testPath, selector } = splitRef(ref);
      const a = answerReference(cases, testPath, selector);
      results.push({
        ac, testPath, ...(selector ? { selector } : {}), status: a.status,
        ...(a.match ? { match: a.match } : {}),
        ...(a.durationMs !== undefined ? { durationMs: a.durationMs } : {}),
        detail: a.detail,
      });
    }
  }
  return results;
}

const readJson = (full) => { try { return JSON.parse(readFileSync(full, 'utf8')); } catch { return null; } };

/** The same results for the same tree, command and producer — differing only in when and how long. */
const stableForm = (s) => JSON.stringify({ ...s, generatedAt: null, runId: null, results: (s.results || []).map(({ durationMs, ...r }) => r) });
const sameResults = (prior, next) => !!prior && typeof prior === 'object' && !Array.isArray(prior) && stableForm(prior) === stableForm(next);

/**
 * Turn fresh reports into docs/evidence/test-run.json. Shared by the gate and the CLI; they differ
 * only in how they establish that the reports are fresh.
 * @returns {{status: 'WRITTEN'|'PLANNED'|'FAIL'|'ERROR'|'BLOCKED'|'SKIPPED', detail: string, summary?: object, reports?: string[]}}
 */
export function convertReports(root, files, { project, producerName, env = process.env, now = new Date(), write = true }) {
  const members = productTreeMembers(root, files);
  if (members === null) return { status: 'BLOCKED', detail: 'git could not say whether the reports are part of the product tree' };
  if (members.length) {
    return {
      status: 'FAIL',
      detail: `${members.join(', ')} ${members.length === 1 ? 'is' : 'are'} part of the product tree (git does not ignore ${members.length === 1 ? 'it' : 'them'}), so writing a report changes the very tree it describes — add the report directory to .gitignore (and \`git rm --cached\` anything already committed)`,
    };
  }
  const { cases, error } = readReports(root, files);
  if (error) return { status: 'ERROR', detail: error };
  const matrixPath = join(root, ARTIFACTS.traceMatrix);
  if (!existsSync(matrixPath)) {
    return { status: 'SKIPPED', detail: `${ARTIFACTS.traceMatrix} does not exist, so there is no reference to answer from ${files.length} JUnit report(s)` };
  }
  // A name-only match is settled from the source: the named file declares the test, and no other
  // test file does (test-source.mjs). What cannot be settled is an ERROR, never a PASS.
  const results = deriveResults(parseTraceMatrix(readFileSync(matrixPath, 'utf8')), cases, { exists: (rel) => repoFileExists(root, rel) })
    .map((r) => {
      if (r.match !== 'name') return r;
      const owned = nameOnlyOwnership(root, r.testPath, r.selector);
      return owned.ok ? r : { ...r, status: 'ERROR', detail: owned.detail };
    });
  if (!results.length) return { status: 'FAIL', detail: `${ARTIFACTS.traceMatrix} names no test for any acceptance criterion, so the reports answer nothing` };
  const tree = currentProductTree(root);
  if (!tree.available) return { status: 'BLOCKED', detail: tree.reason };
  const test = project?.commands?.test || null;
  const summary = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    runId: runIdOf(env, now),
    producer: producerFromEnv(env, producerName),
    ...(test ? { commandDigest: commandDigestOf(test), command: test.map((argv) => argv.join(' ')).join(' && ') } : {}),
    framework: 'junit',
    productTree: { digest: tree.identity.digest, algorithm: tree.identity.algorithm, version: tree.identity.version },
    source: { format: 'junit', reports: files },
    results,
  };
  // EOS validates what it writes against the same schema the gate reads with. A summary EOS itself
  // cannot read back would turn a passing run into an ERROR one step later.
  const { schema, error: schemaError } = loadSchema(root, 'test-run.schema.json');
  if (!schema) return { status: 'ERROR', detail: `${schemaError} — the test-run summary cannot be validated, so it is not written` };
  const v = validate(schema, summary, { label: SUMMARY_PATHS.testRun });
  if (!v.valid) return { status: 'ERROR', detail: `the derived ${SUMMARY_PATHS.testRun} does not match its schema: ${v.errors.slice(0, 3).join('; ')}` };
  // Every story's verified evidence binds this one file. Rewriting it when only the timings moved
  // would make each verification invalidate every other story's, so an identical result is kept.
  const unchanged = write && sameResults(readJson(join(root, SUMMARY_PATHS.testRun)), summary);
  if (write && !unchanged) writeFileAtomic(join(root, SUMMARY_PATHS.testRun), `${JSON.stringify(summary, null, 2)}\n`);
  const passing = results.filter((r) => r.status === 'PASS').length;
  return {
    status: write ? 'WRITTEN' : 'PLANNED',
    unchanged,
    detail: `${results.length} trace-matrix reference(s) answered from ${files.length} JUnit report(s) (${files.join(', ')}): ${passing} PASS, ${results.length - passing} not passing`
      + (unchanged ? ` — identical to the recorded ${SUMMARY_PATHS.testRun} apart from timings, which is kept so no other story's evidence goes stale` : ''),
    summary: unchanged ? readJson(join(root, SUMMARY_PATHS.testRun)) : summary,
    reports: files,
  };
}

// --------------------------------------------------------------------------------- the gate path

/** Before `commands.test` runs: what the declared report locations already hold. */
export function beginCapture(root, project) {
  const patterns = junitPatterns(project);
  if (!patterns) return null;
  // node:test's --test-reporter-destination does not create its directory and exits 7 without it.
  // EOS knows where the reports go, so the location exists before the run (empty, and ignored).
  for (const dir of patterns.map(literalDir).filter(Boolean)) {
    try { mkdirSync(join(root, dir), { recursive: true }); } catch { /* the run reports what is missing */ }
  }
  const found = findReports(root, patterns);
  if (found.error) return { patterns, error: found.error, before: new Map() };
  return { patterns, error: null, before: new Map(found.files.map((f) => [f, stampOf(root, f)])) };
}

/**
 * After the quality commands ran: convert what THIS run wrote.
 * @param {object} gateRun the project-gate verdict (gate-primitives.mjs runProjectGate)
 */
export function finishCapture(root, capture, { project, gateRun, env = process.env, now = new Date() }) {
  if (capture.error) return { status: 'ERROR', detail: capture.error };
  const testSteps = (gateRun?.report?.details?.steps || []).filter((s) => s.step === 'test');
  if (!testSteps.length) {
    return { status: 'BLOCKED', detail: `commands.test did not run (the product-quality gate ended ${gateRun?.status || 'early'}: ${gateRun?.detail || 'no detail'}), so no JUnit report describes this tree` };
  }
  if (testSteps.some((s) => s.status === 'blocked')) {
    return { status: 'BLOCKED', detail: 'commands.test could not be executed (its tool is not installed), so no JUnit report describes this tree' };
  }
  const found = findReports(root, capture.patterns);
  if (found.error) return { status: 'ERROR', detail: found.error };
  const fresh = found.files.filter((f) => capture.before.get(f) !== stampOf(root, f));
  if (!fresh.length) {
    const old = found.files.length;
    return {
      status: 'FAIL',
      detail: `commands.test ran but wrote no JUnit report matching ${capture.patterns.join(', ')}`
        + `${old ? ` (${old} matching report(s) predate this run and were ignored)` : ''}`
        + ' — point the runner\'s JUnit reporter at that location (docs/eos/examples/trace-evidence/)',
    };
  }
  return convertReports(root, fresh, { project, producerName: 'eos verified gate', env, now });
}

// --------------------------------------------------------------------------------- the CLI path

/**
 * `eos evidence junit <files…>`: the tests ran somewhere else (another CI step, another job). The
 * reports cannot be bracketed by a run here, so freshness is the weaker, still mechanical rule: a
 * report older than any product file describes a tree that has since changed, and is refused.
 */
export function importReports(root, inputs, { project, write, env = process.env, now = new Date() }) {
  const files = [];
  for (const input of inputs) {
    const rel = posix(isAbsolute(input) ? relative(root, input) : input);
    if (!insideRepo(root, rel)) return { status: 'ERROR', detail: `${input} is not inside this repository — copy the report into the workspace first` };
    if (!existsSync(join(root, rel))) return { status: 'ERROR', detail: `${input} does not exist` };
    files.push(rel);
  }
  if (!files.length) return { status: 'ERROR', detail: 'no report matched — pass the JUnit files, or declare evidence.junit in .eos/project.json' };
  const unique = [...new Set(files)].sort();
  // A report git does not ignore is itself the newest product file, so the staleness rule below
  // would blame the wrong thing; convertReports names the real problem.
  const members = productTreeMembers(root, unique);
  if (members === null || members.length) return convertReports(root, unique, { project, producerName: 'eos evidence junit', env, now, write });
  const newest = newestProductFile(root);
  if (newest === null) return { status: 'BLOCKED', detail: 'git could not enumerate the product tree, so the reports cannot be compared with it' };
  const stale = unique.filter((f) => statSync(join(root, f)).mtimeMs < newest.mtimeMs);
  if (stale.length) {
    return {
      status: 'STALE',
      detail: `${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} older than ${newest.path}, which changed after the tests ran — re-run the tests, then import the new report(s)`,
    };
  }
  return convertReports(root, unique, { project, producerName: 'eos evidence junit', env, now, write });
}
