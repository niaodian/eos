// Audit regression — eos-2.0.0 audit, secret detection.
//
// Each test first performs the reported bypass against the REAL guard — secret-scan.mjs on a real
// git repository, deny-dangerous.js as a real process — and then asserts it no longer works. A test
// here failing means an audit finding has re-opened. Fixtures are assembled at runtime, so this file
// holds no contiguous secret literal of its own.
//   node --test .github/eos/audit-secrets.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedSpawnSync } from './test-spawn.mjs';
import { REPO_ROOT } from './audit-support.mjs';

const SCAN = join(REPO_ROOT, '.github/hooks/secret-scan.mjs');
const HOOK = join(REPO_ROOT, '.github/hooks/deny-dangerous.js');
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const Q = '"';
const PW = 'pass' + 'word';
const VAL = 'hunter2' + 'prod' + 'value';
const SK = 's' + 'k-' + 'abcdef1234567890' + 'abcdef';
const OPENAI = 's' + 'k-' + 'Ab3dEf7hIj1lMn4pQr6t' + 'T3Blbk' + 'FJ' + 'Uv8wXy2zAb5cDe9fGh0i';
const ENVJS = 'process' + '.env';
const ENVPY = 'os' + '.environ';

/** A git repository holding `files`, scanned by the real secret-scan.mjs. */
function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-secrets-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), `${body}\n`);
  boundedSpawnSync('git', ['init', '-q'], { cwd: dir });
  boundedSpawnSync('git', ['add', '.'], { cwd: dir });
  const r = boundedSpawnSync(process.execPath, [SCAN], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const leaked = (out, file) => new RegExp(`LEAK\\s+${file.replace('.', '\\.')}:`).test(out);

test('secret-scan: a line that reads an env var is no longer skipped whole (the reported bypass)', () => {
  const files = {
    'fallback.js': `const apiKey = ${ENVJS}.OPENAI_API_KEY || ${Q}${SK}${Q};`,
    'vendor-fallback.js': `const k = ${ENVJS}.OPENAI_API_KEY ?? ${Q}${OPENAI}${Q};`,
    'comment.js': `const apiKey = ${Q}${SK}${Q}; // TODO: read from ${ENVJS} later`,
    'default.py': `DB_PASSWORD = ${ENVPY}.get(${Q}DB_PASSWORD${Q}, ${Q}${VAL}${Q})`,
  };
  const r = scan(files);
  assert.equal(r.status, 1, r.out);
  for (const f of Object.keys(files)) assert.ok(leaked(r.out, f), `${f} must be reported:\n${r.out}`);
  assert.doesNotMatch(r.out, new RegExp(VAL), 'findings are redacted');
});

test('secret-scan: credential forms that matched no rule — JSON key, unquoted .properties', () => {
  const r = scan({
    'settings.json': `{ ${Q}${PW}${Q}: ${Q}${VAL}${Q} }`,
    'application.properties': `spring.datasource.${PW}=${VAL}`,
  });
  assert.equal(r.status, 1, r.out);
  assert.ok(leaked(r.out, 'settings.json'), r.out);
  assert.ok(leaked(r.out, 'application.properties'), r.out);
});

test('secret-scan: reading env vars, placeholders and references stay clean', () => {
  const r = scan({
    'ok.js': `const ${PW} = ${ENVJS}.DB_PASSWORD;\nconst k = ${ENVJS}.API_KEY || ${Q}your-api-key${Q};`,
    'ok.py': `token = ${ENVPY}[${Q}API_TOKEN${Q}]`,
    'ok.properties': `spring.datasource.${PW}=\${DB_PASSWORD}`,
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /PASS/);
});

function hook(payload) {
  const r = boundedSpawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout || '{}')?.hookSpecificOutput?.permissionDecision ?? 'allow';
}

test('deny-dangerous: a double-quoted, JSON-key or YAML credential is denied (it escaped as \\" before)', () => {
  assert.equal(hook({ tool_name: 'Write', tool_input: { path: 'app.py', file_text: `${PW} = ${Q}${VAL}${Q}` } }), 'deny');
  assert.equal(hook({ tool_name: 'Write', tool_input: { path: 'cfg.json', file_text: `{${Q}api_key${Q}: ${Q}${VAL}${Q}}` } }), 'deny');
  assert.equal(hook({ tool_name: 'Edit', tool_input: { path: 'cfg.yml', old_str: 'x: 1', new_str: `${PW}: ${Q}${VAL}${Q}` } }), 'deny');
});

test('deny-dangerous: words on different lines are not one command (the reported false positive)', () => {
  const text = `${'fi' + 'nd'} . -name x\nconsole.log(${Q}${'-' + 'delete'}${Q})`;
  assert.equal(hook({ tool_name: 'Write', tool_input: { path: 'x.js', file_text: text } }), 'allow');
});

// eos-2.0.0 evaluation, finding I: CI's step said "gitleaks if available" and nothing installed it,
// so the deeper scan never ran where it mattered. CI now installs a pinned, checksum-verified
// gitleaks and sets EOS_REQUIRE_GITLEAKS=1 — under which a missing gitleaks fails instead of quietly
// falling back to the built-in rules.
test('finding I: where gitleaks is required, its absence fails the scan rather than passing on the built-in rules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eos-secrets-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'clean.txt'), 'nothing to see\n');
  // A PATH without gitleaks. Every case variant goes first: Windows spells it "Path".
  const bare = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  bare.PATH = ['/usr/bin', '/bin'].join(process.platform === 'win32' ? ';' : ':');
  const optional = boundedSpawnSync(process.execPath, [SCAN], { cwd: dir, encoding: 'utf8', env: bare });
  assert.equal(optional.status, 0, optional.stdout);
  assert.match(optional.stdout, /built-in patterns \(install gitleaks for deeper scan\)/);
  const required = boundedSpawnSync(process.execPath, [SCAN], { cwd: dir, encoding: 'utf8', env: { ...bare, EOS_REQUIRE_GITLEAKS: '1' } });
  assert.equal(required.status, 1, required.stdout);
  assert.match(required.stdout, /ERROR gitleaks is not on PATH — EOS_REQUIRE_GITLEAKS=1/);
});

test('finding I: CI installs a pinned gitleaks, verifies its checksum, and requires it', () => {
  const ci = readFileSync(join(REPO_ROOT, '.github/workflows/eos-ci.yml'), 'utf8');
  assert.match(ci, /GITLEAKS_VERSION: \d+\.\d+\.\d+\n/, 'a pinned version, never "latest"');
  assert.match(ci, /GITLEAKS_SHA256: [0-9a-f]{64}\n/);
  assert.match(ci, /sha256sum --check --strict/);
  assert.match(ci, /EOS_REQUIRE_GITLEAKS: '1'\n\s+run: node \.github\/hooks\/secret-scan\.mjs/);
});
