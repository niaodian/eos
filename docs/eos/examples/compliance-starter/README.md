# Compliance Starter — runnable skeletons for the high-frequency 🟡 "project must build" items

Zero-dependency, **offline**, runnable skeletons for the privacy controls that the
compliance checklists mark 🟡 *project must build* — shipped in **four parallel ports**, one per
EOS default reference stack (Node/ESM · Python/stdlib · Go · Java/JDK). They exist so you don't
cold-start **consent**, **DSAR**, and **redaction** from a blank page. Copy the port you use into
your project (e.g. `src/compliance/`), swap the in-memory stubs for your DB, and the wiring is
already shaped.

> All four ports are behaviour-for-behaviour parallel (same regime profiles, same function shapes,
> the same 6 tests). Each uses only its language's standard library / built-in test runner — no
> `npm install`, `pip install`, or third-party test framework required. Keep the shapes; replace
> the storage.

## Files → which 🟡 item → EOS landing point
The table shows the Node/ESM filenames; the same seam ships in every port under the naming
convention below.

| File | Covers (🟡 item) | Regime | Landing point it satisfies |
|---|---|---|---|
| `redaction.mjs` | regime-scoped redaction / PII-free logging / **AI data-boundary** | HIPAA·PCI·GDPR/PIPL presets | `ai/10-ai-llm` "Redact before sending to the provider"; `eos-doctor` **D5**; F-compliance *Agentic data-boundary* |
| `consent.mjs` | consent store (versioned, revocable, **per-purpose**) | GDPR/PIPL | F-compliance-gdpr-pipl "Lawful basis & consent"; PIPL separate-consent |
| `dsar.mjs` | DSAR export / erase over pluggable sources | GDPR/PIPL | `data-api` "support subject deletion / export"; "every deletion audited" |
| `audit.mjs` | append-only who/when/what trail (shared) | all | `data-api` "every deletion of user data is audited … without logging the data itself" |
| `compliance.test.mjs` | proof the above run out of the box | — | copy into your `quality.json` / npm test |

### The four ports (same behaviour, one per default reference stack)
| Stack | redaction | consent | dsar | audit | test | Naming |
|---|---|---|---|---|---|---|
| **Node/ESM** | `redaction.mjs` | `consent.mjs` | `dsar.mjs` | `audit.mjs` | `compliance.test.mjs` | `createRedactor`, camelCase |
| **Python/stdlib** | `redaction.py` | `consent.py` | `dsar.py` | `audit.py` | `test_compliance.py` | `create_redactor`, snake_case |
| **Go** | `redaction.go` | `consent.go` | `dsar.go` | `audit.go` | `compliance_test.go` (+ `go.mod`) | `CreateRedactor`, exported PascalCase; `AssertClean` returns `error` |
| **Java/JDK** | `Redaction.java` | `Consent.java` | `Dsar.java` | `Audit.java` | `ComplianceTest.java` | `createRedactor`, camelCase; `assertClean` throws |

Same regime profiles (`PROFILES` / `Profiles`, `createRedactor` selecting HIPAA·PCI·GDPR_PIPL) and
the same seams (`exportSubject`/`eraseSubject`, `createConsentStore`/`NewConsentStore`/`Consent.create`)
in every port.

## Run
```sh
# Node/ESM port
node --test docs/eos/examples/compliance-starter/compliance.test.mjs

# Python port (stdlib — no install)
python3 docs/eos/examples/compliance-starter/test_compliance.py

# Go port (stdlib `testing`)
cd docs/eos/examples/compliance-starter && go test ./...

# Java port (JDK only — a plain main() harness, UTF-8 for the «REDACTED» mask)
cd docs/eos/examples/compliance-starter && javac -encoding UTF-8 *.java && java ComplianceTest
```
> ⚠️ Node: pass an explicit file/glob (e.g. `src/compliance/*.test.mjs`), **not a bare directory** —
> under Node 23 `node --test <dir>/` treats the path as a module and errors. Wrap it in an npm
> script: `"test:compliance": "node --test src/compliance/*.test.mjs"`.

The Python file is a `unittest.TestCase`, so it also runs under pytest:
`pytest docs/eos/examples/compliance-starter/test_compliance.py -q`. The Java harness is
zero-dependency on purpose (no JUnit); promote it to JUnit 5 in a real project — the shapes are
identical. Java `.class` files are build artifacts (git-ignored); compile to an out-of-tree dir
(`javac -d build *.java`) if you prefer.

## Adapt it to your project (4 steps)
1. **redaction** — pick your regime(s) with `createRedactor(['HIPAA'])` / `['PCI-DSS']` /
   `['GDPR','PIPL']` (presets in `PROFILES`; `base` credentials always on), or extend a profile's
   `keys`/`patterns`. Call `assertClean(payload)` on the line **before** any provider /
   cross-border / analytics call — that is the D5 boundary in code.
2. **consent** — replace the in-memory `Map` with a table `(subject_id, purpose, granted, basis,
   version, at)`, latest row per (subject, purpose). Keep purposes **separate** (PIPL).
3. **dsar** — register one `source` adapter per table/service (`{ name, export, erase }`). Wire
   `exportSubject` / `eraseSubject` to your DSAR endpoint; feed `consent.state()` into the export.
4. **audit** — point `record()` at a WORM store / append-only audit table. Never write raw PII.

> Naming across ports: **Python** uses snake_case (`create_redactor` / `assert_clean` /
> `export_subject`); **Go** uses exported PascalCase (`CreateRedactor` / `AssertClean` — which
> returns an `error` instead of throwing) and functional options (`WithBasis`/`WithVersion`) for
> the optional consent args; **Java** uses camelCase (`createRedactor` / `assertClean` throws
> `IllegalStateException`) with overloads for the optional args. Storage backing differs by idiom
> (JS `Map`, Python `dict`, Go `map`, Java `HashMap`) — same shapes otherwise.

## Why this shape
These are the three items that, left as prose in a checklist, get rebuilt ad-hoc per project and
usually **retrofitted late** (the most expensive time). `redaction.mjs` in particular is the
`eos-doctor` **D5** landmine made concrete: if regulated data reaches a third-party LLM without a
boundary, you are forced into a model/architecture swap. See `docs/checklists/F-compliance.md`
(*Agentic data-boundary*), `docs/checklists/F-compliance-gdpr-pipl.md`, and the `/compliance` prompt.

> `【新建补强】` — no BMAD skill ships compliance code skeletons; this fills that gap and composes
> with `eos-operational-readiness` (decides *what*) by giving the *starting scaffold*, in all four
> default reference-stack ports (Node/ESM · Python/stdlib · Go · Java/JDK) so it drops straight
> into whichever stack the project runs on.
