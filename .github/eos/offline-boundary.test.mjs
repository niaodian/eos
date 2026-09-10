// The offline boundary — enforced, not promised.
//
// EOS's distinguishing claim is that a developer can run the entire governance loop with no network
// and no account. That claim is true today: nothing under `.github/eos/lib/` or `eos.mjs` can reach
// the network. But "true today" is not a property — it is a coincidence that survives only until
// someone adds a convenient `fetch` in a hurry.
//
// This file turns the claim into an assertion that fails. It is the precondition for ever adding a
// provider adapter: without it, "offline-first" erodes one pull request at a time and becomes the
// exact thing the audits kept finding — documentation that says one thing while the machine does
// another.
//
// THE INVARIANT
//   1. EOS Core reaches a decision offline. Every gate yields PASS / FAIL / BLOCKED / DEFERRED
//      without a network.
//   2. No Core code path can call the network.
//   3. An adapter may be online-augmented, but network may only ever upgrade an honest non-PASS
//      into a PASS. It may never manufacture one, and its absence may never be silently ignored.
//
//   node --test .github/eos/offline-boundary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './test-support.mjs';

/** EOS Core: the engine the whole guarantee rests on. */
const CORE = ['.github/eos/lib', '.github/eos/eos.mjs'];

/**
 * Where an adapter is allowed to live once one exists. Nothing here yet — the directory is named so
 * the boundary is a location, not a habit.
 */
const ADAPTER_DIR = '.github/eos/adapters';

function coreFiles() {
  const out = [];
  for (const entry of CORE) {
    const full = join(REPO_ROOT, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isFile()) { out.push(entry); continue; }
    for (const name of readdirSync(full)) {
      if (name.endsWith('.mjs')) out.push(`${entry}/${name}`);
    }
  }
  return out;
}

/** Ways a Node program reaches the network, plus the CLIs that reach it on your behalf. */
const NETWORK_PATTERNS = [
  { re: /from\s+['"]node:(https?|net|tls|dgram|dns)['"]/, what: 'a network core module' },
  { re: /require\(\s*['"]node:?(https?|net|tls|dgram|dns)['"]\s*\)/, what: 'a network core module' },
  { re: /\bfetch\s*\(/, what: 'fetch()' },
  { re: /\bnew\s+WebSocket\b/, what: 'a WebSocket' },
  { re: /spawnSync\(\s*['"](gh|curl|wget|npm|npx|pip|pip3)['"]/, what: 'a network-capable CLI' },
  { re: /exec(Sync|File|FileSync)?\(\s*['"][^'"]*\b(curl|wget|gh\s)/, what: 'a network-capable CLI' },
];

test('EOS Core cannot reach the network — the offline claim is an assertion, not a promise', () => {
  const offenders = [];
  for (const rel of coreFiles()) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      // Comments describe the boundary; they do not cross it.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const { re, what } of NETWORK_PATTERNS) {
        if (re.test(line)) offenders.push(`${rel}: ${what} — ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'EOS Core must reach every decision offline. If this change genuinely needs an external '
    + `authority, it belongs in ${ADAPTER_DIR}/ behind the provider contract — where its absence is `
    + 'BLOCKED/DEFERRED rather than silently ignored, and where the offline suite can exercise it '
    + 'through a deterministic mock. See docs/adr/004-release-membership-and-evidence-trust.md.');
});

test('EOS Core takes no third-party dependency — the whole engine is auditable by reading it', () => {
  const offenders = [];
  for (const rel of coreFiles()) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    for (const m of text.matchAll(/^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      const isLocal = spec.startsWith('.') || spec.startsWith('/');
      const isNodeBuiltin = spec.startsWith('node:');
      if (!isLocal && !isNodeBuiltin) offenders.push(`${rel}: imports "${spec}"`);
    }
  }
  assert.deepEqual(offenders, [],
    'EOS Core is zero-dependency on purpose: the trust story is that you can read all of it. '
    + 'A dependency is code you did not read running inside the thing that decides whether your '
    + 'release is safe.');
});

test('the network can only ever upgrade a verdict, never manufacture one', () => {
  // The rule the adapter contract must obey, expressed against the code that already follows it:
  // the dependency audit needs the network, and offline it is DEFERRED — visible, time-bound and
  // never green. Any future provider adapter is held to this same shape.
  const gates = readFileSync(join(REPO_ROOT, '.github/eos/lib/gates.mjs'), 'utf8');
  const audit = gates.slice(gates.indexOf('releaseDependencyAudit(ctx)'));
  const body = audit.slice(0, audit.indexOf('\n  },'));
  assert.match(body, /DEFERRED/, 'an unreachable network must yield DEFERRED');
  assert.match(body, /blocked\(/, 'a regulated product may not defer it');
  assert.doesNotMatch(body.replace(/^\s*\/\/.*$/gm, ''),
    /offline[^\n]*\bok\(/i, 'being offline must never produce a PASS');
});

// --------------------------------------------------------------------- ADR-005 · D3 and D5
// The two boundaries that are about authority rather than connectivity.

test('ADR-005 D3: EOS never reads a credential, so it can never leak one', () => {
  // Stronger than handling secrets carefully is never seeing one. Adapters delegate to an
  // already-authenticated CLI (`gh`), whose token lives in that tool's own store.
  const offenders = [];
  for (const rel of coreFiles()) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/process\.env\.[A-Z_]*(TOKEN|SECRET|PASSWORD|APIKEY|API_KEY|CREDENTIAL)/i.test(line)) {
        offenders.push(`${rel}: reads a credential from the environment — ${line.trim().slice(0, 70)}`);
      }
      if (/flags\.(token|secret|password|apiKey)/i.test(line)) {
        offenders.push(`${rel}: accepts a credential as a flag — ${line.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'EOS must be able to say it has never seen a credential. Delegate to an already-authenticated '
    + 'CLI instead; if a CI-only path genuinely needs an environment token, it belongs in an adapter '
    + 'that never persists or logs it. See docs/adr/005-external-authority-boundary.md.');
});

test('ADR-005 D5: EOS is read-only against every external system', () => {
  // A tool that can grant itself enforcement authority can also remove it: if EOS could set branch
  // protection, compromising EOS would disable the gates. EOS records and reports; humans and CI act.
  const WRITE_SHAPES = [
    { re: /-X\s*(PUT|POST|PATCH|DELETE)/i, what: 'a mutating API call' },
    { re: /\bgh\s+(repo|api|release|pr)\s+(create|edit|delete|merge)/, what: 'a mutating gh command' },
    { re: /method:\s*['"](PUT|POST|PATCH|DELETE)['"]/i, what: 'a mutating HTTP method' },
  ];
  const offenders = [];
  for (const rel of coreFiles()) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const { re, what } of WRITE_SHAPES) {
        if (re.test(line)) offenders.push(`${rel}: ${what} — ${line.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'EOS does not configure the systems that hold it accountable. The convenience case is real — '
    + '/eos-init could just set branch protection for you — and the door is closed deliberately.');
});
