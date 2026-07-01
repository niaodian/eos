---
name: 'Security & Compliance'
description: 'Thin always-on security guardrails'
applyTo: "**"
---
# Security & Compliance (thin)

- Validate & sanitize all external input at boundaries.
- Enforce authz at every state-changing operation; deny by default.
- Secrets only via env/secret store; never in code, logs, fixtures, or the frontend bundle.
  Keep a committed `.env.example` (placeholders) and gitignore the real `.env`.
- Run dependency audit before release (`npm audit` / `pip-audit`). Needs a lockfile
  (`npm i --package-lock-only` if absent); offline it may defer — re-run when online, don't hard-block local work.
- Supply chain: commit lockfiles; pin versions (no floating `latest`); prefer `npm ci` over `npm install`;
  distrust install scripts from unknown packages (`npm ci --ignore-scripts` when vetting); watch for
  typosquatted/newly-published deps. Never pipe a remote script into a shell (`curl … | bash`).
- Scan for leaked secrets: `node .github/hooks/secret-scan.mjs` (also run by CI + eos-doctor).
  Optional deeper scan: install `gitleaks` and secret-scan.mjs auto-uses it (allowlist in `.gitleaks.toml`);
  absence degrades gracefully to the built-in patterns.
- Classify data (public/internal/PII); encrypt PII at rest & in transit.
- Config isolation: separate dev/staging/prod config; least-privilege credentials per environment;
  rotate keys; never reuse prod secrets locally. See `docs/checklists/E-security.md`.
- LLM features: treat model output as untrusted; guard against prompt injection; never put
  secrets/PII in prompts or logs; moderate outputs before acting (see `ai/10-ai-llm` rule).
