---
name: 'Security & Compliance'
description: 'Thin always-on security guardrails'
applyTo: "**"
---
# Security & Compliance (thin)

- Validate & sanitize all external input at boundaries.
- Enforce authz at every state-changing operation; deny by default.
- Secrets only via env/secret store; never in code, logs, or fixtures.
- Run dependency audit before release (`npm audit` / `pip-audit`).
- Classify data (public/internal/PII); encrypt PII at rest & in transit.
- LLM features: treat model output as untrusted; guard against prompt injection; never put
  secrets/PII in prompts or logs; moderate outputs before acting (see `ai/10-ai-llm` rule).
