// The gate-evaluator registry (P2-3): every check in .eos/gates.json is decided by an evaluator in
// the module of its own gate, and every evaluator a module defines is one a check names.
//
// The engine looks evaluators up by name, so a typo in gates.json or a module that is never
// registered surfaces only when that gate runs — as an ERROR in someone's project. This turns it
// into a failing test here.
//   node --test .github/eos/gate-registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { evaluators, EVALUATORS_BY_GATE } from './lib/gate-evaluators.mjs';
import { REPO_ROOT } from './test-support.mjs';

const GATES = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/gates.json'), 'utf8')).gates;
const MODULES = join(REPO_ROOT, '.github/eos/lib/evaluators');

test('every gate has a module, every module is a registered gate', () => {
  const files = readdirSync(MODULES).filter((n) => n.endsWith('.mjs')).map((n) => n.slice(0, -'.mjs'.length)).sort();
  assert.deepEqual(files, GATES.map((g) => g.id).sort(), 'one module per gate in .eos/gates.json, named by its id');
  assert.deepEqual(Object.keys(EVALUATORS_BY_GATE).sort(), files, 'every module in lib/evaluators/ is registered in gate-evaluators.mjs');
});

test('each check is decided by an evaluator of its own gate, and no evaluator is left unused', () => {
  for (const gate of GATES) {
    const own = EVALUATORS_BY_GATE[gate.id];
    const named = gate.checks.map((c) => c.evaluator);
    for (const name of named) assert.equal(typeof own[name], 'function', `${gate.id}: "${name}" is not implemented in evaluators/${gate.id}.mjs`);
    assert.deepEqual(Object.keys(own).sort(), [...new Set(named)].sort(), `${gate.id}: evaluators/${gate.id}.mjs defines evaluators no check names`);
  }
});

test('the engine sees every evaluator once, under the name gates.json uses', () => {
  const names = new Set(GATES.flatMap((g) => g.checks.map((c) => c.evaluator)));
  assert.deepEqual(Object.keys(evaluators).sort(), [...names].sort());
  for (const gate of GATES) {
    for (const c of gate.checks) assert.equal(evaluators[c.evaluator], EVALUATORS_BY_GATE[gate.id][c.evaluator]);
  }
});
