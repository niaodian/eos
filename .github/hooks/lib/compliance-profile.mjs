// EOS structured compliance profile (`docs/compliance-profile.json`) — schema + loader. Zero deps.
//
// WHY THIS EXISTS: the D5 data-boundary gate used to grep prose for the WORDS
// "BAA / DPA / self-host / redact / tokenize / …". Natural language has negation, so
//   "Decision: no redaction is implemented; regulated data may be sent to third-party models."
// READ AS a recorded, safe boundary decision and the gate passed. Keyword presence is not a
// decision — this file makes the decision structured, enumerated, owned, approved and dated, so a
// machine can tell "approved AND implemented" from "explicitly refused".
// Prose (`docs/compliance-profile.md`) stays for humans; it never authorizes anything.
// JSON, not YAML: EOS stays zero-dependency. [audit EOS-004]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const COMPLIANCE_PROFILE_PATH = 'docs/compliance-profile.json';

export const REGIMES = ['none', 'HIPAA', 'PCI-DSS', 'SOC2', 'SOX', 'GDPR', 'CCPA-CPRA', 'PIPL', 'other'];
export const DATA_CATEGORIES = ['none', 'phi', 'pan', 'personal-data', 'sensitive-personal-data', 'financial', 'biometric', 'government-id', 'other'];
// The four legitimate answers to "regulated data + a third-party model", plus an explicit opt-out
// that must carry a waiver. "decide later" is deliberately NOT representable.
export const THIRD_PARTY_MODEL_POLICIES = ['baa-dpa-signed', 'self-hosted', 'redaction-gateway', 'excluded', 'not-applicable'];
export const CONTROL_KEYS = ['redaction', 'tokenization', 'deIdentification', 'regulatedDataExcluded', 'encryptionAtRest', 'encryptionInTransit', 'auditTrail', 'accessControl', 'dataResidency'];
export const CONTROL_STATUS = ['implemented', 'in_progress', 'planned', 'not_implemented', 'not_applicable'];
export const IMPLEMENTATION_STATUS = ['implemented', 'in_progress', 'planned', 'deferred'];
export const AGREEMENT_TYPES = ['baa', 'dpa', 'scc', 'other'];
export const AGREEMENT_STATUS = ['signed', 'in_review', 'not_signed', 'not_applicable'];

const TOP_LEVEL_KEYS = new Set([
  '$schema', '$comment', 'version', 'regimes', 'noneRationale', 'regulatedDataCategories', 'thirdPartyModelPolicy',
  'approvedRegions', 'agreements', 'controls', 'dataRetention', 'owner', 'approval',
  'implementationStatus', 'waiver', 'notes',
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Load + validate docs/compliance-profile.json.
 * @param {string} root
 * @param {Date} [now] injectable clock (approval expiry)
 * @returns {{present:boolean, path:string, profile:object|null, errors:string[], warnings:string[]}}
 */
export function loadComplianceProfile(root, now = new Date()) {
  const path = join(root, COMPLIANCE_PROFILE_PATH);
  const errors = [];
  const warnings = [];
  if (!existsSync(path)) return { present: false, path, profile: null, errors, warnings };

  let p;
  try {
    p = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${COMPLIANCE_PROFILE_PATH}: invalid JSON (${e.message})`);
    return { present: true, path, profile: null, errors, warnings };
  }
  if (!isPlainObject(p)) {
    errors.push(`${COMPLIANCE_PROFILE_PATH}: must be a JSON object`);
    return { present: true, path, profile: null, errors, warnings };
  }

  for (const k of Object.keys(p)) {
    if (!TOP_LEVEL_KEYS.has(k)) errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown key "${k}"`);
  }

  // --- regimes (the switch that decides how strict everything else is) ---
  let regimes = [];
  if (!Array.isArray(p.regimes) || !p.regimes.length) {
    errors.push(`${COMPLIANCE_PROFILE_PATH}: "regimes" is required — a non-empty array of ${REGIMES.join(' | ')}`);
  } else {
    for (const r of p.regimes) {
      if (!REGIMES.includes(r)) errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown regime "${r}" (expected ${REGIMES.join(' | ')})`);
    }
    regimes = p.regimes.filter((r) => REGIMES.includes(r));
    if (regimes.includes('none') && regimes.length > 1) errors.push(`${COMPLIANCE_PROFILE_PATH}: "none" cannot be combined with another regime`);
  }
  const regulated = regimes.length > 0 && !regimes.includes('none');

  // --- ownership + approval (always required: an unowned profile authorizes nobody) ---
  const owner = typeof p.owner === 'string' ? p.owner.trim() : '';
  if (!owner) errors.push(`${COMPLIANCE_PROFILE_PATH}: "owner" is required (the accountable human/role)`);

  let approvalValid = false;
  if (!isPlainObject(p.approval)) {
    errors.push(`${COMPLIANCE_PROFILE_PATH}: "approval" is required — { approvedBy, approvedOn, reviewBy }`);
  } else {
    const { approvedBy, approvedOn, reviewBy } = p.approval;
    for (const k of Object.keys(p.approval)) {
      if (!['approvedBy', 'approvedOn', 'reviewBy'].includes(k)) errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown approval key "${k}"`);
    }
    if (typeof approvedBy !== 'string' || !approvedBy.trim()) errors.push(`${COMPLIANCE_PROFILE_PATH}: approval.approvedBy is required`);
    if (typeof approvedOn !== 'string' || !isValidDate(approvedOn)) errors.push(`${COMPLIANCE_PROFILE_PATH}: approval.approvedOn must be an ISO date (YYYY-MM-DD)`);
    if (typeof reviewBy !== 'string' || !isValidDate(reviewBy)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: approval.reviewBy must be an ISO date (YYYY-MM-DD) — approvals expire on purpose`);
    } else if (Date.parse(reviewBy) < now.getTime()) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: the compliance approval EXPIRED on ${reviewBy} (approval.reviewBy) — re-review and re-approve before shipping`);
    } else {
      approvalValid = true;
    }
  }

  // --- controls / agreements / retention (shape is checked whenever declared) ---
  const controls = {};
  if (p.controls !== undefined) {
    if (!isPlainObject(p.controls)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "controls" must be an object`);
    } else {
      for (const [k, v] of Object.entries(p.controls)) {
        if (!CONTROL_KEYS.includes(k)) { errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown control "${k}" (expected ${CONTROL_KEYS.join(' | ')})`); continue; }
        if (!CONTROL_STATUS.includes(v)) { errors.push(`${COMPLIANCE_PROFILE_PATH}: controls.${k} has unknown status "${v}" (expected ${CONTROL_STATUS.join(' | ')})`); continue; }
        controls[k] = v;
      }
    }
  }

  const agreements = [];
  if (p.agreements !== undefined) {
    if (!Array.isArray(p.agreements)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "agreements" must be an array`);
    } else {
      p.agreements.forEach((a, i) => {
        if (!isPlainObject(a)) { errors.push(`${COMPLIANCE_PROFILE_PATH}: agreements[${i}] must be an object`); return; }
        if (typeof a.provider !== 'string' || !a.provider.trim()) errors.push(`${COMPLIANCE_PROFILE_PATH}: agreements[${i}].provider is required`);
        if (!AGREEMENT_TYPES.includes(a.type)) errors.push(`${COMPLIANCE_PROFILE_PATH}: agreements[${i}].type must be ${AGREEMENT_TYPES.join(' | ')}`);
        if (!AGREEMENT_STATUS.includes(a.status)) errors.push(`${COMPLIANCE_PROFILE_PATH}: agreements[${i}].status must be ${AGREEMENT_STATUS.join(' | ')}`);
        else agreements.push(a);
      });
    }
  }

  if (p.dataRetention !== undefined) {
    if (!isPlainObject(p.dataRetention)) errors.push(`${COMPLIANCE_PROFILE_PATH}: "dataRetention" must be an object { policy, status }`);
    else {
      if (typeof p.dataRetention.policy !== 'string' || !p.dataRetention.policy.trim()) errors.push(`${COMPLIANCE_PROFILE_PATH}: dataRetention.policy is required (e.g. "P30D", "7 years")`);
      if (!CONTROL_STATUS.includes(p.dataRetention.status)) errors.push(`${COMPLIANCE_PROFILE_PATH}: dataRetention.status must be ${CONTROL_STATUS.join(' | ')}`);
    }
  }

  if (p.approvedRegions !== undefined && (!Array.isArray(p.approvedRegions) || p.approvedRegions.some((r) => typeof r !== 'string' || !r.trim()))) {
    errors.push(`${COMPLIANCE_PROFILE_PATH}: "approvedRegions" must be an array of region strings`);
  }

  let waiver = null;
  if (p.waiver !== undefined) {
    if (!isPlainObject(p.waiver)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "waiver" must be an object { reason, approvedBy, expiresOn }`);
    } else {
      const reason = typeof p.waiver.reason === 'string' ? p.waiver.reason.trim() : '';
      const by = typeof p.waiver.approvedBy === 'string' ? p.waiver.approvedBy.trim() : '';
      if (reason.length < 10) errors.push(`${COMPLIANCE_PROFILE_PATH}: waiver.reason must be a real explanation (>= 10 chars)`);
      if (!by) errors.push(`${COMPLIANCE_PROFILE_PATH}: waiver.approvedBy is required`);
      if (p.waiver.expiresOn !== undefined) {
        if (!isValidDate(p.waiver.expiresOn)) errors.push(`${COMPLIANCE_PROFILE_PATH}: waiver.expiresOn must be an ISO date (YYYY-MM-DD)`);
        else if (Date.parse(p.waiver.expiresOn) < now.getTime()) errors.push(`${COMPLIANCE_PROFILE_PATH}: the waiver EXPIRED on ${p.waiver.expiresOn}`);
      }
      if (reason.length >= 10 && by) waiver = { reason, approvedBy: by, expiresOn: p.waiver.expiresOn };
    }
  }

  // --- fields that only a regulated profile must carry ---
  if (regimes.includes('none')) {
    const rationale = typeof p.noneRationale === 'string' ? p.noneRationale.trim() : '';
    if (rationale.length < 10) errors.push(`${COMPLIANCE_PROFILE_PATH}: regimes ["none"] requires "noneRationale" — say WHY no regime applies (>= 10 chars)`);
  } else if (regulated) {
    if (!Array.isArray(p.regulatedDataCategories) || !p.regulatedDataCategories.length) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "regulatedDataCategories" is required for a regulated profile (${DATA_CATEGORIES.join(' | ')})`);
    } else {
      for (const c of p.regulatedDataCategories) {
        if (!DATA_CATEGORIES.includes(c)) errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown regulatedDataCategory "${c}" (expected ${DATA_CATEGORIES.join(' | ')})`);
      }
    }
    if (p.thirdPartyModelPolicy === undefined) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "thirdPartyModelPolicy" is required for a regulated profile (${THIRD_PARTY_MODEL_POLICIES.join(' | ')})`);
    } else if (!THIRD_PARTY_MODEL_POLICIES.includes(p.thirdPartyModelPolicy)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: unknown thirdPartyModelPolicy "${p.thirdPartyModelPolicy}" (expected ${THIRD_PARTY_MODEL_POLICIES.join(' | ')})`);
    }
    if (!IMPLEMENTATION_STATUS.includes(p.implementationStatus)) {
      errors.push(`${COMPLIANCE_PROFILE_PATH}: "implementationStatus" is required for a regulated profile (${IMPLEMENTATION_STATUS.join(' | ')})`);
    }
  }

  const profile = {
    regimes,
    regulated,
    regulatedDataCategories: Array.isArray(p.regulatedDataCategories) ? p.regulatedDataCategories : [],
    thirdPartyModelPolicy: p.thirdPartyModelPolicy,
    approvedRegions: Array.isArray(p.approvedRegions) ? p.approvedRegions : [],
    agreements,
    controls,
    owner,
    approvalValid,
    implementationStatus: p.implementationStatus,
    waiver,
  };
  return { present: true, path, profile: errors.length ? null : profile, errors, warnings };
}

/**
 * Decide whether a regulated project may send data to / through an LLM path.
 * Pure function over an ALREADY VALID profile — returns the blocking reasons, never a keyword match.
 * @returns {string[]} blocking reasons (empty = boundary is approved AND implemented)
 */
export function evaluateDataBoundary(profile) {
  const problems = [];
  if (!profile) return ['the compliance profile is invalid — fix the errors above before the data boundary can be evaluated'];
  if (!profile.approvalValid) problems.push('the compliance approval is missing or expired (approval.approvedBy / approvedOn / reviewBy)');
  if (!profile.owner) problems.push('no owner is recorded');

  const impl = (key) => profile.controls[key] === 'implemented';
  switch (profile.thirdPartyModelPolicy) {
    case 'baa-dpa-signed': {
      const signed = profile.agreements.filter((a) => a.status === 'signed' && ['baa', 'dpa', 'scc'].includes(a.type));
      if (!signed.length) problems.push('thirdPartyModelPolicy is "baa-dpa-signed" but no agreement with status "signed" is recorded in "agreements"');
      break;
    }
    case 'self-hosted':
      break; // no third-party processor: the boundary is the deployment itself
    case 'redaction-gateway':
      if (!impl('redaction') && !impl('tokenization') && !impl('deIdentification')) {
        problems.push('thirdPartyModelPolicy is "redaction-gateway" but none of controls.redaction / tokenization / deIdentification is "implemented" — a planned or refused control is not a boundary');
      }
      break;
    case 'excluded':
      if (!impl('regulatedDataExcluded')) {
        problems.push('thirdPartyModelPolicy is "excluded" but controls.regulatedDataExcluded is not "implemented" — nothing enforces the exclusion');
      }
      break;
    case 'not-applicable':
      if (!profile.waiver) {
        problems.push('thirdPartyModelPolicy is "not-applicable" — that needs an explicit waiver { reason, approvedBy } saying why no regulated data can reach a model');
      }
      break;
    default:
      problems.push('no thirdPartyModelPolicy is recorded');
  }

  if (profile.implementationStatus && profile.implementationStatus !== 'implemented') {
    problems.push(`implementationStatus is "${profile.implementationStatus}" — the data boundary must be IMPLEMENTED before release, not planned/deferred`);
  }
  return problems;
}
