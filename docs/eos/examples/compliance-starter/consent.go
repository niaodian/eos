// consent.go — per-purpose, versioned, revocable consent. Go parallel of consent.mjs / consent.py.
// GDPR Art.6/7 (lawful basis; withdrawal as easy as giving); PIPL separate consent for
// sensitive PI / cross-border (per-purpose flags, never a bundled all-or-nothing checkbox).
//
// In-memory stub: swap `store` for your DB table
//
//	(subject_id, purpose, granted, basis, version, at) with the latest row per (subject, purpose).
package compliance

// ConsentRecord is the latest state for one (subject, purpose).
type ConsentRecord struct {
	SubjectID string
	Purpose   string
	Granted   bool
	Basis     string
	Version   string
	At        string
}

// GrantOption tweaks the record written by Grant (idiomatic Go stand-in for the JS options
// object / Python keyword args). Use WithBasis / WithVersion.
type GrantOption func(*ConsentRecord)

// WithBasis sets the lawful basis (default "consent").
func WithBasis(basis string) GrantOption { return func(r *ConsentRecord) { r.Basis = basis } }

// WithVersion sets the consent notice version (default "v1").
func WithVersion(version string) GrantOption { return func(r *ConsentRecord) { r.Version = version } }

// ConsentStore records and queries per-purpose consent. Build via NewConsentStore.
type ConsentStore struct {
	store map[string]ConsentRecord // `${subjectId}::${purpose}` -> latest record
	Log   *AuditLog
}

// NewConsentStore builds a store; pass nil to get a fresh audit trail.
func NewConsentStore(log *AuditLog) *ConsentStore {
	if log == nil {
		log = NewAuditLog()
	}
	return &ConsentStore{store: map[string]ConsentRecord{}, Log: log}
}

func consentKey(subjectID, purpose string) string { return subjectID + "::" + purpose }

// Grant records consent for ONE purpose. Separate purposes = separate consent (PIPL).
func (c *ConsentStore) Grant(subjectID, purpose string, opts ...GrantOption) ConsentRecord {
	rec := ConsentRecord{SubjectID: subjectID, Purpose: purpose, Granted: true, Basis: "consent", Version: "v1", At: now()}
	for _, o := range opts {
		o(&rec)
	}
	c.store[consentKey(subjectID, purpose)] = rec
	c.Log.Record(Entry{"type": "consent.grant", "subjectId": subjectID, "purpose": purpose, "version": rec.Version, "basis": rec.Basis})
	return rec
}

// Revoke withdraws consent — must be as easy as granting (GDPR Art.7(3)). No data logged.
func (c *ConsentStore) Revoke(subjectID, purpose string) ConsentRecord {
	rec := ConsentRecord{SubjectID: subjectID, Purpose: purpose, Granted: false, At: now()}
	c.store[consentKey(subjectID, purpose)] = rec
	c.Log.Record(Entry{"type": "consent.revoke", "subjectId": subjectID, "purpose": purpose})
	return rec
}

// Check gates a purpose-bound processing step. True only if the latest record grants it.
func (c *ConsentStore) Check(subjectID, purpose string) bool {
	rec, ok := c.store[consentKey(subjectID, purpose)]
	return ok && rec.Granted
}

// State returns the queryable consent state for a subject (feeds DSAR "access" + a dashboard).
func (c *ConsentStore) State(subjectID string) map[string]ConsentRecord {
	out := map[string]ConsentRecord{}
	for _, v := range c.store {
		if v.SubjectID == subjectID {
			out[v.Purpose] = v
		}
	}
	return out
}
