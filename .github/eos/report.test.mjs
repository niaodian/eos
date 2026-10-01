// The governance report (eos-2.0.0): what an auditor asks for, from the engine's own records.
//   node --test .github/eos/report.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { project, write, run, runJson, cleanup, commitAll, APP_PROJECT, REPO_ROOT, DISCOVERY_MD, DISCOVERY_RECORD } from './test-support.mjs';
import { validate } from './lib/schema.mjs';

after(cleanup);

const REPORT_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/governance-report.schema.json'), 'utf8'));
const ORG_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/schemas/governance-org-report.schema.json'), 'utf8'));
const REGULATED = { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci' };

test('report --format json is a schema-valid record of the project, its gates, policy and supply chain', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  // A gate that fails, then passes: the report counts both runs.
  run(dir, ['check', '--gate', 'discovery-ready']);
  write(dir, 'docs/discovery.md', DISCOVERY_MD);
  write(dir, 'docs/discovery.json', DISCOVERY_RECORD);
  commitAll(dir, 'discovery');
  run(dir, ['check', '--gate', 'discovery-ready']);
  const r = runJson(dir, ['report', '--format', 'json']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(validate(REPORT_SCHEMA, r.json).errors, []);
  assert.equal(r.json.kind, 'eos-governance-report');
  assert.equal(r.json.project.track, 'standard');
  const g = r.json.gates.find((x) => x.gate === 'discovery-ready');
  assert.equal(g.runs, 2);
  assert.equal(g.pass, 1);
  assert.equal(g.passRate, 0.5);
  assert.equal(r.json.ledger.intact, true);
});

test('report renders Markdown for people, and --out writes it', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const out = join(tmpdir(), `eos-report-${process.pid}-${Date.now()}.md`);
  const r = run(dir, ['report', '--format', 'markdown', '--out', out]);
  assert.equal(r.code, 0, r.out);
  const md = readFileSync(out, 'utf8');
  for (const h of ['# EOS governance report', '## Project', '## Gates', '## Policy', '## Supply chain', '## Needs attention']) assert.ok(md.includes(h), `missing ${h}`);
});

test('what needs attention is said plainly: the template\'s declaration, an unsigned Regulated release', () => {
  const fresh = project({ '.eos/project.json': JSON.parse(readFileSync(join(REPO_ROOT, '.eos/project.json'), 'utf8')) });
  assert.ok(runJson(fresh, ['report', '--format', 'json']).json.attention.some((a) => /template's own declaration/.test(a)));

  const regulated = project({ '.eos/project.json': REGULATED });
  assert.equal(run(regulated, ['release', 'init', '--release', 'v1.0.0']).code, 0);
  commitAll(regulated, 'manifest');
  const rep = runJson(regulated, ['report', '--format', 'json']).json;
  assert.equal(rep.project.track, 'regulated');
  assert.equal(rep.releases[0].signed, false);
  assert.ok(rep.attention.some((a) => /v1\.0\.0 is not signed/.test(a)), JSON.stringify(rep.attention));
});

test('report --org aggregates per-repository reports into one view', () => {
  const dirs = [project({ '.eos/project.json': APP_PROJECT }), project({ '.eos/project.json': REGULATED })];
  const reportsDir = join(tmpdir(), `eos-org-${process.pid}-${Date.now()}`);
  mkdirSync(reportsDir, { recursive: true });
  const files = dirs.map((d, i) => {
    const f = join(reportsDir, `repo-${i}.json`);
    assert.equal(run(d, ['report', '--format', 'json', '--out', f]).code, 0);
    return f;
  });
  const org = runJson(dirs[0], ['report', '--org', ...files]);
  assert.equal(org.code, 0, org.out);
  assert.deepEqual(validate(ORG_SCHEMA, org.json).errors, []);
  assert.equal(org.json.repositories.length, 2);
  assert.deepEqual(org.json.totals.byTrack, { standard: 1, regulated: 1 });
  const md = run(dirs[0], ['report', '--org', ...files, '--format', 'markdown']);
  assert.match(md.out, /# EOS organization governance report/);
  assert.match(md.out, /\| Repository \| Track \|/);
});

test('report --org refuses a file that is not an EOS governance report', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const bogus = join(tmpdir(), `eos-bogus-${process.pid}-${Date.now()}.json`);
  write(tmpdir(), bogus.slice(tmpdir().length + 1), { hello: 'world' });
  const r = run(dir, ['report', '--org', bogus]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /not an EOS governance report/);
  assert.equal(existsSync(bogus), true);
});
