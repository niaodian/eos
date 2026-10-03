# Trace evidence — making a passing test a *result*, not a claim

`docs/trace-matrix.md` records a human decision: *"AC1.1 is proven by this test."* That decision is
worth having, and Markdown is the right place for it.

What Markdown cannot record is whether the test **ran**. Before `eos-1.13.0`, any row whose last
cell contained `PASS`, `✅` or `✓` counted as a passing test — so a matrix written by hand (or by a
model) verified a story that had never executed anything (audit finding EOS-AUD-006).

So G7 reads **both**:

| Source | Answers |
|---|---|
| `docs/trace-matrix.md` | *which* test is claimed to prove *which* criterion |
| `docs/evidence/test-run.json` | that it ran, against **this** tree, and what it returned |

and requires them to agree. The schema is `.eos/schemas/test-run.schema.json`.

## The short way: declare where your runner writes JUnit XML (eos-2.2.0)

Since `eos-2.2.0` you write no mapping code. Declare the reports in `.eos/project.json`:

```json
{
  "commands": { "test": "node --test --test-reporter=junit --test-reporter-destination=reports/junit/node.xml tests/login.test.mjs" },
  "evidence": { "junit": ["reports/junit/*.xml"] }
}
```

and keep the report directory out of the product tree (it is already in the template's
`.gitignore`): `/reports/junit/`.

The `verified` gate then does, in the same execution, every time:

1. notes which reports already exist under the declared paths;
2. runs `commands.test` (with the rest of the declared quality commands, as before);
3. reads **only the reports this run wrote** — a report left over from an earlier run is ignored, so
   freshness is a property of the mechanism, not of anyone's discipline;
4. answers every `docs/trace-matrix.md` reference from them and writes `docs/evidence/test-run.json`,
   bound to the product tree, the command (`commandDigest`) and the producer (local or CI).

This folder is a runnable dual-stack example — Node and Python in one project, each runner writing
its own report, nothing else declared:

| File | What it is |
|---|---|
| [`project.json`](project.json) | `commands.test` (two runners, chained) and `evidence.junit` |
| [`trace-matrix.md`](trace-matrix.md) | AC1.1 → a `node:test` test, AC1.2 → a pytest test |
| [`tests/`](tests/) | the two tests |
| [`gitignore.example`](gitignore.example) | what must stay out of the product tree |

### How a matrix row is matched

- A row `tests/login.test.mjs::valid password` is answered by the testcases **named** `valid password`
  — exactly, or without a parameter suffix (`test_x[1]`), or as the leaf of a name that embeds its
  ancestry (`login > valid password`). A selector may name the ancestry too: `session > expires`,
  `TestSession::test_expires`, `LoginTest#validPassword`. Never a substring: `valid password` is not
  answered by `invalid password`.
- When the report says **where** a testcase lives — a `file` attribute, a path or dotted module in
  `classname`, a file-named suite — only cases in the row's file count, and the result says
  `"match": "file"`. When it does not (node:test writes `classname="test"` and no file), the name alone
  matches and the result says `"match": "name"`. The file is then settled from the source: the file
  the matrix names must declare the test (a string literal or function name, not a comment), and no
  other test file may declare the same name — if two do, the row is an ERROR until the name is unique
  or the selector names its suite (`tests/login.test.mjs::login > valid password`).
- Several testcases may answer one row (a parametrised test, or two runners with a same-named test):
  **one failing instance makes the row FAIL**, and a **skipped** or todo test is never a PASS.
- A row with no match is reported with the name it looked for. A row that names only a file
  (`tests/login.test.mjs`) needs a report that records files; otherwise name the test.
- References are read from the matrix's **Test** column when its header has one; elsewhere a word that
  only looks like a file name ("e.g.", "Node.js") is skipped unless it names a real file.
- A run whose results match the recorded `test-run.json` except for timings keeps that file, so
  verifying one story does not make another story's evidence stale.

### Writing JUnit, per stack

| Stack | How the runner writes JUnit XML |
|---|---|
| node:test (Node ≥ 20.8) | `--test-reporter=junit --test-reporter-destination=reports/junit/node.xml` (add `--test-reporter=spec --test-reporter-destination=stdout` to keep console output). Name the test files — a bare directory is read as a module on Node ≥ 21 |
| vitest | `vitest run --reporter=junit --outputFile=reports/junit/vitest.xml` |
| Playwright | `reporter: [['junit', { outputFile: 'reports/junit/e2e.xml' }]]` in `playwright.config` (declared commands run without a shell, so no `VAR=… cmd` prefix) |
| pytest | `--junitxml=reports/junit/python.xml` |
| Maven / Gradle | written by default — declare `target/surefire-reports/TEST-*.xml` / `build/test-results/test/*.xml` |
| Go | `gotestsum --junitfile reports/junit/go.xml` |
| .NET | `dotnet test --logger "junit;LogFilePath=reports/junit/dotnet.xml"` (JunitXml.TestLogger) |
| Rust | `cargo nextest run --profile ci` with `[profile.ci.junit] path = "junit.xml"` — declare `target/nextest/ci/junit.xml` |
| Jest | `jest-junit`, configured with `outputDirectory: "reports/junit"`, `addFileAttribute: "true"` and `ancestorSeparator: " > "` |

EOS creates the declared report directory before the run — node:test does not create it, and exits 7
without it.

### When the tests run in another step

If CI runs the tests in one step and EOS in another (or downloads the reports from another job), the
gate cannot bracket the run, so use the import command:

```sh
node .github/eos/eos.mjs evidence junit reports/junit/*.xml --write   # or no files: reads evidence.junit
```

It is the same conversion with a weaker, still mechanical freshness rule: a report **older than any
product file** describes a tree that has since changed, and is refused (exit 2).

### What is refused

| Situation | Result |
|---|---|
| the run wrote no report under the declared paths (or only old ones are there) | FAIL — nothing is read |
| a report git does not ignore | FAIL — writing it would change the tree it describes |
| malformed XML, an unknown root element, a `<!DOCTYPE>` or `<!ENTITY>` (entity expansion), a report over 32 MB | ERROR — never a pass |
| an imported report older than a product file | STALE — re-run the tests |

`evidence.junit` is part of the policy lock: changing it is a REVIEW change (ADR-014, ADR-016).

## The contract

Whoever writes it — the gate, `eos evidence junit`, or your own step — the file looks like this:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-10T02:14:00.000Z",
  "runId": "ci-8821",
  "framework": "junit",
  "command": "node --test",
  "productTree": { "digest": "<from `eos product-tree --json`>" },
  "results": [
    { "ac": "AC1.1", "testPath": "tests/login.test.mjs", "selector": "valid password", "status": "PASS" }
  ]
}
```

EOS checks that:

1. every story acceptance criterion has a result,
2. every result is `PASS`,
3. `testPath` **exists on disk**,
4. `selector` actually appears in that file,
5. the trace-matrix row points at the same test file,
6. `productTree.digest` equals the current tree — results produced against other code do not
   certify this code.

`productTree.digest` is **required** by the gate, even though the schema can parse a summary without
it: a summary that records no digest is reported `STALE` ("it records no productTree.digest"), not
accepted. It is what stops a summary from outliving the source it described.

## Writing it yourself (still supported)

A project that does not declare `evidence.junit` keeps producing `docs/evidence/test-run.json` its
own way, exactly as before 2.2 — a reporter, a jq step, or a wrapper inside `commands.test`:

```json
{ "commands": { "test": ["npm run --silent test", "node scripts/to-eos-trace.mjs"] } }
```

Read the digest programmatically on every run, as `docs/eos/examples/eval-starter/summary.mjs`
does — a digest pasted by hand is stale after the next edit, and the gate will say so:

```sh
node .github/eos/eos.mjs product-tree --json
# → { "productTree": { "digest": "…" } }
```

## Why JUnit, and only JUnit?

Because nearly every runner already writes it, so one reader covers them all — and EOS never has to
know your runner. Supporting each runner's own format would be a permanent maintenance burden that
still missed the next one; asking every team to write a mapping step was the fixed cost of every
story. The parser is a deliberately small, fail-closed subset of XML (ADR-016).
