#!/usr/bin/env node
// Layered test runner with a wall-clock budget per layer.
//
// WHY THIS EXISTS
// Two failure modes this replaces:
//
//   1. ONE FILE GATED THE WHOLE SUITE. Node parallelises across files but runs the tests inside a
//      file sequentially. The audit regressions lived in a single 1,246-line file, so 38.3s of a
//      38.7s run came from one core while fifteen sat idle. Layers make the parallelism explicit.
//
//   2. NOBODY NOTICED THE SUITE GETTING SLOWER. A suite degrades one plausible second at a time.
//      A budget turns that into a build failure on the commit that caused it, which is the only
//      moment anyone is willing to pay to fix it.
//
// The budget is deliberately generous (see .eos/test-budget.json): it exists to catch a 2x
// regression, not to police normal variance between a laptop and a shared CI runner. Raising a
// budget is allowed — it just has to be a deliberate, reviewable edit rather than a silent drift.
//
//   node .github/eos/run-tests.mjs              # every layer
//   node .github/eos/run-tests.mjs unit         # one layer
//   node .github/eos/run-tests.mjs --list       # what runs where
//   node .github/eos/run-tests.mjs --no-budget  # report timings, never fail on them
//   EOS_TEST_BASELINE_ENV=ci-linux node .github/eos/run-tests.mjs --record-baseline
//                                               # store this run's timings as the baseline
//
// THREE LIMITS, three different failure modes:
//   --test-timeout   one stuck TEST cannot hold its layer hostage (testTimeoutMs)
//   layer backstop   one stuck LAYER PROCESS cannot hold the job hostage (layerTimeoutMs)
//   budget/baseline  a suite that is merely SLOWER fails loudly instead of being absorbed:
//                    budgetMs is the absolute ceiling everywhere; the per-environment baseline
//                    (+baselineTolerance) catches the slow creep a generous ceiling cannot see.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET_PATH = '.eos/test-budget.json';
const HISTORY_PATH = '.eos/local/test-history.jsonl';
const REPORTER = pathToFileURL(join(REPO_ROOT, '.github/eos/duration-reporter.mjs')).href;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const wanted = args.filter((a) => !a.startsWith('--'));

function loadBudget() {
  const full = join(REPO_ROOT, BUDGET_PATH);
  if (!existsSync(full)) {
    console.log(`${BUDGET_PATH} does not exist — it declares which test files make up each layer.`);
    process.exit(3);
  }
  try { return JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    console.log(`${BUDGET_PATH}: invalid JSON (${e.message})`);
    process.exit(3);
  }
}

const budget = loadBudget();
// A slow shared runner is not a regression. Scale the budget instead of weakening it, so the
// ratio a breach represents stays the same everywhere.
const scale = Number(process.env.EOS_TEST_BUDGET_SCALE || budget.defaultScale || 1);
const layers = Object.entries(budget.layers);
// EOS_TEST_TIMEOUT_MS overrides it for one environment. Node 20 wraps each test FILE as a single
// top-level test, so there the limit bounds a whole file rather than one test — which on a runner
// as slow as GitHub's Windows one (spawns ~15x Linux) means a file legitimately needs longer. Raise
// it there by override; the default stays tight everywhere else.
const TEST_TIMEOUT_MS = Number(process.env.EOS_TEST_TIMEOUT_MS || budget.testTimeoutMs || 120000);
// The layer backstop takes the same per-environment override (EOS_LAYER_TIMEOUT_MS), for the same
// reason: on the Windows runner a whole layer can legitimately outlive a limit sized for Linux.
const LAYER_TIMEOUT_MS = Number(process.env.EOS_LAYER_TIMEOUT_MS || budget.layerTimeoutMs || 900000);
const COVERAGE_TIMEOUT_MS = budget.coverageTimeoutMs ?? 1800000;
const BASELINE_ENV = process.env.EOS_TEST_BASELINE_ENV || null;
const TOLERANCE = budget.baselineTolerance ?? 0.5;

// --test-timeout arrived in Node 20.11 / 21.2. On an older runtime the per-test limit is NOT
// applied, and the runner says so rather than implying it was — the layer backstop still holds.
const [major, minor] = process.versions.node.split('.').map(Number);
const perTestTimeout = major > 20 || (major === 20 && minor >= 11);
const timeoutArgs = perTestTimeout ? [`--test-timeout=${TEST_TIMEOUT_MS}`] : [];

if (flag('list')) {
  for (const [name, spec] of layers) {
    console.log(`${name}  (budget ${spec.budgetMs}ms × ${scale})`);
    for (const f of spec.files) console.log(`    ${f}`);
  }
  process.exit(0);
}

const selected = wanted.length ? layers.filter(([n]) => wanted.includes(n)) : layers;
if (!selected.length) {
  console.log(`no such layer: ${wanted.join(', ')}. Known: ${layers.map(([n]) => n).join(', ')}`);
  process.exit(3);
}

/** A layer process that exceeded its backstop: say what, and how to tell a slow runner from a hang. */
function backstopMessage(what, ms) {
  return [`\n✖ ${what} exceeded its backstop of ${ms}ms and was killed.`,
    '  Every test also has its own limit (--test-timeout), so a whole layer outliving this means the',
    '  test PROCESS hung — usually an unclosed handle or a child process that never exited.',
    `  Raise layerTimeoutMs in ${BUDGET_PATH} (or EOS_LAYER_TIMEOUT_MS for one environment) only if the runner is genuinely that slow.`].join('\n');
}

const results = [];
let failed = false;

// --coverage runs every layer's files in ONE invocation: coverage is a property of the engine as a
// whole, and per-layer numbers would each look alarmingly low while the union is fine. Thresholds
// come from .eos/test-budget.json and are set just below the measured figure — they exist to catch
// a real regression, not to chase a round number.
if (flag('coverage')) {
  const files = selected.flatMap(([, spec]) => spec.files).filter((f) => existsSync(join(REPO_ROOT, f)));
  const cov = budget.coverage || {};
  const covArgs = ['--test', ...timeoutArgs, '--experimental-test-coverage'];
  for (const pattern of cov.exclude || []) covArgs.push(`--test-coverage-exclude=${pattern}`);
  // Node 22+ enforces thresholds natively and exits non-zero. On Node 20 the flags do not exist,
  // so the report is printed and the threshold is simply not enforced — reported, never faked.
  const enforced = major >= 22;
  if (enforced) {
    if (cov.lines != null) covArgs.push(`--test-coverage-lines=${cov.lines}`);
    if (cov.branches != null) covArgs.push(`--test-coverage-branches=${cov.branches}`);
    if (cov.functions != null) covArgs.push(`--test-coverage-functions=${cov.functions}`);
  }
  const started = Date.now();
  const r = spawnSync(process.execPath, [...covArgs, ...files], { cwd: REPO_ROOT, stdio: 'inherit', env: process.env, timeout: COVERAGE_TIMEOUT_MS });
  if (r.error?.code === 'ETIMEDOUT') { console.log(backstopMessage('the coverage run', COVERAGE_TIMEOUT_MS)); process.exit(1); }
  console.log(`\nEOS coverage · ${Date.now() - started}ms`);
  if (!enforced) {
    console.log(`  thresholds NOT enforced: node ${process.versions.node} has no --test-coverage-* flags (needs 22+).`);
    console.log('  The report above is still printed; CI runs coverage on a version that enforces it.');
  } else {
    console.log(`  thresholds: lines ${cov.lines}% · branches ${cov.branches}% · functions ${cov.functions}%`);
  }
  console.log(`\n${r.status === 0 ? 'PASS' : 'FAIL'}\n`);
  process.exit(r.status === 0 ? 0 : 1);
}

const fileTimes = {};
const scratch = mkdtempSync(join(tmpdir(), 'eos-durations-'));

for (const [name, spec] of selected) {
  const missing = spec.files.filter((f) => !existsSync(join(REPO_ROOT, f)));
  if (missing.length) {
    // A renamed or deleted test file must break the build. Silently running fewer tests than the
    // layer declares is how a suite stops covering something without anyone deciding to stop.
    console.log(`\n✖ ${name}: declared test file(s) missing: ${missing.join(', ')}`);
    console.log(`  Update ${BUDGET_PATH} if this was intentional.`);
    failed = true;
    results.push({ layer: name, ms: 0, budgetMs: spec.budgetMs, status: 'ERROR' });
    continue;
  }
  const durationsFile = join(scratch, `${name}.json`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [
    '--test', ...timeoutArgs,
    // The normal output still goes to the terminal; per-file timings go to a side file.
    '--test-reporter', process.stdout.isTTY ? 'spec' : 'tap', '--test-reporter-destination', 'stdout',
    '--test-reporter', REPORTER, '--test-reporter-destination', durationsFile,
    ...spec.files,
  ], { cwd: REPO_ROOT, stdio: 'inherit', env: process.env, timeout: LAYER_TIMEOUT_MS });
  const ms = Date.now() - started;
  if (r.error?.code === 'ETIMEDOUT') {
    console.log(backstopMessage(`layer "${name}"`, LAYER_TIMEOUT_MS));
    failed = true;
    results.push({ layer: name, ms, budgetMs: spec.budgetMs, status: 'ERROR' });
    continue;
  }
  try {
    for (const [file, v] of Object.entries(JSON.parse(readFileSync(durationsFile, 'utf8')))) {
      fileTimes[file === '(unknown)' ? file : relative(REPO_ROOT, file).split('\\').join('/')] = { layer: name, ...v };
    }
  } catch { /* a crashed layer writes no timings; its failure is reported below */ }

  const allowed = Math.round(spec.budgetMs * scale);
  const baseline = BASELINE_ENV ? budget.baselines?.[BASELINE_ENV]?.[name] ?? null : null;
  const baselineCeiling = baseline ? Math.round(baseline * (1 + TOLERANCE)) : null;
  const overBudget = ms > allowed;
  const overBaseline = baselineCeiling !== null && ms > baselineCeiling;
  if (r.status !== 0) failed = true;
  if ((overBudget || overBaseline) && !flag('no-budget')) failed = true;
  results.push({
    layer: name, ms, budgetMs: allowed, baseline, baselineCeiling,
    status: r.status !== 0 ? 'FAIL' : overBudget ? 'SLOW' : overBaseline ? 'DRIFT' : 'PASS',
  });
}
rmSync(scratch, { recursive: true, force: true });

const mark = { PASS: 'ok   ', FAIL: 'FAIL ', SLOW: 'SLOW ', DRIFT: 'DRIFT', ERROR: 'ERR  ' };
console.log('\nEOS test layers\n');
for (const r of results) {
  const pct = r.budgetMs ? Math.round((r.ms / r.budgetMs) * 100) : 0;
  const base = r.baseline ? `  · baseline ${r.baseline}ms (+${Math.round(((r.ms - r.baseline) / r.baseline) * 100)}%)` : '';
  console.log(`  ${mark[r.status]} ${r.layer.padEnd(18)} ${String(r.ms).padStart(6)}ms / ${String(r.budgetMs).padStart(6)}ms budget  (${pct}%)${base}`);
}

const files = Object.entries(fileTimes).sort((a, b) => b[1].ms - a[1].ms);
if (files.length) {
  console.log('\nPer file (test time, slowest first)\n');
  for (const [file, v] of files) console.log(`  ${String(v.ms).padStart(6)}ms  ${String(v.tests).padStart(3)} test(s)  ${v.layer.padEnd(17)} ${file}`);
}

if (!perTestTimeout) console.log(`\n  NOTE: node ${process.versions.node} has no --test-timeout (needs 20.11+); the per-test limit was NOT applied.`);
if (BASELINE_ENV && results.some((r) => r.baseline === null && r.status !== 'ERROR') && !flag('record-baseline')) {
  console.log(`\n  NOTE: no baseline recorded for "${BASELINE_ENV}" on some layers — only the absolute budget applied.`);
}
if (results.some((r) => r.status === 'SLOW')) {
  console.log('\n  A layer exceeded its budget. That is a performance regression, not a flake, unless the');
  console.log(`  runner itself is slower — in which case set EOS_TEST_BUDGET_SCALE (currently ${scale}) rather`);
  console.log(`  than raising the budget. If the new cost is genuinely justified, edit ${BUDGET_PATH}`);
  console.log('  in the same change, so the slowdown is reviewed instead of absorbed.');
}
if (results.some((r) => r.status === 'DRIFT')) {
  console.log(`\n  A layer is more than ${Math.round(TOLERANCE * 100)}% slower than its recorded "${BASELINE_ENV}" baseline. It is still under`);
  console.log('  the absolute budget — which is exactly how a suite doubles one plausible second at a time.');
  console.log('  Find the cause in the per-file table above; if the cost is justified, re-record the baseline');
  console.log(`  (--record-baseline) in the same change so the slowdown is reviewed instead of absorbed.`);
}

// --record-baseline: store this run as the reference for its environment. Only layers that PASSED
// are recorded — a failing layer's time says nothing about how long the suite should take.
if (flag('record-baseline')) {
  if (!BASELINE_ENV) {
    console.log('\n  --record-baseline needs EOS_TEST_BASELINE_ENV (e.g. ci-linux): a baseline only means something for one environment.');
    failed = true;
  } else {
    const next = JSON.parse(readFileSync(join(REPO_ROOT, BUDGET_PATH), 'utf8'));
    next.baselines = next.baselines || {};
    next.baselines[BASELINE_ENV] = next.baselines[BASELINE_ENV] || {};
    for (const r of results.filter((x) => x.status !== 'FAIL' && x.status !== 'ERROR')) {
      next.baselines[BASELINE_ENV][r.layer] = Math.ceil(r.ms / 100) * 100;
    }
    writeFileSync(join(REPO_ROOT, BUDGET_PATH), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\n  baseline for "${BASELINE_ENV}" written to ${BUDGET_PATH} — commit it, so the change is reviewed.`);
  }
}

// Local history: what `eos health` reads for its test-duration trend. Gitignored and machine-local
// by design — a laptop's timings are not evidence about anyone else's.
try {
  const histFull = join(REPO_ROOT, HISTORY_PATH);
  mkdirSync(dirname(histFull), { recursive: true });
  appendFileSync(histFull, `${JSON.stringify({
    ts: new Date().toISOString(), env: BASELINE_ENV || 'local', node: process.versions.node, platform: process.platform,
    layers: Object.fromEntries(results.filter((r) => r.status !== 'ERROR').map((r) => [r.layer, r.ms])),
    files: Object.fromEntries(files.map(([file, v]) => [file, v.ms])),
  })}\n`);
  const lines = readFileSync(histFull, 'utf8').trim().split('\n');
  if (lines.length > 500) writeFileSync(histFull, `${lines.slice(-200).join('\n')}\n`);
} catch { /* history is a convenience; never fail a run over it */ }

// CI: publish the same tables to the run summary, so "which file got slower" needs no log digging.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['### EOS test layers', '', '| Layer | Status | Time | Budget | Baseline |', '|---|---|---|---|---|',
    ...results.map((r) => `| ${r.layer} | ${r.status} | ${r.ms}ms | ${r.budgetMs}ms | ${r.baseline ? `${r.baseline}ms` : '—'} |`),
    '', '<details><summary>Per file</summary>', '', '| File | Layer | Tests | Time |', '|---|---|---|---|',
    ...files.map(([file, v]) => `| \`${file}\` | ${v.layer} | ${v.tests} | ${v.ms}ms |`), '', '</details>', ''];
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`); } catch { /* summary is optional */ }
}

console.log(`\n${failed ? 'FAIL' : 'PASS'}\n`);
process.exit(failed ? 1 : 0);
