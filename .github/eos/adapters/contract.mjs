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
import { validate, loadSchema } from '../lib/schema.mjs';

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
export function result({ provider, subject, status, detail, evidenceRef = null, expiry = null, transient = false, now = new Date() }) {
  if (!PROVIDER_STATUSES.includes(status)) {
    return { provider, subject, status: 'ERROR', detail: `adapter returned an unknown status "${status}"`, checkedAt: now.toISOString(), evidenceRef: null, expiry: null, transient: false };
  }
  return { provider, subject, status, detail, checkedAt: now.toISOString(), evidenceRef, expiry, transient };
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
  if (!verdict) return { ...fallback, provider: null, verification: 'LOCAL' };
  if (RAISES(verdict.status) && fallback.status !== 'PASS') {
    return {
      status: verdict.status,
      detail: `${verdict.detail} (verified by ${verdict.provider} at ${verdict.checkedAt})`,
      provider: verdict.provider,
      evidenceRef: verdict.evidenceRef,
      // An explicit marker, not an inference from a prose suffix. A PASS that only exists because
      // something outside this machine said so is a materially different claim from one EOS proved
      // offline: it is exactly as durable as that external authority, and an auditor reading the
      // record has to be able to tell the two apart without parsing English.
      verification: 'REMOTE_VERIFIED',
      checkedAt: verdict.checkedAt,
    };
  }
  // The provider disagrees downward, or could not answer. Report BOTH: the fallback still governs,
  // but hiding a provider's objection would be the "an integration quietly weakened a gate" failure.
  return {
    ...fallback,
    provider: verdict.provider,
    verification: 'LOCAL',
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
  const { schema, error: schemaError } = loadSchema(root, 'providers.schema.json');
  if (!schema) {
    return { present: true, providers: [], errors: [`${schemaError} — ${PROVIDERS_PATH} cannot be validated`] };
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
 * Consecutive transient failures per adapter, for this process only.
 *
 * A gate run consults the same provider once per subject. With an unreachable authority and a 10s
 * timeout, eleven subjects meant almost two minutes of waiting to learn the same thing eleven
 * times. The breaker makes the second and later consultations return immediately — the verdict is
 * identical either way (D4: a provider that cannot answer never changes the outcome), so the only
 * thing the extra attempts bought was delay.
 *
 * In-process is the right lifetime: EOS is a short-lived CLI, and persisting breaker state would
 * mean a provider that recovered stayed "broken" until something cleared a file.
 */
const breaker = new Map();
export const resetProviderBreaker = () => breaker.clear();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the configured provider about one subject.
 *
 * Never throws. An adapter that crashes yields ERROR, which under D4 leaves the fallback in place:
 * a governance tool that can be taken down by a broken integration is not a governance tool.
 *
 * Retries are deliberately narrow. Only a TRANSIENT failure — unreachable, timed out — is retried;
 * an authoritative answer is never retried, because asking a system that already said "no" again
 * is how an integration eventually gets the answer it wants. `transient` is declared by the
 * adapter, never guessed here from the text of an error message.
 *
 * @returns {Promise<object|null>} null when no provider covers this subject
 */
export async function consult(root, subject, {
  providers = null, now = new Date(), retries = 2, backoffMs = 200, breakerThreshold = 2,
} = {}) {
  const configured = providers || loadProviders(root).providers;
  const entry = configured.find((p) => (p.subjects || []).includes(subject));
  if (!entry) return null;
  const load = BUILT_IN[entry.adapter];
  if (!load) {
    return result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: `unknown adapter "${entry.adapter}" (known: ${Object.keys(BUILT_IN).join(', ')})` });
  }
  const failures = breaker.get(entry.adapter) || 0;
  if (failures >= breakerThreshold) {
    return result({
      provider: entry.adapter, subject, status: 'UNVERIFIED', now, transient: true,
      detail: `not consulted: ${entry.adapter} failed ${failures} time(s) in a row in this run, so it is assumed still unreachable. The verdict is the same as if it had been asked and could not answer.`,
    });
  }

  const attempts = Math.max(1, (entry.options?.retries ?? retries) + 1);
  let verdict = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const mod = await load();
      const raw = await mod.check({ root, subject, options: entry.options || {}, now });
      verdict = raw?.status ? raw : result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: 'the adapter returned no verdict' });
    } catch (e) {
      verdict = result({ provider: entry.adapter, subject, status: 'ERROR', now, detail: `the adapter failed: ${e.message}` });
    }
    if (!verdict.transient) { breaker.delete(entry.adapter); return verdict; }
    if (attempt < attempts - 1) await sleep(backoffMs * (2 ** attempt));
  }
  breaker.set(entry.adapter, failures + 1);
  return { ...verdict, detail: `${verdict.detail} (after ${attempts} attempt(s))` };
}
