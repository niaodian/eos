#!/usr/bin/env node
// EOS SDLC gate doctor — zero external deps.
// Statically enforces CONDITIONAL-GATE wiring that lives in project structure
// (complements validate-config.mjs, which checks EOS *config*). Run from project root:
//   node .github/hooks/eos-doctor.mjs
// Designed to run in local CI (act) and as a manual pre-release check.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
// Detection = unambiguous AI dirs (ai/llm/rag) OR an LLM SDK dependency in a manifest, so LLM code
// can't silently escape the gate by living outside a conventioned dir (src/agents/, inference/…).
// `agents` is a common domain noun (insurance/sales agents ≠ LLM agents), so it counts as an LLM
// signal ONLY when an LLM SDK dependency is ALSO present — otherwise a traditional-SaaS src/agents/
// would false-trip D1 (and the D5 compliance BLOCKER). [audit H2/E4 · round-2 N2]
const strongAiDirs = [];   // ai / llm / rag — unambiguous LLM signal
const agentDirs = [];      // agents — ambiguous; needs a dependency signal to count
walkDirs((name, full) => {
  if (['ai', 'llm', 'rag'].includes(name)) strongAiDirs.push(full);
  else if (name === 'agents') agentDirs.push(full);
});
const readManifest = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };
const manifestText = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle']
  .map(readManifest).join('\n');
// High-signal LLM SDK names across JS/Python/Go/Java ecosystems (kept tight to avoid false positives).
const LLM_SDK = /\b(openai|anthropic|langchain|llama[-_]?index|llamaindex|cohere-ai|mistralai|groq-sdk|ollama|generative-ai|google\/genai|huggingface|go-openai|langchain4j)\b/i;
const hasLlmDep = LLM_SDK.test(manifestText);
// agents/ only becomes LLM evidence when a dependency confirms it; ai/llm/rag always count.
const aiDirs = [...strongAiDirs, ...(hasLlmDep ? agentDirs : [])];
const llmPresent = strongAiDirs.length > 0 || hasLlmDep;
const hasEvalPlan = existsSync(join(root, 'docs/eval-plan.md'));
let hasEvalScript = false;
try { const pj = JSON.parse(readManifest('package.json') || '{}'); hasEvalScript = !!(pj.scripts && pj.scripts.eval); } catch { /* no / invalid package.json */ }

if (llmPresent) {
  const why = aiDirs.length
    ? `LLM/agent code (${aiDirs.map((d) => relative(root, d).split(/[\\/]/).join('/')).join(', ')})`
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
