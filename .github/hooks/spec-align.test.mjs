// EOS spec-align regression tests — lock the strict/advisory contract so a release gate can never be
// "green but empty". Zero deps (node:test, built into Node 18+):
//   node --test .github/hooks/spec-align.test.mjs
// Wired into CI (.github/workflows/eos-ci.yml).
// [audit EOS-001: `--strict` exited 0 when docs/prd.md or docs/trace-matrix.md were absent, so a
//  project with NO spec evidence at all passed the G8 hard gate.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'spec-align.mjs');
const sandboxes = [];

// Build a throwaway project root; `files` maps repo-relative paths to contents.
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-spec-align-'));
  sandboxes.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  }
  return dir;
}

function run(dir, args = []) {
  const r = spawnSync(process.execPath, [HOOK, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test.after(() => { for (const d of sandboxes) rmSync(d, { recursive: true, force: true }); });

const PRD_2AC = '# PRD\n\n- AC1.1 user can log in\n- AC1.2 user can log out\n';
const TRACE_2PASS = [
  '| AC | Test | Result |',
  '| --- | --- | --- |',
  '| AC1.1 | login.test.ts | ✅ |',
  '| AC1.2 | logout.test.ts | ✅ |',
  '',
].join('\n');

test('advisory + missing evidence: exit 0, and the output says SKIP/ADVISORY (not PASS)', () => {
  const { code, out } = run(project({ 'README.md': '# x\n' }));
  assert.equal(code, 0);
  assert.match(out, /ADVISORY|SKIP/);
  assert.doesNotMatch(out, /^PASS/m);
});

test('strict + missing PRD: exit 1 (the EOS-001 bypass)', () => {
  const { code, out } = run(project({ 'docs/trace-matrix.md': TRACE_2PASS }), ['--strict']);
  assert.equal(code, 1);
  assert.match(out, /FAIL/);
  assert.match(out, /docs\/prd\.md/);
});

test('strict + missing trace matrix: exit 1', () => {
  const { code, out } = run(project({ 'docs/prd.md': PRD_2AC }), ['--strict']);
  assert.equal(code, 1);
  assert.match(out, /docs\/trace-matrix\.md/);
});

test('strict + both files missing: exit 1', () => {
  const { code } = run(project({ 'README.md': '# x\n' }), ['--strict']);
  assert.equal(code, 1);
});

test('strict + PRD present but no AC ids: exit 1', () => {
  const { code, out } = run(project({
    'docs/prd.md': '# PRD\n\nWe will build a thing. No acceptance criteria yet.\n',
    'docs/trace-matrix.md': TRACE_2PASS,
  }), ['--strict']);
  assert.equal(code, 1);
  assert.match(out, /no acceptance criteria|AC/i);
});

test('strict + trace matrix with no valid AC rows: exit 1', () => {
  const { code } = run(project({
    'docs/prd.md': PRD_2AC,
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n',
  }), ['--strict']);
  assert.equal(code, 1);
});

test('strict + spec drift (AC without a trace row): exit 1', () => {
  const { code, out } = run(project({
    'docs/prd.md': PRD_2AC,
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | ✅ |\n',
  }), ['--strict']);
  assert.equal(code, 1);
  assert.match(out, /drift/i);
});

test('strict + orphan row (trace AC not in the PRD): exit 1 — beyond-spec implementation', () => {
  const { code, out } = run(project({
    'docs/prd.md': PRD_2AC,
    'docs/trace-matrix.md': TRACE_2PASS + '| AC9.9 | rogue.test.ts | ✅ |\n',
  }), ['--strict']);
  assert.equal(code, 1);
  assert.match(out, /orphan/i);
});

test('strict + failing traced row: exit 1', () => {
  const { code } = run(project({
    'docs/prd.md': PRD_2AC,
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | ✅ |\n| AC1.2 | b.test.ts | ❌ |\n',
  }), ['--strict']);
  assert.equal(code, 1);
});

test('strict + full coverage, all passing: exit 0 and PASS', () => {
  const { code, out } = run(project({ 'docs/prd.md': PRD_2AC, 'docs/trace-matrix.md': TRACE_2PASS }), ['--strict']);
  assert.equal(code, 0, out);
  assert.match(out, /PASS/);
});

test('advisory + real gaps: still exit 0 (every-push CI stays non-blocking)', () => {
  const { code, out } = run(project({
    'docs/prd.md': PRD_2AC,
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | ✅ |\n',
  }));
  assert.equal(code, 0);
  assert.match(out, /ADVISORY/);
});
