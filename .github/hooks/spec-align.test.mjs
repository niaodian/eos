// EOS spec-align regression tests — lock the strict/advisory contract so a release gate can never be
// "green but empty". Zero deps (node:test, built into Node 18+):
//   node --test .github/hooks/spec-align.test.mjs
// Wired into CI (.github/workflows/eos-ci.yml).
// [audit EOS-001: `--strict` exited 0 when docs/prd.md or docs/trace-matrix.md were absent, so a
//  project with NO spec evidence at all passed the G8 hard gate.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { boundedSpawnSync } from '../eos/test-spawn.mjs';

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
  const r = boundedSpawnSync(process.execPath, [HOOK, ...args], { cwd: dir, encoding: 'utf8' });
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

test('the machine test-run summary decides whether a traced row passed — a hand-written PASS is a claim', () => {
  const FROM_THE_RUN = '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | from the run |\n| AC1.2 | b.test.ts | from the run |\n';
  const summary = (statuses) => JSON.stringify({ schemaVersion: 1, results: Object.entries(statuses).flatMap(([ac, list]) => list.map((status) => ({ ac, testPath: 'a.test.ts', status }))) });
  // The 2.2.0 example: no result written in the matrix, every row answered by the run.
  const green = run(project({ 'docs/prd.md': PRD_2AC, 'docs/trace-matrix.md': FROM_THE_RUN, 'docs/evidence/test-run.json': summary({ 'AC1.1': ['PASS'], 'AC1.2': ['PASS', 'PASS'] }) }), ['--strict']);
  assert.equal(green.code, 0, green.out);
  assert.match(green.out, /2\/2 .*from docs\/evidence\/test-run\.json/);
  // A matrix that claims PASS where the run recorded a failure, or no result at all, does not pass.
  const claimed = run(project({ 'docs/prd.md': PRD_2AC, 'docs/trace-matrix.md': TRACE_2PASS, 'docs/evidence/test-run.json': summary({ 'AC1.1': ['PASS', 'FAIL'] }) }), ['--strict']);
  assert.equal(claimed.code, 1);
  assert.match(claimed.out, /2 traced row\(s\) not passing in docs\/evidence\/test-run\.json/);
  const unreadable = run(project({ 'docs/prd.md': PRD_2AC, 'docs/trace-matrix.md': TRACE_2PASS, 'docs/evidence/test-run.json': '{"results": 3}' }), ['--strict']);
  assert.equal(unreadable.code, 1);
  assert.match(unreadable.out, /not a readable test-run summary/);
});

test('delivery-only (no PRD required): the stories are the spec — the release\'s stories are covered, any story\'s row is no orphan', () => {
  const WORKFLOW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.eos/workflow.json'), 'utf8');
  const storyWith = (id, ac) => `# ${id}\n\n| AC | Statement | Test |\n| --- | --- | --- |\n| ${ac} | does it | t.test.ts |\n`;
  const files = (profile, extra = {}) => ({
    '.eos/workflow.json': WORKFLOW,
    '.eos/project.json': JSON.stringify({ workflowProfile: profile }),
    'docs/stories/STORY-001.md': storyWith('STORY-001', 'AC1.1'),
    'docs/stories/STORY-002.md': storyWith('STORY-002', 'AC2.1'),
    'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | ✅ |\n',
    ...extra,
  });
  // Every story is the spec without a release: AC2.1 has no row yet.
  const all = run(project(files('delivery-only')), ['--strict']);
  assert.equal(all.code, 1, all.out);
  assert.match(all.out, /Story acceptance criteria:\s+2 {2}— no PRD/);
  assert.match(all.out, /1 AC\(s\) with no trace row: AC2\.1/);
  // The release ships STORY-001 only: covered. STORY-002's later row is no orphan; AC9.9 is.
  const manifest = { '.eos/releases/R1.json': JSON.stringify({ includedStories: ['STORY-001'] }) };
  const release = run(project(files('delivery-only', manifest)), ['--strict', '--release', 'R1']);
  assert.equal(release.code, 0, release.out);
  assert.match(release.out, /Story acceptance criteria \(R1\):\s+1/);
  const rogue = run(project(files('delivery-only', { ...manifest, 'docs/trace-matrix.md': '| AC | Test | Result |\n| --- | --- | --- |\n| AC1.1 | a.test.ts | ✅ |\n| AC2.1 | b.test.ts | ✅ |\n| AC9.9 | c.test.ts | ✅ |\n' })), ['--strict', '--release', 'R1']);
  assert.equal(rogue.code, 1);
  assert.match(rogue.out, /1 orphan row\(s\) not in any story .*AC9\.9/);
  // A profile that requires a PRD still fails without one: the stories are not its spec.
  const standard = run(project(files('standard-product')), ['--strict']);
  assert.equal(standard.code, 1);
  assert.match(standard.out, /missing spec evidence: docs\/prd\.md/);
});
