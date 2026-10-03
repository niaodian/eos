// verified (G7) — Story is verified by executed tests.
//
// The evaluators of the checks .eos/gates.json lists under this gate, moved here unchanged from the
// single evaluator file. The contract every evaluator keeps is described in ../gate-evaluators.mjs,
// the registry that collects every gate's module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatePolicy, gateInputs, gateCollections, ARTIFACTS } from '../state.mjs';
import { readEvidence, evidenceFreshness } from '../evidence.mjs';
import { currentProductTree } from '../product-tree.mjs';
import { readSummary, summaryTreeMismatch, SUMMARY_PATHS } from '../machine-summary.mjs';
import { beginCapture, finishCapture } from '../test-evidence.mjs';
import { nameOnlyOwnership } from '../test-source.mjs';
import {
  parseTraceMatrix, ok, fail, blocked, na, runProjectGate, refMatches, selectorPresent,
  thresholdMet, repoFileExists, evidenceIntegrity,
} from '../gate-primitives.mjs';

export const evaluators = {
  testsExecuted(ctx) {
    const p = ctx.snapshot.project;
    if (!p) return blocked('.eos/project.json is missing, so there is no test command to execute');
    if (p.projectType === 'config-only') {
      return blocked('this repository declares projectType "config-only" — a story cannot be verified where no product code is declared');
    }
    // With `evidence.junit` declared, the reports must be bracketed by THIS run: what the report
    // locations hold before it is the baseline every report is compared against afterwards.
    const capture = beginCapture(ctx.root, p);
    const r = runProjectGate(ctx);
    if (r.command) ctx.commands.push(r.command);
    if (capture) ctx.junit = finishCapture(ctx.root, capture, { project: p, gateRun: r });
    if (r.status === 'PASS') return ok('the declared quality commands ran and passed');
    if (r.status === 'ERROR') return { status: 'ERROR', detail: r.detail };
    if (r.status === 'BLOCKED') return blocked(`the product-quality gate is BLOCKED: ${r.detail}`);
    if (r.status === 'NOT_APPLICABLE') return blocked('the product-quality gate executed no quality command, so nothing about the product was verified');
    return fail(`the product-quality gate failed (exit ${r.exitCode}): ${r.detail}`);
  },
  traceComplete(ctx) {
    if (!ctx.story) return blocked('no story file');
    const rel = ARTIFACTS.traceMatrix;
    if (!existsSync(join(ctx.root, rel))) return fail(`${rel} does not exist — every acceptance criterion needs a traced, executed test at G7`);
    const rows = parseTraceMatrix(readFileSync(join(ctx.root, rel), 'utf8'));

    // (1) The human mapping: which test is claimed to prove which criterion.
    const missing = ctx.story.acs.filter((a) => !rows.has(a.id)).map((a) => a.id);
    if (missing.length) return fail(`no trace-matrix row for ${missing.join(', ')}`);

    // (2) The machine result. A row ending in "PASS" is a claim; this file is the run. Without it
    //     the gate certifies prose, which is the whole of EOS-AUD-006.
    //     When the project declares its JUnit reports, this gate run just derived the file from
    //     them (testsExecuted). If that could not happen, the summary on disk is from another run,
    //     and reading it anyway would be exactly the freshness gap the declaration closes.
    if (ctx.junit && ctx.junit.status !== 'WRITTEN') {
      return { status: ctx.junit.status === 'SKIPPED' ? 'FAIL' : ctx.junit.status, detail: `test results from JUnit (evidence.junit): ${ctx.junit.detail}` };
    }
    const run = readSummary(ctx.root, 'testRun');
    if (run.errors.length) return { status: 'ERROR', detail: `${run.path}: ${run.errors.join('; ')}` };
    if (!run.present) {
      return fail(`${SUMMARY_PATHS.testRun} does not exist — a hand-written PASS in ${rel} is a claim, not a result. Emit the machine test-run summary from your runner (see docs/eos/examples/trace-evidence/).`);
    }
    const tree = currentProductTree(ctx.root);
    const mismatch = summaryTreeMismatch(run.data, tree.identity?.digest || null);
    // Nothing is WRONG with these results — they describe other code. That is staleness, and
    // reporting it as a failure would send a developer to debug a passing suite.
    if (mismatch) {
      return {
        status: 'STALE',
        detail: `${run.path} does not describe this code: ${mismatch}. Re-run the tests so the runner regenerates it, then re-run this gate.`,
      };
    }

    const byAc = new Map();
    for (const r of run.data.results) {
      if (!byAc.has(r.ac)) byAc.set(r.ac, []);
      byAc.get(r.ac).push(r);
    }

    const problems = [];
    for (const ac of ctx.story.acs) {
      const row = rows.get(ac.id);
      const executed = byAc.get(ac.id) || [];
      if (!executed.length) { problems.push(`${ac.id}: no executed test result in ${run.path}`); continue; }
      const failed = executed.filter((r) => r.status !== 'PASS');
      if (failed.length) { problems.push(`${ac.id}: ${failed.map((f) => `${f.testPath}${f.selector ? `::${f.selector}` : ''} ${f.status}${f.detail ? ` (${f.detail})` : ''}`).join(', ')}`); continue; }
      // (3) The test file must EXIST. A trace row pointing at a path that was never written is the
      //     cheapest possible fake, and a summary can name it just as cheaply.
      for (const r of executed) {
        if (!repoFileExists(ctx.root, r.testPath)) { problems.push(`${ac.id}: the executed test path "${r.testPath}" does not exist inside this repository`); continue; }
        // (4) The selector must belong to the file. A JUnit report that records only the name is
        //     settled from the source (declared there, and in no other test file); a summary the
        //     project wrote itself is held to the best-effort substring check.
        if (r.selector && r.match === 'name') {
          const owned = nameOnlyOwnership(ctx.root, r.testPath, r.selector);
          if (!owned.ok) problems.push(`${ac.id}: ${owned.detail}`);
        } else if (r.selector && !selectorPresent(ctx.root, r.testPath, r.selector)) {
          problems.push(`${ac.id}: "${r.selector}" was reported as executed but does not appear in ${r.testPath}`);
        }
      }
      // (5) The human row and the machine result must agree on WHICH test proves the criterion.
      // A row that names a selector must be answered by a result that HAS one: accepting a
      // selector-less result would let one coarse "the file ran" stand in for every criterion in it.
      const namedSelectors = row.testRefs.filter((ref) => ref.includes('::'));
      if (namedSelectors.length && executed.some((r) => !r.selector)) {
        problems.push(`${ac.id}: ${rel} names a specific test but the recorded result has no selector`);
      }
      if (row.testRefs.length && !row.testRefs.some((ref) => executed.some((r) => refMatches(ref, r)))) {
        problems.push(`${ac.id}: ${rel} points at ${row.testRefs.join(' / ')} but the executed test was ${executed.map((r) => r.testPath).join(', ')}`);
      }
      if (!row.testRefs.length) problems.push(`${ac.id}: the ${rel} row names no test file — a trace row without a test reference proves nothing`);
    }
    return problems.length
      ? fail(`trace evidence incomplete: ${problems.slice(0, 4).join(' · ')}${problems.length > 4 ? ` · +${problems.length - 4} more` : ''}`)
      : ok(`${ctx.story.acs.length} criteria traced to executed, passing tests (run ${run.data.runId || run.data.generatedAt}${run.data.source?.format === 'junit' ? `, derived from ${run.data.source.reports.length} JUnit report(s)` : ''}${ctx.junit?.unchanged ? '; this run reproduced it exactly' : ''})`);
  },
  evalThreshold(ctx) {
    if (!ctx.snapshot.agentic) return na('this product is not declared agentic');
    if (!ctx.snapshot.artifacts.evalPlan) return fail('docs/eval-plan.md is missing — an agentic product cannot be verified without an eval design (/eos-eval-spec)');
    if (!ctx.snapshot.project?.commands?.eval) return fail('.eos/project.json declares an agentic product but has no commands.eval — G-EVAL cannot be proven');
    const testsRan = ctx.results.find((c) => c.id === 'tests-executed');
    if (!testsRan || testsRan.status === 'PENDING') return { status: 'PENDING', detail: 'the eval command runs as part of the product-quality gate; run this gate to execute it' };
    if (testsRan.status !== 'PASS') return blocked('the eval result is unknown because the product-quality gate did not complete');

    // Exit code 0 says a process ended, not that a threshold was met. The summary says which
    // prompt / model / dataset / grader produced which number against which threshold.
    const summary = readSummary(ctx.root, 'evalSummary');
    if (summary.errors.length) return { status: 'ERROR', detail: `${summary.path}: ${summary.errors.join('; ')}` };
    if (!summary.present) {
      return fail(`the eval command exited 0 but ${SUMMARY_PATHS.evalSummary} does not exist — exit code 0 is not a met threshold. Make commands.eval write the machine summary (see docs/eos/examples/eval-starter/).`);
    }
    const tree = currentProductTree(ctx.root);
    const mismatch = summaryTreeMismatch(summary.data, tree.identity?.digest || null);
    if (mismatch) return { status: 'STALE', detail: `${summary.path} does not describe this system: ${mismatch}` };

    const failed = summary.data.cases.filter((c) => c.status !== 'PASS' || !thresholdMet(c));
    if (failed.length) {
      return fail(`eval case(s) below threshold: ${failed.map((c) => `${c.id} ${c.metric} ${c.observed} vs ${c.comparator || '>='} ${c.threshold}${c.status === 'PASS' ? ' (reported PASS — the numbers say otherwise)' : ''}`).join('; ')}`);
    }

    // Every eval case the story declares must appear in the summary — otherwise "all cases passed"
    // can be satisfied by reporting one trivial case and omitting the rest.
    const declared = new Set((ctx.story?.acs || []).flatMap((a) => (a.evalCase.match(/EVAL-\d+/gi) || []).map((s) => s.toUpperCase())));
    const reported = new Set(summary.data.cases.map((c) => c.id.toUpperCase()));
    const absent = [...declared].filter((id) => !reported.has(id));
    if (absent.length) return fail(`the story declares eval case(s) the summary does not report: ${absent.join(', ')}`);

    const s = summary.data.subject;
    return ok(`${summary.data.cases.length} eval case(s) met their threshold (${s.model}${s.modelVersion ? `@${s.modelVersion}` : ''} · ${s.datasetRef} · ${s.graderRef})`);
  },
  evidenceCurrent(ctx) {
    if (gatePolicy(ctx.snapshot, ctx.changeType, 'story-ready') === 'not_applicable') return na('story readiness does not apply to this change type');
    const prior = readEvidence(ctx.root, 'story-ready', 'story', ctx.scopeId);
    if (prior.error) return { status: 'ERROR', detail: prior.error };
    if (!prior.present) return fail(`no story-ready evidence for ${ctx.scopeId} — run \`eos check --gate story-ready --scope ${ctx.scopeId}\` first`);
    const tampered = evidenceIntegrity(ctx.snapshot, prior.evidence);
    if (tampered.length) return { status: 'ERROR', detail: `the story-ready evidence is not trustworthy: ${tampered.join('; ')}` };
    const def = ctx.snapshot.gates?.gates.find((g) => g.id === 'story-ready');
    const f = evidenceFreshness(ctx.root, prior.evidence, {
      gateDefinition: def,
      expectedInputs: gateInputs(ctx.snapshot, 'story-ready', 'story', ctx.scopeId),
      collections: gateCollections(ctx.snapshot, 'story-ready', 'story', ctx.scopeId),
    });
    if (f.status === 'STALE') {
      // Name the command that actually clears this: re-running THIS gate cannot refresh the
      // PREREQUISITE gate's evidence, and sending the developer round that loop is the exact
      // "you are blocked but not told what to do" failure this layer exists to remove.
      return {
        status: 'STALE',
        detail: `the story-ready evidence is stale: ${f.reasons.join('; ')} — re-run story-ready first, then this gate`,
        command: `node .github/eos/eos.mjs check --gate story-ready --scope ${ctx.scopeId} && node .github/eos/eos.mjs check --gate verified --scope ${ctx.scopeId}`,
      };
    }
    if (prior.evidence.status !== 'PASS' && prior.evidence.status !== 'WAIVED') {
      return fail(`story-ready is ${prior.evidence.status} for ${ctx.scopeId} — a story cannot be verified before it was ready`);
    }
    return ok('the prerequisite story-ready evidence is present and fresh');
  },

  /**
   * The identity of what was tested. Without this the whole `verified` gate asserts only "some
   * commands exited 0 at some point", which a later rewrite of the source silently invalidates
   * while every recorded hash keeps matching. (EOS-AUD-001)
   */
  productTreeBound(ctx) {
    const current = currentProductTree(ctx.root);
    if (!current.available) return blocked(`${current.reason} — run this gate inside a git repository`);
    ctx.productTree = current.identity;
    return ok(`bound to ${current.identity.fileCount} product file(s) · ${current.identity.digest.slice(0, 12)}`);
  },
};
