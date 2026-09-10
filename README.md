# EOS Template — Engineering Operating System

> 🌏 Chinese: **[README.zh.md](README.zh.md)** (full parity translation) — English is the reference language.

A portable, **local-first** engineering operating system for VS Code + GitHub Copilot,
orchestrating the installed **BMAD** skills (73 `bmad-*`) across the full SDLC. Version: **eos-1.14.0**.

**Supports two paradigms in one framework:**
- **Traditional SaaS** (deterministic): transactions, resilience (circuit-breaker/backoff), REST/OpenAPI, RBAC/multi-tenancy, OTel observability.
- **Agentic / LLM products** (probabilistic): prompt-as-artifact, tool allow-lists, eval-driven testing (G-EVAL), cognitive retry (reflection), token/cost tracing.

The two are **explicitly isolated** so a project can be either — or both — without paradigm cross-contamination.

## The loop (you do not need to read the manual)
```
node .github/eos/eos.mjs resume   # what was I doing, what is blocking it
node .github/eos/eos.mjs next     # the ONE recommended next action, why, and how to start it
```
In Copilot Chat the same loop is the **eos-guide** agent, or `/eos-next` · `/eos-resume` · `/eos-status`.
EOS derives the phase from artifacts, evidence and an append-only ledger — never from a prose summary —
recommends exactly one action, and refuses to promote work that has no evidence behind it.
Contract: [docs/eos/developer-experience.md](docs/eos/developer-experience.md).

## What's inside
```
.github/
  copilot-instructions.md       # R1 always-on global rules (minimal)
  instructions/                 # scoped rules (applyTo globs): 6 backend stacks + frontend + data-api
                                #   + ai/llm + testing + security + release-ops
  prompts/                      # slash-command workflows (/eos-next /eos-resume /eos-status /eos-help
                                #   /eos-init /requirements /spec /ux-spec /eval-spec /spec-align /adr
                                #   /nfr /telemetry-plan /release-gate /runbook /validate-config)
  agents/                       # eos-guide (entry point) + 5 orchestrators (discovery/design/
                                #   architecture/plan/review)
  skills/                       # project-level capabilities (operational-readiness)
  hooks/                        # guardrails + validators (validate-config, eos-doctor, secret-scan,
                                #   spec-align, project-gate)
  eos/                          # the guided-workflow CLI (eos.mjs) + deterministic engine + tests
  workflows/                    # local CI (eos-ci.yml) — runnable via act, no cloud runner
.eos/
  project.json                  # project declaration: projectType + stacks + quality commands
                                #   (what the product-quality gate actually executes — any stack)
  workflow.json gates.json      # change-type gate policy + machine-verified gate definitions
  agent-map.json                # action -> one agent/prompt + a minimal BMAD skill chain
  evidence/ waivers/ ledger/    # gate evidence, controlled exceptions, append-only event log
docs/
  checklists/                   # A-gap, B-rework, C-nfr, D-ops, E-security
  eos/                          # blueprint, user-manual, quickstart, stack-presets, agent-map, examples, VERSION
  adr/ epics/ stories/          # SDD artifacts
api/ ops/ src/
```

## Four enforcement layers (all local)
1. **Per-edit hooks** (real-time): guardrail denies destructive / supply-chain-poison / secret-leak ops;
   quality + config-check run validators after each edit.
2. **Static validators** (on demand): `validate-config.mjs` (config S1–S13), `check-doc-parity.mjs`
   (zh⇄en doc parity), `eos-doctor.mjs` (SDLC gates incl. G-EVAL), `secret-scan.mjs` (+gitleaks),
   `spec-align.mjs` (spec-alignment metric; `--strict` is fail-closed), `project-gate.mjs` (the
   project's own lint/typecheck/test/eval — for any stack).
3. **Gate & transition engine** (per scope): `node .github/eos/eos.mjs check --gate <id> --scope <id>`
   runs a gate for real and records evidence bound to the commit, the gate version and every input
   hash; `transition` refuses illegal jumps, missing guards and stale evidence. A missing tool or a
   crashed validator is BLOCKED, never PASS.
4. **Whole-repo CI** (before merge/release): `act push` runs `.github/workflows/eos-ci.yml`.
   Product tests run for **whatever stack `.eos/project.json` declares** (Node/Python/Go/Java/Rust/.NET) —
   a failing test fails CI, and an undeclared or untestable project fails closed rather than being skipped.

## Verified on this machine
- A recent VS Code + Copilot Chat build · brace globs (`**/*.{ts,tsx}`) load correctly.
- PreToolUse guardrail blocks destructive/poison/secret ops (`permissionDecision: "deny"`).
- `act` runs the CI offline after a one-time image pull; 73 `bmad-*` skills load from user-level dirs.

## Start here
Open this folder in VS Code, then:
```
node .github/eos/eos.mjs init --write     # creates local VS Code tasks (never overwrites)
node .github/eos/eos.mjs next             # tells you the one next thing to do
```
Details in [docs/eos/quickstart.md](docs/eos/quickstart.md) (Prerequisites + Day-1).

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

