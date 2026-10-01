// Gate runs as transactions (#4) — the evidence file and its ledger entry are written together.
//
// A gate run writes TWO things: the evidence file, and a ledger entry pinning that file's digest.
// They used to be written as two independent steps, so two runs of the same gate interleaving —
// A writes its evidence, B writes its evidence, B appends, A appends — left a ledger whose latest
// entry pinned A's digest while the file held B's. `evidenceIntegrity` then reported "the evidence
// file has changed since the ledger recorded it … re-run the gate instead of editing the file":
// tampering, when nobody had touched anything. A crash between the two writes produced the same
// accusation.
//
//   node --test .github/eos/transaction.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, run, runJson, cleanup, baselineFiles, CLI } from './test-support.mjs';
import { cleanEnv } from './test-spawn.mjs';
import { appendEvent } from './lib/ledger.mjs';
import { INTENT_PATH } from './lib/record.mjs';

after(cleanup);

/** One CLI run in its own process, so the OS schedules the contention, not the event loop. */
const cliAsync = (dir, args) => new Promise((resolve) => {
  execFile(process.execPath, [CLI, ...args], { cwd: dir, env: cleanEnv({ ...process.env, EOS_ACTOR: 'tester' }), timeout: 60000 },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: `${stdout}${stderr}` }));
});

test('concurrent runs of the same gate leave evidence that matches its ledger entry', { timeout: 120000 }, async () => {
  const dir = project(baselineFiles(), { withHooks: true });
  const runs = await Promise.all(Array.from({ length: 8 }, () => cliAsync(dir, ['check', '--gate', 'discovery-ready'])));
  for (const r of runs) assert.ok([0, 1, 2].includes(r.code), r.out);
  const doctor = run(dir, ['doctor']);
  assert.doesNotMatch(doctor.out, /has changed since the ledger recorded it|edited by hand|no record of/,
    `two honest runs must never read as tampering:\n${doctor.out}`);
});

// ------------------------------------------------------------- a crash between the two writes
/** A repository whose last discovery-ready run stopped after its ledger entry, before its evidence. */
function interruptedRun() {
  const dir = project(baselineFiles(), { withHooks: true });
  assert.ok([0, 1, 2].includes(run(dir, ['check', '--gate', 'discovery-ready']).code));
  const file = '.eos/evidence/discovery-ready__product__product.json';
  const previous = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  // Exactly what recordGateRun does, minus the evidence write a crash would have prevented.
  const next = { ...previous, generatedAt: new Date(Date.now() + 1000).toISOString() };
  const digest = createHash('sha256').update(`${JSON.stringify(next, null, 2)}\n`).digest('hex');
  writeFileSync(join(dir, INTENT_PATH), JSON.stringify({ schemaVersion: 1, gate: 'discovery-ready', scope: previous.scope, evidenceFile: file, evidenceSha256: digest }));
  appendEvent(dir, { type: 'gate', scope: previous.scope, changeType: previous.changeType, gate: 'discovery-ready', status: previous.status, evidenceSha256: digest, detail: file });
  return { dir, file };
}

test('a run interrupted between ledger and evidence is called interrupted, not tampering', () => {
  const { dir } = interruptedRun();
  const doctor = run(dir, ['doctor']);
  assert.match(doctor.out, /INTERRUPTED/);
  assert.match(doctor.out, /Nothing was tampered with/);
  assert.doesNotMatch(doctor.out, /edited by hand|re-run the gate instead of editing the file/, 'a crash is not an accusation');
});

test('one re-run completes an interrupted run and clears the record', () => {
  const { dir } = interruptedRun();
  run(dir, ['check', '--gate', 'discovery-ready']);
  assert.equal(existsSync(join(dir, INTENT_PATH)), false, 'the intent record is removed once the evidence is written');
  const doctor = run(dir, ['doctor']);
  assert.doesNotMatch(doctor.out, /INTERRUPTED|has changed since the ledger recorded it/, doctor.out);
});

test('a leftover record from a run that DID finish is harmless and says so', () => {
  const dir = project(baselineFiles(), { withHooks: true });
  run(dir, ['check', '--gate', 'discovery-ready']);
  const file = '.eos/evidence/discovery-ready__product__product.json';
  const digest = createHash('sha256').update(readFileSync(join(dir, file), 'utf8')).digest('hex');
  writeFileSync(join(dir, INTENT_PATH), JSON.stringify({ schemaVersion: 1, gate: 'discovery-ready', scope: { type: 'product', id: 'product' }, evidenceFile: file, evidenceSha256: digest }));
  const doctor = run(dir, ['doctor']);
  assert.match(doctor.out, /completed but left its intent record behind/);
  assert.doesNotMatch(doctor.out, /INTERRUPTED/);
});

test('an evidence file genuinely edited by hand is still reported as edited', () => {
  // The intent record must not become a way to launder tampering: with no interrupted run on
  // record, a digest mismatch keeps its original meaning.
  const dir = project(baselineFiles(), { withHooks: true });
  run(dir, ['check', '--gate', 'discovery-ready']);
  const file = join(dir, '.eos/evidence/discovery-ready__product__product.json');
  const ev = JSON.parse(readFileSync(file, 'utf8'));
  ev.generatedAt = '2000-01-01T00:00:00.000Z';
  writeFileSync(file, `${JSON.stringify(ev, null, 2)}\n`);
  assert.match(run(dir, ['doctor']).out, /has changed since the ledger recorded it/);
});

test('every gate run leaves no intent record behind when it completes', () => {
  const dir = project(baselineFiles(), { withHooks: true });
  run(dir, ['check', '--gate', 'discovery-ready']);
  run(dir, ['verify']);
  assert.equal(existsSync(join(dir, INTENT_PATH)), false);
});
