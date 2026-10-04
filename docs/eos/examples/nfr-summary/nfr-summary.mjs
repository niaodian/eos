// Writes the machine summary the release gate's nfr-evidence check reads: docs/evidence/nfr-summary.json
// (schema: .eos/schemas/nfr-summary.schema.json). Zero dependencies.
//
//   node scripts/nfr-summary.mjs perf/measurements.json
//
// A threshold in docs/requirements.json is an intention; this file is the measurement. Your load or
// availability tool (k6, autocannon, locust, JMeter, a synthetic probe…) measures; you put each
// number into the measurements file; this writes the summary bound to the product tree it measured.
// The verdict is computed here exactly as G8 recomputes it — a PASS the numbers do not support fails
// at the gate anyway.
//
// Run in place inside the EOS template it is a demo and writes nothing: copy it into your project.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUMMARY_PATH = 'docs/evidence/nfr-summary.json';

const MET = {
  '>=': (o, t) => o >= t, '>': (o, t) => o > t, '<=': (o, t) => o <= t, '<': (o, t) => o < t, '==': (o, t) => o === t,
};

/** The project root: the git top level, else the working directory. */
export function projectRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return cwd;
  }
}

/** The identity of the tree these measurements describe — the digest the gate computes. */
export function productTree(root) {
  const out = execFileSync(process.execPath, [join(root, '.github/eos/eos.mjs'), 'product-tree', '--json'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  const { productTree: tree } = JSON.parse(out);
  if (!tree?.digest) throw new Error('eos product-tree --json reported no digest — run this inside the project\'s git repository');
  return { digest: tree.digest, algorithm: tree.algorithm, version: tree.version };
}

/**
 * One target, made complete: an ADOPT target gets the status its numbers imply; SKIP and DEFER are
 * checked for the reason / owner + trigger + dueBy the gate requires. Throws on anything the gate would reject,
 * so the problem surfaces where the measurement is, not at the release.
 */
export function target(t) {
  if (!t?.id) throw new Error('every target needs the "id" of an NFR in docs/requirements.json');
  if (t.decision === 'ADOPT') {
    if (typeof t.threshold !== 'number' || typeof t.observed !== 'number') throw new Error(`${t.id}: ADOPT needs a numeric threshold and observed value`);
    const comparator = t.comparator || '>=';
    if (!MET[comparator]) throw new Error(`${t.id}: unknown comparator "${comparator}"`);
    return { ...t, comparator, status: MET[comparator](t.observed, t.threshold) ? 'PASS' : 'FAIL' };
  }
  if (t.decision === 'SKIP') {
    if (typeof t.reason !== 'string' || t.reason.trim().length < 15) throw new Error(`${t.id}: SKIP needs a real reason (15+ characters)`);
    return t;
  }
  if (t.decision === 'DEFER') {
    if (!t.owner || typeof t.trigger !== 'string' || t.trigger.trim().length < 5) throw new Error(`${t.id}: DEFER needs an owner and a trigger`);
    // eos-2.6.0: a deferral without a date cannot be promoted, and one whose date has passed is a FAIL.
    if (typeof t.dueBy !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.dueBy)) throw new Error(`${t.id}: DEFER needs a dueBy date (YYYY-MM-DD) in the future — the release cannot be promoted without one`);
    if (t.dueBy <= new Date().toISOString().slice(0, 10)) console.error(`warning: ${t.id}: dueBy ${t.dueBy} is not in the future — nfr-evidence will FAIL until it is measured, or deferred again with a new date`); // eslint-disable-line no-console
    return t;
  }
  throw new Error(`${t.id}: decision must be ADOPT, SKIP or DEFER`);
}

/** Who measured. Self-reported, like every producer; a CI run says so, which a policy can require. */
function producer() {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return { type: 'ci', name: 'github-actions', runRef: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` };
  }
  return { type: 'local', name: 'nfr-summary' };
}

/** Build the summary (pure apart from the product-tree lookup). */
export function buildSummary({ root, targets, now = new Date() }) {
  if (!Array.isArray(targets) || !targets.length) throw new Error('no targets: list every NFR in docs/requirements.json');
  return {
    $schema: 'https://eos.local/schemas/nfr-summary.schema.json',
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    runId: process.env.GITHUB_RUN_ID || `local-${now.toISOString()}`,
    producer: producer(),
    productTree: productTree(root),
    targets: targets.map(target),
  };
}

export function writeSummary(root, summary) {
  const out = join(root, SUMMARY_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  return out;
}

// CLI
const here = dirname(fileURLToPath(import.meta.url));
// Compared through realpath: on macOS /var is a link to /private/var, and import.meta.url is resolved.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const file = process.argv[2] || join(here, 'measurements.example.json');
  const { targets } = JSON.parse(readFileSync(file, 'utf8'));
  const inPlace = here.endsWith(['docs', 'eos', 'examples', 'nfr-summary'].join(sep));
  const root = projectRoot(here);
  const summary = buildSummary({ root, targets });
  for (const t of summary.targets) {
    console.log(`  ${(t.status || t.decision).padEnd(5)} ${t.id}${t.decision === 'ADOPT' ? ` ${t.observed}${t.unit || ''} ${t.comparator} ${t.threshold}${t.unit || ''}` : ` — ${t.reason || `${t.owner}: ${t.trigger}`}`}`);
  }
  if (inPlace) console.log(`  (demo run in place: ${SUMMARY_PATH} not written — copy this file into your project)`);
  else console.log(`  written ${writeSummary(root, summary)}`);
  process.exitCode = summary.targets.some((t) => t.status === 'FAIL') ? 1 : 0;
}
