// The schema invalid-input matrix (#8).
//
// For every schema in .eos/schemas/, start from a VALID example and break it one constraint at a
// time. Each mutation drops a required property, gives a typed value the wrong type, steps outside
// an enum / const / pattern / bound, or adds an unknown property where the schema is closed. The
// validator must reject every one with a message that says WHERE (the JSON path) and WHAT (the
// violated constraint, and the offending value where there is one).
//
// The mutations are derived from the schema, not written by hand. A constraint added to a schema is
// tested the day it is added, and a schema added without an example fails the coverage test below.
//   node --test .github/eos/schema-matrix.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  project, cleanup, REPO_ROOT, APP_PROJECT, storyFiles, DISCOVERY_RECORD, REQUIREMENTS_RECORD,
  DESIGN_SKIP_RECORD, ARCHITECTURE_RECORD, TELEMETRY_RECORD, ITERATION_RECORD, NFR_SUMMARY, manifest, bindDigests,
} from './test-support.mjs';
import { validate } from './lib/schema.mjs';
import { readSnapshot } from './lib/state.mjs';
import { route } from './lib/router.mjs';
import { buildHandoff } from './lib/handoff.mjs';
import { prepareGateRun } from './lib/gates.mjs';
import { appendEvent, readEvents } from './lib/ledger.mjs';

after(cleanup);

const SCHEMA_DIR = join(REPO_ROOT, '.eos/schemas');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const repoFile = (rel) => readJson(join(REPO_ROOT, rel));
const DIGEST = 'a'.repeat(64);
const NOW = '2026-10-01T00:00:00.000Z';

// ---------------------------------------------------------------- valid examples, one per schema
// Real files where the repository has one; real producers (router, handoff, gate run, ledger) for
// what EOS writes itself; the shared fixtures for stage records.
let sandbox;
function produced() {
  if (sandbox) return sandbox;
  const dir = project(storyFiles({
    'docs/evidence/nfr-summary.json': NFR_SUMMARY,
    'docs/evidence/eval-summary.json': {
      schemaVersion: 1, generatedAt: NOW, runId: 'run-1', productTree: '@tree',
      subject: { promptRef: 'prompts/answer.md', model: 'vendor-model-a', datasetRef: 'evals/dataset.jsonl', graderRef: 'evals/grader.mjs' },
      cases: [{ id: 'EVAL-1', ac: 'AC1.1', metric: 'groundedness', comparator: '>=', threshold: 0.9, observed: 0.94, status: 'PASS' }],
    },
  }));
  appendEvent(dir, { type: 'transition', scope: { type: 'story', id: 'STORY-001' }, changeType: 'FEATURE', from: 'DRAFT', to: 'IN_REVIEW', actor: 'tester', commit: null, detail: 'matrix' });
  const snapshot = readSnapshot(dir);
  const { evidence } = prepareGateRun(snapshot, 'story-ready', 'story', 'STORY-001');
  sandbox = {
    dir,
    nextAction: route(snapshot),
    handoff: buildHandoff(snapshot, { scopeType: 'story', scopeId: 'STORY-001' }),
    evidence,
    event: readEvents(dir).events.at(-1),
    testRun: readJson(join(dir, 'docs/evidence/test-run.json')),
    nfr: readJson(join(dir, 'docs/evidence/nfr-summary.json')),
    evalSummary: readJson(join(dir, 'docs/evidence/eval-summary.json')),
    manifest: manifest(dir, { releaseId: 'v1.0.0' }),
  };
  return sandbox;
}

const EXAMPLES = {
  'active-work': () => [{ schemaVersion: 1, scopeType: 'story', scopeId: 'STORY-001', note: 'resumed', updatedAt: NOW, branch: 'main' }],
  'agent-map': () => [repoFile('.eos/agent-map.json')],
  architecture: () => [ARCHITECTURE_RECORD],
  'bmad-lock': () => [repoFile('.eos/bmad.lock.json')],
  design: () => [DESIGN_SKIP_RECORD],
  diagnostic: () => [{
    schemaVersion: 1, tool: 'project-gate', status: 'FAIL', exitCode: 1, summary: 'FAIL: 1 error(s), 1 warning(s)',
    scope: { type: 'product', id: 'product' },
    problems: [
      { level: 'error', code: 'tests-executed', status: 'FAIL', message: 'test FAIL: npm test exited 1', gate: 'verified', scope: { type: 'story', id: 'STORY-001' }, artifact: null, fix: 'Make the tests pass.', rerunCommand: 'node .github/eos/eos.mjs check --gate verified --scope STORY-001' },
      { level: 'warning', code: 'P1', message: 'stack manifest(s) found but not declared' },
    ],
    notes: ['lint: not declared (N/A)'], rerunCommand: 'node .github/hooks/project-gate.mjs', details: { executedSteps: 1 },
  }],
  discovery: () => [DISCOVERY_RECORD],
  'eval-summary': () => [produced().evalSummary],
  'gate-definition': () => [repoFile('.eos/gates.json')],
  'gate-evidence': () => [produced().evidence],
  handoff: () => [produced().handoff],
  // Its digests are placeholders until bound to a real tree.
  iteration: () => [bindDigests(produced().dir, ITERATION_RECORD)],
  'next-action': () => [produced().nextAction],
  'nfr-summary': () => [produced().nfr],
  'policy-lock': () => [repoFile('.eos/policy.lock.json'), {
    schemaVersion: 1, policyDigest: DIGEST,
    acknowledged: [{ change: 'profile:standard-product:FEATURE:verified:required→waivable', kind: 'WEAKENING', detail: 'verified becomes waivable', reason: 'Pilot team, reviewed weekly by the platform group.', requestedBy: 'dev-a', approver: 'lead-b' }],
  }],
  project: () => [repoFile('.eos/project.json'), { ...APP_PROJECT, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci', language: 'en', release: { artifacts: ['dist/*.tgz'], signing: { publicKey: '.eos/keys/release.pub' } } }],
  providers: () => [{ schemaVersion: 1, providers: [{ adapter: 'mock', subjects: ['enforcement-authority'], options: {} }] }],
  'release-manifest': () => [produced().manifest, {
    ...produced().manifest,
    artifacts: [{ path: 'dist/app-1.0.0.tgz', sha256: DIGEST, size: 10 }],
    sbom: { path: '.eos/sbom.json', sha256: DIGEST },
    ledger: { seq: 3, hash: DIGEST },
    provenance: [{ type: 'slsa', path: 'dist/app.intoto.jsonl' }],
    signature: { alg: 'ed25519', keyId: DIGEST, signedAt: NOW, value: 'A'.repeat(88) },
  }],
  requirements: () => [REQUIREMENTS_RECORD],
  telemetry: () => [TELEMETRY_RECORD],
  'test-budget': () => [repoFile('.eos/test-budget.json')],
  'test-run': () => [produced().testRun],
  'transition-event': () => [produced().event],
  waiver: () => [{
    schemaVersion: 1, gate: 'story-ready', scope: { type: 'story', id: 'STORY-001' },
    reason: 'The trace matrix moves to the new format next sprint.', riskOwner: 'lead-b', requestedBy: 'dev-a', approver: 'lead-c',
    expiresOn: '2026-12-31', trigger: 'the format migration lands', compensatingControls: ['manual review of every merged story'],
  }],
  workflow: () => [repoFile('.eos/workflow.json')],
};

// ---------------------------------------------------------------- the mutation engine
const pathOf = (keys) => keys.reduce((p, k) => (typeof k === 'number' ? `${p}[${k}]` : `${p}.${k}`), '$');
const typeOk = (t, v) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number'
  : t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : typeof v === t);
const wrongValue = (types) => [42, 'eos-wrong-type', true, [], {}, null].find((v) => !types.some((t) => typeOk(t, v)));

function deref(node, root) {
  let n = node;
  for (let hops = 0; n && n.$ref && hops < 16; hops++) n = n.$ref.slice(2).split('/').reduce((o, k) => o?.[k], root);
  return n;
}

/**
 * Every single-constraint violation reachable from `value`, each with the error it must produce.
 * A schema node is broken once per kind, however many array items or examples reach it.
 */
function mutationsOf(schema, examples) {
  const out = [];
  const done = new Map();
  const once = (node, kind) => {
    const kinds = done.get(node) || new Set();
    done.set(node, kinds);
    if (kinds.has(kind)) return false;
    kinds.add(kind);
    return true;
  };
  const visit = (raw, value, keys, ex) => {
    const node = deref(raw, schema);
    if (!node || typeof node !== 'object') return;
    const at = pathOf(keys);
    const add = (kind, op, expect) => { if (once(node, kind)) out.push({ ex, kind, keys, op, at, expect }); };

    if (node.anyOf) {
      // Which alternative a value "meant" is ambiguous, so only a value no alternative accepts.
      const alts = node.anyOf.map((a) => deref(a, schema));
      if (alts.every((a) => a.type)) {
        const v = wrongValue(alts.flatMap((a) => [].concat(a.type)));
        if (v !== undefined) add('anyOf', { set: v }, /does not match any allowed form/);
      }
      return;
    }
    if (node.const !== undefined) add('const', { set: typeof node.const === 'number' ? node.const + 1 : 'eos-not-the-constant' }, new RegExp(`expected ${escapeRe(JSON.stringify(node.const))}, got`));
    if (node.enum) add('enum', { set: 'eos-not-in-the-enum' }, /"eos-not-in-the-enum" is not one of /);
    if (node.type) {
      const v = wrongValue([].concat(node.type));
      if (v !== undefined) add('type', { set: v }, /expected type [a-z|]+, got [a-z]+|is not one of/);
    }
    if (typeof value === 'string') {
      if (node.pattern) {
        const re = new RegExp(node.pattern);
        const bad = ['', ' ', '!', 'eos wrong pattern !', '0', 'A'].find((c) => !re.test(c));
        if (bad !== undefined) add('pattern', { set: bad }, /does not match \//);
      }
      if (node.minLength > 0) add('minLength', { set: '' }, new RegExp(`is 0 character\\(s\\), shorter than the minimum ${node.minLength}`));
      if (node.maxLength !== undefined) add('maxLength', { set: 'x'.repeat(node.maxLength + 1) }, new RegExp(`is ${node.maxLength + 1} character\\(s\\), longer than the maximum ${node.maxLength}`));
    }
    if (typeof value === 'number') {
      if (node.minimum !== undefined) add('minimum', { set: node.minimum - 1 }, new RegExp(`${escapeRe(String(node.minimum - 1))} is below the minimum ${escapeRe(String(node.minimum))}`));
      if (node.maximum !== undefined) add('maximum', { set: node.maximum + 1 }, new RegExp(`${escapeRe(String(node.maximum + 1))} is above the maximum ${escapeRe(String(node.maximum))}`));
    }
    if (Array.isArray(value)) {
      if (node.minItems > 0) add('minItems', { set: [] }, /needs at least \d+ item/);
      if (node.maxItems !== undefined && value.length) add('maxItems', { set: Array(node.maxItems + 1).fill(value[0]) }, /expected at most \d+ item/);
      if (node.uniqueItems === true && value.length) add('uniqueItems', { set: [value[0], value[0]] }, /duplicate entry/);
      if (node.items && value.length) visit(node.items, value[0], [...keys, 0], ex);
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of node.required || []) {
        if (key in value && once(node, `required:${key}`)) out.push({ ex, kind: 'required', keys, op: { drop: key }, at, expect: new RegExp(`missing required property "${escapeRe(key)}"`) });
      }
      const patterns = Object.entries(node.patternProperties || {});
      const UNKNOWN = 'eos_unknown_property';
      if (node.additionalProperties === false && !patterns.some(([p]) => new RegExp(p).test(UNKNOWN))) {
        add('additionalProperties', { add: UNKNOWN }, new RegExp(`unknown property "${UNKNOWN}"`));
      }
      if (node.minProperties > 0) add('minProperties', { set: {} }, /needs at least \d+ propert/);
      for (const [key, child] of Object.entries(value)) {
        if (node.properties && key in node.properties) { visit(node.properties[key], child, [...keys, key], ex); continue; }
        const match = patterns.find(([p]) => new RegExp(p).test(key));
        if (match) visit(match[1], child, [...keys, key], ex);
        else if (node.additionalProperties && typeof node.additionalProperties === 'object') visit(node.additionalProperties, child, [...keys, key], ex);
      }
    }
  };
  examples.forEach((ex, i) => visit(schema, ex, [], i));
  return out;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function apply(example, { keys, op }) {
  const copy = structuredClone(example);
  if (!keys.length && 'set' in op) return op.set;
  const parent = keys.slice(0, op.set !== undefined || 'set' in op ? -1 : keys.length).reduce((o, k) => o[k], copy);
  if ('set' in op) parent[keys.at(-1)] = op.set;
  else if (op.drop) delete parent[op.drop];
  else if (op.add) parent[op.add] = 'eos';
  return copy;
}

// ---------------------------------------------------------------- the matrix
const SCHEMAS = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json')).map((f) => f.replace('.schema.json', '')).sort();

test('every schema in .eos/schemas/ has a valid example — a schema without one is a schema nobody breaks', () => {
  assert.deepEqual(SCHEMAS.filter((name) => !EXAMPLES[name]), [], 'add an example to EXAMPLES in schema-matrix.test.mjs');
  assert.deepEqual(Object.keys(EXAMPLES).filter((name) => !SCHEMAS.includes(name)), [], 'an example for a schema that no longer exists');
});

const KINDS = ['required', 'type', 'enum', 'const', 'pattern', 'additionalProperties', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'anyOf'];
const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));

for (const name of SCHEMAS) {
  test(`${name}.schema.json rejects each invalid input, naming where and what`, (t) => {
    const schema = readJson(join(SCHEMA_DIR, `${name}.schema.json`));
    const examples = EXAMPLES[name]();
    examples.forEach((ex, i) => assert.deepEqual(validate(schema, ex).errors, [], `example ${i} of ${name} must be valid`));

    const mutations = mutationsOf(schema, examples);
    assert.ok(mutations.length > 0, `${name}: no constraint was reachable from its examples`);
    const misses = [];
    for (const m of mutations) {
      const { valid, errors } = validate(schema, apply(examples[m.ex], m));
      const named = errors.some((e) => e.startsWith(`${m.at}:`) && m.expect.test(e));
      if (valid || !named) misses.push(`${m.kind} at ${m.at}: ${valid ? 'ACCEPTED' : `no error at ${m.at} matching ${m.expect} — got ${JSON.stringify(errors.slice(0, 3))}`}`);
      totals[m.kind] += 1;
    }
    assert.deepEqual(misses, [], `${name}: ${misses.length} of ${mutations.length} invalid inputs were not rejected with an actionable message`);
    const byKind = KINDS.filter((k) => mutations.some((m) => m.kind === k)).map((k) => `${k} ${mutations.filter((m) => m.kind === k).length}`);
    t.diagnostic(`${name}: ${mutations.length} invalid inputs — ${byKind.join(', ')}`);
  });
}

test('the matrix covers every kind of constraint the schemas use', () => {
  // A kind of constraint that no schema exercises here is a kind the validator could stop
  // enforcing without a single test noticing.
  const used = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    for (const k of KINDS) if (k in n && (k !== 'additionalProperties' || n[k] === false)) used.add(k);
    if (n.required?.length) used.add('required');
    for (const v of Object.values(n)) walk(v);
  };
  for (const name of SCHEMAS) walk(readJson(join(SCHEMA_DIR, `${name}.schema.json`)));
  const untested = [...used].filter((k) => totals[k] === 0);
  assert.deepEqual(untested, [], `constraint kinds used by a schema but never broken here: ${untested.join(', ')}`);
});
