// redaction.go — strip regulated fields BEFORE any third-party / cross-border / LLM call.
// Zero-dependency (stdlib only), deterministic, offline. Go parallel of redaction.mjs / redaction.py.
// This is the *code form* of the Agentic data-boundary (docs/checklists/F-compliance.md) and
// eos-doctor D5, enforcing "Never place secrets or PII in prompts or logs. Redact before sending
// to the provider." (.github/instructions/ai/10-ai-llm.instructions.md).
//
// Regime presets (compose only what your /compliance profile selected):
//
//	CreateRedactor([]string{"PCI-DSS"})       // base + cardholder data only
//	CreateRedactor([]string{"HIPAA"})         // base + PHI (personal identifiers + health fields)
//	CreateRedactor([]string{"GDPR", "PIPL"})  // base + personal data
//	CreateRedactor(nil)                       // all regimes (also the package-level default below)
//	CreateRedactor([]string{})                // base only (credentials/secrets)
//
// The values walked are the decoded-JSON shapes: map[string]any, []any, string, and scalars.
// A Redactor exposes Redact / Scan / AssertClean.
package compliance

import (
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
)

// ── Luhn (card) check so we only redact real PANs, not any 13–19 digit id ──────────────
var reDigits1319 = regexp.MustCompile(`^\d{13,19}$`)

// LuhnValid reports whether digits (13–19 chars) pass the Luhn checksum.
func LuhnValid(digits string) bool {
	if !reDigits1319.MatchString(digits) {
		return false
	}
	sum, alt := 0, false
	for i := len(digits) - 1; i >= 0; i-- {
		n := int(digits[i] - '0')
		if alt {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
		alt = !alt
	}
	return sum%10 == 0
}

// ── Value patterns (catch PII in free text / unknown keys). validate gates a match. ────
type pattern struct {
	label    string
	re       *regexp.Regexp
	validate func(string) bool // nil == always mask on match
}

var nonDigit = regexp.MustCompile(`\D`)

var (
	patEmail = pattern{"email", regexp.MustCompile(`[\w.+-]+@[\w-]+\.[\w.-]+`), nil}
	patSSN   = pattern{"ssn", regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`), nil}
	patPhone = pattern{"phone", regexp.MustCompile(`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`), nil}
	patPAN   = pattern{"pan", regexp.MustCompile(`\b(?:\d[ -]?){13,19}\b`), func(m string) bool { return LuhnValid(nonDigit.ReplaceAllString(m, "")) }}
)

// Shared "direct personal identifiers" — HIPAA (18 Safe Harbor items) and GDPR/PIPL both want these out.
var personalKeys = []string{"email", "phone", "telephone", "fax", "dob", "dateofbirth", "birthdate", "address", "ssn", "socialsecurity"}
var personalPatterns = []pattern{patEmail, patSSN, patPhone}

// Profile is one regulatory regime's deny config. Fields are unexported; use the API below.
type Profile struct {
	keys     []string
	patterns []pattern
}

// withPersonal returns a copy of personalKeys plus extras (never aliases the shared slice).
func withPersonal(extra ...string) []string {
	return append(append([]string{}, personalKeys...), extra...)
}

// ── Regime profiles. keys = case-insensitive SUBSTRING match on object keys. ───────────
// ⚠ Substring matching means SHORT tokens over-match ('pin'⊂'shipping', 'track'⊂'tracking',
//
//	'sin'⊂'business'). Tokens below are curated to be distinctive; if your schema still
//	collides, switch isDeniedKey to exact-match or scope the key list per module.
//
// Profiles holds every regime preset, keyed by profile name.
var Profiles = map[string]Profile{
	// Credentials/secrets — never leave the boundary regardless of regulatory regime.
	"base": {keys: []string{"password", "passwd", "secret", "token", "apikey", "api_key", "accesskey", "credential", "privatekey", "private_key"}, patterns: nil},
	// HIPAA: PHI = personal identifiers + health-specific fields (Security/Privacy Rule, Safe Harbor).
	"HIPAA": {keys: withPersonal("mrn", "medicalrecord", "medical_record", "phi", "diagnosis", "icd", "healthplan", "health_plan", "beneficiary", "npi", "dea", "patientid"), patterns: personalPatterns},
	// PCI-DSS: cardholder data (CHD) + sensitive authentication data (SAD) only — scoped to cards.
	"PCI": {keys: []string{"pan", "cardnumber", "card_number", "cardno", "cvv", "cvc", "cvv2", "track1", "track2", "magstripe", "pinblock", "expiry", "expiration"}, patterns: []pattern{patPAN}},
	// GDPR / CCPA / PIPL: personal data — identifiers + national/sensitive PI.
	"GDPR_PIPL": {keys: withPersonal("nationalid", "national_id", "idcard", "passport", "taxid", "drivinglicense", "driverslicense", "biometric", "geolocation"), patterns: personalPatterns},
}

// RegimeAliases maps the regime names /compliance uses onto profile keys.
var RegimeAliases = map[string]string{
	"hipaa": "HIPAA",
	"pci":   "PCI", "pci-dss": "PCI", "pcidss": "PCI",
	"gdpr": "GDPR_PIPL", "ccpa": "GDPR_PIPL", "ccpa-cpra": "GDPR_PIPL", "pipl": "GDPR_PIPL",
}

var defaultRegimes = []string{"HIPAA", "PCI", "GDPR_PIPL"}
var reMask = regexp.MustCompile(`^«REDACTED:[^»]+»$`)

func mask(label string) string { return "«REDACTED:" + label + "»" }

func isMask(v any) bool {
	s, ok := v.(string)
	return ok && reMask.MatchString(s)
}

func isEmpty(v any) bool {
	if v == nil {
		return true
	}
	s, ok := v.(string)
	return ok && s == ""
}

func toProfileName(r string) string {
	if _, ok := Profiles[r]; ok {
		return r
	}
	return RegimeAliases[strings.ToLower(r)]
}

// Hit is one leak location reported by Scan (path + kind).
type Hit struct {
	Path string
	Kind string
}

// Redactor is bound to a set of regimes. Build via CreateRedactor.
type Redactor struct {
	Regimes  []string // active regimes (base excluded)
	keys     []string
	patterns []pattern
}

// CreateRedactor builds a redactor for the selected regimes. Pass nil for all regimes
// (the default), an empty slice for base-only, or names/aliases like "HIPAA" / "pci-dss".
func CreateRedactor(regimes []string) *Redactor {
	names := []string{"base"}
	src := regimes
	if regimes == nil {
		src = defaultRegimes
	}
	for _, r := range src {
		if n := toProfileName(r); n != "" && !contains(names, n) {
			names = append(names, n)
		}
	}
	var keys []string
	var pats []pattern
	seenKey := map[string]bool{}
	seenPat := map[string]bool{}
	for _, n := range names {
		p, ok := Profiles[n]
		if !ok {
			continue
		}
		for _, k := range p.keys {
			lk := strings.ToLower(k)
			if !seenKey[lk] {
				seenKey[lk] = true
				keys = append(keys, lk)
			}
		}
		for _, pt := range p.patterns {
			if !seenPat[pt.label] {
				seenPat[pt.label] = true
				pats = append(pats, pt)
			}
		}
	}
	// Validate-gated patterns (PAN) first — they consume digit runs before generic matchers.
	sort.SliceStable(pats, func(i, j int) bool {
		return pats[i].validate != nil && pats[j].validate == nil
	})
	active := []string{}
	for _, n := range names {
		if n != "base" {
			active = append(active, n)
		}
	}
	return &Redactor{Regimes: active, keys: keys, patterns: pats}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// Keys returns the composed deny-key list (lowercased, deduped).
func (r *Redactor) Keys() []string { return append([]string{}, r.keys...) }

// PatternLabels returns the active value-pattern labels in match order.
func (r *Redactor) PatternLabels() []string {
	out := make([]string, len(r.patterns))
	for i, p := range r.patterns {
		out[i] = p.label
	}
	return out
}

func (r *Redactor) isDeniedKey(k string) bool {
	lk := strings.ToLower(k)
	for _, d := range r.keys {
		if strings.Contains(lk, d) {
			return true
		}
	}
	return false
}

func (r *Redactor) redactString(s string) string {
	out := s
	for _, p := range r.patterns {
		p := p // capture per iteration (safe on every Go version)
		if p.validate == nil {
			out = p.re.ReplaceAllString(out, mask(p.label))
		} else {
			out = p.re.ReplaceAllStringFunc(out, func(m string) string {
				if p.validate(m) {
					return mask(p.label)
				}
				return m
			})
		}
	}
	return out
}

// Redact returns a deep copy with regulated fields masked (safe to send / log).
func (r *Redactor) Redact(value any) any {
	switch val := value.(type) {
	case []any:
		out := make([]any, len(val))
		for i, x := range val {
			out[i] = r.Redact(x)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, v := range val {
			if r.isDeniedKey(k) {
				out[k] = mask(strings.ToLower(k))
			} else {
				out[k] = r.Redact(v)
			}
		}
		return out
	case string:
		return r.redactString(val)
	default:
		return value
	}
}

// RedactForLog is a PII-free logging alias for Redact.
func (r *Redactor) RedactForLog(value any) any { return r.Redact(value) }

// Scan reports every place regulated data would leak (path + kind). Empty == clean.
func (r *Redactor) Scan(value any) []Hit {
	var hits []Hit
	var walk func(v any, p string)
	walk = func(v any, p string) {
		switch val := v.(type) {
		case []any:
			for i, x := range val {
				walk(x, fmt.Sprintf("%s[%d]", p, i))
			}
		case map[string]any:
			for k, vv := range val {
				if r.isDeniedKey(k) && !isEmpty(vv) && !isMask(vv) {
					hits = append(hits, Hit{Path: p + "." + k, Kind: "key:" + strings.ToLower(k)})
				}
				walk(vv, p+"."+k)
			}
		case string:
			if r.redactString(val) != val {
				hits = append(hits, Hit{Path: p, Kind: "value-pattern"})
			}
		}
	}
	walk(value, "$")
	return hits
}

// AssertClean is the boundary guard — call it right before any cross-border / third-party /
// LLM request. It returns a non-nil error (Go's idiom instead of throwing) if regulated data
// would leave the boundary.
func (r *Redactor) AssertClean(value any) error {
	hits := r.Scan(value)
	if len(hits) == 0 {
		return nil
	}
	parts := make([]string, len(hits))
	for i, h := range hits {
		parts[i] = fmt.Sprintf("%s (%s)", h.Path, h.Kind)
	}
	return fmt.Errorf("redaction: %d regulated field(s) would leave the boundary: %s", len(hits), strings.Join(parts, ", "))
}

// ── Default instance = all regimes. Package-level convenience API. ─────────────────────
var defaultRedactor = CreateRedactor(nil)

var (
	reRegimeLine   = regexp.MustCompile(`(?i)regulatory\s+regime\s*[:：]\s*(.+)`)
	reRegimeSplit  = regexp.MustCompile(`[\s,/+&]+`)
	reLeadEmphasis = regexp.MustCompile(`^[*_\s]+`)
	reNonePrefix   = regexp.MustCompile(`(?i)^none\b`)
)

// ParseRegimes extracts resolved regime names from the "Regulatory regime:" line that
// /compliance writes into docs/compliance-profile.md. Only tokens that resolve to a known
// regime are kept, so free-text rationale on the line is ignored; an explicit `none` (or no
// match) yields a non-nil empty slice, which CreateRedactor scopes to base credentials only.
func ParseRegimes(profileText string) []string {
	out := []string{}
	m := reRegimeLine.FindStringSubmatch(profileText)
	if m == nil {
		return out
	}
	val := reLeadEmphasis.ReplaceAllString(m[1], "") // drop leading **bold**
	for _, p := range []string{"(", "（"} {           // drop parenthetical rationale
		if i := strings.Index(val, p); i >= 0 {
			val = val[:i]
		}
	}
	val = strings.TrimSpace(val)
	if reNonePrefix.MatchString(val) {
		return out
	}
	for _, tok := range reRegimeSplit.Split(val, -1) {
		if tok == "" {
			continue
		}
		if n := toProfileName(tok); n != "" && n != "base" && !contains(out, n) {
			out = append(out, n)
		}
	}
	return out
}

// RedactorFromProfile builds a redactor from the /compliance profile doc. Pass "" to use the
// default path (docs/compliance-profile.md). A present file scopes to its regimes (or base
// only for `none`); a missing file returns the fail-safe all-regime redactor together with the
// read error, so a caller may surface it or ignore it and keep the strict default — never
// silently under-redacting.
func RedactorFromProfile(path string) (*Redactor, error) {
	if path == "" {
		path = "docs/compliance-profile.md"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return CreateRedactor(nil), err
	}
	return CreateRedactor(ParseRegimes(string(data))), nil
}

// Redact masks regulated fields using the all-regime default instance.
func Redact(v any) any { return defaultRedactor.Redact(v) }

// RedactForLog is the PII-free logging alias on the default instance.
func RedactForLog(v any) any { return defaultRedactor.RedactForLog(v) }

// Scan reports leaks using the default instance.
func Scan(v any) []Hit { return defaultRedactor.Scan(v) }

// AssertClean is the boundary guard on the default instance.
func AssertClean(v any) error { return defaultRedactor.AssertClean(v) }

// DenyKeys is the composed deny list of the default (all-regime) instance — for inspection.
var DenyKeys = defaultRedactor.keys
