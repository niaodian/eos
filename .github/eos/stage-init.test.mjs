// `eos stage init` — stage-record skeletons generated from their schemas (P2-2).
//
// The property that makes a skeleton safe to hand anyone: it can never advance a stage. Every gate
// that reads a record rejects one that still holds a TODO(eos) placeholder, and names what is left.
// And the property that makes it useful: answer each placeholder and the record is valid.
//   node --test .github/eos/stage-init.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, REPO_ROOT, APP_PROJECT, baselineFiles } from './test-support.mjs';
import { skeletonFor, setAt } from './lib/stage-skeleton.mjs';
import { STAGE_RECORDS, PLACEHOLDER, placeholdersIn } from './lib/stage-record.mjs';
import { validate } from './lib/schema.mjs';
import { boundedSpawnSync } from './test-spawn.mjs';
import { CLI } from './test-support.mjs';

after(cleanup);

const schemaOf = (kind) => JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas', STAGE_RECORDS[kind].schema), 'utf8'));
const sample = (kind) => JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eos/examples/stage-records', `${kind === 'design' ? 'design.ui' : kind}.json`), 'utf8'));
const at = (obj, keys) => keys.reduce((o, k) => o?.[k], obj);

test('every stage has a skeleton: required fields only, a placeholder at every answer', () => {
  for (const kind of Object.keys(STAGE_RECORDS)) {
    const { record, leaves } = skeletonFor(schemaOf(kind));
    assert.equal(record.schemaVersion, 1, `${kind}: constants are written, not asked`);
    assert.ok(leaves.length >= 1, kind);
    assert.deepEqual(placeholdersIn(record), leaves.map((l) => l.path), `${kind}: every leaf is a placeholder`);
    assert.ok(leaves.every((l) => at(record, l.keys).startsWith(`${PLACEHOLDER}: ${l.path} — `)), `${kind}: the placeholder names its field`);
  }
});

test('a skeleton whose answers are given is a valid record — the skeleton covers exactly what the schema requires', () => {
  for (const kind of Object.keys(STAGE_RECORDS)) {
    const schema = schemaOf(kind);
    const { record, leaves } = skeletonFor(schema);
    const answers = sample(kind);
    for (const leaf of leaves) setAt(record, leaf.keys, at(answers, leaf.keys));
    if (kind === 'design') record.coverage = answers.coverage; // required only when userInterface is true
    const v = validate(schema, record, { label: kind });
    assert.ok(v.valid, `${kind}: ${v.errors.join('; ')}`);
  }
});

test('every gate rejects a skeleton, naming the answers it still needs', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { withHooks: true });
  for (const kind of Object.keys(STAGE_RECORDS)) assert.equal(run(dir, ['stage', 'init', kind, '--write']).code, 0, kind);
  // Documents with content, so only the records stand between the stage and its gate.
  for (const kind of Object.keys(STAGE_RECORDS)) write(dir, STAGE_RECORDS[kind].doc, `# ${kind}\n\n${'A real paragraph about this stage that carries content. '.repeat(20)}\n`);
  for (const [gate, check] of [['discovery-ready', 'discovery-written'], ['requirements-ready', 'requirements-written'], ['ux-ready', 'ux-applicability'], ['architecture-ready', 'architecture-written'], ['telemetry-ready', 'telemetry-plan']]) {
    const c = runJson(dir, ['check', '--gate', gate]).json.checks.find((x) => x.id === check);
    assert.equal(c.status, 'FAIL', `${gate}: ${JSON.stringify(c)}`);
    assert.match(c.detail, /still holds \d+ TODO\(eos\) placeholder\(s\) from `eos stage init` — answer /);
  }
  const iteration = runJson(dir, ['check', '--gate', 'iteration-ready', '--scope', 'R-1']).json.checks.find((x) => x.id === 'spec-write-back');
  assert.equal(iteration.status, 'FAIL', JSON.stringify(iteration));
  assert.match(iteration.detail, /TODO\(eos\) placeholder/);
});

test('a record is never overwritten without --force, and a document never', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT, 'docs/discovery.json': { mine: true }, 'docs/discovery.md': '# mine\n' });
  const r = runJson(dir, ['stage', 'init', 'discovery', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.json.recordAction, /^kept/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'docs/discovery.json'), 'utf8')), { mine: true });
  assert.equal(runJson(dir, ['stage', 'init', 'discovery', '--write', '--force']).json.recordAction, 'replaced');
  assert.equal(readFileSync(join(dir, 'docs/discovery.md'), 'utf8'), '# mine\n');
  assert.equal(existsSync(join(dir, 'docs/discovery.json.bak')), false);
});

test('--interactive fills the answers, and holds them to the schema before writing', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const answers = [
    'People who share a household lose track of chores because their lists are not in sync.',
    'Shared households complete no more items per week than others.',
    'weekly shared items completed', '9', 'todo.item.completed events in the warehouse', 'shared lists', 'calendar sync', '',
  ].join('\n');
  const ok = boundedSpawnSync(process.execPath, [CLI, 'stage', 'init', 'discovery', '--interactive', '--write'], { cwd: dir, input: answers, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
  const record = JSON.parse(readFileSync(join(dir, 'docs/discovery.json'), 'utf8'));
  assert.equal(record.successMetric.target, 9, 'a number where the schema allows one');
  assert.deepEqual(placeholdersIn(record), []);

  const fresh = project({ '.eos/project.json': APP_PROJECT });
  const tooShort = boundedSpawnSync(process.execPath, [CLI, 'stage', 'init', 'discovery', '--interactive', '--write'], { cwd: fresh, input: ['short', 'x', 'y', '1', 'z', 'a', 'b', ''].join('\n'), encoding: 'utf8' });
  assert.equal(tooShort.status, 1, tooShort.stdout);
  assert.match(tooShort.stdout, /not written — the answers do not match the schema/);
  assert.equal(existsSync(join(fresh, 'docs/discovery.json')), false);
});

test('the sample records keep their contract: each validates and passes its record checks', () => {
  for (const kind of Object.keys(STAGE_RECORDS)) {
    for (const file of kind === 'design' ? ['design', 'design.ui'] : [kind]) {
      const data = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eos/examples/stage-records', `${file}.json`), 'utf8'));
      const v = validate(schemaOf(kind), data, { label: file });
      assert.ok(v.valid, `${file}: ${v.errors.join('; ')}`);
      assert.deepEqual(placeholdersIn(data), []);
    }
  }
  const files = baselineFiles({
    'docs/discovery.json': sample('discovery'),
    'docs/requirements.json': sample('requirements'),
  });
  const dir = project(files, { withHooks: true });
  for (const gate of ['discovery-ready', 'requirements-ready']) {
    const r = runJson(dir, ['check', '--gate', gate]);
    assert.equal(r.json.status, 'PASS', `${gate}: ${JSON.stringify(r.json.checks.filter((c) => c.status !== 'PASS'))}`);
  }
});
