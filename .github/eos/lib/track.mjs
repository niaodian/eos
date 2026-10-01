// The governance track a project is on (ADR-012).
//
// Two tracks, derived rather than declared. A project is on the Regulated track exactly when it
// declares the compliance boundary (`complianceProfile: "regulated"`), which the `regulated`
// workflow profile already requires (1.21). A separate `track` property would be a third
// declaration that could disagree with the two that decide what is enforced.
//
// What a track changes is the RELEASE: Standard never blocks on a missing signature or missing
// provenance, and verifies them whenever they are present; Regulated requires them.

export const TRACKS = {
  standard: {
    name: 'standard',
    title: 'Standard',
    summary: 'zero-cost and non-blocking — signatures and provenance are verified when present, never required',
    releaseRequires: [
      'the release gate re-runs your declared quality commands on the candidate commit',
      'a signed manifest and attested provenance are optional: verified when present, never required',
    ],
  },
  regulated: {
    name: 'regulated',
    title: 'Regulated',
    summary: 'strict and blocking — a release needs a signed manifest, CI-produced evidence and bound provenance',
    releaseRequires: [
      'a release manifest signed with the project\'s release key (`eos release sign`)',
      'release evidence produced in CI (evidencePolicy "ci" or "attested"), never on a laptop',
      'provenance for every shipped artifact, bound to the manifest (artifact attestations / SLSA)',
    ],
  },
};

export const TRACK_NAMES = Object.keys(TRACKS);

/** The track a declaration puts a project on. No declaration is Standard: nothing is regulated by accident. */
export const trackOf = (project) => (project?.complianceProfile === 'regulated' ? TRACKS.regulated : TRACKS.standard);

/** The machine-readable form `status --json` and `next --json` carry. */
export function trackSummary(snapshot) {
  const t = trackOf(snapshot.project);
  return { name: t.name, title: t.title, profile: snapshot.profileName || null, summary: t.summary, releaseRequires: t.releaseRequires };
}

/**
 * Put a starter-pack declaration on a track. The track decides the compliance fields; everything
 * else (stacks, commands) stays what the pack says.
 */
export function applyTrack(declaration, trackName) {
  const d = { ...declaration };
  if (trackName === 'regulated') {
    d.workflowProfile = 'regulated';
    d.complianceProfile = 'regulated';
    if (!d.evidencePolicy || d.evidencePolicy === 'local') { d.evidencePolicy = 'ci'; delete d.evidencePolicyReason; }
  } else if (trackName === 'standard') {
    delete d.complianceProfile;
    delete d.evidencePolicy;
    delete d.evidencePolicyReason;
    if (d.workflowProfile === 'regulated') d.workflowProfile = 'standard-product';
  }
  return d;
}
