// redaction.mjs — strip regulated fields BEFORE any third-party / cross-border / LLM call.
// Zero-dependency, deterministic, offline. This is the *code form* of the Agentic data-boundary
// (docs/checklists/F-compliance.md) and eos-doctor D5, enforcing the rule
// "Never place secrets or PII in prompts or logs. Redact before sending to the provider."
// (.github/instructions/ai/10-ai-llm.instructions.md).
//
// Regime presets (compose only what your /compliance profile selected):
//   createRedactor(['PCI-DSS'])          -> base + cardholder data only
//   createRedactor(['HIPAA'])            -> base + PHI (personal identifiers + health fields)
//   createRedactor(['GDPR','PIPL'])      -> base + personal data
//   createRedactor()                     -> all regimes (the default export below)
//
// Each redactor exposes:
//   redact(value)       -> deep clone with regulated fields masked (safe to send / log)
//   scan(value)         -> array of leak locations (empty == clean)
//   assertClean(value)  -> throws if regulated data would leave the boundary

import { readFileSync } from 'node:fs';

// ── Luhn (card) check so we only redact real PANs, not any 13–19 digit id ──────────────
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

// ── Value patterns (catch PII in free text / unknown keys). `validate` gates a match. ──
const EMAIL = { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ };
const SSN = { label: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ };
const PHONE = { label: 'phone', re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ };
const PAN = { label: 'pan', re: /\b(?:\d[ -]?){13,19}\b/, validate: (m) => luhnValid(m.replace(/\D/g, '')) };

// Shared "direct personal identifiers" — HIPAA (18 Safe Harbor items) and GDPR/PIPL both want these out.
const PERSONAL_KEYS = ['email', 'phone', 'telephone', 'fax', 'dob', 'dateofbirth', 'birthdate', 'address', 'ssn', 'socialsecurity'];
const PERSONAL_PATTERNS = [EMAIL, SSN, PHONE];

// ── Regime profiles. keys = case-insensitive SUBSTRING match on object keys. ───────────
// ⚠ Substring matching means SHORT tokens over-match ('pin'⊂'shipping', 'track'⊂'tracking',
//   'sin'⊂'business', 'ip'⊂'description'). Tokens below are curated to be distinctive; if your
//   schema still collides, switch isDeniedKey to exact-match or scope the key list per module.
export const PROFILES = {
  // Credentials/secrets — never leave the boundary regardless of regulatory regime.
  base: {
    keys: ['password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'accesskey', 'credential', 'privatekey', 'private_key'],
    patterns: [],
  },
  // HIPAA: PHI = personal identifiers + health-specific fields (Security/Privacy Rule, Safe Harbor).
  HIPAA: {
    keys: [...PERSONAL_KEYS, 'mrn', 'medicalrecord', 'medical_record', 'phi', 'diagnosis', 'icd', 'healthplan', 'health_plan', 'beneficiary', 'npi', 'dea', 'patientid'],
    patterns: [...PERSONAL_PATTERNS],
  },
  // PCI-DSS: cardholder data (CHD) + sensitive authentication data (SAD) only — scoped to cards.
  PCI: {
    keys: ['pan', 'cardnumber', 'card_number', 'cardno', 'cvv', 'cvc', 'cvv2', 'track1', 'track2', 'magstripe', 'pinblock', 'expiry', 'expiration'],
    patterns: [PAN],
  },
  // GDPR / CCPA / PIPL: personal data — identifiers + national/sensitive PI.
  GDPR_PIPL: {
    keys: [...PERSONAL_KEYS, 'nationalid', 'national_id', 'idcard', 'passport', 'taxid', 'drivinglicense', 'driverslicense', 'biometric', 'geolocation'],
    patterns: [...PERSONAL_PATTERNS],
  },
};

// Map the regime names /compliance uses onto profile keys.
export const REGIME_ALIASES = {
  hipaa: 'HIPAA',
  pci: 'PCI', 'pci-dss': 'PCI', pcidss: 'PCI',
  gdpr: 'GDPR_PIPL', ccpa: 'GDPR_PIPL', 'ccpa-cpra': 'GDPR_PIPL', pipl: 'GDPR_PIPL',
};

const DEFAULT_REGIMES = ['HIPAA', 'PCI', 'GDPR_PIPL'];
const MASK = (label) => `«REDACTED:${label}»`;
const isMask = (v) => typeof v === 'string' && /^«REDACTED:[^»]+»$/.test(v);
const isEmpty = (v) => v == null || v === '';

function toProfileName(r) {
  if (PROFILES[r]) return r;
  return REGIME_ALIASES[String(r).toLowerCase()] || null;
}

// Compose base + selected regimes into a deduped { keys, patterns } config.
function resolveProfiles(regimes) {
  const names = ['base'];
  for (const r of regimes || []) {
    const n = toProfileName(r);
    if (n && !names.includes(n)) names.push(n);
  }
  const keys = [];
  const patterns = [];
  const seenKey = new Set();
  const seenPat = new Set();
  for (const n of names) {
    const p = PROFILES[n];
    if (!p) continue;
    for (const k of p.keys) {
      const lk = k.toLowerCase();
      if (!seenKey.has(lk)) { seenKey.add(lk); keys.push(lk); }
    }
    for (const pat of p.patterns) {
      if (!seenPat.has(pat.label)) { seenPat.add(pat.label); patterns.push(pat); }
    }
  }
  // Validate-gated patterns (PAN) first — they consume digit runs before generic matchers.
  patterns.sort((a, b) => (b.validate ? 1 : 0) - (a.validate ? 1 : 0));
  return { active: names.filter((n) => n !== 'base'), keys, patterns };
}

const isDeniedKey = (k, keys) => { const lk = k.toLowerCase(); return keys.some((d) => lk.includes(d)); };

function redactString(s, patterns) {
  let out = s;
  for (const { label, re, validate } of patterns) {
    out = out.replace(new RegExp(re.source, 'g'), (m) => (validate ? (validate(m) ? MASK(label) : m) : MASK(label)));
  }
  return out;
}

function redactValue(value, cfg) {
  if (Array.isArray(value)) return value.map((x) => redactValue(x, cfg));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = isDeniedKey(k, cfg.keys) ? MASK(k.toLowerCase()) : redactValue(v, cfg);
    return out;
  }
  if (typeof value === 'string') return redactString(value, cfg.patterns);
  return value;
}

function scanValue(value, cfg) {
  const hits = [];
  const walk = (v, p) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === 'object')
      for (const [k, val] of Object.entries(v)) {
        if (isDeniedKey(k, cfg.keys) && !isEmpty(val) && !isMask(val)) hits.push({ path: `${p}.${k}`, kind: `key:${k.toLowerCase()}` });
        walk(val, `${p}.${k}`);
      }
    else if (typeof v === 'string' && redactString(v, cfg.patterns) !== v) hits.push({ path: p, kind: 'value-pattern' });
  };
  walk(value, '$');
  return hits;
}

// Build a redactor bound to the selected regimes. This is the main entry point.
export function createRedactor(regimes = DEFAULT_REGIMES) {
  const cfg = resolveProfiles(regimes);
  const assertClean = (value) => {
    const hits = scanValue(value, cfg);
    if (hits.length) {
      const e = new Error(
        `redaction: ${hits.length} regulated field(s) would leave the boundary: ` +
          hits.map((h) => `${h.path} (${h.kind})`).join(', '),
      );
      e.violations = hits;
      throw e;
    }
    return value;
  };
  return {
    regimes: cfg.active,
    keys: cfg.keys,
    patterns: cfg.patterns.map((p) => p.label),
    redact: (v) => redactValue(v, cfg),
    redactForLog: (v) => redactValue(v, cfg), // PII-free logging alias
    scan: (v) => scanValue(v, cfg),
    assertClean,
  };
}

// ── Auto-select the regime(s) from the /compliance output ──────────────────────────────
// `/compliance` writes docs/compliance-profile.md with a canonical machine-readable line:
//   **Regulatory regime:** HIPAA, PCI-DSS      (or `none` for generic PII handling)
// parseRegimes reads that line and resolves it to profile names. Only tokens that resolve
// to a *known* regime are kept, so free-text rationale on the line is ignored; an explicit
// `none` short-circuits to [] (base credentials only).
export function parseRegimes(profileText) {
  const m = /regulatory\s+regime\s*[:：]\s*(.+)/i.exec(String(profileText || ''));
  if (!m) return [];
  let val = m[1].replace(/^[*_\s]+/, ''); // drop leading markdown emphasis (**bold**)
  val = val.split(/[(（]/)[0]; // drop parenthetical rationale before tokenizing
  if (/^none\b/i.test(val.trim())) return [];
  const out = [];
  for (const tok of val.split(/[\s,/+&]+/)) {
    if (!tok) continue;
    const n = toProfileName(tok);
    if (n && n !== 'base' && !out.includes(n)) out.push(n);
  }
  return out;
}

// Build a redactor straight from the /compliance profile doc.
//   file lists regimes  -> scope to them
//   file says `none`     -> base credentials only (honours the human decision)
//   file missing         -> fallback: 'all' (default, fail-safe — never silently under-redact),
//                           'base', or 'throw'
export function redactorFromProfile(path = 'docs/compliance-profile.md', { fallback = 'all' } = {}) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    if (fallback === 'throw') {
      throw new Error(`redactorFromProfile: ${path} not found — run /compliance first`);
    }
    return createRedactor(fallback === 'base' ? [] : undefined); // 'all' -> default regimes
  }
  return createRedactor(parseRegimes(text));
}

// ── Default instance = all regimes. Back-compat top-level exports. ─────────────────────
const _default = createRedactor();
export const redact = _default.redact;
export const redactForLog = _default.redactForLog;
export const scan = _default.scan;
export const assertClean = _default.assertClean;
// Composed deny list of the default (all-regime) instance — for inspection / back-compat.
export const DENY_KEYS = _default.keys;
