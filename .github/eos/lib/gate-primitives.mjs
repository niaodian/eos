// Gate primitives — the vocabulary every evaluator is written in.
//
// Split out of gates.mjs, which had grown to 1,303 lines holding three different kinds of thing:
// the vocabulary (statuses, result constructors, file and command helpers), the 58 rules written in
// that vocabulary, and the orchestration that runs them and records evidence. Reading any one of
// them meant scrolling past the other two.
//
// Nothing here knows what a gate IS. It knows how to express a verdict, how to reach a file without
// escaping the repository, and how to run a hook — which is why it can be imported by both the
// evaluators and the engine without a cycle.
//
// The two rules that govern everything downstream:
//   1. A missing tool, an unreadable file, a crashed validator or "there are no tests" is BLOCKED
//      or ERROR — never PASS. Absence of proof is never proof.
//   2. Evidence is only meaningful while its inputs are unchanged.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, isAbsolute, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectStacks } from '../../hooks/lib/project-config.mjs';
import { loadComplianceProfile, evaluateDataBoundary } from '../../hooks/lib/compliance-profile.mjs';
import { EVALUATOR_VERSION, posix, WORKFLOW_PATH } from './registry.mjs';
import { gatePolicy, changeTypeOf, scopeState, gateInputs, gateCollections, ARTIFACTS } from './state.mjs';
import { hashInputs, GOVERNANCE_INPUTS, writeEvidence, readEvidence, evidenceFreshness, evidenceFile, sha256File } from './evidence.mjs';
import { currentProductTree, compareProductTree, uncommittedProductChanges } from './product-tree.mjs';
import { readSummary, summaryTreeMismatch, producerTrust, SUMMARY_PATHS } from './machine-summary.mjs';
import { readStageRecord, emptyDocReason, decisionProblem, openBlockers, substantive, STAGE_RECORDS } from './stage-record.mjs';
import { readManifest, manifestProblems, manifestPath } from './release.mjs';
import { resolve as applyProviderVerdict } from '../adapters/contract.mjs';
import { lastGateEvent } from './ledger.mjs';
import { findWaiver, expiredWaivers } from './waivers.mjs';
import { AC_ID, opsDecisionProblem } from './story.mjs';

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'PENDING', 'WAIVED', 'NOT_APPLICABLE', 'STALE', 'DEFERRED', 'ERROR'];
export const SEVERITY = { ERROR: 7, BLOCKED: 6, FAIL: 5, STALE: 4, DEFERRED: 3, PENDING: 2, WAIVED: 1, NOT_APPLICABLE: 0, PASS: 0 };
// An unrecognised status must be treated as the WORST case, never as "not blocking": a stored
// `status: "failed"` must not slip through because it is not spelled the way we expect.
export const isBlocking = (s) => !['PASS', 'WAIVED', 'NOT_APPLICABLE', 'PENDING'].includes(s);

/** Checks that shell out to another process. They are skipped (→ PENDING) in "cheap" mode. */
export const EXPENSIVE = new Set(['tests-executed', 'eval-threshold', 'spec-alignment', 'secret-scan', 'candidate-quality', 'dependency-audit']);

export const ok = (detail = '', artifact = null) => ({ status: 'PASS', detail, artifact });
export const fail = (detail, artifact = null) => ({ status: 'FAIL', detail, artifact });
export const blocked = (detail, artifact = null) => ({ status: 'BLOCKED', detail, artifact });
export const na = (detail, artifact = null) => ({ status: 'NOT_APPLICABLE', detail, artifact });
// A check that depends on a record another check already reported as missing has not FAILED — it
// has not run. Reporting it as BLOCKED would make it outrank the real cause in `eos next`.
export const awaiting = (path) => ({ status: 'PENDING', detail: `waiting on ${path} (the record check above explains what is missing)`, artifact: path });

/**
 * Is this reference a real, repository-relative path INSIDE the repository?
 * A `../` (or absolute, or symlinked-out) reference would let a file that is not part of the
 * product — and therefore not covered by the product-tree identity or by git history — satisfy an
 * existence check. Containment is verified after resolving symlinks, so a link out is caught too.
 */
export function insideRepo(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return false;
  if (isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) return false;
  const full = resolve(root, rel);
  const base = (() => { try { return realpathSync(root); } catch { return resolve(root); } })();
  const real = (() => { try { return realpathSync(full); } catch { return full; } })();
  return real === base || real.startsWith(base + sep);
}

/** Existence that cannot be satisfied from outside the repository. */
export const repoFileExists = (root, rel) => insideRepo(root, rel) && existsSync(join(root, rel));

// The always-on rule that tells every later agent how to build and test this project, and the
// marker the template ships so "we never chose a stack" is visible instead of silently defaulting.
export const WORKSPACE_RULE = '.github/instructions/00-workspace.instructions.md';
export const PROVISIONAL_STACK = /⛳\s*PROVISIONAL/;

/** Run a bundled validator, recording the real argv + exit code into the evidence. */
export function runHook(ctx, relScript, args = []) {
  const full = join(ctx.root, relScript);
  if (!existsSync(full)) return { status: 'BLOCKED', detail: `${relScript} is not present in this repository — the check cannot be proven`, command: null };
  const argv = [process.execPath, full, ...args];
  const r = spawnSync(argv[0], argv.slice(1), { cwd: ctx.root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const command = { argv: [posix(relScript), ...args], exitCode: r.status ?? null, detail: out.split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 400) };
  if (r.error) return { status: 'ERROR', detail: `${relScript} could not be executed: ${r.error.message}`, command };
  return { status: r.status === 0 ? 'PASS' : 'FAIL', detail: command.detail, out, command, exitCode: r.status };
}

/**
 * A path-looking token, optionally followed by `::selector`. The selector may contain spaces (test
 * names usually do), so it runs to the end of the cell rather than to the first space.
 */
export const TEST_REF = /(?:^|[\s(`"'])((?:[A-Za-z0-9_.@-]+\/)*[A-Za-z0-9_.@-]+\.[A-Za-z0-9]{1,10})(?:::([^|`"')]+))?/g;

/**
 * Parse docs/trace-matrix.md into `AC id → { testRefs, resultCell }`.
 * Only the human MAPPING is taken from here. Whether the test passed is read from the machine
 * summary, because this file is prose and prose is what a gate must not be talked past.
 */
export function parseTraceMatrix(text) {
  const rows = new Map();
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (cells.length < 2 || !AC_ID.test(cells[0])) continue;
    const testRefs = [];
    for (const cell of cells.slice(1)) {
      for (const m of cell.matchAll(TEST_REF)) testRefs.push(m[2] ? `${m[1]}::${m[2].trim()}` : m[1]);
    }
    rows.set(cells[0], { testRefs: [...new Set(testRefs)], resultCell: cells.at(-1) });
  }
  return rows;
}

/** A matrix reference matches a result when the file path agrees (and the selector, if given). */
export function refMatches(ref, result) {
  const [refPath, refSelector] = ref.split('::');
  if (posix(refPath) !== posix(result.testPath)) return false;
  if (!refSelector) return true;
  if (!result.selector) return false;
  return result.selector.includes(refSelector) || refSelector.includes(result.selector);
}
/** Best-effort selector verification: only decisive when the test file is readable text. */
export function selectorPresent(root, testPath, selector) {
  let text;
  try { text = readFileSync(join(root, testPath), 'utf8'); } catch { return true; }
  if (/\u0000/.test(text.slice(0, 4096))) return true; // binary — nothing to verify against
  const needle = selector.trim();
  if (!needle) return true;
  if (text.includes(needle)) return true;
  // Runners report ids like `suite > case` or `Class::method`; any segment appearing verbatim is
  // enough to prove the reference is not invented.
  return needle.split(/\s*(?:>|::|#|\.|\/)\s*/).filter((p) => p.length >= 3).some((p) => text.includes(p));
}

// ------------------------------------------------------------------ activation (G0)

/** The human document + the machine record must BOTH be real. Shared by G1/G2/G4/G9. */
export function stageDocCheck(ctx, kind, minWords) {
  const spec = STAGE_RECORDS[kind];
  const docProblem = emptyDocReason(ctx.root, spec.doc, { minWords });
  if (docProblem) return fail(`${docProblem} — run ${spec.prompt}`, spec.doc);
  const r = readStageRecord(ctx.root, kind);
  if (r.errors.length) return { status: 'ERROR', detail: r.errors.join('; '), artifact: spec.path };
  if (!r.present) {
    return fail(`${spec.doc} exists but ${spec.path} does not. Markdown is what people read; the record is what promotes — a gate that reads only prose can be talked past. Run ${spec.prompt}.`, spec.path);
  }
  return ok(`${spec.doc} is written and ${spec.path} validates`, spec.path);
}

export const duplicates = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

/**
 * The stories THIS release ships, per its manifest. `null` means the manifest check above already
 * reported why it could not be read — this check has not failed, it has not run.
 */
export function manifestStories(ctx) {
  const r = ctx.manifest ? { manifest: ctx.manifest } : readManifest(ctx.root, ctx.scopeId);
  if (!r.manifest) return null;
  const known = new Map(ctx.snapshot.stories.map((s) => [s.id, s]));
  return r.manifest.includedStories.map((id) => known.get(id)).filter(Boolean);
}

/**
 * Recompute a reported verdict from its own numbers. A summary that says `"status": "PASS"` beside
 * `observed: 0.41, threshold: 0.9` is asserting a conclusion its data contradicts — and a gate that
 * reads the conclusion instead of the data is back to trusting a claim.
 */
export function thresholdMet({ observed, threshold, comparator = '>=' }) {
  if (typeof observed !== 'number' || typeof threshold !== 'number') return false;
  switch (comparator) {
    case '>': return observed > threshold;
    case '<=': return observed <= threshold;
    case '<': return observed < threshold;
    case '==': return observed === threshold;
    case '>=': default: return observed >= threshold;
  }
}

/** Decision records, read once per evaluation. */
export function listAdrs(root) {
  const dir = join(root, 'docs/adr');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    try { out.push({ name, path: `docs/adr/${name}`, text: readFileSync(join(dir, name), 'utf8') }); } catch { /* unreadable */ }
  }
  return out;
}

/** An ADR that still says TBD / <fill in> has not decided anything. */
export const decisionIsPlaceholder = (text) => {
  const body = text.replace(/^---[\s\S]*?---/, '').trim();
  if (body.length < 120) return true;
  return /\b(TBD|TODO|FIXME|【[^】]*】|<[a-z-]{3,}>|\bfill in\b)/i.test(body);
};

export const isRegulated = (ctx) => {
  if (ctx.snapshot.project?.complianceProfile === 'regulated') return true;
  const profile = loadComplianceProfile(ctx.root);
  return !!profile.profile?.regulated;
};

/**
 * Execute a declared project command for a gate. Distinguishes "could not run" (missing binary)
 * and "could not reach the network" from "reported findings" — collapsing them would turn an
 * offline machine into a green supply chain.
 */
export function runCommandList(ctx, step, argvList) {
  let last = { status: 'PASS', detail: '', exitCode: 0, offline: false };
  for (const argv of argvList) {
    const r = spawnSync(argv[0], argv.slice(1), { cwd: ctx.root, encoding: 'utf8' });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    const detail = out.split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 400);
    ctx.commands.push({ argv, exitCode: r.status ?? null, detail });
    if (r.error) return { status: 'BLOCKED', detail: `${argv[0]}: ${r.error.message}`, exitCode: null, offline: false };
    if (r.status !== 0) {
      const offline = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|offline|getaddrinfo|proxy/i.test(out);
      return { status: 'FAIL', detail, exitCode: r.status, offline };
    }
    last = { status: 'PASS', detail, exitCode: 0, offline: false };
  }
  return last;
}

export function aggregate(results) {
  if (!results.length) return 'ERROR';
  if (results.some((r) => !STATUSES.includes(r.status))) return 'ERROR';
  const worst = results.reduce((acc, r) => (SEVERITY[r.status] > SEVERITY[acc] ? r.status : acc), 'PASS');
  if (worst === 'PASS' && results.every((r) => r.status === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return worst;
}


/**
 * Evidence integrity. The evidence file is an ordinary file: editing one word in a genuine one
 * would otherwise grant a promotion, because every input hash still matches (no input changed).
 * Two cheap cross-checks close that, using data that already exists:
 *   (a) the top-level status must be what its own checks aggregate to;
 *   (b) it must agree with the hash-chained ledger, which recorded the same run and cannot be
 *       edited without breaking the chain.
 * @returns {string[]} problems (empty = consistent)
 */
export function evidenceIntegrity(snapshot, evidence) {
  const problems = [];
  const recomputed = aggregate(evidence.checks || []);
  const waived = evidence.status === 'WAIVED';
  if (!waived && recomputed !== evidence.status) {
    problems.push(`the recorded status "${evidence.status}" is not what its own checks aggregate to ("${recomputed}") — this file was edited by hand`);
  }
  if (waived && !isBlocking(recomputed) && recomputed !== 'PENDING') {
    problems.push(`recorded as WAIVED although its checks aggregate to "${recomputed}" — a waiver only applies to a failing gate`);
  }
  const event = lastGateEvent(snapshot.events, evidence.scope.type, evidence.scope.id, evidence.gate);
  if (!event) {
    problems.push(`the append-only ledger has no record of ${evidence.gate} running for ${evidence.scope.id} — evidence without a ledger entry is not proof`);
  } else if (event.status !== evidence.status) {
    problems.push(`the ledger recorded ${evidence.gate} as ${event.status} but this file claims ${evidence.status} — the ledger is hash-chained and wins`);
  } else if (event.evidenceSha256) {
    // Content binding: without this, an attacker holding one genuine PASS could regress the
    // artifact and recompute a single input hash, leaving every other assertion satisfied.
    const digest = sha256File(snapshot.root, evidenceFile(evidence.gate, evidence.scope.type, evidence.scope.id));
    if (digest !== event.evidenceSha256) {
      problems.push(`the evidence file has changed since the ledger recorded it (the chain pins its digest) — re-run the gate instead of editing the file`);
    }
  }
  return problems;
}

