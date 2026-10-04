# EOS Stack Presets

> A **reference doc with no frontmatter / `applyTo` — Copilot never auto-loads it**, so it adds
> **zero always-on context cost** no matter how many stacks it lists.
>
> When configuring a new project: **copy only the one block for the stack you use** (two for a monorepo)
> into the right file — don't paste the whole thing into `00-workspace`.

## How to use (3 steps)

> **Fastest path (eos-2.0.0):** `node .github/eos/eos.mjs init` lists the starter packs and names the
> ones that match your code; `init <pack> --write` writes a correct `.eos/project.json` for your stack
> and track, and `stack sync --write` renders its commands into `00-workspace`. The steps below are
> what those commands do for you, and how to adjust them by hand.

1. Open `.github/instructions/00-workspace.instructions.md` and replace the `## Local commands` line with the finished line for your stack below.
2. Enable the matching **R3 stack-rule file** (all six backends — Node/Python/Go/Java/Rust/.NET — plus the React frontend ship with the template; just keep them). The unused stack-rule files are **lazy**: they only take effect when the repo actually contains files with the matching extension, so keeping them is harmless (delete them if you prefer).
3. **Put the same commands into `.eos/project.json`** (see the next section) — that is the copy CI and
   `project-gate` actually execute, and it decides whether a failing test can turn CI red. **Omitting it
   fails closed**: if the repo contains a `pyproject.toml` / `go.mod` / … with no declaration,
   `project-gate` errors out instead of silently skipping.
4. (Optional) If you use a non-Node stack and want the **edit-time** quality gate to fire, replace the `PostToolUse` command in `.github/hooks/quality.json` per the table below (the shipped one is Node-only: it probes for `npm` + `package.json` and no-ops automatically on non-Node repos). Note PostToolUse is **advisory**; the authoritative gate is `project-gate` in CI.

> **Mutual-exclusion reminder**: every R3 file's `applyTo` glob must be non-overlapping (`**/*.ts` / `**/*.py` / `**/*.go` / `**/*.java` / `**/*.rs` / `**/*.cs` / `**/*.{tsx,jsx}`). After editing, run `node .github/hooks/validate-config.mjs` to check S3.

---

## Choose your governance track

A stack says *how* the product is verified; a track says *how much a release must prove*. They are
independent: every pack works on either track, and the track lives in the same `.eos/project.json`.

| | Standard (default) | Regulated |
|---|---|---|
| Declare it | `eos init <pack> --write` | `eos init <pack> --track regulated --write` |
| What it sets | nothing extra | `workflowProfile` and `complianceProfile` `"regulated"`, `evidencePolicy` `"ci"` |
| A release needs | the declared quality commands, re-run on the candidate | the same, plus a signed manifest, CI-produced evidence and provenance for every artifact |

No code yet? `eos init config-only --write` (with `--track` if it applies) — the stack is decided at
architecture, and `eos init <pack> --write` later keeps the track. Details, signing and CI provenance:
[user manual §10.6](user-manual.md#106-governance-tracks-signed-releases-and-central-policy).

---

## `.eos/project.json` (the single entry point of the product-quality gate)

EOS CI used to be one line — `if [ -f package.json ]` — so a **Python/Go/Java/Rust/.NET project's failing
tests were never executed**: "EOS config green != product tests green". It is now an **explicit
declaration**, executed by the zero-dependency, cross-platform `node .github/hooks/project-gate.mjs`.

| Field | Meaning |
|---|---|
| `projectType` | `application` \| `library` \| `config-only`. The first two **must** have `commands.test`; `config-only` is allowed only when **no stack manifest exists** in the repo, and must **not** declare `commands` (they would never run) |
| `stacks` | `node` \| `python` \| `go` \| `java` \| `rust` \| `dotnet` \| `other` (array, multi-stack ok). Use `other` for a stack with no manifest file (shell / Terraform / plain scripts) |
| `commands` | `install` / `lint` / `typecheck` / `test` / `eval` / `audit`. Absent = N/A; declared = **must actually run and pass**. `audit` (npm audit, pip-audit, govulncheck …) is not part of the per-push gate: the release gate (G8) runs it, and fails without it — every starter pack with code declares one |
| `evidence` | `{ "junit": ["reports/junit/*.xml"] }` — where `commands.test` writes JUnit XML. The `verified` gate reads only the reports that run wrote and derives `docs/evidence/test-run.json` from them (eos-2.2.0, ADR-016; see `docs/eos/examples/trace-evidence/`) |
| `productParadigms` | `deterministic` \| `agentic` (array). Contains `agentic` => the G-EVAL gate turns on |
| `evalRequired` | Optional `boolean`, explicitly overriding the inference above |
| `evalWaiver` | `{ reason, approvedBy }` — required when an LLM dependency is discovered but you still declare `deterministic`; the reason must be real |

**Execution semantics (all fail closed)**

- Declared but not runnable => **FAIL**; toolchain missing (command not on PATH) => **BLOCKED + exit 1**, never a fake PASS.
- `application`/`library` without `commands.test` => **FAIL** (a vacuously green gate is refused).
- `config-only` while a `package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`/`pom.xml`/`*.csproj` exists => **FAIL**.
  EOS's own root `package.json` is tooling, not product code, as long as it only carries EOS (a `.github/`
  bin, scripts that only run `node .github/…` or `npm run …`, no dependency or entry point); the first
  dependency or product script makes it a Node project.
- `config-only` that declares `commands` => **FAIL** (they would never run — no pretending a gate exists).
  Code in a stack with no manifest file? Use `"projectType": "application"` + `"stacks": ["other"]`.
- No `.eos/project.json` at all: a pure Node repo falls back to the legacy npm-script defaults
  (**backwards compatible**, still requiring a `test` script); any other stack => **FAIL**, declare it first.
- **Commands never reach a shell**: `;` `&&` `|` `>` `` ` `` `$` and friends are rejected at load time
  (config cannot be an injection vector). To chain, pass an **array**: `"test": ["ruff check .", "pytest -q"]`;
  for pipes/globs, move the pipeline into an npm script / Makefile / tox and call that one command here.
  > An array has exactly two legal shapes and **must not be mixed** (mixing errors out as ambiguous):
  > one command's argv — `["go", "test", "./..."]`; or several complete commands — `["ruff check .", "pytest -q"]`.
  > An argument containing a space belongs in a **quoted single string**: `"dotnet test \"My App.sln\""`.
- Running a non-Node stack in CI? Add the matching toolchain setup step to `.github/workflows/eos-ci.yml`
  (`setup-python` / `setup-go` / `setup-java` / `rust-toolchain` / `setup-dotnet`), or it reports BLOCKED.

```jsonc
// Node.js / TypeScript
{ "projectType": "application", "stacks": ["node"],
  "commands": { "install": "npm ci", "lint": "npm run --silent lint",
                "typecheck": "npm run --silent typecheck", "test": "npm test --silent",
                "audit": "npm audit --audit-level=high" } }

// Python
{ "projectType": "application", "stacks": ["python"],
  "commands": { "install": "pip install -r requirements.txt", "lint": "ruff check .",
                "typecheck": "mypy .", "test": "pytest -q --junitxml=reports/junit/python.xml",
                "audit": "pip-audit -r requirements.txt" },
  "evidence": { "junit": ["reports/junit/*.xml"] } }

// Go
{ "projectType": "application", "stacks": ["go"],
  "commands": { "install": "go mod download", "lint": "golangci-lint run",
                "typecheck": "go vet ./...", "test": "go test ./...", "audit": "govulncheck ./..." } }

// Java (Maven)
{ "projectType": "application", "stacks": ["java"],
  "commands": { "install": "mvn -q dependency:go-offline", "lint": "mvn -q spotless:check",
                "test": "mvn -q test", "audit": "mvn -q org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7" },
  "evidence": { "junit": ["target/surefire-reports/TEST-*.xml"] } }

// Rust
{ "projectType": "application", "stacks": ["rust"],
  "commands": { "install": "cargo fetch", "lint": ["cargo clippy -- -D warnings"],
                "typecheck": "cargo check", "test": "cargo test", "audit": "cargo audit" } }

// .NET / C#
{ "projectType": "application", "stacks": ["dotnet"],
  "commands": { "install": "dotnet restore", "lint": "dotnet format --verify-no-changes",
                "test": "dotnet test", "audit": "dotnet restore -warnaserror:NU1903,NU1904" } }

// Agentic / LLM product (adds eval on top of the backend stack — declaring agentic REQUIRES an eval command)
{ "projectType": "application", "stacks": ["python"], "productParadigms": ["deterministic", "agentic"],
  "commands": { "lint": "ruff check .", "test": "pytest -q", "eval": "pytest evals/ -q" } }

// No product code yet — `eos init config-only --write` (the stack is decided at architecture)
{ "projectType": "config-only", "stacks": [], "productParadigms": ["deterministic"] }
```

> `jsonc` is only so the examples can carry comments; **the real file is strict JSON and cannot contain them**.
> After editing, run `node .github/hooks/validate-config.mjs` (S12 validates the declaration itself) and
> `node .github/hooks/project-gate.mjs`.

## Quick reference

| Stack | R3 file (`applyTo`) | Ships with template |
|---|---|---|
| Node.js / TypeScript (default) | `backend/10-backend-node` (`**/*.ts`) | ✅ |
| Python (FastAPI/Django) | `backend/10-backend-python` (`**/*.py`) | ✅ |
| Go | `backend/10-backend-go` (`**/*.go`) | ✅ |
| Java / Spring Boot | `backend/10-backend-java` (`**/*.java`) | ✅ |
| Frontend React | `frontend/10-frontend` (`**/*.{tsx,jsx}`) | ✅ |
| Rust | `backend/10-backend-rust` (`**/*.rs`) | ✅ |
| .NET / C# | `backend/10-backend-dotnet` (`**/*.cs`) | ✅ |
| AI / LLM & Agentic | `ai/10-ai-llm` (`**/{ai,llm,rag}/**`, additive layer) | ✅ |

---

## Finished block per stack

### Node.js / TypeScript (default)

- **`00-workspace` Local commands**:
  ```
  - Install: `npm ci` · Lint: `npm run lint` · Test: `npm test` · Typecheck: `npm run typecheck`.
  ```
- **R3**: `backend/10-backend-node.instructions.md` (shipped, `**/*.ts`). Same for pnpm/yarn — just swap the prefix.
- **Layout**: `src/` · `test/`
- **quality.json inner command** (this is the default): `npm run -s lint --if-present && npm run -s typecheck --if-present && npm test --silent --if-present`

### Python (FastAPI/Django)

- **Local commands**:
  ```
  - Install: `pip install -r requirements.txt` · Lint: `ruff check .` · Test: `pytest` · Typecheck: `mypy .`.
  ```
- **R3**: `backend/10-backend-python.instructions.md` (shipped, `**/*.py`). Variants: `uv sync` / `poetry install`.
- **Layout**: `app/` (routers/services/repositories) · `tests/`
- **quality.json inner command**: `ruff check . && mypy . && pytest -q`

### Go

- **Local commands**:
  ```
  - Install: `go mod download` · Lint: `golangci-lint run` · Test: `go test ./...` · Typecheck: `go vet ./...`.
  ```
- **R3**: `backend/10-backend-go.instructions.md` (shipped, `**/*.go`)
- **Layout**: `cmd/` · `internal/` · `pkg/`
- **quality.json inner command**: `golangci-lint run && go vet ./... && go test ./...`

### Java / Spring Boot

- **Local commands** (Maven):
  ```
  - Install: `mvn -q dependency:go-offline` · Lint: `mvn -q spotless:check` · Test: `mvn -q test` · Build: `mvn -q compile`.
  ```
  Gradle: `./gradlew dependencies` / `spotlessCheck` / `test` / `compileJava`
- **R3**: `backend/10-backend-java.instructions.md` (shipped, `**/*.java`)
- **Layout**: `src/main/java` · `src/test/java`
- **quality.json inner command**: `mvn -q spotless:check && mvn -q test`

### Rust

- **Local commands**:
  ```
  - Install: `cargo fetch` · Lint: `cargo clippy -- -D warnings` · Test: `cargo test` · Typecheck: `cargo check`.
  ```
- **R3**: `backend/10-backend-rust.instructions.md` (shipped, `**/*.rs`)
- **Layout**: `src/` · `tests/`
- **quality.json inner command**: `cargo clippy -- -D warnings && cargo test`

### .NET / C#

- **Local commands**:
  ```
  - Install: `dotnet restore` · Lint: `dotnet format --verify-no-changes` · Test: `dotnet test` · Build: `dotnet build`.
  ```
- **R3**: `backend/10-backend-dotnet.instructions.md` (shipped, `**/*.cs`)
- **Layout**: `src/` · `tests/`
- **quality.json inner command**: `dotnet format --verify-no-changes && dotnet test`

### AI / LLM & Agentic (additive layer, stacks on top of a backend)

> This is an **additive layer**, not a replacement for the backend stack: an LLM product is usually "Python backend + AI layer". Put AI code under `ai/`/`llm/`/`rag/`; files there pick up both the backend stack rule and this AI rule.

- **Local commands** (backend stack plus eval):
  ```
  - Install: `pip install -r requirements.txt` · Lint: `ruff check .` · Test: `pytest` · Eval: `pytest evals/ -q`.
  ```
- **R3**: `ai/10-ai-llm.instructions.md` (shipped, `**/{ai,llm,rag}/**`) — prompt-as-artifact, tool/agent architecture, non-deterministic evaluation, reproducibility, LLM safety, tracing/cost
- **Layout**: `ai/` (agents/tools/chains) · `ai/prompts/` (versioned prompts) · `evals/` (eval sets + graders)
- **Common dependency governance** (as needed, pin versions): orchestration LangChain / LlamaIndex; vector stores Chroma (local) / Pinecone·Qdrant·Weaviate (hosted); provider SDKs OpenAI/Anthropic. **A synchronous, blocking LLM call must never run inside a web request thread** — use an async queue (Celery/BullMQ); see the Execution model in `ai/10-ai-llm`.
- **Companion gate**: `/eos-eval-spec` produces `docs/eval-plan.md` (conditional gate **G-EVAL**; non-LLM features SKIP with a reason); C-nfr adds cost/token/latency/quality thresholds
- **Starter skeleton**: copy `docs/eos/examples/eval-starter/` (a zero-dependency runnable dataset + graders + runner + stub) and swap the stub
- **quality.json inner command**: `ruff check . && pytest -q && pytest evals/ -q`
  (Node projects use `node --test evals/*.test.mjs` instead — pass an explicit glob; a bare `evals/` directory errors on Node 23)
- **CI**: `.github/workflows/eos-ci.yml` (run locally with `act push -W .github/workflows/eos-ci.yml`) executes evals + `eos-doctor` (G-EVAL machine-enforced), failing on regression

---

## Frontend alongside a backend (monorepo)

The React frontend rule `frontend/10-frontend.instructions.md` (`**/*.{tsx,jsx}`) is naturally mutually exclusive with any backend rule, so they can coexist in one repo. In a monorepo, `00-workspace`'s `Local commands` can hold two lines (frontend `npm` + backend `pytest`/`go test`), each annotated with its directory prefix. If both frontend and backend are pure `.ts`, narrow the backend glob to a directory (e.g. `apps/api/**/*.ts`) to keep them exclusive — see the Scope note at the top of `backend/10-backend-node.instructions.md`.

## Run after editing

```sh
node .github/hooks/validate-config.mjs   # expect PASS: S3 glob exclusivity, S4 type coverage, S7 required paths, S12 valid declaration
node .github/hooks/project-gate.mjs      # expect PASS: your declared lint/typecheck/test/eval actually ran
```

> Adding or removing a stack doesn't touch the EOS skeleton (agents / skills / hooks / governance flow are all unchanged) — you only swap `applyTo` and the body text. See user-manual Chapter 11 for details.
