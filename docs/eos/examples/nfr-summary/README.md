# NFR summary — what the release gate measures, not what a checklist intends

`docs/requirements.json` states the non-functional targets (p95 latency, availability, cost …). At
G2 they are intentions. The release gate (G8, check `nfr-evidence`) wants the **measurements**:
`docs/evidence/nfr-summary.json`, schema `.eos/schemas/nfr-summary.schema.json`.

`eos status` lists it under *Release gate ahead (G8)* from the first day, so it is never a surprise at
the release.

## What G8 checks

| Rule | Why |
|---|---|
| Every NFR id in `docs/requirements.json` has a target here | leaving a target out must not drop it |
| `ADOPT` has `threshold`, `observed` and `comparator`; the gate **recomputes** the verdict | a `PASS` beside numbers that miss the threshold is an intention, not a result |
| `SKIP` has a real `reason` (15+ characters) | "n/a" is not a decision |
| `DEFER` has an `owner`, a `trigger` and a `dueBy` (`YYYY-MM-DD`) | the release reports **DEFERRED** — visible and time-bound, never passed. On the Standard track it can still be promoted, but only with a `dueBy` in the future: once the date has passed, the check is a **FAIL** until the target is measured, or deferred again with a new date and a fresh approval. Regulated and Controlled releases are never promoted with a deferral |
| `productTree.digest` equals the candidate's tree | a measurement of other code does not describe this release |
| `producer` | local measurements are honest but `UNATTESTED_LOCAL`; `evidencePolicy` "ci" requires CI-produced ones |

## Producing it

1. **Measure** each `ADOPT` target with the tool that fits it — k6, autocannon, locust or JMeter for
   latency and throughput, a synthetic probe or SLO dashboard export for availability, the cloud bill
   for cost. Run it against the release candidate, ideally in CI (`bmad-testarch-nfr` designs the
   checks).
2. **Record** the numbers in a measurements file — [`measurements.example.json`](measurements.example.json):
   the targets with `observed` filled in, plus the `SKIP` and `DEFER` decisions.
3. **Write** the summary with [`nfr-summary.mjs`](nfr-summary.mjs) — zero dependencies; copy it into
   your project (e.g. `scripts/`):

   ```sh
   node scripts/nfr-summary.mjs perf/measurements.json   # → docs/evidence/nfr-summary.json
   ```

   It computes each `ADOPT` verdict the way G8 does, refuses a `SKIP` without a reason or a `DEFER`
   without an owner, a trigger and a `dueBy`, binds the product tree (`eos product-tree --json`) and records the
   producer (`github-actions` in GitHub Actions, otherwise local). It exits 1 when a measured target
   misses its threshold. Run in place inside the template it is a demo and writes nothing.

[`nfr-summary.example.json`](nfr-summary.example.json) shows the result.

Measure on the commit you release: the summary is bound to the product tree, so any later change to
the product makes it `STALE` until it is measured again — by design.
