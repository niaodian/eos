#!/usr/bin/env node
// EOS spec-alignment metric — zero external deps.
// Quantifies how well the built artifact matches the spec — EOS's own meta-metric:
//   - AC coverage %:   ACs in the PRD that appear in the trace matrix.
//   - Traced-pass %:   trace-matrix rows marked passing (✅) over total rows.
//   - Spec drift:      ACs in docs/prd.md with NO trace-matrix row (spec says X, no proof).
// Reads docs/prd.md + docs/trace-matrix.md. Advisory by default; --strict makes gaps exit 1.
//   node .github/hooks/spec-align.mjs [--strict]
//
// STRICT IS FAIL-CLOSED: missing evidence is a FAILURE, not a skip. `--strict` is the G8 release
// gate, and "no PRD / no trace matrix" is the emptiest possible spec alignment — exiting 0 there
// produced a green-but-empty release gate. Advisory mode (every-push CI) still skips loudly.
// [audit EOS-001 · locked by spec-align.test.mjs]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const prdPath = join(root, 'docs/prd.md');
const tracePath = join(root, 'docs/trace-matrix.md');

const missing = [
  ...(existsSync(prdPath) ? [] : ['docs/prd.md']),
  ...(existsSync(tracePath) ? [] : ['docs/trace-matrix.md']),
];
if (missing.length) {
  if (strict) {
    console.log('EOS spec-alignment\n');
    console.log(`  ERROR missing spec evidence: ${missing.join(', ')}`);
    console.log('');
    console.log('FAIL (--strict): no spec evidence to score. A release gate cannot pass on absent proof —');
    console.log('  run /spec (docs/prd.md) and produce docs/trace-matrix.md at G7, or, if this project tracks');
    console.log('  specs elsewhere, record that N/A in the /release-gate report instead of running --strict.');
    process.exit(1);
  }
  console.log(`ADVISORY / SKIP — ${missing.join(' + ')} not found; nothing to score yet (produced at G7).`);
  console.log('  Note: --strict (release gate G8) treats this same state as FAIL.');
  process.exit(0);
}

const prd = readFileSync(prdPath, 'utf8');
const trace = readFileSync(tracePath, 'utf8');

// AC ids look like AC1.1, AC12.3, etc.
const AC = /\bAC\d+\.\d+\b/g;
const prdACs = new Set((prd.match(AC) || []));

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
  const result = cells[cells.length - 1];
  if (/✅|✓|PASS/i.test(result)) passed++;
}

const totalPrd = prdACs.size || 0;
const coveredCount = [...prdACs].filter((a) => tracedACs.has(a)).length;
const drift = [...prdACs].filter((a) => !tracedACs.has(a));
const orphan = [...tracedACs].filter((a) => !prdACs.has(a)); // in matrix, not in PRD

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const coverage = pct(coveredCount, totalPrd);
const tracedPass = pct(passed, rows);

console.log('EOS spec-alignment\n');
console.log(`  PRD acceptance criteria:      ${totalPrd}`);
console.log(`  Covered by trace matrix:      ${coveredCount}/${totalPrd}  (${coverage}%)`);
console.log(`  Traced rows passing:          ${passed}/${rows}  (${tracedPass}%)`);
if (drift.length) console.log(`  ⚠ Spec drift (AC without a trace row): ${drift.join(', ')}`);
if (orphan.length) console.log(`  ⚠ Orphan rows (trace AC not in PRD):   ${orphan.join(', ')}`);
console.log('');

// A tidy one-line record you can append to a trend log for first-pass-rate tracking.
console.log(`  RECORD spec-align coverage=${coverage}% traced_pass=${tracedPass}% drift=${drift.length} orphan=${orphan.length}`);
console.log('');

const clean = drift.length === 0 && orphan.length === 0 && totalPrd > 0 && rows > 0
  && coverage === 100 && tracedPass === 100;
if (!clean && strict) {
  // Name the reason: "gaps present" alone made an empty PRD indistinguishable from a failing row.
  const why = [];
  if (totalPrd === 0) why.push('docs/prd.md contains no acceptance criteria (expected AC<n>.<n> ids)');
  if (rows === 0) why.push('docs/trace-matrix.md contains no AC rows');
  if (drift.length) why.push(`${drift.length} AC(s) with no trace row: ${drift.join(', ')}`);
  if (orphan.length) why.push(`${orphan.length} orphan row(s) not in the PRD (built beyond the approved spec): ${orphan.join(', ')}`);
  if (rows > 0 && passed < rows) why.push(`${rows - passed} traced row(s) not passing`);
  for (const w of why) console.log('  ERROR ' + w);
  console.log('');
  console.log('FAIL (--strict): spec-alignment gaps present. Close drift, orphans and failing rows before release.');
  process.exit(1);
}
console.log(clean ? 'PASS — full spec alignment.' : 'ADVISORY — see gaps above (use --strict to enforce).');
