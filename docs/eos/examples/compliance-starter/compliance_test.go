// compliance_test.go — proves the Go skeletons run out of the box. Zero-dependency (stdlib
// `testing`). Run: `go test ./...` (or `go test -v`) from this directory.
// Mirrors compliance.test.mjs / test_compliance.py one-for-one (same 7 cases).
package compliance

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestRedactionRegimeScoping(t *testing.T) {
	// PCI-DSS scope = cardholder data only; a plain email is out of scope and stays.
	pci := CreateRedactor([]string{"PCI-DSS"}) // alias resolves to PCI
	p := pci.Redact(map[string]any{"cardNumber": "4111111111111111", "email": "jane@example.com"}).(map[string]any)
	if p["cardNumber"] != "«REDACTED:cardnumber»" {
		t.Fatalf("PCI should mask cardNumber, got %v", p["cardNumber"])
	}
	if p["email"] != "jane@example.com" {
		t.Fatalf("PCI scope must not touch a non-card email, got %v", p["email"])
	}

	// HIPAA scope = PHI (identifiers + health), but NOT a raw card number (that is PCI's regime).
	hipaa := CreateRedactor([]string{"HIPAA"})
	h := hipaa.Redact(map[string]any{"mrn": "MR-9", "email": "jane@example.com", "pan": "4111111111111111"}).(map[string]any)
	if h["mrn"] != "«REDACTED:mrn»" {
		t.Fatalf("HIPAA should mask mrn, got %v", h["mrn"])
	}
	if h["email"] != "«REDACTED:email»" {
		t.Fatalf("HIPAA should mask email, got %v", h["email"])
	}
	if h["pan"] != "4111111111111111" {
		t.Fatalf("HIPAA-only must not redact card data (select PCI for that), got %v", h["pan"])
	}

	// base-only (no regime) = credentials/secrets only.
	base := CreateRedactor([]string{})
	if got := base.Redact(map[string]any{"token": "abc123", "email": "a@b.co"}).(map[string]any)["token"]; got != "«REDACTED:token»" {
		t.Fatalf("base should mask token, got %v", got)
	}
	if got := base.Redact(map[string]any{"email": "a@b.co"}).(map[string]any)["email"]; got != "a@b.co" {
		t.Fatalf("base must not touch email, got %v", got)
	}

	if len(pci.Regimes) != 1 || pci.Regimes[0] != "PCI" {
		t.Fatalf("expected regimes [PCI], got %v", pci.Regimes)
	}
	for _, n := range []string{"HIPAA", "PCI", "GDPR_PIPL"} {
		if _, ok := Profiles[n]; !ok {
			t.Fatalf("named regime preset %q must be exported", n)
		}
	}
}

func TestRedactionMasksCore(t *testing.T) {
	out := Redact(map[string]any{
		"userId": "u-123", // safe identifier — kept
		"email":  "jane@example.com",
		"note":   "card 4111 1111 1111 1111, ssn 123-45-6789, call 555-123-4567",
		"order":  map[string]any{"total": 42}, // safe — kept
	}).(map[string]any)
	if out["userId"] != "u-123" {
		t.Fatalf("safe id changed: %v", out["userId"])
	}
	if out["order"].(map[string]any)["total"] != 42 {
		t.Fatalf("nested safe value changed: %v", out["order"])
	}
	if out["email"] != "«REDACTED:email»" {
		t.Fatalf("email not masked: %v", out["email"])
	}
	note := out["note"].(string)
	if strings.Contains(note, "4111") {
		t.Fatal("PAN not stripped")
	}
	if strings.Contains(note, "123-45-6789") {
		t.Fatal("SSN not stripped")
	}
	if strings.Contains(note, "555-123-4567") {
		t.Fatal("phone not stripped")
	}
}

func TestLuhn(t *testing.T) {
	if !LuhnValid("4111111111111111") {
		t.Fatal("valid PAN should pass Luhn")
	}
	if LuhnValid("1234567890123456") {
		t.Fatal("non-card 16-digit id should fail Luhn")
	}
}

func TestAssertCleanBoundaryGuard(t *testing.T) {
	if AssertClean(map[string]any{"ssn": "123-45-6789"}) == nil {
		t.Fatal("assertClean should flag an ssn leak")
	}
	if len(Scan(map[string]any{"userId": "u-1", "qty": 3})) != 0 {
		t.Fatal("clean payload should scan empty")
	}
	if AssertClean(Redact(map[string]any{"email": "a@b.co", "qty": 3})) != nil {
		t.Fatal("payload should be clean after redact")
	}
}

func TestConsent(t *testing.T) {
	c := NewConsentStore(nil)
	c.Grant("u-1", "marketing")
	c.Grant("u-1", "analytics")
	if !c.Check("u-1", "marketing") {
		t.Fatal("marketing should be granted")
	}

	c.Revoke("u-1", "marketing") // withdrawal as easy as granting
	if c.Check("u-1", "marketing") {
		t.Fatal("marketing should be revoked")
	}
	if !c.Check("u-1", "analytics") {
		t.Fatal("purposes must be independent (PIPL separate consent)")
	}
	if c.Check("u-1", "never-asked") {
		t.Fatal("never-asked purpose must be false")
	}

	keys := []string{}
	for k := range c.State("u-1") {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) != 2 || keys[0] != "analytics" || keys[1] != "marketing" {
		t.Fatalf("expected [analytics marketing], got %v", keys)
	}
	if n := len(c.Log.All()); n != 3 {
		t.Fatalf("expected 3 audit entries (2 grants + 1 revoke), got %d", n)
	}
}

// fakeSource is a DSAR adapter for the test: name + export + erase, recording erase order.
type fakeSource struct {
	name  string
	rows  any
	count int
	sink  *[]string
}

func (f fakeSource) Name() string      { return f.name }
func (f fakeSource) Export(string) any { return f.rows }
func (f fakeSource) Erase(string) int  { *f.sink = append(*f.sink, f.name); return f.count }

func TestDSAR(t *testing.T) {
	var erased []string
	sources := []Source{
		fakeSource{name: "profiles", rows: []any{map[string]any{"id": "u-1", "city": "X"}}, count: 1, sink: &erased},
		fakeSource{name: "orders", rows: []any{map[string]any{"id": "o-9"}}, count: 1, sink: &erased},
	}

	bundle := ExportSubject("u-1", sources, nil)
	if _, ok := bundle.Data["profiles"]; !ok {
		t.Fatal("export must include profiles source")
	}
	if _, ok := bundle.Data["orders"]; !ok {
		t.Fatal("export must include orders source")
	}
	if bundle.GeneratedAt == "" {
		t.Fatal("export must be timestamped/portable")
	}

	receipt := EraseSubject("u-1", sources, "user-request", nil)
	sort.Strings(erased)
	if len(erased) != 2 || erased[0] != "orders" || erased[1] != "profiles" {
		t.Fatalf("erase must run each source, got %v", erased)
	}
	if receipt.Erased["profiles"] != 1 || receipt.Erased["orders"] != 1 {
		t.Fatalf("erase counts wrong: %v", receipt.Erased)
	}
	if receipt.Reason != "user-request" {
		t.Fatalf("reason not recorded: %v", receipt.Reason)
	}
}

func TestProfileAutoSelect(t *testing.T) {
	// Pure parse: canonical line -> resolved profile names; rationale words are ignored.
	if got := strings.Join(ParseRegimes("# Compliance profile\n\n**Regulatory regime:** HIPAA, PCI-DSS\n"), ","); got != "HIPAA,PCI" {
		t.Fatalf("multi-regime parse wrong: %q", got)
	}
	// Slash / plus separators and mixed case also resolve.
	if got := strings.Join(ParseRegimes("Regulatory regime: gdpr / pipl"), ","); got != "GDPR_PIPL" {
		t.Fatalf("gdpr/pipl parse wrong: %q", got)
	}
	// Explicit `none` (with parenthetical rationale naming a regime) -> base only (empty).
	if got := ParseRegimes("Regulatory regime: none (generic PII, no PCI applies)"); len(got) != 0 {
		t.Fatalf("none must parse to empty, got %v", got)
	}

	// File round-trip: write a profile, build the redactor straight from it.
	dir := t.TempDir()
	f := filepath.Join(dir, "compliance-profile.md")
	if err := os.WriteFile(f, []byte("# Compliance profile\n\n**Regulatory regime:** HIPAA\n\nRationale: PHI.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r, err := RedactorFromProfile(f)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Join(r.Regimes, ",") != "HIPAA" {
		t.Fatalf("redactor should scope to HIPAA, got %v", r.Regimes)
	}

	// Missing file -> fail-safe: all regimes + the read error (never silently under-redact).
	strict, err := RedactorFromProfile(filepath.Join(dir, "nope.md"))
	if err == nil {
		t.Fatal("missing profile should return the read error")
	}
	if strings.Join(strict.Regimes, ",") != "HIPAA,PCI,GDPR_PIPL" {
		t.Fatalf("missing profile must fail safe to all regimes, got %v", strict.Regimes)
	}
}
