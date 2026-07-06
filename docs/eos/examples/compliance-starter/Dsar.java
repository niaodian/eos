// Dsar.java — Data Subject Access Requests: export (access/portability) + erase (right to erasure).
// Java parallel of dsar.mjs / dsar.py. GDPR Art.15/17/20 · PIPL 45/47. Landing point: data-api
// "Support subject deletion / export where PII is stored" + "Every deletion … is audited".
//
// A Source is any store that can export/erase ONE subject's rows — register one adapter per
// table/service. This is the pluggable "your data" seam. Handlers are synchronous here for a
// zero-dep skeleton; wrap them in your framework's async / a task queue if exports are large.
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Dsar {

    /** One table/service that can export and erase a single subject's rows. */
    public interface Source {
        String name();

        Object export(String subjectId);

        int erase(String subjectId); // returns how many rows were erased
    }

    private Dsar() {
    }

    private static String now() {
        return Instant.now().toString();
    }

    /** Access + Portability: structured, machine-readable bundle (GDPR Art.20). Pass null log for a fresh trail. */
    public static Map<String, Object> exportSubject(String subjectId, List<Source> sources, Audit log) {
        Audit lg = (log != null) ? log : Audit.create();
        Map<String, Object> data = new LinkedHashMap<>();
        List<Object> names = new ArrayList<>();
        for (Source s : sources) {
            data.put(s.name(), s.export(subjectId));
            names.add(s.name());
        }
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("type", "dsar.export");
        ev.put("subjectId", subjectId);
        ev.put("sources", names);
        lg.record(ev);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("subjectId", subjectId);
        out.put("generatedAt", now());
        out.put("data", data);
        return out;
    }

    /** Right to erasure. Returns an audit-friendly record of WHAT was erased WHERE (not the data itself). */
    public static Map<String, Object> eraseSubject(String subjectId, List<Source> sources, String reason, Audit log) {
        Audit lg = (log != null) ? log : Audit.create();
        String rsn = (reason != null && !reason.isEmpty()) ? reason : "dsar.erasure";
        Map<String, Object> erased = new LinkedHashMap<>();
        for (Source s : sources) {
            erased.put(s.name(), s.erase(subjectId));
        }
        // Backups inherit the same rule: re-run erasure on restore, or document the retention
        // window + encryption so restored data self-expires. (.github/instructions/data-api)
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("type", "dsar.erase");
        ev.put("subjectId", subjectId);
        ev.put("reason", rsn);
        ev.put("erased", erased);
        lg.record(ev);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("subjectId", subjectId);
        out.put("erasedAt", now());
        out.put("reason", rsn);
        out.put("erased", erased);
        return out;
    }
}
