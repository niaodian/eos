# Stage records — the machine half of each phase

Every phase keeps a document people read and a small JSON record the gate reads (EOS-AUD-003): prose
can be talked past, a record cannot. These are complete, schema-valid records for one product — the
*todo-api* of the manual's SaaS path — to read next to your own.

| Record | Read by | Sample |
|---|---|---|
| `docs/discovery.json` | `discovery-ready` (G1) | [discovery.json](discovery.json) |
| `docs/requirements.json` | `requirements-ready` (G2), and G4 / G8 for the NFRs | [requirements.json](requirements.json) |
| `docs/design.json` | `ux-ready` (G-UX) | [design.json](design.json) (an API) · [design.ui.json](design.ui.json) (a web product) |
| `docs/architecture.json` | `architecture-ready` (G4) | [architecture.json](architecture.json) |
| `docs/telemetry.json` | `telemetry-ready` (G9) | [telemetry.json](telemetry.json) |
| `docs/iteration.json` | `iteration-ready` (G10) | [iteration.json](iteration.json) |

## Start from a skeleton

```sh
node .github/eos/eos.mjs stage init discovery            # what would be written
node .github/eos/eos.mjs stage init discovery --write    # docs/discovery.json + docs/discovery.md
node .github/eos/eos.mjs stage init discovery --interactive --write   # answer each field now
```

The skeleton is generated from the record's schema: every required field, and a `TODO(eos)`
placeholder wherever an answer belongs — enums, numbers and booleans included, so no decision is made
for you. **Every gate rejects a record that still holds a placeholder**, naming the fields left to
answer, so writing a skeleton never advances a stage. The document template holds only headings and
HTML comments, which the empty-document check does not count as content. An existing record is kept
unless you pass `--force`; an existing document is never overwritten. The stage's agent or skill
(`eos-discovery`, `/eos-requirements` …) fills both in; any agent or a person can, too.

## Notes

- `"$schema"` points your editor at the schema, so it validates while you type.
- A decision is `ADOPT` with a note, `SKIP` with a real reason, or `DEFER` with an owner and a trigger
  — never a bare `SKIP`.
- `iteration.json` binds each write-back to the content it wrote: `targetDigest` is the SHA-256 of the
  target file as it is now (`shasum -a 256 docs/requirements.json`). The sample's zeros are a
  placeholder; reverting the document after recording makes the gate fail, by design.
- `design.json` with `"userInterface": false` needs a `skipReason` that says why no human uses the
  product directly.
