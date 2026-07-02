# Compliance Starter — runnable skeletons for the high-frequency 🟡 "project must build" items

Zero-dependency, **offline**, runnable Node/ESM skeletons for the privacy controls that the
compliance checklists mark 🟡 *project must build*. They exist so you don't cold-start
**consent**, **DSAR**, and **redaction** from a blank page. Copy this folder into your project
(e.g. `src/compliance/`), swap the in-memory stubs for your DB, and the wiring is already shaped.

> Reference implementation is Node/ESM (matches this template's own tooling). The **pattern** is
> language-neutral — a Python/Go/Java equivalent is the same three seams (redact → consent → DSAR)
> with your ORM behind the stub. Keep the function shapes; replace the storage.

## Files → which 🟡 item → EOS landing point
| File | Covers (🟡 item) | Regime | Landing point it satisfies |
|---|---|---|---|
| `redaction.mjs` | field-level redaction / PII-free logging / **AI data-boundary** | all | `ai/10-ai-llm` "Redact before sending to the provider"; `eos-doctor` **D5**; F-compliance *Agentic data-boundary* |
| `consent.mjs` | consent store (versioned, revocable, **per-purpose**) | GDPR/PIPL | F-compliance-gdpr-pipl "Lawful basis & consent"; PIPL separate-consent |
| `dsar.mjs` | DSAR export / erase over pluggable sources | GDPR/PIPL | `data-api` "support subject deletion / export"; "every deletion audited" |
| `audit.mjs` | append-only who/when/what trail (shared) | all | `data-api` "every deletion of user data is audited … without logging the data itself" |
| `compliance.test.mjs` | proof the above run out of the box | — | copy into your `quality.json` / npm test |

## Run
```sh
node --test docs/eos/examples/compliance-starter/compliance.test.mjs
```
> ⚠️ Pass an explicit file/glob (e.g. `src/compliance/*.test.mjs`), **not a bare directory** —
> under Node 23 `node --test <dir>/` treats the path as a module and errors. Wrap it in an npm
> script: `"test:compliance": "node --test src/compliance/*.test.mjs"`.

Python equivalent: `pytest tests/compliance -q` with the same three modules.

## Adapt it to your project (4 steps)
1. **redaction** — extend `DENY_KEYS` / `PATTERNS` for your regime (HIPAA `mrn/phi`, PCI `pan/cvv`,
   GDPR/PIPL `email/nationalId`). Call `assertClean(payload)` on the line **before** any provider /
   cross-border / analytics call — that is the D5 boundary in code.
2. **consent** — replace the in-memory `Map` with a table `(subject_id, purpose, granted, basis,
   version, at)`, latest row per (subject, purpose). Keep purposes **separate** (PIPL).
3. **dsar** — register one `source` adapter per table/service (`{ name, export, erase }`). Wire
   `exportSubject` / `eraseSubject` to your DSAR endpoint; feed `consent.state()` into the export.
4. **audit** — point `record()` at a WORM store / append-only audit table. Never write raw PII.

## Why this shape
These are the three items that, left as prose in a checklist, get rebuilt ad-hoc per project and
usually **retrofitted late** (the most expensive time). `redaction.mjs` in particular is the
`eos-doctor` **D5** landmine made concrete: if regulated data reaches a third-party LLM without a
boundary, you are forced into a model/architecture swap. See `docs/checklists/F-compliance.md`
(*Agentic data-boundary*), `docs/checklists/F-compliance-gdpr-pipl.md`, and the `/compliance` prompt.

> `【新建补强】` — no BMAD skill ships compliance code skeletons; this fills that gap and composes
> with `eos-operational-readiness` (decides *what*) by giving the *starting scaffold*.
