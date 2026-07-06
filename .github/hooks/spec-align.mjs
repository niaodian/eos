#!/usr/bin/env node
// EOS spec-alignment metric — zero external deps.
// Quantifies how well the built artifact matches the spec — EOS's own meta-metric:
//   - AC coverage %:   ACs in the PRD that appear in the trace matrix.
//   - Traced-pass %:   trace-matrix rows marked passing (✅) over total rows.
//   - Spec drift:      ACs in docs/prd.md with NO trace-matrix row (spec says X, no proof).
// Reads docs/prd.md + docs/trace-matrix.md. Advisory by default; --strict makes gaps exit 1.
//   node .github/hooks/spec-align.mjs [--strict]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const prdPath = join(root, 'docs/prd.md');
const tracePath = join(root, 'docs/trace-matrix.md');

if (!existsSync(prdPath) || !existsSync(tracePath)) {
  console.log('spec-align: docs/prd.md or docs/trace-matrix.md not found — nothing to score (run at G7).');
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

const clean = drift.length === 0 && coverage === 100 && tracedPass === 100;
if (!clean && strict) {
  console.log('FAIL (--strict): spec-alignment gaps present. Close drift and failing rows before release.');
  process.exit(1);
}
console.log(clean ? 'PASS — full spec alignment.' : 'ADVISORY — see gaps above (use --strict to enforce).');
