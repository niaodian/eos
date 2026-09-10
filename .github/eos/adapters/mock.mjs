// Deterministic mock provider — how the offline suite exercises a network-dependent contract.
//
// This exists because of rule D1: an adapter that can only be tested with a network is an adapter
// whose failure modes are never tested. Every case the real adapters can produce — unreachable,
// unauthorised, timed out, disagreeing, crashing — must be reproducible on a plane, and this is what
// makes that possible.
//
// It reads its verdict from configuration, so a test states the world it wants and asserts what EOS
// does with it. It performs no I/O of any kind.
import { result } from './contract.mjs';

export async function check({ subject, options, now }) {
  if (options.throw) throw new Error(options.throw);
  return result({
    provider: 'mock',
    subject,
    status: options.status || 'PASS',
    detail: options.detail || `mock verdict for ${subject}`,
    evidenceRef: options.evidenceRef || null,
    expiry: options.expiry || null,
    now,
  });
}
