# EOS Template — Engineering Operating System

> 🌏 Chinese: **[README.zh.md](README.zh.md)** (full parity translation) — English is the reference language.

A portable, **local-first** engineering operating system for VS Code + GitHub Copilot,
orchestrating the installed **BMAD** skills (73 `bmad-*`) across the full SDLC. Version: **eos-1.11.0**.

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
  prompts/                      # slash-command workflows (/eos-help /eos-init /requirements /spec /ux-spec /eval-spec
                                #   /spec-align /adr /nfr /telemetry-plan /release-gate /runbook /validate-config)
  agents/                       # 5 orchestrator agents (discovery/design/architecture/plan/review)
  skills/                       # project-level capabilities (operational-readiness)
  hooks/                        # guardrails + validators (validate-config, eos-doctor, secret-scan,
                                #   spec-align, project-gate)
  workflows/                    # local CI (eos-ci.yml) — runnable via act, no cloud runner
.eos/
  project.json                  # project declaration: projectType + stacks + quality commands
                                #   (what the product-quality gate actually executes — any stack)
docs/
  checklists/                   # A-gap, B-rework, C-nfr, D-ops, E-security
  eos/                          # blueprint, user-manual, quickstart, stack-presets, agent-map, examples, VERSION
  adr/ epics/ stories/          # SDD artifacts
api/ ops/ src/
```

## Three enforcement layers (all local)
1. **Per-edit hooks** (real-time): guardrail denies destructive / supply-chain-poison / secret-leak ops;
   quality + config-check run validators after each edit.
2. **Static validators** (on demand): `validate-config.mjs` (config S1–S12), `check-doc-parity.mjs`
   (zh⇄en doc parity), `eos-doctor.mjs` (SDLC gates incl. G-EVAL), `secret-scan.mjs` (+gitleaks),
   `spec-align.mjs` (spec-alignment metric; `--strict` is fail-closed), `project-gate.mjs` (the
   project's own lint/typecheck/test/eval — for any stack).
3. **Whole-repo CI** (before merge/release): `act push` runs `.github/workflows/eos-ci.yml`.
   Product tests run for **whatever stack `.eos/project.json` declares** (Node/Python/Go/Java/Rust/.NET) —
   a failing test fails CI, and an undeclared or untestable project fails closed rather than being skipped.

## Verified on this machine
- A recent VS Code + Copilot Chat build · brace globs (`**/*.{ts,tsx}`) load correctly.
- PreToolUse guardrail blocks destructive/poison/secret ops (`permissionDecision: "deny"`).
- `act` runs the CI offline after a one-time image pull; 73 `bmad-*` skills load from user-level dirs.

## Start here
See [docs/eos/quickstart.md](docs/eos/quickstart.md) (Prerequisites + Day-1). First command:
```
node .github/hooks/validate-config.mjs    # expect PASS
```

> **One-time hardening (makes the CI gates actually merge-blocking, not just advisory):** after you
> instantiate a real repo, run `/eos-init` in Copilot Chat. It walks you through branch protection +
> replacing the CODEOWNERS handle + the approval baseline, and tracks progress in
> [docs/eos/activation.md](docs/eos/activation.md). `eos-doctor` reminds you of anything still pending
> on every run, and `/release-gate` re-checks it before you ship — so it can't be systematically forgotten.

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
- Hooks are a VS Code **Preview** feature (official: config format/behavior may change) — `.github/hooks/*.json`
  load by default via `chat.hookFilesLocations`. See `docs/eos/user-manual.md` §2.4 + Appendix D.
- There is **no native rule priority** — control is via `applyTo` scope + conventions + hooks.

## License

[MIT](LICENSE) © 2026 Xavier Zhang.

