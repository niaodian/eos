# EOS Template — Engineering Operating System

A portable, **local-first** engineering operating system for VS Code + GitHub Copilot,
orchestrating the installed **BMAD** skills (73 `bmad-*`) across the full SDLC. Version: **eos-1.5.0**.

**Supports two paradigms in one framework:**
- **Traditional SaaS** (deterministic): transactions, resilience (circuit-breaker/backoff), REST/OpenAPI, RBAC/multi-tenancy, OTel observability.
- **Agentic / LLM products** (probabilistic): prompt-as-artifact, tool allow-lists, eval-driven testing (G-EVAL), cognitive retry (reflection), token/cost tracing.

The two are **explicitly isolated** so a project can be either — or both — without paradigm cross-contamination.

## What's inside
```
.github/
  copilot-instructions.md       # R1 always-on global rules (minimal)
  instructions/                 # scoped rules (applyTo globs): 6 backend stacks + frontend + data-api
                                #   + ai/llm + testing + security + release-ops
  prompts/                      # slash-command workflows (/requirements /spec /ux-spec /eval-spec
                                #   /spec-align /adr /nfr /telemetry-plan /release-gate /runbook /validate-config)
  agents/                       # 5 orchestrator agents (discovery/design/architecture/plan/review)
  skills/                       # project-level capabilities (operational-readiness)
  hooks/                        # guardrails + validators (validate-config, eos-doctor, secret-scan, spec-align)
  workflows/                    # local CI (eos-ci.yml) — runnable via act, no cloud runner
docs/
  checklists/                   # A-gap, B-rework, C-nfr, D-ops, E-security
  eos/                          # blueprint, user-manual, quickstart, stack-presets, agent-map, examples, VERSION
  adr/ epics/ stories/          # SDD artifacts
api/ ops/ src/
```

## Three enforcement layers (all local)
1. **Per-edit hooks** (real-time): guardrail denies destructive / supply-chain-poison / secret-leak ops;
   quality + config-check run validators after each edit.
2. **Static validators** (on demand): `validate-config.mjs` (config S1–S11), `eos-doctor.mjs` (SDLC gates
   incl. G-EVAL), `secret-scan.mjs` (+gitleaks), `spec-align.mjs` (spec-alignment metric).
3. **Whole-repo CI** (before merge/release): `act push` runs `.github/workflows/eos-ci.yml`.

## Verified on this machine
- A recent VS Code + Copilot Chat build · brace globs (`**/*.{ts,tsx}`) load correctly.
- PreToolUse guardrail blocks destructive/poison/secret ops (`permissionDecision: "deny"`).
- `act` runs the CI offline after a one-time image pull; 73 `bmad-*` skills load from user-level dirs.

## Start here
See [docs/eos/quickstart.md](docs/eos/quickstart.md) (Prerequisites + Day-1). First command:
```
node .github/hooks/validate-config.mjs    # expect PASS
```

> **Open the project folder itself as the workspace root** (`code .` from inside it). VS Code discovers
> `.github/{agents,instructions,hooks,prompts}` only at the opened root — open a **parent** folder and the
> custom agents, instructions, and hooks all silently go inactive.

**Full user manual** (idea → launch → iteration; includes step-by-step **SaaS** and **Agentic** tracks
for beginners): [docs/eos/user-manual.md](docs/eos/user-manual.md).

Design rationale (why it's built this way): [docs/eos/blueprint.md](docs/eos/blueprint.md).

Per-stack setup presets (Node/Python/Go/Java/Rust/.NET + AI/LLM): [docs/eos/stack-presets.md](docs/eos/stack-presets.md).

## Notes
- No org/network dependencies: fully local & Git-portable.
- Local CI runs via `act` (GitHub Actions locally, needs Docker) — `.github/workflows/eos-ci.yml`.
  No Docker? Run the same gate directly: `node .github/hooks/validate-config.mjs && node .github/hooks/eos-doctor.mjs`.
- Hooks are a VS Code **Preview** feature; `.github/hooks/*.json` load by default.
- There is **no native rule priority** — control is via `applyTo` scope + conventions + hooks.

