// ComplianceTest.java — proves the Java skeletons run out of the box. Zero-dependency: a plain
// main() harness (no JUnit, no build tool), mirroring how the Node/Python ports use their
// built-in runners. Mirrors compliance.test.mjs / test_compliance.py one-for-one (same 6 cases).
//
// Compile + run (UTF-8 for the «REDACTED» mask):
//   javac -encoding UTF-8 *.java && java ComplianceTest
//
// In a real project you'd promote these to JUnit 5; the shapes are identical.
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ComplianceTest {
    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) {
        redactionRegimeScoping();
        redactionMasksCore();
        luhn();
        assertCleanBoundaryGuard();
        consent();
        dsar();

        System.out.println();
        System.out.println((failed == 0 ? "OK" : "FAILED")
                + " — " + passed + " checks passed, " + failed + " failed across 6 tests");
        if (failed > 0) {
            System.exit(1);
        }
    }

    private static void check(boolean cond, String msg) {
        if (cond) {
            passed++;
        } else {
            failed++;
            System.out.println("  \u2717 FAIL: " + msg);
        }
    }

    /** Build an ordered String->Object map from k, v, k, v, ... pairs. */
    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    private static void redactionRegimeScoping() {
        // PCI-DSS scope = cardholder data only; a plain email is out of scope and stays.
        Redaction.Redactor pci = Redaction.createRedactor(List.of("PCI-DSS")); // alias resolves to PCI
        Map<String, Object> p = (Map<String, Object>) pci.redact(
                map("cardNumber", "4111111111111111", "email", "jane@example.com"));
        check("«REDACTED:cardnumber»".equals(p.get("cardNumber")), "PCI masks card number");
        check("jane@example.com".equals(p.get("email")), "PCI scope must not touch a non-card email");

        // HIPAA scope = PHI (identifiers + health), but NOT a raw card number (that is PCI's regime).
        Redaction.Redactor hipaa = Redaction.createRedactor(List.of("HIPAA"));
        Map<String, Object> h = (Map<String, Object>) hipaa.redact(
                map("mrn", "MR-9", "email", "jane@example.com", "pan", "4111111111111111"));
        check("«REDACTED:mrn»".equals(h.get("mrn")), "HIPAA masks mrn");
        check("«REDACTED:email»".equals(h.get("email")), "HIPAA masks email");
        check("4111111111111111".equals(h.get("pan")), "HIPAA-only must not redact card data (select PCI)");

        // base-only (no regime) = credentials/secrets only.
        Redaction.Redactor base = Redaction.createRedactor(List.of());
        Map<String, Object> b1 = (Map<String, Object>) base.redact(map("token", "abc123", "email", "a@b.co"));
        check("«REDACTED:token»".equals(b1.get("token")), "base masks a credential token");
        Map<String, Object> b2 = (Map<String, Object>) base.redact(map("email", "a@b.co"));
        check("a@b.co".equals(b2.get("email")), "base must not touch a non-credential email");

        check(pci.regimes.equals(List.of("PCI")), "reports the active regime set");
        check(Redaction.PROFILES.containsKey("HIPAA") && Redaction.PROFILES.containsKey("PCI")
                && Redaction.PROFILES.containsKey("GDPR_PIPL"), "named regime presets are exported");
    }

    @SuppressWarnings("unchecked")
    private static void redactionMasksCore() {
        Map<String, Object> out = (Map<String, Object>) Redaction.redact(map(
                "userId", "u-123", // safe identifier — kept
                "email", "jane@example.com",
                "note", "card 4111 1111 1111 1111, ssn 123-45-6789, call 555-123-4567",
                "order", map("total", 42))); // safe — kept
        check("u-123".equals(out.get("userId")), "safe identifier kept");
        check(Integer.valueOf(42).equals(((Map<String, Object>) out.get("order")).get("total")),
                "nested safe value kept");
        check("«REDACTED:email»".equals(out.get("email")), "email masked");
        String note = (String) out.get("note");
        check(!note.contains("4111"), "PAN stripped");
        check(!note.contains("123-45-6789"), "SSN stripped");
        check(!note.contains("555-123-4567"), "phone stripped");
    }

    private static void luhn() {
        check(Redaction.luhnValid("4111111111111111"), "valid PAN passes Luhn");
        check(!Redaction.luhnValid("1234567890123456"), "non-card 16-digit id fails Luhn");
    }

    private static void assertCleanBoundaryGuard() {
        boolean threw = false;
        try {
            Redaction.assertClean(map("ssn", "123-45-6789"));
        } catch (RuntimeException e) {
            threw = true;
        }
        check(threw, "assertClean throws on a leak");
        check(Redaction.scan(map("userId", "u-1", "qty", 3)).isEmpty(), "clean payload scans empty");
        boolean threwAfterRedact = false;
        try {
            Redaction.assertClean(Redaction.redact(map("email", "a@b.co", "qty", 3)));
        } catch (RuntimeException e) {
            threwAfterRedact = true;
        }
        check(!threwAfterRedact, "assertClean passes on redacted payload");
    }

    private static void consent() {
        Consent c = Consent.create();
        c.grant("u-1", "marketing");
        c.grant("u-1", "analytics");
        check(c.check("u-1", "marketing"), "marketing granted");

        c.revoke("u-1", "marketing"); // withdrawal as easy as granting
        check(!c.check("u-1", "marketing"), "marketing revoked");
        check(c.check("u-1", "analytics"), "purposes independent (PIPL separate consent)");
        check(!c.check("u-1", "never-asked"), "never-asked purpose is false");

        List<String> keys = new ArrayList<>(c.state("u-1").keySet());
        Collections.sort(keys);
        check(keys.equals(List.of("analytics", "marketing")), "state lists both purposes");
        check(c.log.all().size() == 3, "audit trail has 3 events (2 grants + 1 revoke), no PII");
    }

    private static void dsar() {
        List<String> erased = new ArrayList<>();
        List<Dsar.Source> sources = List.of(
                source("profiles", List.of(map("id", "u-1", "city", "X")), 1, erased),
                source("orders", List.of(map("id", "o-9")), 1, erased));

        Map<String, Object> bundle = Dsar.exportSubject("u-1", sources, null);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) bundle.get("data");
        check(data.containsKey("profiles") && data.containsKey("orders"), "export gathers all sources");
        check(bundle.get("generatedAt") != null, "export is timestamped/portable");

        Map<String, Object> receipt = Dsar.eraseSubject("u-1", sources, "user-request", null);
        List<String> sorted = new ArrayList<>(erased);
        Collections.sort(sorted);
        check(sorted.equals(List.of("orders", "profiles")), "erase runs each source");
        @SuppressWarnings("unchecked")
        Map<String, Object> er = (Map<String, Object>) receipt.get("erased");
        check(Integer.valueOf(1).equals(er.get("profiles")) && Integer.valueOf(1).equals(er.get("orders")),
                "erase counts recorded");
        check("user-request".equals(receipt.get("reason")), "reason recorded");
    }

    /** A DSAR source adapter: name + export(subject) + erase(subject), recording erase order. */
    private static Dsar.Source source(String name, Object rows, int count, List<String> sink) {
        return new Dsar.Source() {
            @Override
            public String name() {
                return name;
            }

            @Override
            public Object export(String subjectId) {
                return rows;
            }

            @Override
            public int erase(String subjectId) {
                sink.add(name);
                return count;
            }
        };
    }

    private ComplianceTest() {
    }
}
