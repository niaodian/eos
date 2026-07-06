// Audit.java — append-only who/when/what trail shared by consent + DSAR.
// Java parallel of audit.mjs / audit.py. Landing point: data-api "Every deletion of user data
// is audited (who/when/what), without logging the data itself."
// (.github/instructions/data-api/20-data-api.instructions.md)
//
// Stub: swap the in-memory list for a WORM store / append-only audit table.
// NEVER write raw PII here — log identifiers + action, not the personal data.
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Audit {
    private final List<Map<String, Object>> entries = new ArrayList<>();

    /** Append a timestamped, read-only copy of {@code entry} and return it. */
    public Map<String, Object> record(Map<String, Object> entry) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Instant.now().toString());
        e.putAll(entry);
        Map<String, Object> readOnly = Collections.unmodifiableMap(e); // frozen entry (parity with Object.freeze / MappingProxyType)
        entries.add(readOnly);
        return readOnly;
    }

    /** Return a shallow copy of the trail so callers can't mutate it. */
    public List<Map<String, Object>> all() {
        return new ArrayList<>(entries);
    }

    /** Factory mirroring audit() in the sibling ports. */
    public static Audit create() {
        return new Audit();
    }
}
