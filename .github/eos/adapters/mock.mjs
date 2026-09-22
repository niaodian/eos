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
  // `failTimes` lets a test reproduce the shape that matters for retry and the circuit breaker: an
  // authority that is down for a while and then answers. Counting per subject keeps each test case
  // independent of the order the others ran in.
  if (options.failTimes) {
    attempts.set(subject, (attempts.get(subject) || 0) + 1);
    if (attempts.get(subject) <= options.failTimes) {
      return result({
        provider: 'mock', subject, status: options.transientStatus || 'UNVERIFIED', now, transient: true,
        detail: options.transientDetail || `mock is unreachable (attempt ${attempts.get(subject)})`,
      });
    }
  }
  return result({
    provider: 'mock',
    subject,
    status: options.status || 'PASS',
    detail: options.detail || `mock verdict for ${subject}`,
    evidenceRef: options.evidenceRef || null,
    expiry: options.expiry || null,
    transient: !!options.transient,
    now,
  });
}

const attempts = new Map();
export const resetMockAttempts = () => attempts.clear();
