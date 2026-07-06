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

Output: `docs/telemetry-plan.md`. Every success metric must have >=1 backing event.

> **Next (after G9):** switch to the `eos-review` agent (Chat mode picker) to drive the next
> iteration from telemetry — it closes the loop back to `/requirements` (Gate G10).
