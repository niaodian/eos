"""redaction.py — strip regulated fields BEFORE any third-party / cross-border / LLM call.

Zero-dependency (stdlib only), deterministic, offline. Python parallel of ``redaction.mjs``.
This is the *code form* of the Agentic data-boundary (docs/checklists/F-compliance.md) and
eos-doctor D5, enforcing the rule "Never place secrets or PII in prompts or logs. Redact
before sending to the provider." (.github/instructions/ai/10-ai-llm.instructions.md).

Regime presets (compose only what your /compliance profile selected)::

    create_redactor(["PCI-DSS"])         # base + cardholder data only
    create_redactor(["HIPAA"])           # base + PHI (personal identifiers + health fields)
    create_redactor(["GDPR", "PIPL"])    # base + personal data
    create_redactor()                    # all regimes (also the module-level default below)

A redactor exposes ``redact(value)``, ``scan(value)``, ``assert_clean(value)``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable, NamedTuple


# ── Luhn (card) check so we only redact real PANs, not any 13–19 digit id ──────────────
def luhn_valid(digits: str) -> bool:
    if not re.fullmatch(r"\d{13,19}", digits or ""):
        return False
    total, alt = 0, False
    for ch in reversed(digits):
        n = ord(ch) - 48
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


# ── Value patterns (catch PII in free text / unknown keys). ``validate`` gates a match. ─
class Pattern(NamedTuple):
    label: str
    regex: re.Pattern
    validate: Callable[[str], bool] | None = None


EMAIL = Pattern("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"))
SSN = Pattern("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"))
PHONE = Pattern("phone", re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b"))
PAN = Pattern("pan", re.compile(r"\b(?:\d[ -]?){13,19}\b"), lambda m: luhn_valid(re.sub(r"\D", "", m)))

# Shared "direct personal identifiers" — HIPAA (18 Safe Harbor items) and GDPR/PIPL both want these out.
PERSONAL_KEYS = ["email", "phone", "telephone", "fax", "dob", "dateofbirth", "birthdate",
                 "address", "ssn", "socialsecurity"]
PERSONAL_PATTERNS = [EMAIL, SSN, PHONE]


@dataclass(frozen=True)
class Profile:
    keys: list[str]
    patterns: list[Pattern]


# ── Regime profiles. keys = case-insensitive SUBSTRING match on mapping keys. ───────────
# ⚠ Substring matching means SHORT tokens over-match ('pin'⊂'shipping', 'track'⊂'tracking',
#   'sin'⊂'business'). Tokens below are curated to be distinctive; if your schema still
#   collides, switch _is_denied_key to exact-match or scope the key list per module.
PROFILES: dict[str, Profile] = {
    # Credentials/secrets — never leave the boundary regardless of regulatory regime.
    "base": Profile(
        keys=["password", "passwd", "secret", "token", "apikey", "api_key", "accesskey",
              "credential", "privatekey", "private_key"],
        patterns=[],
    ),
    # HIPAA: PHI = personal identifiers + health-specific fields (Security/Privacy Rule, Safe Harbor).
    "HIPAA": Profile(
        keys=[*PERSONAL_KEYS, "mrn", "medicalrecord", "medical_record", "phi", "diagnosis",
              "icd", "healthplan", "health_plan", "beneficiary", "npi", "dea", "patientid"],
        patterns=[*PERSONAL_PATTERNS],
    ),
    # PCI-DSS: cardholder data (CHD) + sensitive authentication data (SAD) only — scoped to cards.
    "PCI": Profile(
        keys=["pan", "cardnumber", "card_number", "cardno", "cvv", "cvc", "cvv2", "track1",
              "track2", "magstripe", "pinblock", "expiry", "expiration"],
        patterns=[PAN],
    ),
    # GDPR / CCPA / PIPL: personal data — identifiers + national/sensitive PI.
    "GDPR_PIPL": Profile(
        keys=[*PERSONAL_KEYS, "nationalid", "national_id", "idcard", "passport", "taxid",
              "drivinglicense", "driverslicense", "biometric", "geolocation"],
        patterns=[*PERSONAL_PATTERNS],
    ),
}

# Map the regime names /compliance uses onto profile keys.
REGIME_ALIASES = {
    "hipaa": "HIPAA",
    "pci": "PCI", "pci-dss": "PCI", "pcidss": "PCI",
    "gdpr": "GDPR_PIPL", "ccpa": "GDPR_PIPL", "ccpa-cpra": "GDPR_PIPL", "pipl": "GDPR_PIPL",
}

_DEFAULT_REGIMES = ["HIPAA", "PCI", "GDPR_PIPL"]
_MASK_RE = re.compile(r"^«REDACTED:[^»]+»$")


def _mask(label: str) -> str:
    return f"«REDACTED:{label}»"


def _is_mask(v: Any) -> bool:
    return isinstance(v, str) and bool(_MASK_RE.match(v))


def _is_empty(v: Any) -> bool:
    return v is None or v == ""


def _to_profile_name(regime: str) -> str | None:
    if regime in PROFILES:
        return regime
    return REGIME_ALIASES.get(str(regime).lower())


class Redactor:
    """Redactor bound to a set of regimes. Build via ``create_redactor``."""

    def __init__(self, regimes: Iterable[str] | None = None):
        names = ["base"]
        for r in (regimes if regimes is not None else _DEFAULT_REGIMES):
            n = _to_profile_name(r)
            if n and n not in names:
                names.append(n)
        keys: list[str] = []
        patterns: list[Pattern] = []
        seen_key: set[str] = set()
        seen_pat: set[str] = set()
        for n in names:
            prof = PROFILES.get(n)
            if not prof:
                continue
            for k in prof.keys:
                lk = k.lower()
                if lk not in seen_key:
                    seen_key.add(lk)
                    keys.append(lk)
            for p in prof.patterns:
                if p.label not in seen_pat:
                    seen_pat.add(p.label)
                    patterns.append(p)
        # Validate-gated patterns (PAN) first — they consume digit runs before generic matchers.
        patterns.sort(key=lambda p: 0 if p.validate else 1)
        self.regimes = [n for n in names if n != "base"]
        self.keys = keys
        self.patterns = patterns

    # ── internals ──────────────────────────────────────────────────────────────────────
    def _is_denied_key(self, k: str) -> bool:
        lk = k.lower()
        return any(d in lk for d in self.keys)

    def _redact_string(self, s: str) -> str:
        out = s
        for p in self.patterns:
            if p.validate is None:
                out = p.regex.sub(_mask(p.label), out)
            else:
                out = p.regex.sub(lambda m, _p=p: _mask(_p.label) if _p.validate(m.group(0)) else m.group(0), out)
        return out

    # ── public API ───────────────────────────────────────────────────────────────────--
    def redact(self, value: Any) -> Any:
        """Deep copy with regulated fields masked. Safe to send to a provider or log."""
        if isinstance(value, list):
            return [self.redact(x) for x in value]
        if isinstance(value, dict):
            return {k: (_mask(k.lower()) if self._is_denied_key(k) else self.redact(v)) for k, v in value.items()}
        if isinstance(value, str):
            return self._redact_string(value)
        return value

    # PII-free logging alias — data-api: "every deletion audited … without logging the data itself".
    def redact_for_log(self, value: Any) -> Any:
        return self.redact(value)

    def scan(self, value: Any) -> list[dict]:
        """Report every place regulated data would leak (path + kind). Empty list == clean."""
        hits: list[dict] = []

        def walk(v: Any, p: str) -> None:
            if isinstance(v, list):
                for i, x in enumerate(v):
                    walk(x, f"{p}[{i}]")
            elif isinstance(v, dict):
                for k, val in v.items():
                    if self._is_denied_key(k) and not _is_empty(val) and not _is_mask(val):
                        hits.append({"path": f"{p}.{k}", "kind": f"key:{k.lower()}"})
                    walk(val, f"{p}.{k}")
            elif isinstance(v, str) and self._redact_string(v) != v:
                hits.append({"path": p, "kind": "value-pattern"})

        walk(value, "$")
        return hits

    def assert_clean(self, value: Any) -> Any:
        """Boundary guard — call right before any cross-border / third-party / LLM request."""
        hits = self.scan(value)
        if hits:
            detail = ", ".join(f"{h['path']} ({h['kind']})" for h in hits)
            err = ValueError(f"redaction: {len(hits)} regulated field(s) would leave the boundary: {detail}")
            err.violations = hits  # type: ignore[attr-defined]
            raise err
        return value


def create_redactor(regimes: Iterable[str] | None = None) -> Redactor:
    """Build a redactor bound to the selected regimes. Main entry point."""
    return Redactor(regimes)


# ── Default instance = all regimes. Module-level convenience API. ──────────────────────
_default = create_redactor()
redact = _default.redact
redact_for_log = _default.redact_for_log
scan = _default.scan
assert_clean = _default.assert_clean
DENY_KEYS = _default.keys  # composed deny list of the default (all-regime) instance
