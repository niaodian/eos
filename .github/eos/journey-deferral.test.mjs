// The limits of a bounded DEFERRED (eos-2.6.0, ADR-023): an overdue date, a controlled release, and an approval bound to the deferred list. Its own file, so Node runs it beside the other journeys.
//   node --test .github/eos/journey-deferral.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { write, run, runJson, cleanup } from './test-support.mjs';
import { SOLO, candidate, toState, deferralSummary } from './journey-support.mjs';

after(cleanup);

test('journey: a deferral whose dueBy has passed is a FAIL, and cannot be promoted', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2020-01-31');
  const nfr = runJson(dir, ['release-status', '--release', 'R-1'], SOLO).json.checks.find((c) => c.id === 'nfr-evidence');
  assert.equal(nfr.status, 'FAIL');
  assert.match(nfr.detail, /overdue/);
  const refused = toState(dir, 'VERIFIED');
  assert.equal(refused.code, 1);
  assert.match(refused.out, /release-ready/);
});

test('journey: a controlled (or regulated) release is never promoted with a deferral', () => {
  const dir = candidate({ workflowProfile: 'controlled' }, '2999-01-31');
  const refused = toState(dir, 'VERIFIED');
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /never promoted with a deferred check/);
});

test('journey: an approval is bound to the deferred list — change the list and it must be given again', () => {
  const dir = candidate({ approvalMode: 'solo' }, '2999-01-31');
  assert.equal(toState(dir, 'VERIFIED').code, 0);
  assert.equal(run(dir, ['approve', '--scope', 'release', '--id', 'R-1', '--self', '--reason', 'solo maintainer; no second reviewer exists'], SOLO).code, 0);
  write(dir, 'docs/evidence/nfr-summary.json', deferralSummary(dir, '2999-06-30'));
  const refused = toState(dir, 'APPROVED');
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /list of deferred NFR targets changed after it was approved/);
});

