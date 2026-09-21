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
// Packs are data. The commands mirror STACK_PRESETS in lib/workspace-rule.mjs so a pack and the
// generated workspace rule cannot disagree about how a stack is built.
export const PACKS = {
  'node-service': {
    title: 'Node / TypeScript service',
    declaration: {
      projectType: 'application',
      stacks: ['node'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'npm ci', lint: 'npm run lint', typecheck: 'npm run typecheck', test: 'npm test' },
    },
    notes: ['Commit package-lock.json — `npm ci` needs it, and the SBOM enumerates components from it.'],
  },
  'python-service': {
    title: 'Python service (FastAPI / Django)',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', typecheck: 'mypy .', test: 'pytest' },
    },
    notes: ['Swap in `uv sync` / `poetry install` if that is what CI runs — the declaration must match reality, not convention.'],
  },
  'go-service': {
    title: 'Go service',
    declaration: {
      projectType: 'application',
      stacks: ['go'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'go mod download', lint: 'golangci-lint run', typecheck: 'go vet ./...', test: 'go test ./...' },
    },
    notes: [],
  },
  'java-service': {
    title: 'Java / Spring Boot service',
    declaration: {
      projectType: 'application',
      stacks: ['java'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'mvn -q dependency:go-offline', lint: 'mvn -q spotless:check', test: 'mvn -q test' },
    },
    notes: ['Gradle projects: replace every command with its `./gradlew` equivalent.'],
  },
  'rag-app': {
    title: 'RAG application (retrieval + LLM)',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic', 'agentic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', test: 'pytest', eval: 'pytest evals/ -q' },
    },
    notes: [
      'The agentic paradigm turns G-EVAL on: `commands.eval` must produce real numbers, not just exit 0.',
      'See docs/eos/examples/eval-starter/ for a runnable eval harness and docs/evidence/eval-summary.json for the shape the gate reads.',
    ],
  },
  'agentic-app': {
    title: 'Agentic application (tool-using LLM agent)',
    declaration: {
      projectType: 'application',
      stacks: ['node'],
      productParadigms: ['agentic'],
      workflowProfile: 'standard-product',
      commands: { install: 'npm ci', lint: 'npm run lint', test: 'npm test', eval: 'npm run eval' },
    },
    notes: [
      'Prompts, datasets and model configuration are PRODUCT: editing one makes a verified story stale, by design.',
      'Tool allow-lists and prompt-injection handling belong in the architecture record, not in a code comment.',
    ],
  },
  'data-pipeline': {
    title: 'Data pipeline / ETL',
    declaration: {
      projectType: 'application',
      stacks: ['python'],
      productParadigms: ['deterministic'],
      workflowProfile: 'standard-product',
      commands: { install: 'pip install -r requirements.txt', lint: 'ruff check .', test: 'pytest' },
    },
    notes: ['Data classification is not optional here — record PII/PHI handling in the requirements, before the first pipeline runs.'],
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
    },
    notes: [
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
      commands: { install: 'npm ci', lint: 'npm run lint', typecheck: 'npm run typecheck', test: 'npm test' },
    },
    notes: ['A library has no telemetry or rollback story of its own; those gates are answered by whatever ships it.'],
  },
};

const RATIONALE = (id, pack) => [
  `Scaffolded from the "${id}" starter pack (${pack.title}).`,
  'REPLACE THE COMMANDS with what CI actually runs for this project — commands.test is executed by',
  'the product-quality gate, so a command that does not exist fails closed rather than passing',
  'vacuously. Set "language" to the BCP-47 tag you want agents to answer in, or omit it to mirror',
  'whatever language you write in. See docs/eos/stack-presets.md for every supported stack.',
].join(' ');

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
