# Trace evidence — making a passing test a *result*, not a claim

`docs/trace-matrix.md` records a human decision: *"AC1.1 is proven by this test."* That decision is
worth having, and Markdown is the right place for it.

What Markdown cannot record is whether the test **ran**. Before `eos-1.13.0`, any row whose last
cell contained `PASS`, `✅` or `✓` counted as a passing test — so a matrix written by hand (or by a
model) verified a story that had never executed anything (audit finding EOS-AUD-006).

So G7 now reads **both**:

| Source | Answers |
|---|---|
| `docs/trace-matrix.md` | *which* test is claimed to prove *which* criterion |
| `docs/evidence/test-run.json` | that it ran, against **this** tree, and what it returned |

and requires them to agree. The schema is `.eos/schemas/test-run.schema.json`.

## The contract

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-10T02:14:00.000Z",
  "runId": "ci-8821",
  "framework": "node:test",
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
6. `productTree.digest` (when present) equals the current tree — results produced against other code
   do not certify this code.

`productTree` is optional so a first integration is not blocked on wiring it, but **record it**: it
is what stops a summary from outliving the source it described.

## Producing it

It is deliberately framework-neutral — a small mapping step, not an EOS plugin. Three shapes:

**A test that names its AC.** Tag the criterion in the test name and let a reporter map it:

```js
test('AC1.1 valid password logs the user in', () => { /* … */ });
```

**A reporter / jq step.** Most runners already emit machine-readable output:

```sh
node --test --test-reporter=json > /tmp/out.json
node scripts/to-eos-trace.mjs /tmp/out.json > docs/evidence/test-run.json   # ~30 lines

pytest -q --json-report --json-report-file=/tmp/out.json
python scripts/to_eos_trace.py /tmp/out.json > docs/evidence/test-run.json

go test ./... -json | go run ./tools/eos-trace > docs/evidence/test-run.json
dotnet test --logger "trx;LogFileName=out.trx" && dotnet run --project tools/EosTrace
```

**A wrapper inside `commands.test`.** Chain it in `.eos/project.json` so a verified story cannot
exist without the evidence:

```json
{ "commands": { "test": ["npm run --silent test", "node scripts/to-eos-trace.mjs"] } }
```

## Getting the digest

```sh
node .github/eos/eos.mjs product-tree --json
# → { "productTree": { "digest": "…" } }   — copy it into the summary you emit
```

## Why does EOS not run the tests and collect this itself?

Because it would have to know your runner. EOS runs whatever `.eos/project.json` declares — Node,
pytest, Go, Gradle, dotnet, a shell script — and parsing all of their outputs would be a permanent
maintenance burden that still misses the next one. A 30-line mapping step in *your* repository, in
*your* language, is both smaller and more honest.
