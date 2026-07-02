// Consent.java — per-purpose, versioned, revocable consent. Java parallel of consent.mjs / consent.py.
// GDPR Art.6/7 (lawful basis; withdrawal as easy as giving); PIPL separate consent for
// sensitive PI / cross-border (per-purpose flags, never a bundled all-or-nothing checkbox).
//
// In-memory stub: swap `store` for your DB table
//   (subject_id, purpose, granted, basis, version, at) with the latest row per (subject, purpose).
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

public final class Consent {
    private final Map<String, Map<String, Object>> store = new HashMap<>(); // "subject::purpose" -> latest record
    public final Audit log;

    public Consent(Audit log) {
        this.log = (log != null) ? log : Audit.create();
    }

    public static Consent create() {
        return new Consent(null);
    }

    public static Consent create(Audit log) {
        return new Consent(log);
    }

    private static String key(String subjectId, String purpose) {
        return subjectId + "::" + purpose;
    }

    private static String now() {
        return Instant.now().toString();
    }

    /** Record consent for ONE purpose with defaults (basis "consent", version "v1"). */
    public Map<String, Object> grant(String subjectId, String purpose) {
        return grant(subjectId, purpose, "consent", "v1");
    }

    /** Record consent for ONE purpose. Separate purposes = separate consent (PIPL). */
    public Map<String, Object> grant(String subjectId, String purpose, String basis, String version) {
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("subjectId", subjectId);
        rec.put("purpose", purpose);
        rec.put("granted", true);
        rec.put("basis", basis);
        rec.put("version", version);
        rec.put("at", now());
        store.put(key(subjectId, purpose), rec);
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("type", "consent.grant");
        ev.put("subjectId", subjectId);
        ev.put("purpose", purpose);
        ev.put("version", version);
        ev.put("basis", basis);
        log.record(ev);
        return rec;
    }

    /** Withdrawal must be as easy as granting (GDPR Art.7(3)). No data logged, just the action. */
    public Map<String, Object> revoke(String subjectId, String purpose) {
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("subjectId", subjectId);
        rec.put("purpose", purpose);
        rec.put("granted", false);
        rec.put("at", now());
        store.put(key(subjectId, purpose), rec);
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("type", "consent.revoke");
        ev.put("subjectId", subjectId);
        ev.put("purpose", purpose);
        log.record(ev);
        return rec;
    }

    /** Gate a purpose-bound processing step on this. */
    public boolean check(String subjectId, String purpose) {
        Map<String, Object> rec = store.get(key(subjectId, purpose));
        return rec != null && Boolean.TRUE.equals(rec.get("granted"));
    }

    /** Queryable consent state for a subject (feeds DSAR "access" + your consent dashboard). */
    public Map<String, Map<String, Object>> state(String subjectId) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> rec : store.values()) {
            if (subjectId.equals(rec.get("subjectId"))) {
                out.put((String) rec.get("purpose"), rec);
            }
        }
        return out;
    }
}
