// Recording a gate run as ONE unit: the evidence file and the ledger entry that pins it.
//
// THE DEFECT (#4). A gate run wrote its evidence, then appended a ledger entry pinning the file's
// digest, as two independent steps. Two runs of the same gate could interleave — A writes, B
// writes, B appends, A appends — leaving a latest entry that pins A's digest over a file holding
// B's. `evidenceIntegrity` then reported the file as edited by hand. A crash between the two writes
// produced the same false accusation. Both were reproduced by transaction.test.mjs before this fix.
//
// THE ORDER, and why it is this one:
//   1. intent record   — "a run of <gate>/<scope> producing <digest> is in progress"
//   2. ledger entry    — pins <digest>
//   3. evidence file   — written atomically
//   4. intent removed
// all under the ledger lock, so no other writer can slip between steps.
//
// Ledger-first means EOS itself can never leave evidence without its entry: a file with no entry
// can only be hand-made, and is still reported as such. The opposite gap — an entry whose evidence
// never arrived — is what a crash between 2 and 3 leaves, and the intent record is what lets EOS
// call that INTERRUPTED instead of tampering.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { withLedger, appendEvent } from './ledger.mjs';
import { writeFileAtomic } from './atomic.mjs';

export const INTENT_PATH = '.eos/ledger/pending.json';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Write a prepared gate run (prepareGateRun) together with its ledger entry.
 * @returns {{event: object, evidenceSha256: string|null}}
 */
export function recordGateRun(root, { evidence, evidenceFile, event }) {
  if (!evidence || !evidenceFile) {
    // A gate that could not even be evaluated produces no evidence; its entry stands alone.
    return { event: appendEvent(root, { ...event, evidenceSha256: null, detail: '' }), evidenceSha256: null };
  }
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceSha256 = sha256(body);
  return withLedger(root, ({ append }) => {
    writeFileAtomic(join(root, INTENT_PATH), `${JSON.stringify({
      schemaVersion: 1, gate: evidence.gate, scope: evidence.scope, evidenceFile, evidenceSha256, startedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const recorded = append({ ...event, evidenceSha256, detail: evidenceFile });
    writeFileAtomic(join(root, evidenceFile), body);
    try { unlinkSync(join(root, INTENT_PATH)); } catch { /* already gone */ }
    return { event: recorded, evidenceSha256 };
  });
}

/**
 * The state a stopped gate run left behind, if any.
 * @returns {{present:false}|{present:true, interrupted:boolean, intent:object, detail:string}}
 */
export function readIntent(root) {
  const full = join(root, INTENT_PATH);
  if (!existsSync(full)) return { present: false };
  let intent;
  try { intent = JSON.parse(readFileSync(full, 'utf8')); } catch {
    return { present: true, interrupted: true, intent: null, detail: `${INTENT_PATH} is unreadable — a gate run stopped mid-write; re-run the gate you last ran` };
  }
  const evidencePath = join(root, intent.evidenceFile || '');
  const actual = intent.evidenceFile && existsSync(evidencePath) ? sha256(readFileSync(evidencePath, 'utf8')) : null;
  const scope = `${intent.gate} for ${intent.scope?.id}`;
  const rerun = `node .github/eos/eos.mjs check --gate ${intent.gate}${intent.scope?.type && intent.scope.type !== 'product' ? ` --scope ${intent.scope.id}` : ''}`;
  if (actual === intent.evidenceSha256) {
    // Steps 1–3 all happened; only the clean-up did not. Nothing is inconsistent.
    return { present: true, interrupted: false, intent, detail: `a run of ${scope} completed but left its intent record behind — harmless; the next gate run clears it` };
  }
  return {
    present: true, interrupted: true, intent,
    detail: `a run of ${scope} was INTERRUPTED: it was recorded in the ledger but its evidence was never written (the process stopped in between). Nothing was tampered with — re-run it: ${rerun}`,
  };
}
