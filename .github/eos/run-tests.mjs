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
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET_PATH = '.eos/test-budget.json';

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

const results = [];
let failed = false;

// --coverage runs every layer's files in ONE invocation: coverage is a property of the engine as a
// whole, and per-layer numbers would each look alarmingly low while the union is fine. Thresholds
// come from .eos/test-budget.json and are set just below the measured figure — they exist to catch
// a real regression, not to chase a round number.
if (flag('coverage')) {
  const files = selected.flatMap(([, spec]) => spec.files).filter((f) => existsSync(join(REPO_ROOT, f)));
  const cov = budget.coverage || {};
  const args = ['--test', '--experimental-test-coverage'];
  for (const pattern of cov.exclude || []) args.push(`--test-coverage-exclude=${pattern}`);
  // Node 22+ enforces thresholds natively and exits non-zero. On Node 20 the flags do not exist,
  // so the report is printed and the threshold is simply not enforced — reported, never faked.
  const major = Number(process.versions.node.split('.')[0]);
  const enforced = major >= 22;
  if (enforced) {
    if (cov.lines != null) args.push(`--test-coverage-lines=${cov.lines}`);
    if (cov.branches != null) args.push(`--test-coverage-branches=${cov.branches}`);
    if (cov.functions != null) args.push(`--test-coverage-functions=${cov.functions}`);
  }
  const started = Date.now();
  const r = spawnSync(process.execPath, [...args, ...files], { cwd: REPO_ROOT, stdio: 'inherit', env: process.env });
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
  const started = Date.now();
  const r = spawnSync(process.execPath, ['--test', ...spec.files], {
    cwd: REPO_ROOT, stdio: 'inherit', env: process.env,
  });
  const ms = Date.now() - started;
  const allowed = Math.round(spec.budgetMs * scale);
  const over = ms > allowed;
  if (r.status !== 0) failed = true;
  if (over && !flag('no-budget')) failed = true;
  results.push({ layer: name, ms, budgetMs: allowed, status: r.status !== 0 ? 'FAIL' : over ? 'SLOW' : 'PASS' });
}

const mark = { PASS: 'ok  ', FAIL: 'FAIL', SLOW: 'SLOW', ERROR: 'ERR ' };
console.log('\nEOS test layers\n');
for (const r of results) {
  const pct = r.budgetMs ? Math.round((r.ms / r.budgetMs) * 100) : 0;
  console.log(`  ${mark[r.status]}  ${r.layer.padEnd(18)} ${String(r.ms).padStart(6)}ms / ${String(r.budgetMs).padStart(6)}ms budget  (${pct}%)`);
}
const slow = results.filter((r) => r.status === 'SLOW');
if (slow.length) {
  console.log('\n  A layer exceeded its budget. That is a performance regression, not a flake, unless the');
  console.log(`  runner itself is slower — in which case set EOS_TEST_BUDGET_SCALE (currently ${scale}) rather`);
  console.log(`  than raising the budget. If the new cost is genuinely justified, edit ${BUDGET_PATH}`);
  console.log('  in the same change, so the slowdown is reviewed instead of absorbed.');
}
console.log(`\n${failed ? 'FAIL' : 'PASS'}\n`);
process.exit(failed ? 1 : 0);
