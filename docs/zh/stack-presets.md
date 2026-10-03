> 🌐 **与英文版同步 · 英文为参照语言 (in sync with English · English is the reference language).**
> 本文与英文权威版 [`../eos/stack-presets.md`](../eos/stack-presets.md) **内容对等、同步维护**；若翻译出现歧义，以英文为准（EOS 的配置与门禁均以英文实现）。

---

# EOS Stack Presets（技术栈配方册）

> 这是一份**参考文档，不带 frontmatter / `applyTo`，不会被 Copilot 自动加载** ——
> 所以放再多栈也**不增加任何 always-on 上下文成本**。
>
> 配置新项目时：**只复制你用的那一个栈的块**（monorepo 可两个）到对应文件，别整本搬进 `00-workspace`。

## 怎么用（3 步）

> **最快路径（eos-2.0.0）：** `node .github/eos/eos.mjs init` 会列出所有起步包，并点名与你的代码
> 相匹配的那些；`init <pack> --write` 为你的技术栈与轨道写出正确的 `.eos/project.json`，再用
> `stack sync --write` 把它的命令渲染进 `00-workspace`。下面的步骤就是这些命令替你做的事，以及如何
> 手工调整。

1. 打开 `.github/instructions/00-workspace.instructions.md`，把 `## Local commands` 那一行换成下面你这个栈的成品行。
2. 启用对应的 **R3 栈规则文件**（六大后端栈 Node/Python/Go/Java/Rust/.NET + 前端 React 均随模板发布，留着即可）。其余不用的栈规则文件是**惰性的**——只有当仓库里真有对应后缀文件时才生效，留着无害，想删也行。
3. **把同一套命令写进 `.eos/project.json`**（见下一节）——这是 CI 和 `project-gate` 真正执行的那一份，
   决定"测试失败能不能让 CI 变红"。**不写就 fail closed**：仓库里有 `pyproject.toml` / `go.mod` / …
   却没有声明时，`project-gate` 直接报错，而不是无声跳过。
4.（可选）若用非 Node 栈又想让**编辑时**的质量门禁生效，按下表替换 `.github/hooks/quality.json` 里 `PostToolUse` 的命令（现有那条是 Node 专用：探测 `npm`+`package.json`，非 Node 自动 no-op）。注意 PostToolUse 只是**提示性**的，权威门禁是 CI 里的 `project-gate`。

> **互斥提醒**：每个 R3 文件的 `applyTo` glob 必须互不重叠（`**/*.ts` / `**/*.py` / `**/*.go` / `**/*.java` / `**/*.rs` / `**/*.cs` / `**/*.{tsx,jsx}`）。改完跑 `node .github/hooks/validate-config.mjs` 验 S3。

---

## 选择你的治理轨道

技术栈决定产品*如何*被验证；轨道决定*一次发布必须证明多少*。两者相互独立：每个包都能用于任一条
轨道，而轨道就写在同一个 `.eos/project.json` 里。

| | Standard（默认） | Regulated |
|---|---|---|
| 如何声明 | `eos init <pack> --write` | `eos init <pack> --track regulated --write` |
| 它设置什么 | 不额外设置 | `workflowProfile` 与 `complianceProfile` 为 `"regulated"`，`evidencePolicy` 为 `"ci"` |
| 一次发布需要 | 声明的质量命令，在候选提交上重新运行 | 同左，外加签名的发布清单、由 CI 产出的证据，以及每个制品的来源证明 |

还没有代码？`eos init config-only --write`（适用时加 `--track`）——技术栈在架构阶段决定，之后
`eos init <pack> --write` 会保留这条轨道。细节、签名与 CI 来源证明见
[用户手册 §10.6](user-manual.md#106-治理轨道、签名发布与中心策略)。

---

## `.eos/project.json`（产品质量门禁的唯一入口）

EOS 的 CI 曾经只有一句 `if [ -f package.json ]`，于是 **Python/Go/Java/Rust/.NET 项目里失败的
测试根本不会被执行**——"EOS 配置绿 != 产品测试绿"。现在改成一份**显式声明**，由零依赖、跨平台的
`node .github/hooks/project-gate.mjs` 读取并执行。

| 字段 | 说明 |
|---|---|
| `projectType` | `application` \| `library` \| `config-only`。前两者**必须**有 `commands.test`；`config-only` 只有在仓库里**找不到任何栈清单文件**时才允许，且**不得**声明 `commands`（不会被执行） |
| `stacks` | `node` \| `python` \| `go` \| `java` \| `rust` \| `dotnet` \| `other`（数组，可多栈）。栈没有清单文件（shell / Terraform / 裸脚本）就用 `other` |
| `commands` | `install` / `lint` / `typecheck` / `test` / `eval` / `audit`。缺省=N/A；声明了就**必须真的能跑通**。`audit`（npm audit、pip-audit、govulncheck 等）不属于每次推送的门禁：由发布门禁（G8）运行，缺失即 FAIL——每个带代码的起步包都声明了它 |
| `evidence` | `{ "junit": ["reports/junit/*.xml"] }`——`commands.test` 写出 JUnit XML 的位置。`verified` 门禁只读取本次运行写出的报告，并据此生成 `docs/evidence/test-run.json`（eos-2.2.0，ADR-016；见 `docs/eos/examples/trace-evidence/`） |
| `productParadigms` | `deterministic` \| `agentic`（数组）。含 `agentic` => G-EVAL 门打开 |
| `evalRequired` | 可选 `boolean`，显式覆盖上面的推断 |
| `evalWaiver` | `{ reason, approvedBy }`——自动检测到 LLM 依赖但你坚持声明为 deterministic 时必须给，且要有真实理由 |

**执行语义（全部 fail closed）**

- 声明了却跑不通 => **FAIL**；工具链没装（命令不在 PATH）=> **BLOCKED + 退出码 1**，绝不伪装成 PASS。
- `application`/`library` 没有 `commands.test` => **FAIL**（拒绝空跑成绿）。
- `config-only` 但扫到 `package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`/`pom.xml`/`*.csproj` => **FAIL**。
  EOS 自带的根目录 `package.json` 只要还只承载 EOS（`.github/` 下的 bin、只运行 `node .github/…` 或
  `npm run …` 的脚本、没有依赖或入口文件），就算工具而不是产品代码；第一个依赖或产品脚本会让它成为 Node 项目。
- `config-only` 却写了 `commands` => **FAIL**（这些命令根本不会执行，不允许"假装有门"）。
  代码所在的栈没有清单文件？用 `"projectType": "application"` + `"stacks": ["other"]`。
- 没有 `.eos/project.json`：纯 Node 仓库退回旧的 npm 脚本默认值
  （**向后兼容**，仍要求 `test` 脚本）；其它栈 => **FAIL**，要求先声明。
- **命令不经过 shell**：`;` `&&` `|` `>` `` ` `` `$` 等元字符会在加载阶段被拒绝
  （配置不可注入 shell）。需要串多条时给**数组**：`"test": ["ruff check .", "pytest -q"]`；
  需要管道/通配符时，把它放进 npm script / Makefile / tox，再在这里调用那一条。
  > 数组只有两种合法形态，**不能混用**（混用会报 ambiguous 并 FAIL）：
  > 一条命令的 argv —— `["go", "test", "./..."]`；或多条完整命令 —— `["ruff check .", "pytest -q"]`。
  > 参数里带空格时写成**带引号的单个字符串**：`"dotnet test \"My App.sln\""`。
- CI 里跑非 Node 栈时，记得在 `.github/workflows/eos-ci.yml` 加上对应的 toolchain setup step
  （`setup-python` / `setup-go` / `setup-java` / `rust-toolchain` / `setup-dotnet`），否则会 BLOCKED。

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

// Agentic / LLM 产品（在后端栈基础上加 eval——声明了 agentic 就必须有 eval 命令）
{ "projectType": "application", "stacks": ["python"], "productParadigms": ["deterministic", "agentic"],
  "commands": { "lint": "ruff check .", "test": "pytest -q", "eval": "pytest evals/ -q" } }

// 还没有产品代码——`eos init config-only --write`（技术栈在架构阶段决定）
{ "projectType": "config-only", "stacks": [], "productParadigms": ["deterministic"] }
```

> `jsonc` 只是为了在文档里写注释；**真实文件是严格 JSON，不能带注释**。改完跑
> `node .github/hooks/validate-config.mjs`（S12 校验声明本身）和 `node .github/hooks/project-gate.mjs`。

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
- **常见依赖治理**（按需，pin 版本）：编排 LangChain / LlamaIndex；向量库 Chroma(本地)/ Pinecone·Qdrant·Weaviate(托管)；provider SDK OpenAI/Anthropic。**同步阻塞的 LLM 调用不得在 Web 请求线程内**——走异步队列(Celery/BullMQ)，见 `ai/10-ai-llm` 的 Execution model。
- **配套门**：`/eval-spec` 产 `docs/eval-plan.md`（条件门 **G-EVAL**，非 LLM 功能 SKIP+理由）；C-nfr 加成本/token/延迟/质量阈值
- **起步骨架**：拷 `docs/eos/examples/eval-starter/`（零依赖可跑的 dataset+graders+runner+stub），换掉 stub 即用
- **quality.json 内层命令**：`ruff check . && pytest -q && pytest evals/ -q`
  （Node 项目改用 `node --test evals/*.test.mjs`——须给显式 glob,裸 `evals/` 目录在 Node 23 会报错）
- **CI**：`.github/workflows/eos-ci.yml`（`act push` 本地跑）会执行 evals + `eos-doctor`（G-EVAL 机器强制）,回归即失败

---

## 前端并存（monorepo）

前端 React 规则 `frontend/10-frontend.instructions.md`（`**/*.{tsx,jsx}`）与任一后端规则天然互斥，可同仓共存。monorepo 里 `00-workspace` 的 `Local commands` 可写两行（前端 `npm` + 后端 `pytest`/`go test`），各自标注目录前缀。若前后端都是纯 `.ts`，把后端 glob 收窄到目录（如 `apps/api/**/*.ts`）以保持互斥——见 `backend/10-backend-node.instructions.md` 顶部 Scope note。

## 改完必跑

```sh
node .github/hooks/validate-config.mjs   # 期望 PASS：S3 glob 互斥、S4 类型覆盖、S7 必需路径、S12 声明有效
node .github/hooks/project-gate.mjs      # 期望 PASS：你声明的 lint/typecheck/test/eval 真的跑了
```

> 新增/删除栈不动 EOS 骨架（agents / prompts / hooks / 治理流程都不变）——只换 `applyTo` 和正文。详见 user-manual 第 11 章。
