// Starter packs — a correct project DECLARATION for a known shape of project.
//
// WHAT A PACK IS NOT: a copied application skeleton. EOS does not scaffold product code. There are
// better tools for that in every ecosystem, and a half-maintained app template inside a governance
// repository rots faster than anything else in it.
//
// WHAT A PACK IS: the answers to the questions EOS asks before it will let you start — what kind of
// project this is, which stacks it has, which commands actually verify it, which gate policy
// applies, and whether a compliance boundary is in force. Those are exactly the answers a newcomer
// gets wrong or leaves on the default, and a wrong default here is not cosmetic: an `application`
// with no `commands.test` fails closed, and a `config-only` that should not be one reports
// NOT_APPLICABLE forever while nobody notices no code is being verified.
//
// Packs are data. The build and test commands start from STACK_PRESETS in lib/workspace-rule.mjs, so
// a pack and the generated workspace rule agree about how a stack is built. On top of that a pack
// declares what the gates downstream will ask for (2.2): the dependency audit the release gate (G8)
// runs, and — where the stack's runner writes JUnit XML without extra tooling — the reports the
// verified gate (G7) reads, so no project has to write a test-run mapping step (ADR-016).

// The reports the verified gate reads (ADR-016); /reports/junit/ is ignored by the template.
const JUNIT = { junit: ['reports/junit/*.xml'] };
const NODE_JUNIT_NOTE = 'Make `npm test` write JUnit XML to reports/junit/ — node:test: `--test-reporter=junit --test-reporter-destination=reports/junit/node.xml`; vitest: `--reporter=junit --outputFile=reports/junit/vitest.xml`. The verified gate reads only the reports that run wrote (docs/eos/examples/trace-evidence/).';
const PIP_AUDIT_NOTE = '`pip-audit` is not part of Python: `pip install pip-audit` in the environment CI runs the audit in. Missing, the release gate reports the audit DEFERRED (BLOCKED on the Regulated track), never passed.';
export const PACKS = {
  // Day one of most projects: the stack is an irreversible decision EOS defers to architecture
  // (Phase 4). Declaring config-only says so honestly — the product gate reports NOT_APPLICABLE, never
  // PASS — and `eos init <pack> --write` replaces it when code lands, keeping the chosen track.
  'config-only': {
    title: 'No product code yet (the stack is decided at architecture)',
    declaration: {
      projectType: 'config-only',
      stacks: [],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
    },
    notes: [
      'When product code lands — Phase 4 locks the stack in an ADR — run `eos init <pack> --write`; the governance track you chose carries over.',
      'The release gate (G8) will need a dependency audit, NFR measurements, a runbook and a deployment-topology ADR: `eos status` tracks them from today.',
    ],
  },
  'node-service': {
    title: 'Node / TypeScript service',
    declaration: {
      projectType: 'application',
      stacks: ['node'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'npm ci', lint: 'npm run lint', typecheck: 'npm run typecheck', test: 'npm test', audit: 'npm audit --audit-level=high' },
      evidence: JUNIT,
    },
    notes: ['Commit package-lock.json — `npm ci` and `npm audit` need it, and the SBOM enumerates components from it.', NODE_JUNIT_NOTE],
  },
  'python-service': {
    title: 'Python service (FastAPI / Django)',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', typecheck: 'mypy .', test: 'pytest --junitxml=reports/junit/python.xml', audit: 'pip-audit -r requirements.txt' },
      evidence: JUNIT,
    },
    notes: ['Swap in `uv sync` / `poetry install` if that is what CI runs — the declaration must match reality, not convention.', PIP_AUDIT_NOTE],
  },
  'go-service': {
    title: 'Go service',
    declaration: {
      projectType: 'application',
      stacks: ['go'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'go mod download', lint: 'golangci-lint run', typecheck: 'go vet ./...', test: 'go test ./...', audit: 'govulncheck ./...' },
    },
    notes: [
      '`govulncheck` is installed with `go install golang.org/x/vuln/cmd/govulncheck@latest`.',
      '`go test` writes no JUnit XML. To drop the test-run mapping step, run the tests through gotestsum — test: `gotestsum --junitfile reports/junit/go.xml -- ./...` — and declare "evidence": {"junit": ["reports/junit/*.xml"]} (docs/eos/examples/trace-evidence/).',
    ],
  },
  'java-service': {
    title: 'Java / Spring Boot service',
    declaration: {
      projectType: 'application',
      stacks: ['java'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'mvn -q dependency:go-offline', lint: 'mvn -q spotless:check', test: 'mvn -q test', audit: 'mvn -q org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7' },
      // Surefire writes these by default; /target/ is ignored by the template.
      evidence: { junit: ['target/surefire-reports/TEST-*.xml'] },
    },
    notes: [
      'Gradle projects: replace every command with its `./gradlew` equivalent, and declare build/test-results/test/*.xml as evidence.junit.',
      'OWASP dependency-check needs an NVD API key to run at a usable speed — configure it in the plugin (nvdApiKeyEnvironmentVariable), never in this file.',
    ],
  },
  'rag-app': {
    title: 'RAG application (retrieval + LLM)',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic', 'agentic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', test: 'pytest --junitxml=reports/junit/python.xml', eval: 'pytest evals/ -q', audit: 'pip-audit -r requirements.txt' },
      evidence: JUNIT,
    },
    notes: [
      'The agentic paradigm turns G-EVAL on: `commands.eval` must produce real numbers, not just exit 0.',
      'Start evals/ from docs/eos/examples/eval-starter/python/ (run by `pytest evals/`): it writes docs/evidence/eval-summary.json, the summary the gate reads.',
      PIP_AUDIT_NOTE,
    ],
  },
  'agentic-app': {
    title: 'Agentic application (tool-using LLM agent)',
    declaration: {
      projectType: 'application',
      stacks: ['node'],
      productParadigms: ['agentic'],
      workflowProfile: 'standard-product',
      commands: { install: 'npm ci', lint: 'npm run lint', test: 'npm test', eval: 'npm run eval', audit: 'npm audit --audit-level=high' },
      evidence: JUNIT,
    },
    notes: [
      'Prompts, datasets and model configuration are PRODUCT: editing one makes a verified story stale, by design.',
      'Tool allow-lists and prompt-injection handling belong in the architecture record, not in a code comment.',
      'Start evals/ from docs/eos/examples/eval-starter/ (make `npm run eval` run `node --test evals/eval.test.mjs`): it writes docs/evidence/eval-summary.json, the summary the gate reads.',
      NODE_JUNIT_NOTE,
    ],
  },
  'data-pipeline': {
    title: 'Data pipeline / ETL',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', test: 'pytest --junitxml=reports/junit/python.xml', audit: 'pip-audit -r requirements.txt' },
      evidence: JUNIT,
    },
    notes: ['Data classification is not optional here — record PII/PHI handling in the requirements, before the first pipeline runs.', PIP_AUDIT_NOTE],
  },
  'regulated-app': {
    title: 'Regulated application (HIPAA / PCI-DSS / SOC2 / GDPR)',
    declaration: {
      projectType: 'application',
      stacks: ['node'],
      productParadigms: ['deterministic'],
      workflowProfile: 'regulated',
      complianceProfile: 'regulated',
      commands: { install: 'npm ci', lint: 'npm run lint', typecheck: 'npm run typecheck', test: 'npm test', audit: 'npm audit --audit-level=high' },
      evidence: JUNIT,
    },
    notes: [
      NODE_JUNIT_NOTE,
      'The `regulated` workflow profile permits NO waivers and requires a recorded reason for every change classification.',
      'docs/compliance-profile.json stays authoritative for which regime applies — see docs/eos/examples/compliance-profile.example.json.',
      'Never send PHI/PAN to a third-party LLM without a signed BAA/DPA: self-host or redact (see the eos-compliance-skeletons skill).',
    ],
  },
  'library': {
    title: 'Library / package (no deployable surface)',
    declaration: {
      projectType: 'library',
      stacks: ['node'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'npm ci', lint: 'npm run lint', typecheck: 'npm run typecheck', test: 'npm test', audit: 'npm audit --audit-level=high' },
      evidence: JUNIT,
    },
    notes: ['A library has no telemetry or rollback story of its own; those gates are answered by whatever ships it.', NODE_JUNIT_NOTE],
  },
};

const RATIONALE = (id, pack) => (id === 'config-only' ? [
  'No product code yet: the stack is an irreversible decision EOS defers to architecture (Phase 4).',
  'The product-quality gate reports NOT_APPLICABLE until then, never PASS. When code lands, run',
  '`node .github/eos/eos.mjs init <pack> --write` — the governance track carries over.',
].join(' ') : [

  `Scaffolded from the "${id}" starter pack (${pack.title}).`,
  'REPLACE THE COMMANDS with what CI actually runs for this project — commands.test is executed by',
  'the product-quality gate, so a command that does not exist fails closed rather than passing',
  'vacuously. Set "language" to the BCP-47 tag you want agents to answer in, or omit it to mirror',
  'whatever language you write in. See docs/eos/stack-presets.md for every supported stack.',
].join(' '));

/** The declaration a pack produces, ready to be written to .eos/project.json. */
export function packDeclaration(id) {
  const pack = PACKS[id];
  if (!pack) return null;
  return {
    $schema: './schemas/project.schema.json',
    ...pack.declaration,
    rationale: RATIONALE(id, pack),
  };
}

export const packIds = () => Object.keys(PACKS);
