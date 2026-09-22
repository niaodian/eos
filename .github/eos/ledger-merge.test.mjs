// Ledger merge policy — what happens when two branches both append.
//
// THE GAP THIS CLOSES: the locking fix made appends safe within ONE repository. It said nothing
// about two branches each appending and then being merged, which is the ordinary way a team uses
// git. Git cannot merge an append-only hash chain: a textual merge of two appended tails produces
// duplicated sequence numbers and `prevHash` pointers that lead nowhere — a chain `ledger --verify`
// correctly rejects, but only AFTER git has already reported success.
//
// Worse, it rejected it as "the ledger was rewritten", which accuses whoever ran `git merge` of
// tampering. Same class of false accusation as the concurrency bug: the machine was right that
// something was wrong and wrong about what.
//
// Three properties are asserted here:
//   1. git never silently merges the ledger (.gitattributes -merge)
//   2. a merged/conflicted ledger is DIAGNOSED as a merge, not as tampering
//   3. resolving replays both sides into one valid chain and LOSES NOTHING
//
//   node --test .github/eos/ledger-merge.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { project, run, runJson, git, commitAll, cleanup, APP_PROJECT, REPO_ROOT } from './test-support.mjs';
import { readEvents, verifyChain, parseConflicted, reconcileEvents, divergence, LEDGER_PATH } from './lib/ledger.mjs';

after(cleanup);

const ledgerText = (dir) => readFileSync(join(dir, LEDGER_PATH), 'utf8');

/** Two branches that each recorded a different gate, then merged. The ordinary team workflow. */
function divergedRepo() {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { withHooks: true });
  // A shared prefix, so the test covers the realistic case rather than two empty histories.
  run(dir, ['check', '--gate', 'activation']);
  commitAll(dir, 'baseline with one event');

  git(dir, ['checkout', '-q', '-b', 'feature-a']);
  run(dir, ['check', '--gate', 'discovery-ready']);
  commitAll(dir, 'branch a records a gate');

  git(dir, ['checkout', '-q', 'main']);
  git(dir, ['checkout', '-q', '-b', 'feature-b']);
  run(dir, ['check', '--gate', 'activation']);
  commitAll(dir, 'branch b records a gate');

  const merge = git(dir, ['merge', '--no-edit', 'feature-a']);
  return { dir, merge };
}

// ----------------------------------------------------------------- 1. git must not merge it
test('.gitattributes stops git from silently merging the ledger', () => {
  const attrs = readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf8');
  assert.match(attrs, /\.eos\/ledger\/events\.jsonl\s+-merge/, 'a textual merge produces a broken chain that git reports as success');
  assert.match(attrs, /\.eos\/ledger\/head\.json\s+-merge/);
});

test('two branches that both appended produce a conflict, not a silent bad merge', () => {
  const { dir, merge } = divergedRepo();
  assert.notEqual(merge.code, 0, `git should refuse to merge the ledger automatically:\n${merge.out}`);
  assert.match(ledgerText(dir), /^<{7}/m, 'the conflict must be visible in the file');
});

// ----------------------------------------------------------------- 2. diagnosis, not accusation
test('a conflicted ledger is reported as a merge, and never as hand-editing', () => {
  const { dir } = divergedRepo();
  const { errors, conflicted } = readEvents(dir);
  assert.equal(conflicted, true);
  assert.match(errors[0], /two branches both appended/);
  assert.match(errors[0], /ledger --resolve/, 'the diagnosis must carry the fix');
  assert.doesNotMatch(errors[0], /must never be hand-edited/, 'this was not hand-editing');
});

test('a textually merged ledger is reported as divergence, not as tampering', () => {
  // The other shape: duplicated sequence numbers with no markers left behind.
  const events = [
    { seq: 1, ts: '2026-01-01T00:00:00.000Z', type: 'note', detail: 'a', prevHash: null, hash: 'x' },
    { seq: 2, ts: '2026-01-01T00:01:00.000Z', type: 'note', detail: 'b', prevHash: 'x', hash: 'y' },
    { seq: 2, ts: '2026-01-01T00:02:00.000Z', type: 'note', detail: 'c', prevHash: 'x', hash: 'z' },
  ];
  assert.deepEqual(divergence(events).duplicatedSeq, [2]);
  const v = verifyChain(events);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /MERGE DIVERGENCE, not tampering/);
  assert.match(v.problems[0], /ledger --resolve/);
  assert.equal(v.problems.length, 1, 'one cause must not produce a cascade that buries the fix');
});

// ----------------------------------------------------------------- 3. resolution loses nothing
test('parseConflicted separates the shared prefix from each side', () => {
  const { dir } = divergedRepo();
  const { common, ours, theirs } = parseConflicted(ledgerText(dir));
  assert.ok(ours.length > 0 && theirs.length > 0, 'both sides must be recovered');
  assert.ok(common.length >= 1, 'the shared prefix belongs to neither side');
});

test('resolve --write replays both sides into one chain that verifies', () => {
  const { dir } = divergedRepo();
  const before = parseConflicted(ledgerText(dir));
  const expected = before.common.length + before.ours.length + before.theirs.length;

  const r = runJson(dir, ['ledger', '--resolve', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.events, expected, 'every event must survive the replay');

  const { events, errors, conflicted } = readEvents(dir);
  assert.deepEqual(errors, []);
  assert.equal(conflicted, false);
  assert.equal(events.length, expected);
  assert.deepEqual(events.map((e) => e.seq), Array.from({ length: expected }, (_, i) => i + 1), 'gapless 1..N');
  assert.deepEqual(verifyChain(events, { root: dir }).problems, [], 'the replayed chain must verify');
});

test('resolution preserves what each event SAYS, changing only its position', () => {
  const { dir } = divergedRepo();
  const before = parseConflicted(ledgerText(dir));
  const said = (e) => `${e.ts}|${e.type}|${e.gate || ''}|${e.status || ''}|${e.actor || ''}|${e.evidenceSha256 || ''}`;
  const expected = [...before.common, ...before.ours, ...before.theirs].map(said).sort();

  run(dir, ['ledger', '--resolve', '--write']);
  assert.deepEqual(readEvents(dir).events.map(said).sort(), expected,
    'nothing dropped, nothing invented — only seq/prevHash/hash may move');
});

test('resolve orders by timestamp, so the chain reflects when things happened', () => {
  const { dir } = divergedRepo();
  run(dir, ['ledger', '--resolve', '--write']);
  const ts = readEvents(dir).events.map((e) => e.ts);
  assert.deepEqual(ts, [...ts].sort(), 'not "whichever branch won"');
});

test('resolve is a dry run by default', () => {
  const { dir } = divergedRepo();
  const before = ledgerText(dir);
  const r = run(dir, ['ledger', '--resolve']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Nothing was written/);
  assert.equal(ledgerText(dir), before, 'a dry run must not touch the file');
});

test('resolving is deterministic — two people get the same chain', () => {
  const a = divergedRepo().dir;
  const raw = ledgerText(a);
  const once = reconcileEvents(Object.values(parseConflicted(raw)));
  const twice = reconcileEvents(Object.values(parseConflicted(raw)));
  assert.deepEqual(once.map((e) => e.hash), twice.map((e) => e.hash));
});

test('the shared prefix collapses, but two real runs of the same gate both survive', () => {
  // Dedup is by hash: identical prefix events collapse; two separate runs differ and are kept.
  const shared = { seq: 1, ts: '2026-01-01T00:00:00.000Z', type: 'gate', gate: 'activation', status: 'PASS', prevHash: null, hash: 'same' };
  const runA = { seq: 2, ts: '2026-01-01T00:01:00.000Z', type: 'gate', gate: 'verified', status: 'PASS', prevHash: 'same', hash: 'a' };
  const runB = { seq: 2, ts: '2026-01-01T00:02:00.000Z', type: 'gate', gate: 'verified', status: 'PASS', prevHash: 'same', hash: 'b' };
  const out = reconcileEvents([[shared], [shared, runA], [shared, runB]]);
  assert.equal(out.length, 3, 'the prefix collapses once; both real runs are kept');
  assert.deepEqual(out.map((e) => e.seq), [1, 2, 3]);
  assert.deepEqual(verifyChain(out).problems, []);
});

test('resolve refuses to claim success on a ledger that is broken for another reason', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { withHooks: true });
  run(dir, ['check', '--gate', 'activation']);
  const lines = ledgerText(dir).trim().split('\n');
  const tampered = JSON.parse(lines[0]);
  tampered.status = 'PASS-but-edited';
  writeFileSync(join(dir, LEDGER_PATH), `${JSON.stringify(tampered)}\n`, 'utf8');
  const r = run(dir, ['ledger', '--resolve']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /NOT by a merge/, 'tampering must not be laundered through the merge tool');
});

test('resolve on a healthy ledger is a no-op that says so', () => {
  const dir = project({ '.eos/project.json': APP_PROJECT }, { withHooks: true });
  run(dir, ['check', '--gate', 'activation']);
  const before = ledgerText(dir);
  const r = run(dir, ['ledger', '--resolve', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Nothing to resolve/);
  assert.equal(ledgerText(dir), before);
});

test('the resolved ledger is accepted by the normal verify path', () => {
  const { dir } = divergedRepo();
  run(dir, ['ledger', '--resolve', '--write']);
  const v = run(dir, ['ledger', '--verify']);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /PASS/);
  assert.ok(existsSync(join(dir, '.eos/ledger/head.json')));
});
