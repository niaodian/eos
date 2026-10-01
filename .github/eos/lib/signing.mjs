// Signatures for EOS documents: release manifests and policy baselines (ADR-012, ADR-013).
//
// Ed25519 through node:crypto — offline and zero-dependency, and behaves the same on every
// platform. What is signed is the document's CONTENT: canonical JSON without the signature block,
// prefixed by a domain string, so a signature over a manifest can never be replayed as one over a
// policy baseline. Line endings, key order and indentation do not affect it.
//
// The one secret EOS ever reads is a signing key, and only when it is handed one explicitly
// (`eos release sign --key <file>`). It is never read from the environment, never logged, and
// never written anywhere but where `keygen` was told to put it. (Recorded in ADR-012 as the scoped
// exception to ADR-005 D3.)
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalJson } from './canonical.mjs';

export const SIGNATURE_ALG = 'ed25519';
const DOMAINS = { manifest: 'eos-release-manifest-v1', policy: 'eos-policy-baseline-v1' };

/** The exact bytes a signature covers. */
export function signedBytes(kind, doc) {
  if (!DOMAINS[kind]) throw new Error(`unknown signed document kind "${kind}"`);
  const { signature, $schema, ...content } = doc;
  return Buffer.from(`${DOMAINS[kind]}\n${canonicalJson(content)}`, 'utf8');
}

/** A key's identity: SHA-256 of its public half in DER (SPKI) form. */
export const keyId = (key) => {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
};

function requireEd25519(key, what) {
  if (key.asymmetricKeyType !== SIGNATURE_ALG) throw new Error(`${what} is a ${key.asymmetricKeyType} key; EOS signs with ${SIGNATURE_ALG}`);
  return key;
}

/** @throws when the PEM is not an Ed25519 public key */
export const loadPublicKey = (pem) => requireEd25519(createPublicKey(pem), 'the public key');
/** @throws when the PEM is not an Ed25519 private key */
export const loadPrivateKey = (pem) => requireEd25519(createPrivateKey(pem), 'the private key');

export function generateSigningKey() {
  const { privateKey, publicKey } = generateKeyPairSync(SIGNATURE_ALG);
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
    keyId: keyId(publicKey),
  };
}

/** A copy of `doc` carrying a signature by `privateKey`. */
export function signDocument(kind, doc, privateKey, { now = new Date() } = {}) {
  const { signature, ...unsigned } = doc;
  const value = sign(null, signedBytes(kind, unsigned), privateKey).toString('base64');
  return { ...unsigned, signature: { alg: SIGNATURE_ALG, keyId: keyId(privateKey), signedAt: now.toISOString(), value } };
}

/**
 * Does `doc` carry a valid signature by `publicKey`?
 * @returns {{valid: boolean, problem: string|null}}
 */
export function verifyDocument(kind, doc, publicKey) {
  const s = doc?.signature;
  if (!s) return { valid: false, problem: 'it is not signed' };
  if (s.alg !== SIGNATURE_ALG) return { valid: false, problem: `it is signed with "${s.alg}", and EOS verifies ${SIGNATURE_ALG}` };
  const expected = keyId(publicKey);
  if (s.keyId !== expected) return { valid: false, problem: `it is signed by key ${String(s.keyId).slice(0, 12)}…, not by the declared key ${expected.slice(0, 12)}…` };
  let ok = false;
  try { ok = verify(null, signedBytes(kind, doc), publicKey, Buffer.from(String(s.value), 'base64')); } catch { ok = false; }
  return ok ? { valid: true, problem: null } : { valid: false, problem: 'the signature does not match the content — it was edited after signing' };
}
