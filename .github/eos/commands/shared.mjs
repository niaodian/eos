// Helpers every command module shares: the exit-code contract, output, scope resolution and the
// one place a gate consults an external authority.
//
// Exit codes (contract — see docs/eos/developer-experience.md §10.1):
//   0 PASS / nothing blocking · 1 FAIL or rejected transition · 2 BLOCKED/PENDING/STALE · 3 ERROR
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activeScope } from '../lib/router.mjs';
import { loadPrivateKey } from '../lib/signing.mjs';
import { loadProviders, consult } from '../adapters/contract.mjs';

export const EXIT = { OK: 0, FAIL: 1, BLOCKED: 2, ERROR: 3 };

export const statusExit = (s) => (['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(s) ? EXIT.OK : s === 'FAIL' ? EXIT.FAIL : s === 'ERROR' ? EXIT.ERROR : EXIT.BLOCKED);

export const emit = (flags, json, text) => {
  if (flags.json) console.log(JSON.stringify(json, null, 2));
  else console.log(text);
};

const SCOPE_TYPES = ['product', 'story', 'release'];

/**
 * Accept both spellings: `--scope story --id STORY-012` and the shorthand `--scope STORY-012`.
 * Without either, fall back to the router's active scope so `eos handoff` "just works".
 */
export function resolveScope(snapshot, flags, defaultType = 'story') {
  let type = null;
  let id = null;
  if (typeof flags.scope === 'string') {
    if (SCOPE_TYPES.includes(flags.scope)) type = flags.scope;
    else id = flags.scope;
  }
  if (typeof flags.id === 'string') id = flags.id;
  if (!id) {
    const active = activeScope(snapshot);
    return { type: type || active.type, id: active.id };
  }
  if (!type) {
    if (snapshot.stories.some((s) => s.id === id)) type = 'story';
    else if (id === 'product') type = 'product';
    else type = defaultType;
  }
  return { type, id };
}

/**
 * Ask the configured external authorities, once, before a gate runs.
 *
 * Only the gates that ASSERT something about the outside world consult a provider; the whole
 * development loop (G1–G7) never does, so no provider problem can ever block day-to-day work.
 * A provider that is absent, unreachable or broken yields nothing here, and the gate falls back to
 * the verdict EOS reaches on its own. (ADR-005 · D4)
 */
export async function consultProviders(snapshot, gateId) {
  if (gateId !== 'release-ready' && gateId !== 'activation') return {};
  const { providers, errors } = loadProviders(snapshot.root);
  if (errors.length || !providers.length) return {};
  const out = {};
  for (const subject of ['enforcement-authority', 'evidence-provenance']) {
    const verdict = await consult(snapshot.root, subject, { providers });
    if (verdict) out[subject] = verdict;
  }
  return out;
}

/**
 * The one place EOS reads a private key: a file the user handed it with --key, for `release sign`
 * and `policy export --sign`. Read, used in memory, never logged, never written. (ADR-012)
 * @throws when the file is missing or is not an Ed25519 private key
 */
export const privateKeyFromFile = (path) => loadPrivateKey(readFileSync(resolve(path), 'utf8'));
