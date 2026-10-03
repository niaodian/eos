#!/usr/bin/env node
// EOS spec-alignment metric — zero external deps.
// Quantifies how well the built artifact matches the spec — EOS's own meta-metric:
//   - AC coverage %:   ACs in the PRD that appear in the trace matrix.
//   - Traced-pass %:   trace-matrix rows whose test passed, over total rows. When the machine
//                      test-run summary exists (docs/evidence/test-run.json) it is the answer: a
//                      "PASS" written in the matrix is a claim, and since eos-2.2.0 the matrix need
//                      not carry one at all (the verified gate derives the summary from JUnit). Without
//                      the summary the Result column is read, as before.
//   - Spec drift:      ACs in docs/prd.md with NO trace-matrix row (spec says X, no proof).
// Reads docs/prd.md + docs/trace-matrix.md. Advisory by default; --strict makes gaps exit 1.
//   node .github/hooks/spec-align.mjs [--strict] [--release <id>]
//
// Without a PRD, a profile whose FEATURE changes do not require one (delivery-only — brownfield
// adoption, eos-2.3.0) keeps the acceptance criteria in the stories, so the stories are the spec:
// coverage and drift are measured over the stories the release ships (`--release <id>` reads
// .eos/releases/<id>.json; without it, every story), and an orphan is a row no story declares.
//
// STRICT IS FAIL-CLOSED: missing evidence is a FAILURE, not a skip. `--strict` is the G8 release
// gate, and "no PRD / no trace matrix" is the emptiest possible spec alignment — exiting 0 there
// produced a green-but-empty release gate. Advisory mode (every-push CI) still skips loudly.
// [audit EOS-001 · locked by spec-align.test.mjs]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const releaseAt = process.argv.indexOf('--release');
const releaseId = releaseAt === -1 ? null : process.argv[releaseAt + 1] || null;
const prdPath = join(root, 'docs/prd.md');
const tracePath = join(root, 'docs/trace-matrix.md');
const storiesDir = join(root, 'docs/stories');

/** Does the declared workflow profile keep acceptance criteria in the stories (no PRD required)? */
function storiesAreTheSpec() {
  try {
    const project = JSON.parse(readFileSync(join(root, '.eos/project.json'), 'utf8'));
    const workflow = JSON.parse(readFileSync(join(root, '.eos/workflow.json'), 'utf8'));
    const profile = workflow.profiles?.[project.workflowProfile || workflow.defaultProfile || 'standard-product'];
    return profile?.changeTypes?.FEATURE?.gates?.['prd-ready'] === 'not_applicable';
  } catch {
    return false;
  }
}
const storyFiles = () => (existsSync(storiesDir) ? readdirSync(storiesDir).filter((f) => f.endsWith('.md')).sort() : []);
const fromStories = !existsSync(prdPath) && storiesAreTheSpec() && storyFiles().length > 0;

const missing = [
  ...(existsSync(prdPath) || fromStories ? [] : ['docs/prd.md']),
  ...(existsSync(tracePath) ? [] : ['docs/trace-matrix.md']),
];
if (missing.length) {
  if (strict) {
    console.log('EOS spec-alignment\n');
    console.log(`  ERROR missing spec evidence: ${missing.join(', ')}`);
    console.log('');
    console.log('FAIL (--strict): no spec evidence to score. A release gate cannot pass on absent proof —');
    console.log('  run /eos-spec (docs/prd.md) and produce docs/trace-matrix.md at G7, or, if this project tracks');
    console.log('  specs elsewhere, record that N/A in the /eos-release-gate report instead of running --strict.');
    process.exit(1);
  }
  console.log(`ADVISORY / SKIP — ${missing.join(' + ')} not found; nothing to score yet (produced at G7).`);
  console.log('  Note: --strict (release gate G8) treats this same state as FAIL.');
  process.exit(0);
}

const trace = readFileSync(tracePath, 'utf8');

// The machine results, when there are any: AC id → the statuses recorded for it.
const runPath = join(root, 'docs/evidence/test-run.json');
let machine = null;
if (existsSync(runPath)) {
  let results = null;
  try { results = JSON.parse(readFileSync(runPath, 'utf8')).results; } catch { /* reported below */ }
  if (!Array.isArray(results)) {
    console.log('EOS spec-alignment\n');
    console.log('  ERROR docs/evidence/test-run.json is not a readable test-run summary (no "results" array)');
    console.log('');
    console.log(strict ? 'FAIL (--strict): the machine results cannot be read, so no traced row can be scored.' : 'ADVISORY — the machine results cannot be read.');
    process.exit(strict ? 1 : 0);
  }
  machine = new Map();
  for (const r of results) {
    if (!r || typeof r.ac !== 'string') continue;
    if (!machine.has(r.ac)) machine.set(r.ac, []);
    machine.get(r.ac).push(r.status);
  }
}
const rowPasses = (ac, resultCell) => (machine
  ? (machine.get(ac) || []).length > 0 && machine.get(ac).every((st) => st === 'PASS')
  : /✅|✓|PASS/i.test(resultCell));

// AC ids look like AC1.1, AC12.3, etc.
const AC = /\bAC\d+\.\d+\b/g;
// specACs: what this run must cover. knownACs: everything a row may legitimately trace.
let specACs;
let knownACs;
let specLabel = 'PRD acceptance criteria';
let specSource = 'docs/prd.md';
if (fromStories) {
  const acsOf = (file) => readFileSync(join(storiesDir, file), 'utf8').match(AC) || [];
  let included = null;
  if (releaseId) {
    try {
      included = JSON.parse(readFileSync(join(root, '.eos/releases', `${releaseId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`), 'utf8')).includedStories;
    } catch { /* no readable manifest: every story is the spec */ }
  }
  const files = Array.isArray(included) ? included.map((id) => `${id}.md`).filter((f) => existsSync(join(storiesDir, f))) : storyFiles();
  specACs = new Set(files.flatMap(acsOf));
  knownACs = new Set(storyFiles().flatMap(acsOf));
  specLabel = Array.isArray(included) ? `Story acceptance criteria (${releaseId})` : 'Story acceptance criteria';
  specSource = 'the stories';
} else {
  specACs = new Set(readFileSync(prdPath, 'utf8').match(AC) || []);
  knownACs = specACs;
}
const prdACs = specACs;

// Parse trace-matrix table rows by splitting on '|' (robust vs. greedy regex).
const tracedACs = new Set();
let rows = 0, passed = 0;
for (const line of trace.split('\n')) {
  if (!/^\s*\|/.test(line)) continue;
  const cells = line.split('|').map((s) => s.trim()).filter((s) => s.length);
  if (cells.length < 2) continue;
  const acCell = cells[0];
  if (!/^AC\d+\.\d+$/.test(acCell)) continue; // skip header/separator/non-AC rows
  tracedACs.add(acCell);
  rows++;
  if (rowPasses(acCell, cells[cells.length - 1])) passed++;
}

const totalPrd = prdACs.size || 0;
const coveredCount = [...prdACs].filter((a) => tracedACs.has(a)).length;
const drift = [...prdACs].filter((a) => !tracedACs.has(a));
const orphan = [...tracedACs].filter((a) => !knownACs.has(a)); // in matrix, in no spec

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const coverage = pct(coveredCount, totalPrd);
const tracedPass = pct(passed, rows);

console.log('EOS spec-alignment\n');
console.log(`  ${`${specLabel}:`.padEnd(29)} ${totalPrd}${fromStories ? '  — no PRD: this workflow profile keeps them in the stories' : ''}`);
console.log(`  Covered by trace matrix:      ${coveredCount}/${totalPrd}  (${coverage}%)`);
console.log(`  Traced rows passing:          ${passed}/${rows}  (${tracedPass}%)${machine ? '  — from docs/evidence/test-run.json' : ''}`);
if (drift.length) console.log(`  ⚠ Spec drift (AC without a trace row): ${drift.join(', ')}`);
if (orphan.length) console.log(`  ⚠ Orphan rows (trace AC not in ${fromStories ? 'any story' : 'PRD'}):   ${orphan.join(', ')}`);
console.log('');

// A tidy one-line record you can append to a trend log for first-pass-rate tracking.
console.log(`  RECORD spec-align coverage=${coverage}% traced_pass=${tracedPass}% drift=${drift.length} orphan=${orphan.length}`);
console.log('');

const clean = drift.length === 0 && orphan.length === 0 && totalPrd > 0 && rows > 0
  && coverage === 100 && tracedPass === 100;
if (!clean && strict) {
  // Name the reason: "gaps present" alone made an empty PRD indistinguishable from a failing row.
  const why = [];
  if (totalPrd === 0) why.push(`${specSource} contain${fromStories ? '' : 's'} no acceptance criteria (expected AC<n>.<n> ids)`);
  if (rows === 0) why.push('docs/trace-matrix.md contains no AC rows');
  if (drift.length) why.push(`${drift.length} AC(s) with no trace row: ${drift.join(', ')}`);
  if (orphan.length) why.push(`${orphan.length} orphan row(s) not in ${fromStories ? 'any story' : 'the PRD'} (built beyond the approved spec): ${orphan.join(', ')}`);
  if (rows > 0 && passed < rows) why.push(`${rows - passed} traced row(s) not passing${machine ? ' in docs/evidence/test-run.json (a row passes when every result recorded for its AC is PASS)' : ''}`);
  for (const w of why) console.log('  ERROR ' + w);
  console.log('');
  console.log('FAIL (--strict): spec-alignment gaps present. Close drift, orphans and failing rows before release.');
  process.exit(1);
}
console.log(clean ? 'PASS — full spec alignment.' : 'ADVISORY — see gaps above (use --strict to enforce).');
