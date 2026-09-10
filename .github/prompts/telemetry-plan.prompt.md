---
name: telemetry-plan
description: Design the telemetry/analytics plan and close it against success metrics
agent: agent
tools: ['search', 'editFiles']
---
# Telemetry Plan (EOS)

1. List key user/system events to instrument (name, trigger, properties).
2. For each event, link it to a success metric defined in `docs/discovery.md`.
3. Define alert thresholds for critical paths.
4. Confirm audit-log coverage for sensitive operations.
5. LLM/agentic features (if applicable): trace each chain/agent run (span per model/tool call);
   log prompt id+version, model, tokens in/out, cost, latency, outcome; capture user feedback
   to feed the eval/data flywheel (`docs/eval-plan.md`).

## Outputs (Gate G9 reads the second one)

| File | Audience |
|---|---|
| `docs/telemetry-plan.md` | people: what is instrumented and why |
| `docs/telemetry.json` | the machine: schema `.eos/schemas/telemetry.schema.json` |

`telemetry-ready` requires: the **discovery success metric** emitted as a named signal, at least one
dashboard, at least one alert **with a `routesTo`** (an alert nobody receives is not an alert), the
sensitive-operation audit decision, a `rollbackTrigger`, and a named `owner`.

```sh
node .github/eos/eos.mjs check --gate telemetry-ready --scope <release-id>
node .github/eos/eos.mjs transition --scope release --id <release-id> --to OBSERVED
```

> **Next (after G9):** switch to the `eos-review` agent (Chat mode picker) to drive the next
> iteration from telemetry — it closes the loop back to `/requirements` (Gate G10).
