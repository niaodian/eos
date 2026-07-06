"""test_compliance.py — proves the Python skeletons run out of the box. Zero-dependency.

Run (stdlib, no install):   python3 docs/eos/examples/compliance-starter/test_compliance.py
Or under pytest:            pytest docs/eos/examples/compliance-starter/test_compliance.py -q

Written as unittest.TestCase so it runs under BOTH the stdlib runner and pytest.
"""
import os
import tempfile
import unittest
from types import SimpleNamespace

from redaction import (
    redact,
    scan,
    assert_clean,
    luhn_valid,
    create_redactor,
    PROFILES,
    parse_regimes,
    redactor_from_profile,
)
from consent import create_consent_store
from dsar import export_subject, erase_subject


def _source(name, rows, erased_sink):
    """A DSAR source adapter: name + export(subject) + erase(subject) (duck-typed like the JS shape)."""
    def erase(_subject):
        erased_sink.append(name)
        return len(rows)
    return SimpleNamespace(name=name, export=lambda _subject: rows, erase=erase)


class RedactionRegimeScoping(unittest.TestCase):
    def test_profiles_scope_what_gets_masked(self):
        # PCI-DSS scope = cardholder data only; a plain email is out of scope and stays.
        pci = create_redactor(["PCI-DSS"])  # alias resolves to PCI
        p = pci.redact({"cardNumber": "4111111111111111", "email": "jane@example.com"})
        self.assertEqual(p["cardNumber"], "«REDACTED:cardnumber»")
        self.assertEqual(p["email"], "jane@example.com", "PCI scope must not touch a non-card email")

        # HIPAA scope = PHI (identifiers + health), but NOT a raw card number (that is PCI's regime).
        hipaa = create_redactor(["HIPAA"])
        h = hipaa.redact({"mrn": "MR-9", "email": "jane@example.com", "pan": "4111111111111111"})
        self.assertEqual(h["mrn"], "«REDACTED:mrn»")
        self.assertEqual(h["email"], "«REDACTED:email»")
        self.assertEqual(h["pan"], "4111111111111111", "HIPAA-only must not redact card data (select PCI)")

        # base-only (no regime) = credentials/secrets only.
        base = create_redactor([])
        self.assertEqual(base.redact({"token": "abc123", "email": "a@b.co"})["token"], "«REDACTED:token»")
        self.assertEqual(base.redact({"email": "a@b.co"})["email"], "a@b.co")

        self.assertEqual(pci.regimes, ["PCI"])  # reports the active regime set
        self.assertTrue(all(n in PROFILES for n in ("HIPAA", "PCI", "GDPR_PIPL")))


class RedactionCore(unittest.TestCase):
    def test_masks_pan_email_ssn_denied_keys_preserves_rest(self):
        out = redact({
            "userId": "u-123",  # safe identifier — kept
            "email": "jane@example.com",  # denied key
            "note": "card 4111 1111 1111 1111, ssn 123-45-6789, call 555-123-4567",
            "order": {"total": 42},  # safe — kept
        })
        self.assertEqual(out["userId"], "u-123")
        self.assertEqual(out["order"]["total"], 42)
        self.assertEqual(out["email"], "«REDACTED:email»")
        self.assertNotIn("4111", out["note"], "PAN not stripped")
        self.assertNotIn("123-45-6789", out["note"], "SSN not stripped")
        self.assertNotIn("555-123-4567", out["note"], "phone not stripped")

    def test_luhn_avoids_over_redacting_non_card_id(self):
        self.assertTrue(luhn_valid("4111111111111111"))
        self.assertFalse(luhn_valid("1234567890123456"))

    def test_assert_clean_is_the_boundary_guard(self):
        with self.assertRaises(ValueError):
            assert_clean({"ssn": "123-45-6789"})
        self.assertEqual(scan({"userId": "u-1", "qty": 3}), [])
        assert_clean(redact({"email": "a@b.co", "qty": 3}))  # clean after redact — no raise


class ConsentStore(unittest.TestCase):
    def test_per_purpose_grant_revoke_check_queryable_audited(self):
        c = create_consent_store()
        c.grant("u-1", "marketing")
        c.grant("u-1", "analytics")
        self.assertTrue(c.check("u-1", "marketing"))

        c.revoke("u-1", "marketing")  # withdrawal as easy as granting
        self.assertFalse(c.check("u-1", "marketing"))
        self.assertTrue(c.check("u-1", "analytics"), "purposes must be independent (PIPL separate consent)")
        self.assertFalse(c.check("u-1", "never-asked"))

        self.assertEqual(sorted(c.state("u-1").keys()), ["analytics", "marketing"])
        self.assertEqual(len(c.log.all()), 3)  # 2 grants + 1 revoke, no PII in the trail


class Dsar(unittest.TestCase):
    def test_export_gathers_sources_erase_runs_and_audits(self):
        erased: list[str] = []
        sources = [
            _source("profiles", [{"id": "u-1", "city": "X"}], erased),
            _source("orders", [{"id": "o-9"}], erased),
        ]

        bundle = export_subject("u-1", sources)
        self.assertEqual(sorted(bundle["data"].keys()), ["orders", "profiles"])
        self.assertTrue(bundle["generatedAt"], "export is timestamped/portable")

        receipt = erase_subject("u-1", sources, reason="user-request")
        self.assertEqual(sorted(erased), ["orders", "profiles"])
        self.assertEqual(receipt["erased"], {"profiles": 1, "orders": 1})
        self.assertEqual(receipt["reason"], "user-request")


class ProfileAutoSelect(unittest.TestCase):
    def test_parse_and_build_from_profile(self):
        # Pure parse: canonical line -> resolved profile names; rationale words are ignored.
        self.assertEqual(
            parse_regimes("# Compliance profile\n\n**Regulatory regime:** HIPAA, PCI-DSS\n"),
            ["HIPAA", "PCI"],
        )
        # Slash / plus separators and mixed case also resolve.
        self.assertEqual(parse_regimes("Regulatory regime: gdpr / pipl"), ["GDPR_PIPL"])
        # Explicit `none` (with parenthetical rationale naming a regime) -> base only.
        self.assertEqual(parse_regimes("Regulatory regime: none (generic PII, no PCI applies)"), [])

        # File round-trip: write a profile, build the redactor straight from it.
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "compliance-profile.md")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("# Compliance profile\n\n**Regulatory regime:** HIPAA\n\nRationale: PHI.\n")
            self.assertEqual(redactor_from_profile(f).regimes, ["HIPAA"])

            # Missing file -> fail-safe: all regimes (never silently under-redact).
            missing = os.path.join(d, "nope.md")
            self.assertEqual(redactor_from_profile(missing).regimes, ["HIPAA", "PCI", "GDPR_PIPL"])
            # Opt-in softer fallbacks.
            self.assertEqual(redactor_from_profile(missing, fallback="base").regimes, [])
            with self.assertRaises(FileNotFoundError):
                redactor_from_profile(missing, fallback="throw")


if __name__ == "__main__":
    unittest.main()
