#!/usr/bin/env node
// Plan one run of .github/workflows/eos-release.yml: which track, which release, whether to attest
// and whether to publish. Prints GitHub Actions outputs (key=value lines).
//
// The track comes from the engine (lib/track.mjs) reading the project's own declaration, so the
// workflow never holds a second copy of the rule that decides what a release must carry. (ADR-012)
//
//   node .github/eos/release-plan.mjs >> "$GITHUB_OUTPUT"
//   env: EOS_EVENT, EOS_REF_TYPE, EOS_REF_NAME, EOS_TRACK (auto|standard|regulated),
//        EOS_HEAD_REPO (pull requests), EOS_REPO (owner/name)
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProjectConfig } from '../hooks/lib/project-config.mjs';
import { trackOf, TRACK_NAMES } from './lib/track.mjs';
import { readManifest } from './lib/release.mjs';

/**
 * @returns {{track:string, release:string, manifest:'true'|'false', attest:'true'|'false', publish:'true'|'false', name:string}}
 */
export function planRelease({ root, event, refType, refName, requested = 'auto', headRepo = '', repo = '' }) {
  if (requested !== 'auto' && !TRACK_NAMES.includes(requested)) {
    throw new Error(`unknown track "${requested}" — auto | ${TRACK_NAMES.join(' | ')}`);
  }
  const { config } = loadProjectConfig(root);
  const track = requested === 'auto' ? trackOf(config).name : requested;
  const isTag = event === 'push' && refType === 'tag';
  const release = isTag ? refName : 'dry-run';
  // A pull request from a fork gets no OIDC token, so nothing there can be attested.
  const fork = event === 'pull_request' && !!headRepo && !!repo && headRepo !== repo;
  const project = (repo.split('/')[1] || basename(root)).replace(/[^A-Za-z0-9._-]/g, '-');
  return {
    track,
    release,
    manifest: isTag && readManifest(root, release).manifest ? 'true' : 'false',
    attest: fork ? 'false' : 'true',
    publish: isTag ? 'true' : 'false',
    name: `${project}-${release}`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const plan = planRelease({
    root: process.cwd(),
    event: env.EOS_EVENT || '',
    refType: env.EOS_REF_TYPE || '',
    refName: env.EOS_REF_NAME || '',
    requested: env.EOS_TRACK || 'auto',
    headRepo: env.EOS_HEAD_REPO || '',
    repo: env.EOS_REPO || '',
  });
  for (const [k, v] of Object.entries(plan)) process.stdout.write(`${k}=${v}\n`);
  process.stderr.write(`EOS release plan: ${plan.track} track · release ${plan.release} · attest ${plan.attest} · publish ${plan.publish}\n`);
}
