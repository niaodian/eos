// The path a one-person project takes to ship a release whose monthly availability target cannot be measured before shipping (eos-2.6.0, ADR-023): a labelled self-approval, and the refusal when the project did not declare it. Its own file, so Node runs it beside journey.test.mjs.
//   node --test .github/eos/journey-solo.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { write, run, runJson, cleanup } from './test-support.mjs';
import { SOLO, candidate, toState, deferralSummary } from './journey-support.mjs';

after(cleanup);

test('journey: a solo project ships with a bounded DEFERRED — labelled, bound to its list, and never PASS', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2999-01-31');
  const gate = runJson(dir, ['release-status', '--release', 'R-1'], SOLO);
  assert.equal(gate.json.checks.find((c) => c.id === 'nfr-evidence').status, 'DEFERRED');
  assert.notEqual(gate.code, 0, 'DEFERRED is never a green gate');

  assert.equal(toState(dir, 'VERIFIED').code, 0, 'the one deferral is bounded, so the candidate may be promoted');

  // The person who prepared the candidate cannot approve it, and cannot self-approve without saying why.
  const plain = run(dir, ['approve', '--scope', 'release', '--id', 'R-1'], SOLO);
  assert.equal(plain.code, 1);
  assert.match(plain.out, /record it yourself with --self --reason/);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self'], SOLO).code, 1, '--self needs a reason');

  const approved = run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO);
  assert.equal(approved.code, 0, approved.out);
  assert.match(approved.out, /NFR1 {2}owner @platform {2}due by 2999-01-31/, 'the full deferred list is printed before the approval is recorded');
  assert.match(approved.out, /SELF-APPROVAL/);
  const event = readFileSync(join(dir, '.eos/ledger/events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.type === 'approval').at(-1);
  assert.equal(event.assurance, 'self');
  assert.deepEqual(event.deferred, [{ id: 'NFR1', owner: '@platform', trigger: 'the first full month in production', dueBy: '2999-01-31' }]);
  assert.match(event.deferredDigest, /^[0-9a-f]{64}$/);

  assert.equal(toState(dir, 'APPROVED').code, 0);
  assert.equal(toState(dir, 'RELEASED').code, 0);

  // After the release the deferral is on record: status keeps saying DEFERRED, next says when it is due.
  const health = run(dir, ['health'], SOLO).out;
  assert.match(health, /DEFERRED {2}NFR1 → @platform, due by 2999-01-31 \(accepted by solo-dev, a self-approval\)/);
  write(dir, '.eos/local/active-work.json', { schemaVersion: 1, scopeType: 'release', scopeId: 'R-1' });
  const next = runJson(dir, ['next'], SOLO).json.recommendedAction.doneWhen.join('\n');
  assert.match(next, /measure the deferred NFR target NFR1 \(owner @platform, due by 2999-01-31\)/);
  assert.equal(run(dir, ['ledger', '--verify']).code, 0);
});

test('journey: --self is refused unless the project declared the solo path', () => {
  const dir = candidate({}, '2999-01-31');
  assert.equal(toState(dir, 'VERIFIED').code, 0);
  const r = run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO);
  assert.equal(r.code, 1);
  assert.match(r.out, /--self needs approvalMode "solo"/);
});
