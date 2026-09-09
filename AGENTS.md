# Agents Entry (workspace root)

This repository uses an Engineering Operating System (EOS).

**Start here:** `node .github/eos/eos.mjs next` — it derives the current phase from artifacts,
recorded evidence and an append-only ledger, and returns the one recommended next action.
In Copilot Chat use the `eos-guide` agent, or `/eos-next` · `/eos-resume` · `/eos-status`.

- Guided-workflow contract: [docs/eos/developer-experience.md](docs/eos/developer-experience.md)
- Always-on rules: [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Scoped rules: `.github/instructions/**` (auto-applied by `applyTo` globs)
- Workflow commands (slash): `.github/prompts/**`
- Orchestrator agents (handoffs): `.github/agents/**`
- BMAD reuse map: [docs/eos/agent-map.md](docs/eos/agent-map.md)
- Quickstart: [docs/eos/quickstart.md](docs/eos/quickstart.md)
- User manual (incl. step-by-step SaaS & Agentic tracks): [docs/eos/user-manual.md](docs/eos/user-manual.md)
- Supports both deterministic SaaS and probabilistic Agentic/LLM projects; the two paradigms
  (state, fault-tolerance, testing) are kept explicitly isolated — see the AI rule `.github/instructions/ai/`.
