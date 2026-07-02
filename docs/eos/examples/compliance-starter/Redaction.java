// Redaction.java — strip regulated fields BEFORE any third-party / cross-border / LLM call.
// Zero-dependency (JDK only), deterministic, offline. Java parallel of redaction.mjs / redaction.py.
// This is the *code form* of the Agentic data-boundary (docs/checklists/F-compliance.md) and
// eos-doctor D5, enforcing "Never place secrets or PII in prompts or logs. Redact before sending
// to the provider." (.github/instructions/ai/10-ai-llm.instructions.md).
//
// Regime presets (compose only what your /compliance profile selected):
//   Redaction.createRedactor(List.of("PCI-DSS"))       // base + cardholder data only
//   Redaction.createRedactor(List.of("HIPAA"))         // base + PHI (identifiers + health fields)
//   Redaction.createRedactor(List.of("GDPR", "PIPL"))  // base + personal data
//   Redaction.createRedactor()                         // all regimes (also the static default below)
//   Redaction.createRedactor(List.of())                // base only (credentials/secrets)
//
// The values walked are decoded-JSON shapes: Map<String,Object>, List<Object>, String, scalars.
// A Redactor exposes redact / scan / assertClean.
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Redaction {

    // ── Luhn (card) check so we only redact real PANs, not any 13–19 digit id ──────────
    private static final Pattern DIGITS_13_19 = Pattern.compile("^\\d{13,19}$");

    public static boolean luhnValid(String digits) {
        if (digits == null || !DIGITS_13_19.matcher(digits).matches()) {
            return false;
        }
        int sum = 0;
        boolean alt = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int n = digits.charAt(i) - '0';
            if (alt) {
                n *= 2;
                if (n > 9) {
                    n -= 9;
                }
            }
            sum += n;
            alt = !alt;
        }
        return sum % 10 == 0;
    }

    // ── Value patterns (catch PII in free text / unknown keys). validate gates a match. ─
    @FunctionalInterface
    interface Validator {
        boolean ok(String match);
    }

    static final class Pat {
        final String label;
        final Pattern re;
        final Validator validate; // null == always mask on match

        Pat(String label, String regex, Validator validate) {
            this.label = label;
            this.re = Pattern.compile(regex);
            this.validate = validate;
        }
    }

    private static final Pattern NON_DIGIT = Pattern.compile("\\D");
    static final Pat EMAIL = new Pat("email", "[\\w.+-]+@[\\w-]+\\.[\\w.-]+", null);
    static final Pat SSN = new Pat("ssn", "\\b\\d{3}-\\d{2}-\\d{4}\\b", null);
    static final Pat PHONE = new Pat("phone", "\\b\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b", null);
    static final Pat PAN = new Pat("pan", "\\b(?:\\d[ -]?){13,19}\\b",
            m -> luhnValid(NON_DIGIT.matcher(m).replaceAll("")));

    // Shared "direct personal identifiers" — HIPAA (18 Safe Harbor items) and GDPR/PIPL both want these out.
    static final List<String> PERSONAL_KEYS = List.of("email", "phone", "telephone", "fax", "dob",
            "dateofbirth", "birthdate", "address", "ssn", "socialsecurity");
    static final List<Pat> PERSONAL_PATTERNS = List.of(EMAIL, SSN, PHONE);

    static final class Profile {
        final List<String> keys;
        final List<Pat> patterns;

        Profile(List<String> keys, List<Pat> patterns) {
            this.keys = keys;
            this.patterns = patterns;
        }
    }

    private static List<String> withPersonal(String... extra) {
        List<String> out = new ArrayList<>(PERSONAL_KEYS);
        Collections.addAll(out, extra);
        return out;
    }

    // ── Regime profiles. keys = case-insensitive SUBSTRING match on object keys. ─────────
    // ⚠ Substring matching means SHORT tokens over-match ('pin'⊂'shipping', 'track'⊂'tracking',
    //   'sin'⊂'business'). Tokens below are curated to be distinctive; if your schema still
    //   collides, switch isDeniedKey to exact-match or scope the key list per module.
    public static final Map<String, Profile> PROFILES = buildProfiles();

    private static Map<String, Profile> buildProfiles() {
        Map<String, Profile> m = new LinkedHashMap<>();
        // Credentials/secrets — never leave the boundary regardless of regulatory regime.
        m.put("base", new Profile(List.of("password", "passwd", "secret", "token", "apikey",
                "api_key", "accesskey", "credential", "privatekey", "private_key"), List.of()));
        // HIPAA: PHI = personal identifiers + health-specific fields (Security/Privacy Rule, Safe Harbor).
        m.put("HIPAA", new Profile(withPersonal("mrn", "medicalrecord", "medical_record", "phi",
                "diagnosis", "icd", "healthplan", "health_plan", "beneficiary", "npi", "dea",
                "patientid"), PERSONAL_PATTERNS));
        // PCI-DSS: cardholder data (CHD) + sensitive authentication data (SAD) only — scoped to cards.
        m.put("PCI", new Profile(List.of("pan", "cardnumber", "card_number", "cardno", "cvv",
                "cvc", "cvv2", "track1", "track2", "magstripe", "pinblock", "expiry", "expiration"),
                List.of(PAN)));
        // GDPR / CCPA / PIPL: personal data — identifiers + national/sensitive PI.
        m.put("GDPR_PIPL", new Profile(withPersonal("nationalid", "national_id", "idcard",
                "passport", "taxid", "drivinglicense", "driverslicense", "biometric", "geolocation"),
                PERSONAL_PATTERNS));
        return Collections.unmodifiableMap(m);
    }

    // Map the regime names /compliance uses onto profile keys.
    static final Map<String, String> REGIME_ALIASES = Map.ofEntries(
            Map.entry("hipaa", "HIPAA"),
            Map.entry("pci", "PCI"), Map.entry("pci-dss", "PCI"), Map.entry("pcidss", "PCI"),
            Map.entry("gdpr", "GDPR_PIPL"), Map.entry("ccpa", "GDPR_PIPL"),
            Map.entry("ccpa-cpra", "GDPR_PIPL"), Map.entry("pipl", "GDPR_PIPL"));

    static final List<String> DEFAULT_REGIMES = List.of("HIPAA", "PCI", "GDPR_PIPL");
    private static final Pattern MASK_RE = Pattern.compile("^«REDACTED:[^»]+»$");

    static String mask(String label) {
        return "«REDACTED:" + label + "»";
    }

    static boolean isMask(Object v) {
        return v instanceof String s && MASK_RE.matcher(s).matches();
    }

    static boolean isEmpty(Object v) {
        return v == null || "".equals(v);
    }

    static String toProfileName(String r) {
        if (PROFILES.containsKey(r)) {
            return r;
        }
        return REGIME_ALIASES.get(r.toLowerCase());
    }

    /** One leak location reported by scan (path + kind). */
    public static final class Hit {
        public final String path;
        public final String kind;

        Hit(String path, String kind) {
            this.path = path;
            this.kind = kind;
        }

        @Override
        public String toString() {
            return path + " (" + kind + ")";
        }
    }

    /** Redactor bound to a set of regimes. Build via createRedactor. */
    public static final class Redactor {
        public final List<String> regimes; // active regimes (base excluded)
        public final List<String> keys;
        public final List<String> patternLabels;
        private final List<Pat> patterns;

        Redactor(List<String> regimes) {
            List<String> names = new ArrayList<>();
            names.add("base");
            List<String> src = (regimes != null) ? regimes : DEFAULT_REGIMES;
            for (String r : src) {
                String n = toProfileName(r);
                if (n != null && !names.contains(n)) {
                    names.add(n);
                }
            }
            List<String> ks = new ArrayList<>();
            List<Pat> ps = new ArrayList<>();
            Set<String> seenKey = new HashSet<>();
            Set<String> seenPat = new HashSet<>();
            for (String n : names) {
                Profile prof = PROFILES.get(n);
                if (prof == null) {
                    continue;
                }
                for (String k : prof.keys) {
                    String lk = k.toLowerCase();
                    if (seenKey.add(lk)) {
                        ks.add(lk);
                    }
                }
                for (Pat p : prof.patterns) {
                    if (seenPat.add(p.label)) {
                        ps.add(p);
                    }
                }
            }
            // Validate-gated patterns (PAN) first — they consume digit runs before generic matchers.
            ps.sort((a, b) -> Integer.compare(b.validate != null ? 1 : 0, a.validate != null ? 1 : 0));
            List<String> active = new ArrayList<>();
            for (String n : names) {
                if (!n.equals("base")) {
                    active.add(n);
                }
            }
            List<String> labels = new ArrayList<>();
            for (Pat p : ps) {
                labels.add(p.label);
            }
            this.regimes = Collections.unmodifiableList(active);
            this.keys = Collections.unmodifiableList(ks);
            this.patternLabels = Collections.unmodifiableList(labels);
            this.patterns = ps;
        }

        private boolean isDeniedKey(String k) {
            String lk = k.toLowerCase();
            for (String d : keys) {
                if (lk.contains(d)) {
                    return true;
                }
            }
            return false;
        }

        private String redactString(String s) {
            String out = s;
            for (Pat p : patterns) {
                Matcher mt = p.re.matcher(out);
                StringBuilder sb = new StringBuilder();
                while (mt.find()) {
                    String m = mt.group();
                    String rep = (p.validate == null || p.validate.ok(m)) ? mask(p.label) : m;
                    mt.appendReplacement(sb, Matcher.quoteReplacement(rep));
                }
                mt.appendTail(sb);
                out = sb.toString();
            }
            return out;
        }

        /** Deep copy with regulated fields masked (safe to send / log). */
        public Object redact(Object value) {
            if (value instanceof List<?> list) {
                List<Object> out = new ArrayList<>(list.size());
                for (Object x : list) {
                    out.add(redact(x));
                }
                return out;
            }
            if (value instanceof Map<?, ?> map) {
                Map<String, Object> out = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    String k = String.valueOf(e.getKey());
                    out.put(k, isDeniedKey(k) ? mask(k.toLowerCase()) : redact(e.getValue()));
                }
                return out;
            }
            if (value instanceof String s) {
                return redactString(s);
            }
            return value;
        }

        /** PII-free logging alias for redact. */
        public Object redactForLog(Object value) {
            return redact(value);
        }

        /** Report every place regulated data would leak (path + kind). Empty == clean. */
        public List<Hit> scan(Object value) {
            List<Hit> hits = new ArrayList<>();
            walk(value, "$", hits);
            return hits;
        }

        private void walk(Object v, String p, List<Hit> hits) {
            if (v instanceof List<?> list) {
                for (int i = 0; i < list.size(); i++) {
                    walk(list.get(i), p + "[" + i + "]", hits);
                }
            } else if (v instanceof Map<?, ?> map) {
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    String k = String.valueOf(e.getKey());
                    Object val = e.getValue();
                    if (isDeniedKey(k) && !isEmpty(val) && !isMask(val)) {
                        hits.add(new Hit(p + "." + k, "key:" + k.toLowerCase()));
                    }
                    walk(val, p + "." + k, hits);
                }
            } else if (v instanceof String s) {
                if (!redactString(s).equals(s)) {
                    hits.add(new Hit(p, "value-pattern"));
                }
            }
        }

        /** Boundary guard — call right before any cross-border / third-party / LLM request.
         *  Throws IllegalStateException (Java's idiom) if regulated data would leave the boundary. */
        public Object assertClean(Object value) {
            List<Hit> hits = scan(value);
            if (!hits.isEmpty()) {
                StringJoiner sj = new StringJoiner(", ");
                for (Hit h : hits) {
                    sj.add(h.toString());
                }
                throw new IllegalStateException(
                        "redaction: " + hits.size() + " regulated field(s) would leave the boundary: " + sj);
            }
            return value;
        }
    }

    /** Build a redactor for all regimes (the default). */
    public static Redactor createRedactor() {
        return new Redactor(null);
    }

    /** Build a redactor for the selected regimes (names/aliases; empty list == base only). */
    public static Redactor createRedactor(List<String> regimes) {
        return new Redactor(regimes);
    }

    // ── Default instance = all regimes. Static convenience API. ────────────────────────
    private static final Redactor DEFAULT = createRedactor();

    public static Object redact(Object v) {
        return DEFAULT.redact(v);
    }

    public static Object redactForLog(Object v) {
        return DEFAULT.redactForLog(v);
    }

    public static List<Hit> scan(Object v) {
        return DEFAULT.scan(v);
    }

    public static Object assertClean(Object v) {
        return DEFAULT.assertClean(v);
    }

    /** Composed deny list of the default (all-regime) instance — for inspection / back-compat. */
    public static final List<String> DENY_KEYS = DEFAULT.keys;

    private Redaction() {
    }
}
