// dsar.go — Data Subject Access Requests: export (access/portability) + erase (right to erasure).
// Go parallel of dsar.mjs / dsar.py. GDPR Art.15/17/20 · PIPL 45/47. Landing point: data-api
// "Support subject deletion / export where PII is stored" + "Every deletion … is audited".
//
// A Source is any store that can export/erase ONE subject's rows — register one adapter per
// table/service. This is the pluggable "your data" seam. Handlers are synchronous here for a
// zero-dep skeleton; wrap them in goroutines / a task queue if exports are large.
package compliance

// Source exports/erases one subject's rows for a single table or service.
type Source interface {
	Name() string
	Export(subjectID string) any // structured rows for this subject (access/portability)
	Erase(subjectID string) int  // returns how many rows were erased
}

// ExportBundle is the structured, machine-readable access/portability payload (GDPR Art.20).
type ExportBundle struct {
	SubjectID   string
	GeneratedAt string
	Data        map[string]any
}

// ExportSubject gathers every source's rows for the subject and audits the access.
// Pass nil for log to use a fresh trail.
func ExportSubject(subjectID string, sources []Source, log *AuditLog) ExportBundle {
	if log == nil {
		log = NewAuditLog()
	}
	data := map[string]any{}
	names := make([]any, 0, len(sources))
	for _, s := range sources {
		data[s.Name()] = s.Export(subjectID)
		names = append(names, s.Name())
	}
	log.Record(Entry{"type": "dsar.export", "subjectId": subjectID, "sources": names})
	return ExportBundle{SubjectID: subjectID, GeneratedAt: now(), Data: data}
}

// EraseReceipt records WHAT was erased WHERE (not the data itself) — safe to keep/audit.
type EraseReceipt struct {
	SubjectID string
	ErasedAt  string
	Reason    string
	Erased    map[string]int
}

// EraseSubject runs erasure on every source and audits it. An empty reason defaults to
// "dsar.erasure". Backups inherit the same rule: re-run erasure on restore, or document the
// retention window + encryption so restored data self-expires. (.github/instructions/data-api)
func EraseSubject(subjectID string, sources []Source, reason string, log *AuditLog) EraseReceipt {
	if log == nil {
		log = NewAuditLog()
	}
	if reason == "" {
		reason = "dsar.erasure"
	}
	erased := map[string]int{}
	for _, s := range sources {
		erased[s.Name()] = s.Erase(subjectID)
	}
	log.Record(Entry{"type": "dsar.erase", "subjectId": subjectID, "reason": reason, "erased": erased})
	return EraseReceipt{SubjectID: subjectID, ErasedAt: now(), Reason: reason, Erased: erased}
}
