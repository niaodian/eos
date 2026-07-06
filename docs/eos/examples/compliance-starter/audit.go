// audit.go — append-only who/when/what trail shared by consent + DSAR.
// Go parallel of audit.mjs / audit.py. Landing point: data-api "Every deletion of user data
// is audited (who/when/what), without logging the data itself."
// (.github/instructions/data-api/20-data-api.instructions.md)
//
// Stub: swap the in-memory slice for a WORM store / append-only audit table.
// NEVER write raw PII here — log identifiers + action, not the personal data.
package compliance

import "time"

// Entry is one audit record (who/when/what). Keep it PII-free.
type Entry map[string]any

// AuditLog is an append-only trail. Not safe for concurrent writers as-is; wrap with a
// sync.Mutex or hand writes to a single goroutine / your DB if you share it across requests.
type AuditLog struct {
	entries []Entry
}

// NewAuditLog builds an empty trail. Mirrors audit()/AuditLog() in the sibling ports.
func NewAuditLog() *AuditLog { return &AuditLog{} }

// Record appends a timestamped copy of entry and returns it.
func (a *AuditLog) Record(entry Entry) Entry {
	e := Entry{"at": now()}
	for k, v := range entry {
		e[k] = v
	}
	a.entries = append(a.entries, e)
	return e
}

// All returns a shallow copy of the trail so callers can't append to the internal slice.
// (Go has no frozen map; the Entry maps are shared. Deep-copy on read if you need true
// immutability, or keep this internal and expose a read model.)
func (a *AuditLog) All() []Entry {
	out := make([]Entry, len(a.entries))
	copy(out, a.entries)
	return out
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }
