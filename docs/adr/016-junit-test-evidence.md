# ADR-016 — EOS reads one test-result format, JUnit XML, and the verified gate writes the test-run summary itself

- Status: Accepted
- Date: 2026-10-03
- Amends: the principle in `docs/eos/examples/trace-evidence/README.md` (eos-1.13.0) that EOS parses no
  runner output — narrowed to "EOS parses no runner-*specific* output"
- Depends on: ADR-004 (evidence trust), ADR-014 (trust chain — what the policy lock covers)
- Governs: `.eos/project.json` `evidence.junit`, `.github/eos/lib/junit.mjs`, `.github/eos/lib/test-evidence.mjs`,
  the `verified` gate's `tests-executed` and `trace-complete` checks, `eos evidence junit`

## Context

G7 reads two sources and requires them to agree: `docs/trace-matrix.md` (which test proves which
criterion — a human decision) and `docs/evidence/test-run.json` (that the test ran, against this tree).
Since 1.13 every project produced the second file itself, with "a ~30-line mapping step" from its
runner's output. The template shipped none of those steps: the guide referenced a `to-eos-trace.mjs`
that did not exist, the product-tree digest had to be read programmatically, and EOS's own journey test
wrote its summary by hand. The 2.0 evaluation ranked this the largest fixed cost per story — paid by
every project, in every language, and the place a hurried team is most tempted to paste a digest.

The original reason for not parsing runner output was sound: parsing N runner formats is a permanent
maintenance burden that still misses the next runner. But nearly every runner already writes one
common format.

Options considered:

1. **An adapter per runner** (node:test JSON, pytest-json-report, `go test -json`, TRX …). N formats to
   maintain forever — the burden the original principle refused.
2. **Require test names to carry the AC id** ("AC1.1 valid password"). Makes teams rename tests and
   duplicates the trace matrix, which already records the mapping.
3. **An import command only** (`eos evidence junit <files>`). Removes the glue code, but freshness is
   again left to discipline: nothing stops importing yesterday's report.
4. **JUnit XML only, read by the gate in the run it bracketed.** One format; the trace matrix stays the
   mapping; freshness is a property of the mechanism.

## Decision

**Option 4, with option 3 as the path for tests that run elsewhere.**

1. **One input format: JUnit XML.** No runner-specific reader is ever added. node:test (≥ 20.8),
   vitest, Playwright, pytest, Maven/Gradle, gotestsum, .NET (JunitXml.TestLogger), cargo-nextest and
   jest-junit all write it.
2. **The trace matrix stays the mapping.** Each row (AC → `path::selector`) is answered by the
   testcases whose name matches the selector — exactly, without a parameter suffix, or as the leaf of
   a name that embeds its ancestry; never as a substring. When the report records where a case lives
   (`file`, a path or dotted module in `classname`, a file-named suite), only cases in the row's file
   count (`"match": "file"`). When it does not — node:test writes `classname="test"` and no file — the
   name alone matches and the result is marked `"match": "name"`; file ownership is then guaranteed by
   the gate's existing check that the selector appears in the file the matrix names. Several matching
   cases all count, and the worst outcome wins: one failure fails the row, and skipped is never PASS.
   A row with no match is reported with the name that was looked for.
3. **Freshness by mechanism.** A project declares `"evidence": { "junit": ["reports/junit/*.xml"] }`.
   The `verified` gate inventories the matching files, runs the declared quality commands as before,
   and reads only the reports that run created or changed. It then writes `docs/evidence/test-run.json`
   bound to the product tree measured before the run, the command (`commandDigest`) and the producer
   (local, or the CI it detects — self-reported, as every producer is). No step per story.
   - Tests that run in another CI step use `eos evidence junit [<files>…] [--write]`, where freshness is
     the weaker mechanical rule that a report older than any product file is refused (STALE).
   - A report git does not ignore is refused: it would be part of the product tree, so writing it would
     change the digest it is bound to. The template ignores `/reports/junit/`.
   - `evidence` is part of the policy snapshot when declared, and any change to it is a REVIEW change
     (ADR-014). A project that never declares it keeps its lock digest.
4. **A zero-dependency, fail-closed XML subset.** Elements, attributes, comments, CDATA, processing
   instructions, the five predefined entities and numeric references. `<!DOCTYPE>` and `<!ENTITY>` are
   refused outright, which removes entity expansion instead of mitigating it. Size (32 MB) and depth
   (64) are capped. An unknown root, a testcase in an unknown element, an unnamed testcase, an illegal
   reference or any malformation is an ERROR; nothing is ever read "mostly". Failure text and captured
   output are never copied into the summary: they can contain anything the product printed.
5. **Backward compatible.** A project that writes its own `test-run.json` and declares no
   `evidence.junit` is read exactly as before.

## Consequences

- The per-story glue step disappears for every stack that can write JUnit; a dual-stack (Node + Python)
  project needs only `commands.test` and `evidence.junit` to pass G7.
- Re-running the `verified` gate after an edit now re-runs the tests *and* re-derives the summary, so
  "the recorded results describe the tree as it was" is fixed by the one command `eos next` prints.
- EOS now owns a small XML reader. Its surface is the subset above, tested against real reporter output
  and hostile inputs (`junit.test.mjs`, `test-evidence.test.mjs`); growing it requires amending this ADR.
- `match: "name"` is weaker than a file match. It is accepted because the alternative — refusing
  node:test, the template's own runner — would push those projects back to hand-written summaries.
