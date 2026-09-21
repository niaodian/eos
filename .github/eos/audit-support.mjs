// Shared preamble for the audit-regression suites.
//
// WHY THIS FILE EXISTS: the audit regressions used to live in one 1,246-line file. Node's test
// runner parallelises across FILES but runs the tests inside one file sequentially, and these
// tests are dominated by CLI subprocesses (421 spawns, ~31s of the suite's ~40s). One file meant
// one core, so the whole suite was gated by that single file — 38.3s of a 38.7s run.
//
// Splitting the tests across files parallelises them. Everything they share lives here, so the
// split does not duplicate a preamble that would then drift file by file.
export {
  project, write, run, runJson, cleanup, git, commitAll, story, releaseFiles,
  APP_PROJECT, PRD_2AC, baselineFiles, storyFiles, testRun, treeDigest, DISCOVERY_RECORD,
  writeManifest, bindDigests, ARCHITECTURE_RECORD, REQUIREMENTS_RECORD,
  TELEMETRY_MD, TELEMETRY_RECORD, ITERATION_RECORD, REPO_ROOT,
} from './test-support.mjs';
export { computeProductTree, compareProductTree, clearProductTreeCache, isSelfReference } from './lib/product-tree.mjs';
export { emptyDocReason } from './lib/stage-record.mjs';
export { readEvidence, evidenceFreshness } from './lib/evidence.mjs';
export { bmadReadiness, deprecatedMappings, skillRoots } from '../hooks/lib/bmad-runtime.mjs';
export { resolveProjectRoot, foreignProjectReferences, RESOLUTION_ORDER } from './lib/project-context.mjs';
export { producerTrust } from './lib/machine-summary.mjs';
export { parseTraceMatrix } from './lib/gates.mjs';
export { prdAcceptanceCriteria, parseOpsDecision, opsDecisionProblem } from './lib/story.mjs';

import assert from 'node:assert/strict';
import { project, run, storyFiles } from './test-support.mjs';

/** Drive a story all the way to VERIFIED through the real CLI. */
export function verifiedStory(extra = {}) {
  const dir = project(storyFiles(extra), { withHooks: true });
  assert.equal(run(dir, ['check', '--gate', 'story-ready', '--scope', 'STORY-001']).code, 0);
  for (const to of ['IN_REVIEW', 'READY_FOR_DEV', 'IN_DEVELOPMENT', 'READY_FOR_TEST']) {
    assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', to]).code, 0);
  }
  const v = run(dir, ['check', '--gate', 'verified', '--scope', 'STORY-001']);
  assert.equal(v.code, 0, v.out);
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'VERIFIED']).code, 0);
  return dir;
}

export const mergeRefused = (dir, what) => {
  const merge = run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED']);
  assert.equal(merge.code, 1, `MERGED was allowed after ${what}:\n${merge.out}`);
  assert.match(merge.out, /STALE|product tree/i, merge.out);
  return merge.out;
};
