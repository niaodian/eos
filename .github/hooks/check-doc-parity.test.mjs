// EOS doc-parity regression tests — lock the zh<->en lockstep gate's behavioral contract so a future
// edit to check-doc-parity.mjs can't silently stop catching drift. Zero deps (node:test, Node 18+):
//   node --test .github/hooks/check-doc-parity.test.mjs
// Also wired into CI (.github/workflows/eos-ci.yml). Spawns the REAL gate against throwaway fixture
// trees (spawnSync cwd) and asserts: PASS on parity, FAIL on each drift class. This institutionalizes
// the "verify-don't-trust" proof (a green-but-never-red gate is worse than no gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'check-doc-parity.mjs');
const BANNER = '> 🌐 英文为参照语言 (English is the reference language).';

// An in-parity baseline: docs/eos/sample.md ⇄ docs/zh/sample.md + README ⇄ README.zh,
// matching structure (1 heading, 2 table rows, 0 fences) + codes {S1 G2 P3 D4 R5, eos-1.10.0}.
const EN_SAMPLE = '# Title\n\n| a | b |\n|---|---|\n\nUses S1 G2 P3 D4 R5 at eos-1.10.0.\n';
const ZH_SAMPLE = `# 标题\n\n${BANNER}\n\n| a | b |\n|---|---|\n\n用到 S1 G2 P3 D4 R5，版本 eos-1.10.0。\n`;
const EN_README = '# Project\n\nHello.\n';
const ZH_README = `# 项目\n\n${BANNER}\n\n你好。\n`;

// Build a fresh fixture tree; `mutate(dir)` may inject drift before the gate runs.
function makeFixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-parity-'));
  mkdirSync(join(dir, 'docs/eos'), { recursive: true });
  mkdirSync(join(dir, 'docs/zh'), { recursive: true });
  writeFileSync(join(dir, 'docs/eos/sample.md'), EN_SAMPLE);
  writeFileSync(join(dir, 'docs/zh/sample.md'), ZH_SAMPLE);
  writeFileSync(join(dir, 'README.md'), EN_README);
  writeFileSync(join(dir, 'README.zh.md'), ZH_README);
  if (mutate) mutate(dir);
  return dir;
}

// Run the REAL gate in the fixture dir; return { status, out }. Always cleans up the tree.
function runGate(mutate) {
  const dir = makeFixture(mutate);
  try {
    const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('parity baseline PASSes (exit 0, no errors)', () => {
  const { status, out } = runGate();
  assert.equal(status, 0, `expected PASS, got exit ${status}:\n${out}`);
  assert.match(out, /PASS/);
});

test('coverage drift: an en doc with no zh mirror FAILs', () => {
  const { status, out } = runGate((dir) => writeFileSync(join(dir, 'docs/eos/foo.md'), '# Foo\n'));
  assert.equal(status, 1, `expected FAIL:\n${out}`);
  assert.match(out, /missing ZH mirror .*foo\.md/);
});

test('structure drift: an extra heading in zh FAILs', () => {
  const { status, out } = runGate((dir) =>
    writeFileSync(join(dir, 'docs/zh/sample.md'), ZH_SAMPLE + '\n## 多余标题\n'));
  assert.equal(status, 1, `expected FAIL:\n${out}`);
  assert.match(out, /structure drift/);
  assert.match(out, /headings/);
});

test('factual-code drift: S11-style code mismatch FAILs (the exact class fixed this session)', () => {
  // zh drops S1 and invents S8 → set diff both directions.
  const { status, out } = runGate((dir) =>
    writeFileSync(join(dir, 'docs/zh/sample.md'), ZH_SAMPLE.replace('S1 ', 'S8 ')));
  assert.equal(status, 1, `expected FAIL:\n${out}`);
  assert.match(out, /factual-code drift/);
  assert.match(out, /in EN not ZH: .*S1\b/);
  assert.match(out, /in ZH not EN: .*S8\b/);
});

test('missing parity banner is a WARNING, not a failure (exit 0)', () => {
  const { status, out } = runGate((dir) =>
    writeFileSync(join(dir, 'docs/zh/sample.md'), ZH_SAMPLE.replace(BANNER + '\n\n', '')));
  assert.equal(status, 0, `banner absence must not FAIL the build:\n${out}`);
  assert.match(out, /WARN {2}.*missing parity banner/);
});

test('no false positive: shared incidental tokens (AWS S3 in BOTH langs) do not flag', () => {
  const { status, out } = runGate((dir) => {
    writeFileSync(join(dir, 'docs/eos/sample.md'), EN_SAMPLE.replace('eos-1.10.0.', 'eos-1.10.0 with an S3 bucket.'));
    writeFileSync(join(dir, 'docs/zh/sample.md'), ZH_SAMPLE.replace('eos-1.10.0。', 'eos-1.10.0，使用 S3 存储桶。'));
  });
  assert.equal(status, 0, `shared S3 in both langs must cancel, not FAIL:\n${out}`);
});
