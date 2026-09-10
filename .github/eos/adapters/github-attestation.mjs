// GitHub attestation adapter — did this artifact really come from the build it claims?
//
// `producer: "ci"` in a machine summary is a string someone can type. `attestation` carries a
// reference to provenance, but a reference is not a verification: EOS Core deliberately verifies
// nothing itself, because a trust mechanism the offline suite cannot exercise would look like a
// control and behave like a decoration. This adapter is the thing that actually checks.
//
// It obeys the same boundary rules as the governance adapter: it delegates authentication to `gh`
// (D3), it only reads (D5), and every failure leaves EOS's own verdict untouched (D4).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { result } from './contract.mjs';

const PROVIDER = 'github-attestation';

export async function check({ root, subject, options, now }) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const artifact = options.artifact || null;
  const owner = options.owner || null;

  if (!artifact) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now,
      detail: 'no artifact is configured for this provider — set options.artifact to the file or image digest whose provenance should be verified' });
  }
  // A path is verified as a file; anything else is treated as an OCI reference.
  const isPath = !artifact.includes('://') && !artifact.includes('@sha256:');
  if (isPath && !existsSync(join(root, artifact))) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: `the configured artifact ${artifact} does not exist here` });
  }

  const args = ['attestation', 'verify', isPath ? join(root, artifact) : artifact];
  if (owner) args.push('--owner', owner);
  if (options.repo) args.push('--repo', options.repo);

  const r = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs });
  if (r.error) {
    const why = r.error.code === 'ENOENT'
      ? 'the GitHub CLI (`gh`) is not installed'
      : r.error.code === 'ETIMEDOUT' ? `\`gh attestation verify\` timed out after ${timeoutMs}ms` : r.error.message;
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: why });
  }
  const out = ((r.stdout || '') + (r.stderr || '')).trim();

  if (r.status === 0) {
    return result({ provider: PROVIDER, subject, status: 'PASS', now, evidenceRef: artifact,
      detail: `provenance for ${artifact} verified${owner ? ` against owner ${owner}` : ''}` });
  }
  // "No attestation exists" and "the attestation does not match" are VERIFIED negatives — the
  // authority answered, and the answer was no.
  if (/no attestation|failed to verify|verification failed|does not match/i.test(out)) {
    return result({ provider: PROVIDER, subject, status: 'FAIL', now, evidenceRef: artifact,
      detail: `provenance for ${artifact} could not be established: ${out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 160)}` });
  }
  if (/not logged|authentication|gh auth login/i.test(out)) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: 'the GitHub CLI is not authenticated (`gh auth login`)' });
  }
  if (/unknown command|unknown flag/i.test(out)) {
    return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now, detail: 'this version of the GitHub CLI has no `attestation verify` command — upgrade `gh`' });
  }
  // Everything else is "I could not find out": never a pass, never a new blocker.
  return result({ provider: PROVIDER, subject, status: 'UNVERIFIED', now,
    detail: out.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 160) || `gh exited ${r.status}` });
}
