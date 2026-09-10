// The provider contract — how EOS consults an authority it cannot be.
//
// Two things a program on your laptop cannot know: whether the server enforces branch protection,
// and whether a build really came from the pipeline it claims. EOS reported both honestly as
// BLOCKED / UNVERIFIED and stopped there. An adapter is how a project that CAN reach those
// authorities gets a real answer.
//
// Five rules, from ADR-005, each asserted by the test suite:
//
//   D1  Core never calls this. Adapters live outside Core, are absent by default, and the offline
//       suite exercises them through a deterministic mock.
//   D3  An adapter never handles a credential. It delegates to an already-authenticated CLI, whose
//       token lives in that tool's own store and never enters this process.
//   D4  An adapter is MONOTONIC. Its absence, failure or timeout must leave the verdict no worse
//       than it was with no adapter at all. `resolve()` is what enforces that: a provider can raise
//       a verdict, never lower one.
//   D5  An adapter is READ-ONLY. It asks; it never configures the system that holds EOS accountable.
//   --  A network failure, a permission error or an outage may never become PASS.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../lib/schema.mjs';

export const PROVIDERS_PATH = '.eos/providers.json';

/** Provider verdicts. */
export const PROVIDER_STATUSES = ['ERROR', 'FAIL', 'BLOCKED', 'DEFERRED', 'UNVERIFIED', 'PASS'];

/**
 * D4, stated as simply as it can be: **only a PASS may raise the verdict.**
 *
 * An earlier version ranked the statuses and let any "better" one through, which meant a provider
 * that merely FAILED TO ANSWER (`UNVERIFIED`) could still change the outcome. That is precisely the
 * case the rule exists to prevent: not knowing is not evidence. Everything except PASS is reported
 * and then ignored.
 */
const RAISES = (status) => status === 'PASS';

/**
 * Build a provider result. Every field exists because a bare status is not reviewable: you cannot
 * act on "BLOCKED" without knowing who said so, about what, and when.
 */
export function result({ provider, subject, status, detail, evidenceRef = null, expiry = null, now = new Date() }) {
  if (!PROVIDER_STATUSES.includes(status)) {
    return { provider, subject, status: 'ERROR', detail: `adapter returned an unknown status "${status}"`, checkedAt: now.toISOString(), evidenceRef: null, expiry: null };
  }
  return { provider, subject, status, detail, checkedAt: now.toISOString(), evidenceRef, expiry };
}

/**
 * Apply a provider verdict to the verdict EOS already reached on its own.
 *
 * This function IS rule D4. A provider that is missing, broken, unauthorised or slow leaves
 * `fallback` untouched, so introducing an adapter can never make a project worse off than it was
 * before that adapter existed. It can only turn an honest "I cannot know" into a real answer.
 *
 * @param {{status:string, detail:string}} fallback  what EOS concluded with no provider at all
 * @param {object|null} verdict                      what the provider said, if anything
 */
export function resolve(fallback, verdict) {
  if (!verdict) return { ...fallback, provider: null };
  if (RAISES(verdict.status) && fallback.status !== 'PASS') {
    return {
      status: verdict.status,
      detail: `${verdict.detail} (verified by ${verdict.provider} at ${verdict.checkedAt})`,
      provider: verdict.provider,
      evidenceRef: verdict.evidenceRef,
    };
  }
  // The provider disagrees downward, or could not answer. Report BOTH: the fallback still governs,
  // but hiding a provider's objection would be the "an integration quietly weakened a gate" failure.
  return {
    ...fallback,
    provider: verdict.provider,
    detail: `${fallback.detail} · ${verdict.provider}: ${verdict.status} — ${verdict.detail}`,
  };
}

/**
 * Read the opt-in provider configuration.
 * Absent is normal and silent: no configuration means no adapters, which is the default posture.
 */
export function loadProviders(root) {
  const full = join(root, PROVIDERS_PATH);
  if (!existsSync(full)) return { present: false, providers: [], errors: [] };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, providers: [], errors: [`${PROVIDERS_PATH}: invalid JSON (${e.message})`] };
  }
  let schema;
  try { schema = JSON.parse(readFileSync(join(root, '.eos/schemas/providers.schema.json'), 'utf8')); } catch (e) {
    return { present: true, providers: [], errors: [`.eos/schemas/providers.schema.json is missing or unreadable (${e.message}) — ${PROVIDERS_PATH} cannot be validated`] };
  }
  const v = validate(schema, parsed, { label: PROVIDERS_PATH });
  if (!v.valid) return { present: true, providers: [], errors: v.errors.slice(0, 4) };
  return { present: true, providers: parsed.providers.filter((p) => p.enabled !== false), errors: [] };
}

/** Adapters shipped with EOS. A project selects by id; an unknown id is reported, never guessed. */
const BUILT_IN = {
  'github-governance': () => import('./github-governance.mjs'),
  'github-attestation': () => import('./github-attestation.mjs'),
  mock: () => import('./mock.mjs'),
};

/**
 * Ask the configured provider about one subject.
 *
 * Never throws. An adapter that crashes yields ERROR, which under D4 leaves the fallback in place:
 * a governance tool that can be taken down by a broken integration is not a governance tool.
 *
 * @returns {Promise<object|null>} null when no provider covers this subject
 */
export async function consult(root, subject, { providers = null, now = new Date() } = {}) {
  const configured = providers || loadProviders(root).providers;
  const entry = configured.find((p) => (p.subjects || []).includes(subject));
  if (!entry) return null;
  const load = BUILT_IN[entry.adapter];
  if (!load) {
    return result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: `unknown adapter "${entry.adapter}" (known: ${Object.keys(BUILT_IN).join(', ')})` });
  }
  try {
    const mod = await load();
    const verdict = await mod.check({ root, subject, options: entry.options || {}, now });
    return verdict?.status ? verdict : result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: 'the adapter returned no verdict' });
  } catch (e) {
    return result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: `the adapter failed: ${e.message}` });
  }
}
