// compliance.test.mjs — proves the skeletons run out of the box. Zero-dependency.
// Run: `node --test docs/eos/examples/compliance-starter/compliance.test.mjs`
// (Pass an explicit file/glob — a bare directory path errors under Node 23's --test.)
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  redact,
  scan,
  assertClean,
  luhnValid,
  createRedactor,
  PROFILES,
  parseRegimes,
  redactorFromProfile,
} from './redaction.mjs';
import { createConsentStore } from './consent.mjs';
import { exportSubject, eraseSubject } from './dsar.mjs';

test('redaction: regime profiles scope what gets masked', () => {
  // PCI-DSS scope = cardholder data only; a plain email is out of scope and stays.
  const pci = createRedactor(['PCI-DSS']); // alias resolves to PCI
  const p = pci.redact({ cardNumber: '4111111111111111', email: 'jane@example.com' });
  assert.strictEqual(p.cardNumber, '«REDACTED:cardnumber»');
  assert.strictEqual(p.email, 'jane@example.com', 'PCI scope must not touch a non-card email');

  // HIPAA scope = PHI (identifiers + health), but NOT a raw card number (that is PCI's regime).
  const hipaa = createRedactor(['HIPAA']);
  const h = hipaa.redact({ mrn: 'MR-9', email: 'jane@example.com', pan: '4111111111111111' });
  assert.strictEqual(h.mrn, '«REDACTED:mrn»');
  assert.strictEqual(h.email, '«REDACTED:email»');
  assert.strictEqual(h.pan, '4111111111111111', 'HIPAA-only must not redact card data (select PCI for that)');

  // base-only (no regime) = credentials/secrets only.
  const base = createRedactor([]);
  assert.strictEqual(base.redact({ token: 'abc123', email: 'a@b.co' }).token, '«REDACTED:token»');
  assert.strictEqual(base.redact({ email: 'a@b.co' }).email, 'a@b.co');

  assert.deepStrictEqual(pci.regimes, ['PCI']); // reports the active regime set
  assert.ok(PROFILES.HIPAA && PROFILES.PCI && PROFILES.GDPR_PIPL, 'named regime presets are exported');
});

test('redaction: masks PAN / email / SSN / denied keys, preserves the rest', () => {
  const input = {
    userId: 'u-123', // safe identifier — kept
    email: 'jane@example.com', // denied key
    note: 'card 4111 1111 1111 1111, ssn 123-45-6789, call 555-123-4567',
    order: { total: 42 }, // safe — kept
  };
  const out = redact(input);
  assert.strictEqual(out.userId, 'u-123');
  assert.strictEqual(out.order.total, 42);
  assert.strictEqual(out.email, '«REDACTED:email»');
  assert.ok(!out.note.includes('4111'), 'PAN not stripped');
  assert.ok(!out.note.includes('123-45-6789'), 'SSN not stripped');
  assert.ok(!out.note.includes('555-123-4567'), 'phone not stripped');
});

test('redaction: Luhn avoids over-redacting a non-card 16-digit id', () => {
  assert.strictEqual(luhnValid('4111111111111111'), true);
  assert.strictEqual(luhnValid('1234567890123456'), false);
});

test('redaction: assertClean is the boundary guard (throws on leak, passes when clean)', () => {
  assert.throws(() => assertClean({ ssn: '123-45-6789' }), /would leave the boundary/);
  assert.strictEqual(scan({ userId: 'u-1', qty: 3 }).length, 0);
  assert.doesNotThrow(() => assertClean(redact({ email: 'a@b.co', qty: 3 })));
});

test('consent: per-purpose grant / revoke / check, queryable + audited', () => {
  const c = createConsentStore();
  c.grant('u-1', 'marketing');
  c.grant('u-1', 'analytics');
  assert.strictEqual(c.check('u-1', 'marketing'), true);

  c.revoke('u-1', 'marketing'); // withdrawal as easy as granting
  assert.strictEqual(c.check('u-1', 'marketing'), false);
  assert.strictEqual(c.check('u-1', 'analytics'), true, 'purposes must be independent (PIPL separate consent)');
  assert.strictEqual(c.check('u-1', 'never-asked'), false);

  assert.deepStrictEqual(Object.keys(c.state('u-1')).sort(), ['analytics', 'marketing']);
  assert.strictEqual(c.log.all().length, 3); // 2 grants + 1 revoke, no PII in the trail
});

test('dsar: export gathers all sources (portable); erase runs + audits each', async () => {
  const erased = [];
  const sources = [
    { name: 'profiles', export: async () => [{ id: 'u-1', city: 'X' }], erase: async () => (erased.push('profiles'), 1) },
    { name: 'orders', export: async () => [{ id: 'o-9' }], erase: async () => (erased.push('orders'), 1) },
  ];

  const bundle = await exportSubject('u-1', sources);
  assert.deepStrictEqual(Object.keys(bundle.data).sort(), ['orders', 'profiles']);
  assert.ok(bundle.generatedAt, 'export is timestamped/portable');

  const receipt = await eraseSubject('u-1', sources, { reason: 'user-request' });
  assert.deepStrictEqual(erased.sort(), ['orders', 'profiles']);
  assert.deepStrictEqual(receipt.erased, { profiles: 1, orders: 1 });
  assert.strictEqual(receipt.reason, 'user-request');
});

test('profile: parseRegimes + redactorFromProfile pick the regime from /compliance output', () => {
  // Pure parse: canonical line -> resolved profile names; rationale words are ignored.
  assert.deepStrictEqual(
    parseRegimes('# Compliance profile\n\n**Regulatory regime:** HIPAA, PCI-DSS\n'),
    ['HIPAA', 'PCI'],
  );
  // Slash / plus separators and mixed case also resolve.
  assert.deepStrictEqual(parseRegimes('Regulatory regime: gdpr / pipl'), ['GDPR_PIPL']);
  // Explicit `none` (with parenthetical rationale mentioning a regime) -> base only.
  assert.deepStrictEqual(parseRegimes('Regulatory regime: none (generic PII, no PCI applies)'), []);

  // File round-trip: write a profile, build the redactor straight from it.
  const dir = mkdtempSync(join(tmpdir(), 'eos-profile-'));
  try {
    const f = join(dir, 'compliance-profile.md');
    writeFileSync(f, '# Compliance profile\n\n**Regulatory regime:** HIPAA\n\nRationale: PHI.\n');
    const r = redactorFromProfile(f);
    assert.deepStrictEqual(r.regimes, ['HIPAA'], 'redactor scoped to the profile regime');

    // Missing file -> fail-safe: all regimes (never silently under-redact).
    const strict = redactorFromProfile(join(dir, 'nope.md'));
    assert.deepStrictEqual(strict.regimes, ['HIPAA', 'PCI', 'GDPR_PIPL']);
    // Opt-in softer fallbacks.
    assert.deepStrictEqual(redactorFromProfile(join(dir, 'nope.md'), { fallback: 'base' }).regimes, []);
    assert.throws(() => redactorFromProfile(join(dir, 'nope.md'), { fallback: 'throw' }), /run \/compliance first/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
