# EOS Stack Presets（技术栈配方册）

> 这是一份**参考文档，不带 frontmatter / `applyTo`，不会被 Copilot 自动加载** ——
> 所以放再多栈也**不增加任何 always-on 上下文成本**。
>
> 配置新项目时：**只复制你用的那一个栈的块**（monorepo 可两个）到对应文件，别整本搬进 `00-workspace`。

## 怎么用（3 步）

1. 打开 `.github/instructions/00-workspace.instructions.md`，把 `## Local commands` 那一行换成下面你这个栈的成品行。
2. 启用对应的 **R3 栈规则文件**（六大后端栈 Node/Python/Go/Java/Rust/.NET + 前端 React 均随模板发布，留着即可）。其余不用的栈规则文件是**惰性的**——只有当仓库里真有对应后缀文件时才生效，留着无害，想删也行。
3.（可选）若用非 Node 栈又想让自动质量门禁生效，按下表替换 `.github/hooks/quality.json` 里 `PostToolUse` 的命令（现有那条是 Node 专用：探测 `npm`+`package.json`，非 Node 自动 no-op）。

> **互斥提醒**：每个 R3 文件的 `applyTo` glob 必须互不重叠（`**/*.ts` / `**/*.py` / `**/*.go` / `**/*.java` / `**/*.rs` / `**/*.cs` / `**/*.{tsx,jsx}`）。改完跑 `node .github/hooks/validate-config.mjs` 验 S3。

---

## 速查表

| 栈 | R3 文件（`applyTo`） | 随模板发布 |
|---|---|---|
| Node.js / TypeScript（默认） | `backend/10-backend-node`（`**/*.ts`） | ✅ |
| Python（FastAPI/Django） | `backend/10-backend-python`（`**/*.py`） | ✅ |
| Go | `backend/10-backend-go`（`**/*.go`） | ✅ |
| Java / Spring Boot | `backend/10-backend-java`（`**/*.java`） | ✅ |
| 前端 React | `frontend/10-frontend`（`**/*.{tsx,jsx}`） | ✅ |
| Rust | `backend/10-backend-rust`（`**/*.rs`） | ✅ |
| .NET / C# | `backend/10-backend-dotnet`（`**/*.cs`） | ✅ |
| AI / LLM & Agentic | `ai/10-ai-llm`（`**/{ai,llm,rag}/**`，附加层） | ✅ |

---

## 每个栈的成品块

### Node.js / TypeScript（默认）

- **`00-workspace` Local commands**：
  ```
  - Install: `npm ci` · Lint: `npm run lint` · Test: `npm test` · Typecheck: `npm run typecheck`.
  ```
- **R3**：`backend/10-backend-node.instructions.md`（已发布，`**/*.ts`）。pnpm/yarn 同理换前缀。
- **Layout**：`src/` · `test/`
- **quality.json 内层命令**（默认即此）：`npm run -s lint --if-present && npm run -s typecheck --if-present && npm test --silent --if-present`

### Python（FastAPI/Django）

- **Local commands**：
  ```
  - Install: `pip install -r requirements.txt` · Lint: `ruff check .` · Test: `pytest` · Typecheck: `mypy .`.
  ```
- **R3**：`backend/10-backend-python.instructions.md`（已发布，`**/*.py`）。变体：`uv sync` / `poetry install`。
- **Layout**：`app/`（routers/services/repositories）· `tests/`
- **quality.json 内层命令**：`ruff check . && mypy . && pytest -q`

### Go

- **Local commands**：
  ```
  - Install: `go mod download` · Lint: `golangci-lint run` · Test: `go test ./...` · Typecheck: `go vet ./...`.
  ```
- **R3**：`backend/10-backend-go.instructions.md`（已发布，`**/*.go`）
- **Layout**：`cmd/` · `internal/` · `pkg/`
- **quality.json 内层命令**：`golangci-lint run && go vet ./... && go test ./...`

### Java / Spring Boot

- **Local commands**（Maven）：
  ```
  - Install: `mvn -q dependency:go-offline` · Lint: `mvn -q spotless:check` · Test: `mvn -q test` · Build: `mvn -q compile`.
  ```
  Gradle：`./gradlew dependencies` / `spotlessCheck` / `test` / `compileJava`
- **R3**：`backend/10-backend-java.instructions.md`（已发布，`**/*.java`）
- **Layout**：`src/main/java` · `src/test/java`
- **quality.json 内层命令**：`mvn -q spotless:check && mvn -q test`

### Rust

- **Local commands**：
  ```
  - Install: `cargo fetch` · Lint: `cargo clippy -- -D warnings` · Test: `cargo test` · Typecheck: `cargo check`.
  ```
- **R3**：`backend/10-backend-rust.instructions.md`（已发布，`**/*.rs`）
- **Layout**：`src/` · `tests/`
- **quality.json 内层命令**：`cargo clippy -- -D warnings && cargo test`

### .NET / C#

- **Local commands**：
  ```
  - Install: `dotnet restore` · Lint: `dotnet format --verify-no-changes` · Test: `dotnet test` · Build: `dotnet build`.
  ```
- **R3**：`backend/10-backend-dotnet.instructions.md`（已发布，`**/*.cs`）
- **Layout**：`src/` · `tests/`
- **quality.json 内层命令**：`dotnet format --verify-no-changes && dotnet test`

### AI / LLM & Agentic（附加层，与后端栈叠加）

> 这是**附加层**，不替代后端栈：LLM 产品通常是"Python 后端 + AI 层"。把 AI 代码放 `ai/`/`llm/`/`rag/` 目录,该目录文件同时吃后端栈规则 + 这条 AI 规则。

- **Local commands**（在后端栈基础上加评估）：
  ```
  - Install: `pip install -r requirements.txt` · Lint: `ruff check .` · Test: `pytest` · Eval: `pytest evals/ -q`.
  ```
- **R3**：`ai/10-ai-llm.instructions.md`（已发布，`**/{ai,llm,rag}/**`）——prompt 即制品、tool/agent 架构、非确定性评估、可复现、LLM 安全、tracing/成本
- **Layout**：`ai/`（agents/tools/chains）· `ai/prompts/`（版本化 prompt）· `evals/`（评估集+grader）
- **配套门**：`/eval-spec` 产 `docs/eval-plan.md`（条件门 **G-EVAL**，非 LLM 功能 SKIP+理由）；C-nfr 加成本/token/延迟/质量阈值
- **quality.json 内层命令**：`ruff check . && pytest -q && pytest evals/ -q`

---

## 前端并存（monorepo）

前端 React 规则 `frontend/10-frontend.instructions.md`（`**/*.{tsx,jsx}`）与任一后端规则天然互斥，可同仓共存。monorepo 里 `00-workspace` 的 `Local commands` 可写两行（前端 `npm` + 后端 `pytest`/`go test`），各自标注目录前缀。若前后端都是纯 `.ts`，把后端 glob 收窄到目录（如 `apps/api/**/*.ts`）以保持互斥——见 `backend/10-backend-node.instructions.md` 顶部 Scope note。

## 改完必跑

```sh
node .github/hooks/validate-config.mjs   # 期望 PASS：S3 glob 互斥、S4 类型覆盖、S7 必需路径
```

> 新增/删除栈不动 EOS 骨架（agents / prompts / hooks / 治理流程都不变）——只换 `applyTo` 和正文。详见 user-manual 第 11 章。
