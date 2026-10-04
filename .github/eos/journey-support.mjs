// Shared by the eos-2.6.0 release journeys (journey-solo / journey-deferral): a merged story and a release
// candidate whose only NFR target is deferred, driven through the real CLI.
import assert from 'node:assert/strict';
import { write, run, releaseFiles, writeManifest, treeDigest, APP_PROJECT } from './test-support.mjs';
import { verifiedStory } from './audit-support.mjs';

export const SOLO = { EOS_ACTOR: 'solo-dev' };
export const deferralSummary = (dir, dueBy) => ({
  schemaVersion: 1, generatedAt: '2026-01-01T00:00:00.000Z', productTree: { digest: treeDigest(dir) },
  targets: [{ id: 'NFR1', category: 'availability', decision: 'DEFER', owner: '@platform', trigger: 'the first full month in production', dueBy }],
});
/** A merged story, a release candidate whose only NFR is deferred, ready for `verify-release`. */
export function candidate(projectExtra, dueBy) {
  const dir = verifiedStory(releaseFiles({ '.eos/project.json': { ...APP_PROJECT, commands: { test: 'node --version', audit: 'node --version' }, ...projectExtra } }));
  assert.equal(run(dir, ['transition', '--scope', 'story', '--id', 'STORY-001', '--to', 'MERGED'], SOLO).code, 0);
  write(dir, 'docs/evidence/nfr-summary.json', deferralSummary(dir, dueBy));
  writeManifest(dir, { releaseId: 'R-1' });
  assert.equal(run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', 'CANDIDATE'], SOLO).code, 0);
  run(dir, ['verify-release', '--release', 'R-1'], SOLO);
  return dir;
}
export const toState = (dir, to) => run(dir, ['transition', '--scope', 'release', '--id', 'R-1', '--to', to], SOLO);

