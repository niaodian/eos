# EOS Stack Presets

> A **reference doc with no frontmatter / `applyTo` — Copilot never auto-loads it**, so it adds
> **zero always-on context cost** no matter how many stacks it lists.
>
> When configuring a new project: **copy only the one block for the stack you use** (two for a monorepo)
> into the right file — don't paste the whole thing into `00-workspace`.

## How to use (3 steps)

1. Open `.github/instructions/00-workspace.instructions.md` and replace the `## Local commands` line with the finished line for your stack below.
2. Enable the matching **R3 stack-rule file** (all six backends — Node/Python/Go/Java/Rust/.NET — plus the React frontend ship with the template; just keep them). The unused stack-rule files are **lazy**: they only take effect when the repo actually contains files with the matching extension, so keeping them is harmless (delete them if you prefer).
3. (Optional) If you use a non-Node stack and want the automatic quality gate to fire, replace the `PostToolUse` command in `.github/hooks/quality.json` per the table below (the shipped one is Node-only: it probes for `npm` + `package.json` and no-ops automatically on non-Node repos).

> **Mutual-exclusion reminder**: every R3 file's `applyTo` glob must be non-overlapping (`**/*.ts` / `**/*.py` / `**/*.go` / `**/*.java` / `**/*.rs` / `**/*.cs` / `**/*.{tsx,jsx}`). After editing, run `node .github/hooks/validate-config.mjs` to check S3.

---

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
- **Companion gate**: `/eval-spec` produces `docs/eval-plan.md` (conditional gate **G-EVAL**; non-LLM features SKIP with a reason); C-nfr adds cost/token/latency/quality thresholds
- **Starter skeleton**: copy `docs/eos/examples/eval-starter/` (a zero-dependency runnable dataset + graders + runner + stub) and swap the stub
- **quality.json inner command**: `ruff check . && pytest -q && pytest evals/ -q`
  (Node projects use `node --test evals/*.test.mjs` instead — pass an explicit glob; a bare `evals/` directory errors on Node 23)
- **CI**: `.github/workflows/eos-ci.yml` (run locally with `act push`) executes evals + `eos-doctor` (G-EVAL machine-enforced), failing on regression

---

## Frontend alongside a backend (monorepo)

The React frontend rule `frontend/10-frontend.instructions.md` (`**/*.{tsx,jsx}`) is naturally mutually exclusive with any backend rule, so they can coexist in one repo. In a monorepo, `00-workspace`'s `Local commands` can hold two lines (frontend `npm` + backend `pytest`/`go test`), each annotated with its directory prefix. If both frontend and backend are pure `.ts`, narrow the backend glob to a directory (e.g. `apps/api/**/*.ts`) to keep them exclusive — see the Scope note at the top of `backend/10-backend-node.instructions.md`.

## Run after editing

```sh
node .github/hooks/validate-config.mjs   # expect PASS: S3 glob exclusivity, S4 type coverage, S7 required paths
```

> Adding or removing a stack doesn't touch the EOS skeleton (agents / prompts / hooks / governance flow are all unchanged) — you only swap `applyTo` and the body text. See user-manual Chapter 11 for details.
