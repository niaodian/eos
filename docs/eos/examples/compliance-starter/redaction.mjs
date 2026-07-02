// redaction.mjs — strip regulated fields BEFORE any third-party / cross-border / LLM call.
// Zero-dependency, deterministic, offline. This is the *code form* of the Agentic data-boundary
// (docs/checklists/F-compliance.md) and eos-doctor D5, enforcing the rule
// "Never place secrets or PII in prompts or logs. Redact before sending to the provider."
// (.github/instructions/ai/10-ai-llm.instructions.md).
//
// Two entry points:
//   redact(value)       -> deep clone with regulated fields masked (safe to send / log)
//   assertClean(value)  -> throws if regulated data would leave the boundary (call before a provider request)

// 1) Field-name deny list — case-insensitive substring match on object keys.
//    Extend per regime: HIPAA (mrn/phi/diagnosis), PCI (pan/cvv/track), GDPR/PIPL (email/dob/nationalId)…
export const DENY_KEYS = [
  'password', 'secret', 'token', 'apikey', 'ssn', 'sin', 'nino',
  'mrn', 'phi', 'diagnosis', 'icd', // health (HIPAA)
  'pan', 'cardnumber', 'card_number', 'cvv', 'cvc', 'track', // card (PCI-DSS)
  'email', 'phone', 'dob', 'birth', 'address', 'passport', 'nationalid', // personal (GDPR/PIPL)
];

// 2) Value patterns — catch PII that slips through unknown keys / free text.
//    Sources kept non-global; a global copy is compiled per replace.
const PATTERNS = [
  { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { label: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: 'phone', re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
];

const MASK = (label) => `«REDACTED:${label}»`;

// Luhn check so we only redact real card numbers (avoids nuking any 13–19 digit id).
export function luhnValid(digits) {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const isDeniedKey = (k) => DENY_KEYS.some((d) => k.toLowerCase().includes(d));
const isEmpty = (v) => v == null || v === '';
const isMask = (v) => typeof v === 'string' && /^«REDACTED:[^»]+»$/.test(v);

function redactString(s) {
  // PAN first (Luhn-checked), then structured patterns. Tokens carry no digits, so order is safe.
  let out = s.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) =>
    luhnValid(m.replace(/\D/g, '')) ? MASK('pan') : m,
  );
  for (const { label, re } of PATTERNS) out = out.replace(new RegExp(re.source, 'g'), MASK(label));
  return out;
}

// Deep clone with regulated fields removed. Safe to send to a provider or write to a log.
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = isDeniedKey(k) ? MASK(k.toLowerCase()) : redact(v);
    return out;
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}

// PII-free logging alias — data-api: "every deletion audited … without logging the data itself".
export const redactForLog = redact;

// Report every place regulated data would leak (path + kind). Empty array == clean.
export function scan(value) {
  const hits = [];
  const walk = (v, p) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object')
      for (const [k, val] of Object.entries(v)) {
        if (isDeniedKey(k) && !isEmpty(val) && !isMask(val)) hits.push({ path: `${p}.${k}`, kind: `key:${k.toLowerCase()}` });
        walk(val, `${p}.${k}`);
      }
    else if (typeof v === 'string' && redactString(v) !== v) hits.push({ path: p, kind: 'value-pattern' });
  };
  walk(value, '$');
  return hits;
}

// Boundary guard — call right before any cross-border / third-party / LLM request.
export function assertClean(value) {
  const hits = scan(value);
  if (hits.length) {
    const e = new Error(
      `redaction: ${hits.length} regulated field(s) would leave the boundary: ` +
      hits.map((h) => `${h.path} (${h.kind})`).join(', '),
    );
    e.violations = hits;
    throw e;
  }
  return value;
}
