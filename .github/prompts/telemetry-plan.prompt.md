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

Output: `docs/telemetry-plan.md`. Every success metric must have >=1 backing event.
