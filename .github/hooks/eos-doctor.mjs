#!/usr/bin/env node
// EOS SDLC gate doctor — zero external deps.
// Statically enforces CONDITIONAL-GATE wiring that lives in project structure
// (complements validate-config.mjs, which checks EOS *config*). Run from project root:
//   node .github/hooks/eos-doctor.mjs
// Designed to run in local CI (act) and as a manual pre-release check.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { loadProjectConfig, PROJECT_CONFIG_PATH } from './lib/project-config.mjs';

const root = process.cwd();
const errors = [];
const warns = [];
// Vendored / installed / generated trees are third-party code: their dirs and manifests say nothing
// about what THIS project is, so every scan below skips them. [review]
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', 'dist', 'build', '.next', 'coverage',
  'vendor', 'target', '.venv', 'venv', '__pycache__', 'Pods', '.tox',
]);

function walkDirs(onDir, maxDepth = 5) {
  (function rec(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      onDir(e.name, full);
      rec(full, depth + 1);
    }
  })(root, 0);
}

function anyFile(pred, maxDepth = 6) {
  let found = false;
  (function rec(dir, depth) {
    if (found || depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) rec(full, depth + 1); }
      else if (pred(e.name)) found = true;
    }
  })(root, 0);
  return found;
}

// --- D0: the project declaration must be valid — every conditional gate below reads it ---
const proj = loadProjectConfig(root);
for (const e of proj.errors) errors.push(`D0 project declaration: ${e}`);
for (const w of proj.warnings) warns.push(`D0 project declaration: ${w}`);

// --- D1/D2: G-EVAL — an LLM/agent product component requires an eval plan + runner ---
// The EXPLICIT declaration in .eos/project.json is AUTHORITATIVE; discovery is only a safety net.
// Rationale: any signal-sniffing scheme (dir names + an SDK regex) is bypassable by definition — a
// self-hosted gateway, a private wrapper package or an unlisted SDK leaves no fingerprint, and
// `litellm` in src/virtual_employee/ already slipped through. So the project SAYS what it is, and
// auto-discovery exists to catch an undeclared/stale declaration rather than to be the gate.
// `agents` is a common domain noun (insurance/sales agents ≠ LLM agents), so it counts as an LLM
// signal ONLY when an LLM SDK dependency is ALSO present. [audit H2/E4 · round-2 N2 · EOS-003]
const strongAiDirs = [];   // ai / llm / rag — unambiguous LLM signal
const agentDirs = [];      // agents — ambiguous; needs a dependency signal to count
walkDirs((name, full) => {
  if (['ai', 'llm', 'rag'].includes(name)) strongAiDirs.push(full);
  else if (name === 'agents') agentDirs.push(full);
});

// Collect dependency manifests across the tree (not just the root) — a monorepo's ai service lives
// in apps/*/ and used to escape detection entirely. Vendored/installed trees are skipped so a
// third-party manifest can't be mistaken for this project's own dependencies.
const MANIFEST_NAMES = new Set([
  'package.json', 'requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'Pipfile',
  'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Cargo.toml', 'composer.json', 'Gemfile',
]);
const manifests = [];
(function collect(dir, depth) {
  if (depth > 3) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collect(full, depth + 1); continue; }
    if (MANIFEST_NAMES.has(e.name) || /\.(csproj|fsproj)$/i.test(e.name)) {
      try { manifests.push({ name: e.name, text: readFileSync(full, 'utf8') }); } catch { /* unreadable */ }
    }
  }
})(root, 0);
const manifestText = manifests.map((m) => m.text).join('\n');

// Pull out DEPENDENCY IDENTIFIERS (not free text). Manifests carry <description>/"description"
// prose, so matching the raw file would make ordinary English ("brings billing together",
// "the bedrock of our platform", "XSLT transformers") look like an LLM SDK and fail CI for
// projects with no AI code at all.
function dependencyNames({ name, text }) {
  const out = [];
  const push = (s) => { if (s && typeof s === 'string') out.push(s); };
  if (name === 'package.json' || name === 'composer.json') {
    try {
      const j = JSON.parse(text);
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'require', 'require-dev']) {
        if (j[field] && typeof j[field] === 'object') out.push(...Object.keys(j[field]));
      }
    } catch { /* invalid JSON — fall through to the line scan below */ }
  }
  if (/^requirements.*\.txt$/.test(name) || name === 'Pipfile' || name === 'Gemfile') {
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:gem\s+["']|-e\s+)?["']?([A-Za-z0-9._-]+)/);
      if (m && !/^\s*#/.test(line)) push(m[1]);
    }
  }
  if (name === 'pyproject.toml' || name === 'Cargo.toml' || name === 'Pipfile') {
    // Scoped to dependency TABLES/ARRAYS only. Scanning the whole file would feed a project's own
    // `name = "bedrock-tools"` or `keywords = ["instructor"]` to the ambiguous-word list and fail
    // CI for a repo with no AI code (a Rust crate named `minimax`, a Minecraft tool named
    // `bedrock-*`). [review]
    const DEP_TABLE = /^\[(?:.*\.)?(?:dev-|build-|optional-)?dependencies(\..+)?\]$|^\[(?:dev-)?packages\]$/i;
    const DEP_ARRAY = /^(dependencies|dev-dependencies|optional-dependencies|requires)\s*=/i;
    const NAMES_IN = (line) => { for (const m of line.matchAll(/["']([A-Za-z0-9._-]+)/g)) push(m[1]); };
    let inTable = false;
    let inArray = false;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[') && !inArray) {
        const m = line.match(DEP_TABLE);
        inTable = !!m;
        if (m && m[1]) push(m[1].slice(1)); // [dependencies.<crate>]
        continue;
      }
      if (!inArray && DEP_ARRAY.test(line)) {
        inArray = !line.slice(line.indexOf('=')).includes(']');
        NAMES_IN(line.slice(line.indexOf('=')));
        continue;
      }
      if (inArray) {
        NAMES_IN(line);
        if (line.includes(']')) inArray = false;
        continue;
      }
      if (inTable) {
        const m = line.match(/^["']?([A-Za-z0-9._-]+)["']?\s*=/);
        if (m) push(m[1]);
      }
    }
  }
  if (name === 'go.mod') for (const m of text.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\/[^\s]+)\s+v/gm)) push(m[1]);
  if (name === 'pom.xml') for (const m of text.matchAll(/<(?:artifactId|groupId)>([^<]+)<\//g)) push(m[1]);
  if (/build\.gradle/.test(name)) for (const m of text.matchAll(/["']([A-Za-z0-9._-]+:[A-Za-z0-9._-]+)[:"']/g)) push(m[1]);
  if (/\.(csproj|fsproj)$/i.test(name)) for (const m of text.matchAll(/Include\s*=\s*"([^"]+)"/g)) push(m[1]);
  return out;
}
const depNames = manifests.flatMap(dependencyNames).join('\n');

// Distinctive brand/package names — safe to match anywhere in a manifest.
const LLM_SDK = new RegExp([
  '\\b(openai|anthropic|claude-sdk|cohere-ai|mistralai|groq-sdk|ollama|litellm|openrouter|portkey',
  '|langchain|langchain4j|langgraph|langfuse|llama[-_]?index|llamaindex|llama[-_]?cpp|dspy',
  '|crewai|autogen|semantic[-_]kernel|smolagents|pydantic[-_]ai|phidata',
  '|generative-ai|google[-_/]genai|google[-_]generativeai|vertexai|azure[-_.]ai',
  '|huggingface|sentence[-_]transformers|vllm|fireworks-ai',
  '|go-openai|openai-go|spring-ai|modelcontextprotocol',
  '|dashscope|zhipuai|qianfan|deepseek|baichuan)\\b',
].join(''), 'i');
// Words that are also ordinary English / other-domain terms. Matched ONLY against extracted
// dependency identifiers, never against description prose.
const LLM_DEP_AMBIGUOUS = /\b(bedrock|transformers|together|replicate|instructor|guidance|haystack|agno|ernie|moonshot|qwen|minimax)\b/i;
// Vercel AI SDK ships as the bare package name "ai" / "@ai-sdk/*" — too generic for a word-boundary
// match, so look for it as an actual dependency key.
const AI_SDK_DEP = /"(ai|@ai-sdk\/[a-z0-9-]+)"\s*:/i;
const hasLlmDep = LLM_SDK.test(manifestText)
  || LLM_DEP_AMBIGUOUS.test(depNames)
  || manifests.some((m) => m.name === 'package.json' && AI_SDK_DEP.test(m.text));
// agents/ only becomes LLM evidence when a dependency confirms it; ai/llm/rag always count.
const aiDirs = [...strongAiDirs, ...(hasLlmDep ? agentDirs : [])];
const autoLlm = strongAiDirs.length > 0 || hasLlmDep;

// Resolve the authoritative paradigm: explicit declaration > auto-discovery.
const declared = proj.config;
const declaredAgentic = declared?.productParadigms ? declared.productParadigms.includes('agentic') : null;
const evalRequiredDecl = declared?.evalRequired;
const explicitAgentic = evalRequiredDecl === true || (evalRequiredDecl === undefined && declaredAgentic === true);
const explicitNonAgentic = !explicitAgentic && (evalRequiredDecl === false || declaredAgentic === false);

let llmPresent = autoLlm;
let evalReason = aiDirs.length
  ? `LLM/agent code (${aiDirs.map((d) => relative(root, d).split(/[\\/]/).join('/')).join(', ')})`
  : 'an LLM SDK dependency (package.json / requirements / go.mod / …)';
if (explicitAgentic) {
  llmPresent = true;
  evalReason = `a declared agentic product (${PROJECT_CONFIG_PATH})`;
} else if (explicitNonAgentic) {
  llmPresent = false;
  const conflicting = autoLlm || declaredAgentic === true;
  if (conflicting && !declared.evalWaiver) {
    // Deny by default: the declaration says deterministic, the repo says otherwise. One of them is
    // wrong, and silently trusting the declaration is how an agentic product ships with no evals.
    errors.push(`D1 G-EVAL: ${PROJECT_CONFIG_PATH} declares this product deterministic (no evals required), but ${autoLlm ? `LLM/agent evidence was found — ${evalReason}` : 'productParadigms also lists "agentic"'}. Either declare "agentic" in productParadigms, or record an evalWaiver { reason, approvedBy } explaining why no model output needs evaluating.`);
  } else if (conflicting) {
    warns.push(`D1 G-EVAL: LLM/agent evidence found but evals are waived — "${declared.evalWaiver.reason}" (${declared.evalWaiver.approvedBy}). Re-check this at every release.`);
  }
}

const hasEvalPlan = existsSync(join(root, 'docs/eval-plan.md'));
let hasEvalScript = false;
try {
  const pj = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  hasEvalScript = !!(pj.scripts && pj.scripts.eval);
} catch { /* no / invalid package.json */ }
const hasEvalCommand = !!declared?.commands?.eval;

if (llmPresent) {
  if (!hasEvalPlan) {
    errors.push(`D1 G-EVAL: found ${evalReason} but no docs/eval-plan.md. Design evals before shipping (run /eval-spec).`);
  }
  const evalsDir = join(root, 'evals');
  const hasRunner = existsSync(evalsDir)
    && readdirSync(evalsDir).some((f) => /\.(test|spec)\.[mc]?[jt]s$/.test(f) || /(^test_.*|.*_test)\.py$/.test(f));
  if (!hasRunner && !hasEvalScript && !hasEvalCommand) {
    // E4: a plan alone never proves evals actually run — require an executable harness too.
    errors.push(`D2 G-EVAL: ${evalReason} but no runnable eval harness (evals/*.test.* , an "eval" npm script, or commands.eval in ${PROJECT_CONFIG_PATH}). Copy docs/eos/examples/eval-starter/.`);
  }
} else if (hasEvalPlan && !explicitNonAgentic) {
  warns.push('D2 G-EVAL: docs/eval-plan.md exists but no ai/llm/rag/agents dir or LLM dependency was found (ok if code lives elsewhere — declare productParadigms to be sure).');
}

// --- D3: G-UX (conditional) — real frontend components should have a UX contract ---
const hasComponents = anyFile((n) => /\.(tsx|jsx)$/.test(n));
if (hasComponents && !existsSync(join(root, 'docs/EXPERIENCE.md'))) {
  warns.push('D3 G-UX: found React component files but no docs/EXPERIENCE.md. User-facing work needs the UX contract (run /ux-spec) or an explicit SKIP.');
}

// --- D4: secret hygiene — delegate to secret-scan.mjs if present (error on leak) ---
const scanner = join(root, '.github/hooks/secret-scan.mjs');
if (existsSync(scanner)) {
  try {
    execSync(`node ${JSON.stringify(scanner)}`, { cwd: root, stdio: 'ignore' });
  } catch {
    errors.push('D4 Security: secret-scan.mjs found potential hardcoded secret(s). Run `node .github/hooks/secret-scan.mjs` for details.');
  }
}

// --- D5: Compliance data-boundary — a regulated regime + third-party LLM must decide the data boundary ---
// Reads ONLY project output files (never docs/eos or the checklists), so it can't false-fire on the
// template's own docs. Fires the Agentic landmine: PHI/PAN to a third-party model needs a boundary decision.
const readIf = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };
const regimeText = readIf('docs/compliance-profile.md') + '\n' + readIf('docs/requirements.md');
const REGULATED = /\b(HIPAA|PCI[\s-]?DSS|SOC\s?2|SOX|GDPR|CCPA|CPRA|PIPL)\b/i;
if (regimeText.trim() && REGULATED.test(regimeText) && llmPresent) {
  let boundaryText = regimeText;
  const adrDir = join(root, 'docs/adr');
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir)) if (f.endsWith('.md')) boundaryText += '\n' + readIf(`docs/adr/${f}`);
  }
  boundaryText += '\n' + readIf('docs/architecture.md');
  const BOUNDARY = /\bBAA\b|\bDPA\b|self[\s-]?host|on[\s-]?prem|redact|tokeniz|de[\s-]?identif|exclude regulated|no PHI|no PAN/i;
  if (!BOUNDARY.test(boundaryText)) {
    // BLOCKER (deny-by-default) per security rule: a regulated regime + LLM/agent is the Agentic
    // compliance landmine. Only fires when regime IS declared AND LLM IS present AND no boundary is
    // recorded — non-regulated projects are unaffected (preserves local-first). [audit H3/T3]
    errors.push('D5 Compliance (BLOCKER): a regulated regime is declared and LLM/agent code exists, but no data-boundary decision was found (BAA/DPA · self-host · redaction · exclude regulated data). Deny-by-default per security rules — resolve F-compliance.md "Agentic data-boundary" before shipping.');
  }
}

// --- A0 Activation surface (ADVISORY — never fails CI) ---
// EOS's CI gates are AUTHORITATIVE only once the downstream repo enables SERVER-SIDE branch protection,
// and the org-compliance axis only opens once an approved profile is installed. Neither can be verified
// locally (no network / no org backend), so this is an honest REMINDER, not a gate. It reads the tracked
// ledger docs/eos/activation.md and reports how many one-time hardening items are still pending. This is
// the "impossible to systematically forget" surface: it prints every run and in CI, yet never blocks.
const activationOut = [];
const ledgerPath = join(root, 'docs/eos/activation.md');
if (!existsSync(ledgerPath)) {
  activationOut.push('  ACTIVATION  docs/eos/activation.md not found — run /eos-init to set up enforcement authority (branch protection · CODEOWNERS · approval baseline).');
} else {
  const pending = [];
  for (const ln of readFileSync(ledgerPath, 'utf8').split('\n')) {
    const m = ln.match(/^\s*-\s*\[( |x|X|~)\]\s+(.*\S)/);
    if (m && m[1] === ' ') pending.push(m[2].trim());
  }
  if (pending.length) {
    activationOut.push(`  ACTIVATION  enforcement authority = CONTRACTUAL: ${pending.length} one-time hardening item(s) pending (advisory — local checks can't verify server-side branch protection):`);
    for (const p of pending) activationOut.push('              \u25B8 ' + p);
    activationOut.push('              \u2192 run /eos-init, or see docs/eos/activation.md \u00B7 Appendix D. Mark [x] done or [~] waived-with-reason to clear.');
  } else {
    activationOut.push('  ACTIVATION  enforcement authority attested \u2713 (docs/eos/activation.md \u2014 0 pending).');
  }
}

// --- Report (same shape as validate-config.mjs) ---
console.log('EOS SDLC gate doctor\n');
for (const line of activationOut) console.log(line);
if (activationOut.length) console.log('');
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
