// Version compatibility and migration.
//
// `schemaVersion` was written into every governance file and read by nothing, which made it
// decoration rather than a contract. These tests are what turn it into one.
//
// The direction that matters is AHEAD: an OLD engine reading a file written by a NEWER one. It
// does not know what the new fields mean, and the schema validator rejects unknown properties, so
// without an explicit check the failure describes a symptom and sends someone to hand-edit a file
// whose format they are not the authority on. It must fail closed, and say why.
//
//   node --test .github/eos/migrate.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, APP_PROJECT } from './test-support.mjs';
import { inspectVersions, planMigration, applyMigration, compatibilityErrors, CURRENT_VERSIONS, MIGRATIONS } from './lib/migrate.mjs';

after(cleanup);

const base = () => project({ '.eos/project.json': APP_PROJECT });
/** A sandbox that also carries a test-budget file, which fixtures do not copy by default. */
const withBudget = () => project({
  '.eos/project.json': APP_PROJECT,
  '.eos/test-budget.json': { schemaVersion: 1, defaultScale: 1, layers: { unit: { budgetMs: 1000, files: ['.github/eos/cli.test.mjs'] } } },
});
const bump = (dir, rel, version) => {
  const data = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  data.schemaVersion = version;
  write(dir, rel, data);
  return data;
};

test('the shipped repository is at the version this engine writes', () => {
  const files = inspectVersions(process.cwd());
  const off = files.filter((f) => !['CURRENT', 'MISSING'].includes(f.state));
  assert.deepEqual(off, [], 'EOS must ship governance files at its own current schemaVersion');
});

test('every declared current version has a schema that accepts it', () => {
  for (const [path, version] of Object.entries(CURRENT_VERSIONS)) {
    assert.equal(typeof version, 'number');
    assert.ok(version >= 1, `${path} must declare a positive version`);
  }
});

// ---------------------------------------------------------------- AHEAD: the dangerous direction
test('a file from a NEWER EOS is reported as AHEAD, not silently reinterpreted', () => {
  const dir = base();
  bump(dir, '.eos/workflow.json', 99);
  const [wf] = inspectVersions(dir).filter((f) => f.path === '.eos/workflow.json');
  assert.equal(wf.state, 'AHEAD');
  assert.match(wf.detail, /upgrade EOS/);
});

test('AHEAD stops every command except the ones that diagnose it', () => {
  const dir = base();
  bump(dir, '.eos/workflow.json', 99);
  for (const cmd of [['status'], ['next'], ['check', '--gate', 'discovery-ready']]) {
    const r = run(dir, cmd);
    assert.equal(r.code, 3, `${cmd.join(' ')} must fail closed:\n${r.out}`);
    assert.match(r.out, /written by a newer version of EOS/);
  }
  assert.match(run(dir, ['migrate']).out, /AHEAD/, 'migrate must still be able to explain the problem');
});

test('an AHEAD file is never rewritten, even with --apply', () => {
  const dir = base();
  const before = readFileSync(join(dir, '.eos/workflow.json'), 'utf8');
  bump(dir, '.eos/workflow.json', 99);
  const after = readFileSync(join(dir, '.eos/workflow.json'), 'utf8');
  const r = applyMigration(dir);
  assert.equal(r.ok, false);
  assert.deepEqual(r.written, []);
  assert.equal(readFileSync(join(dir, '.eos/workflow.json'), 'utf8'), after, 'untouched');
  assert.notEqual(before, after);
});

// ---------------------------------------------------------------- BEHIND: the migratable direction
test('a BEHIND file with no registered migration is blocked, not guessed at', () => {
  const dir = base();
  bump(dir, '.eos/gates.json', 0);
  const plan = planMigration(dir);
  assert.equal(plan.ok, false);
  assert.match(plan.blocked.find((b) => b.path === '.eos/gates.json').reason, /NO migration is registered/);
});

test('a registered migration produces a reviewable diff before it is applied', () => {
  const dir = withBudget();
  bump(dir, '.eos/test-budget.json', 0);
  // Register a real migration for the duration of this test, so the machinery is exercised rather
  // than merely present. Restored afterwards so the suite stays order-independent.
  MIGRATIONS['.eos/test-budget.json'] = {
    0: (data) => ({ ...data, defaultScale: data.defaultScale ?? 1, migratedMarker: true }),
  };
  try {
    const plan = planMigration(dir);
    assert.equal(plan.ok, true, JSON.stringify(plan.blocked));
    const change = plan.changes.find((c) => c.path === '.eos/test-budget.json');
    assert.equal(change.from, 0);
    assert.equal(change.to, 1);
    assert.ok(change.diff.some((d) => d.includes('migratedMarker')), change.diff.join(' | '));
    // --plan must not have written anything.
    assert.equal(JSON.parse(readFileSync(join(dir, '.eos/test-budget.json'), 'utf8')).schemaVersion, 0);

    const applied = applyMigration(dir);
    assert.deepEqual(applied.written, ['.eos/test-budget.json']);
    const after = JSON.parse(readFileSync(join(dir, '.eos/test-budget.json'), 'utf8'));
    assert.equal(after.schemaVersion, 1);
    assert.equal(after.migratedMarker, true);
  } finally {
    delete MIGRATIONS['.eos/test-budget.json'];
  }
});

test('migrate --apply refuses to write ANY file while one is blocked', () => {
  const dir = withBudget();
  bump(dir, '.eos/test-budget.json', 0);
  bump(dir, '.eos/workflow.json', 99);
  MIGRATIONS['.eos/test-budget.json'] = { 0: (d) => ({ ...d, touched: true }) };
  try {
    const r = applyMigration(dir);
    assert.equal(r.ok, false);
    assert.deepEqual(r.written, [], 'a partial migration is worse than none — it leaves a mixed-version repository');
    assert.equal(JSON.parse(readFileSync(join(dir, '.eos/test-budget.json'), 'utf8')).touched, undefined);
  } finally {
    delete MIGRATIONS['.eos/test-budget.json'];
  }
});

// ---------------------------------------------------------------- reporting
test('migrate reports CURRENT for an untouched repository and exits 0', () => {
  const r = runJson(base(), ['migrate']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.files.every((f) => ['CURRENT', 'MISSING'].includes(f.state)), JSON.stringify(r.json.files));
});

test('a file with no schemaVersion at all is reported, not assumed current', () => {
  const dir = base();
  const data = JSON.parse(readFileSync(join(dir, '.eos/agent-map.json'), 'utf8'));
  delete data.schemaVersion;
  write(dir, '.eos/agent-map.json', data);
  const found = inspectVersions(dir).find((f) => f.path === '.eos/agent-map.json');
  assert.equal(found.state, 'UNVERSIONED');
  assert.match(found.detail, /predates the version contract/);
});

test('compatibilityErrors reports only the direction that is unsafe', () => {
  const dir = base();
  bump(dir, '.eos/gates.json', 0);      // BEHIND — safe to keep working
  assert.deepEqual(compatibilityErrors(dir), [], 'an older file is a migration task, not a hard stop');
  bump(dir, '.eos/workflow.json', 99);  // AHEAD — unsafe
  assert.equal(compatibilityErrors(dir).length, 1);
});
