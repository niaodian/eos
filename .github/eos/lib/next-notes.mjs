// What `eos next` says besides the one recommended action (eos-2.6.0).
//
// The card names one next step. Four things a developer would otherwise learn the hard way are said
// next to it, once each and only when they apply, without changing which action is recommended:
//   - the repository is not activated: nothing enforces these gates yet (`/eos-init`);
//   - an ADR for an irreversible decision is still "proposed": a person confirms it before release;
//   - an NFR has a scale condition: build the dataset and measure from the first story that touches it;
//   - (the release-time notes live in the router: freeze first, the deferred list, G9 / G10 after release.)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStageRecord } from './stage-record.mjs';
import { readAdrConfirmation, oneWayDoors } from './adr.mjs';
import { SUMMARY_PATHS } from './machine-summary.mjs';

const CLI = 'node .github/eos/eos.mjs';

/** Unchecked items of docs/eos/activation.md, or null when the project has not declared itself yet. */
function pendingActivation(snapshot) {
  const p = snapshot.project;
  if (!p || p.templateDefault) return null;
  const ledger = join(snapshot.root, 'docs/eos/activation.md');
  if (!existsSync(ledger)) return ['docs/eos/activation.md is missing'];
  return readFileSync(ledger, 'utf8').split('\n').map((ln) => ln.match(/^\s*-\s*\[ \]\s+(.*\S)/)?.[1]?.trim()).filter(Boolean);
}

/** NFRs whose target is stated at a size — "p95 ≤ 500 ms at 100k rows" — and so cannot be measured on an empty database. */
function scaleConditions(snapshot) {
  const req = readStageRecord(snapshot.root, 'requirements');
  const SCALE = /\b(?:at|with|under|over|for)\b[^.;]*\d|\d[\d,.]*\s?(?:k|m|万|千)?\s?(?:rows|records|users|requests|rps|qps|concurrent|items|events|条|并发|用户)/i;
  return (req.data?.nfr || [])
    .filter((n) => ['performance', 'scalability', 'availability'].includes(n.category) && SCALE.test(`${n.target || ''} ${n.statement || ''}`))
    .map((n) => `${n.id} (${(n.target || n.statement).slice(0, 80)})`);
}

/**
 * @returns {{lines: string[], json: object}}
 */
export function nextNotes(snapshot, decision) {
  const lines = [];
  const json = {};

  const pending = pendingActivation(snapshot);
  if (pending?.length) {
    json.activation = { pending: pending.length, command: '/eos-init' };
    lines.push('', 'Not activated yet',
      `  Nothing enforces these gates until the one-time hardening is done: ${pending.length} item(s) pending in docs/eos/activation.md.`,
      '  Run /eos-init first — branch protection, CODEOWNERS, the approval baseline — and note which steps need a second person (or a solo --self).');
  }

  const arch = readStageRecord(snapshot.root, 'architecture');
  const proposed = arch.data
    ? oneWayDoors(arch.data).filter((d) => readAdrConfirmation(snapshot.root, d.adr).status === 'proposed').map((d) => `${d.key} (${d.adr})`)
    : [];
  if (proposed.length) {
    json.oneWayDoors = { proposed };
    lines.push('', 'Awaiting a person',
      `  ${proposed.length} irreversible decision(s) are still "proposed": ${proposed.join(', ')}.`,
      '  Read each ADR, set "Status: accepted", add "Confirmed by" and "Confirmed at", and commit — release-ready will not pass without it.');
  }

  const scope = decision.current;
  const early = scope?.scopeType === 'story' && ['DRAFT', 'IN_REVIEW', 'READY_FOR_DEV'].includes(scope.state);
  if (early && !existsSync(join(snapshot.root, SUMMARY_PATHS.nfrSummary))) {
    const scale = scaleConditions(snapshot);
    if (scale.length) {
      json.nfrScale = scale;
      lines.push('', 'Start measuring now',
        `  ${scale.join('; ')} ${scale.length === 1 ? 'is' : 'are'} stated at a scale. Build that dataset into the first story that touches it and measure there:`,
        `  found at release, a miss costs another merge and a re-verification of every story. (${CLI} status lists the release checks)`);
    }
  }
  return { lines, json };
}
