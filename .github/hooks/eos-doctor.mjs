#!/usr/bin/env node
// EOS SDLC gate doctor — zero external deps.
// Statically enforces CONDITIONAL-GATE wiring that lives in project structure
// (complements validate-config.mjs, which checks EOS *config*). Run from project root:
//   node .github/hooks/eos-doctor.mjs
// Designed to run in local CI (act) and as a manual pre-release check.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warns = [];
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'dist', 'build', '.next', 'coverage']);

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

// --- D1/D2: G-EVAL — an LLM/agent product component requires an eval plan + runner ---
// Detection mirrors the AI rule's applyTo glob (**/{ai,llm,rag,agents}/**) AND a dependency
// signal (an LLM SDK named in a manifest), so LLM code can't silently escape the gate by living
// outside a conventioned directory (e.g. src/agents/, inference/, packages/chatbot/). [audit H2/E4]
const aiDirs = [];
walkDirs((name, full) => { if (['ai', 'llm', 'rag', 'agents'].includes(name)) aiDirs.push(full); });
const readManifest = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };
const manifestText = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle']
  .map(readManifest).join('\n');
// High-signal LLM SDK names across JS/Python/Go/Java ecosystems (kept tight to avoid false positives).
const LLM_SDK = /\b(openai|anthropic|langchain|llama[-_]?index|llamaindex|cohere-ai|mistralai|groq-sdk|ollama|generative-ai|google\/genai|huggingface|go-openai|langchain4j)\b/i;
const hasLlmDep = LLM_SDK.test(manifestText);
const llmPresent = aiDirs.length > 0 || hasLlmDep;
const hasEvalPlan = existsSync(join(root, 'docs/eval-plan.md'));
let hasEvalScript = false;
try { const pj = JSON.parse(readManifest('package.json') || '{}'); hasEvalScript = !!(pj.scripts && pj.scripts.eval); } catch { /* no / invalid package.json */ }

if (llmPresent) {
  const why = aiDirs.length
    ? `LLM/agent code (${aiDirs.map((d) => d.replace(root + '/', '')).join(', ')})`
    : 'an LLM SDK dependency (package.json / requirements / go.mod)';
  if (!hasEvalPlan) {
    errors.push(`D1 G-EVAL: found ${why} but no docs/eval-plan.md. Design evals before shipping (run /eval-spec).`);
  }
  const evalsDir = join(root, 'evals');
  const hasRunner = existsSync(evalsDir)
    && readdirSync(evalsDir).some((f) => /\.(test|spec)\.[mc]?[jt]s$/.test(f) || /(^test_.*|.*_test)\.py$/.test(f));
  if (!hasRunner && !hasEvalScript) {
    // E4: a plan alone never proves evals actually run — require an executable harness too.
    errors.push('D2 G-EVAL: LLM/agent present but no runnable eval harness (evals/*.test.* or an "eval" npm script). Copy docs/eos/examples/eval-starter/.');
  }
} else if (hasEvalPlan) {
  warns.push('D2 G-EVAL: docs/eval-plan.md exists but no ai/llm/rag/agents dir or LLM dependency was found (ok if code lives elsewhere).');
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
const REGULATED = /\b(HIPAA|PCI[\s-]?DSS|SOC\s?2|SOX|GDPR|CCPA|CPRA|PIPL)\b|个人信息保护/i;
if (regimeText.trim() && REGULATED.test(regimeText) && llmPresent) {
  let boundaryText = regimeText;
  const adrDir = join(root, 'docs/adr');
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir)) if (f.endsWith('.md')) boundaryText += '\n' + readIf(`docs/adr/${f}`);
  }
  boundaryText += '\n' + readIf('docs/architecture.md');
  const BOUNDARY = /\bBAA\b|\bDPA\b|self[\s-]?host|on[\s-]?prem|redact|tokeniz|de[\s-]?identif|exclude regulated|no PHI|no PAN|脱敏|不出境|本地模型|自托管/i;
  if (!BOUNDARY.test(boundaryText)) {
    // BLOCKER (deny-by-default) per security rule: a regulated regime + LLM/agent is the Agentic
    // compliance landmine. Only fires when regime IS declared AND LLM IS present AND no boundary is
    // recorded — non-regulated projects are unaffected (preserves local-first). [audit H3/T3]
    errors.push('D5 Compliance (BLOCKER): a regulated regime is declared and LLM/agent code exists, but no data-boundary decision was found (BAA/DPA · self-host · redaction · exclude regulated data). Deny-by-default per security rules — resolve F-compliance.md "Agentic data-boundary" before shipping.');
  }
}

// --- Report (same shape as validate-config.mjs) ---
console.log('EOS SDLC gate doctor\n');
for (const w of warns) console.log('  WARN  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
console.log('');
if (errors.length) {
  console.log(`FAIL: ${errors.length} error(s), ${warns.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS${warns.length ? ` (${warns.length} warning(s))` : ''}`);
