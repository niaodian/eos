// eos upgrade — three-way template upgrades (lib/upgrade.mjs, ADR-015), through the real CLI.
//   node --test .github/eos/upgrade.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedSpawnSync, cleanEnv } from './test-spawn.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'eos.mjs');
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-upgrade-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
const template = (version, files) => tree({ '.github/eos/eos.mjs': '// engine\n', 'docs/eos/VERSION': `${version}\n`, ...files });
const cli = (cwd, args) => {
  const r = boundedSpawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

const BASE = { 'a.txt': 'a1\n', 'c.txt': 'c1\n', 'd.txt': 'd1\n', 'e.txt': 'e1\n', 'README.md': 'template readme\n', '.eos/project.json': '{"template":true}\n' };
const NEXT = { 'a.txt': 'a2\n', 'n.txt': 'new\n', 'd.txt': 'd2\n', 'e.txt': 'e1\n', 'README.md': 'new template readme\n', '.eos/project.json': '{"template":"next"}\n' };
function scenario() {
  const base = template('eos-1.0.0', BASE);
  const next = template('eos-1.1.0', NEXT);
  // The project: started from BASE, then changed d and e, and wrote its own README and declaration.
  const local = template('eos-1.0.0', { ...BASE, 'd.txt': 'd-local\n', 'e.txt': 'e-local\n', 'README.md': 'my product\n', '.eos/project.json': '{"mine":true}\n' });
  return { base, next, local };
}

test('a dry run plans every file and changes nothing', () => {
  const { base, next, local } = scenario();
  const r = cli(local, ['upgrade', '--from', next, '--base', base, '--json']);
  assert.equal(r.code, 0, r.out);
  const plan = Object.fromEntries(JSON.parse(r.out).files.map((f) => [f.path, f.action]));
  assert.deepEqual(plan, { 'a.txt': 'update', 'c.txt': 'remove', 'd.txt': 'conflict', 'docs/eos/VERSION': 'update', 'e.txt': 'kept', 'n.txt': 'add' });
  assert.equal(read(local, 'a.txt'), 'a1\n');
  assert.ok(existsSync(join(local, 'c.txt')));
});

test('--write applies the plan: never overwrites an edit, never touches what the project owns', () => {
  const { base, next, local } = scenario();
  const r = cli(local, ['upgrade', '--from', next, '--base', base, '--write']);
  assert.equal(r.code, 2, `a conflict leaves work to do (BLOCKED):\n${r.out}`);
  assert.equal(read(local, 'a.txt'), 'a2\n', 'untouched by the project: updated');
  assert.equal(read(local, 'n.txt'), 'new\n', 'new upstream: added');
  assert.equal(existsSync(join(local, 'c.txt')), false, 'deleted upstream, untouched locally: removed');
  assert.equal(read(local, 'e.txt'), 'e-local\n', 'only the project changed it: kept');
  assert.equal(read(local, 'd.txt'), 'd-local\n', 'both changed it: the local file is never overwritten');
  assert.equal(read(local, '.eos/local/upgrade/eos-1.1.0/d.txt'), 'd2\n', '...and the new version is parked for a hand merge');
  assert.equal(read(local, 'README.md'), 'my product\n', 'project-owned');
  assert.equal(read(local, '.eos/project.json'), '{"mine":true}\n', 'project-owned');
  assert.equal(read(local, 'docs/eos/VERSION'), 'eos-1.1.0\n');
  assert.match(r.out, /policy lock/);
});

test('a base that is not the version the project started from is refused', () => {
  const { next, local } = scenario();
  const wrongBase = template('eos-0.9.0', BASE);
  const r = cli(local, ['upgrade', '--from', next, '--base', wrongBase]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /--base is eos-0\.9\.0, but this project says it is eos-1\.0\.0/);
});

test('without the two templates, upgrade names the exact commands to fetch them — it downloads nothing', () => {
  const { local } = scenario();
  const r = cli(local, ['upgrade']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /npx degit niaodian\/eos#eos-1\.0\.0 \/tmp\/eos-base/);
  assert.match(r.out, /EOS Core downloads nothing/);
  const notATemplate = tree({ 'x.txt': 'x\n' });
  assert.equal(cli(local, ['upgrade', '--from', notATemplate, '--base', notATemplate]).code, 3);
});

// eos-2.3.0: the new template's changelog says what changes for the project, before --write.
const CHANGELOG = [
  '# EOS changelog', '', '> intro', '',
  '## eos-1.2.0 — 2026-10-03', '', '- **Breaking:** commands renamed.', '- a new gate check.', '',
  '## eos-1.1.0 — 2026-10-02', '', '- `eos upgrade` exists.', '',
  '## eos-1.0.0 — 2026-10-01', '', '- the first release.', '',
].join('\n');

test('the plan says what changes, from the new template\'s changelog — only the versions after the base', () => {
  const base = template('eos-1.0.0', BASE);
  const next = template('eos-1.2.0', { ...NEXT, 'docs/eos/CHANGELOG.md': CHANGELOG });
  const local = template('eos-1.0.0', { ...BASE });
  const r = cli(local, ['upgrade', '--from', next, '--base', base, '--json']);
  assert.equal(r.code, 0, r.out);
  const { changelog } = JSON.parse(r.out);
  assert.deepEqual(changelog.map((e) => e.version), ['eos-1.2.0', 'eos-1.1.0']);
  assert.deepEqual(changelog[0].lines, ['**Breaking:** commands renamed.', 'a new gate check.']);
  const text = cli(local, ['upgrade', '--from', next, '--base', base]).out;
  assert.match(text, /What changes for you \(docs\/eos\/CHANGELOG\.md of eos-1\.2\.0\)\n {2}eos-1\.2\.0 — 2026-10-03\n {4}· Breaking: commands renamed\./);
  assert.doesNotMatch(text, /the first release/);
});

test('a template without a changelog plans exactly as before', () => {
  const { base, next, local } = scenario();
  const r = cli(local, ['upgrade', '--from', next, '--base', base, '--json']);
  assert.deepEqual(JSON.parse(r.out).changelog, []);
  assert.doesNotMatch(cli(local, ['upgrade', '--from', next, '--base', base]).out, /What changes for you/);
});
