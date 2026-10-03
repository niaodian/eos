// The machine summary G-EVAL reads: docs/evidence/eval-summary.json
// (schema: .eos/schemas/eval-summary.schema.json).
//
// `commands.eval` exiting 0 proves only that a process ended. This file says which prompt, model,
// dataset and grader produced which number against which threshold — and binds it to the product
// tree, so editing a prompt, the dataset or a grader makes the result STALE until the evals run again.
// The gate recomputes every verdict from `observed` and `threshold`; a case reported PASS whose
// numbers say otherwise still fails.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

export const SUMMARY_PATH = 'docs/evidence/eval-summary.json';

/** The project root: the git top level, else the working directory. */
export function projectRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return cwd;
  }
}

/** The identity of the tree these results describe — the same digest the gate computes. */
export function productTree(root) {
  const out = execFileSync(process.execPath, [join(root, '.github/eos/eos.mjs'), 'product-tree', '--json'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  const { productTree: tree } = JSON.parse(out);
  if (!tree?.digest) throw new Error('eos product-tree --json reported no digest — run the evals inside the project\'s git repository');
  return { digest: tree.digest, algorithm: tree.algorithm, version: tree.version };
}

const sha12 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
const met = (observed, comparator, threshold) => ({
  '>=': observed >= threshold, '>': observed > threshold, '<=': observed <= threshold, '<': observed < threshold, '==': observed === threshold,
})[comparator];

/** One eval case: a metric, its threshold, what was observed, and the verdict those numbers imply. */
export function evalCase(id, metric, comparator, threshold, observed, sampleSize) {
  return { id, metric, comparator, threshold, observed, sampleSize, status: met(observed, comparator, threshold) ? 'PASS' : 'FAIL' };
}

/**
 * Write the summary. `files` are absolute paths of the system under test, the dataset and the
 * graders; they are recorded relative to the project root, with a content hash as their version.
 */
export function writeSummary({ root, cases, files, model, modelVersion, parameters }) {
  const rel = (f) => relative(root, f).split('\\').join('/');
  const ci = process.env.GITHUB_ACTIONS === 'true';
  const summary = {
    $schema: 'https://eos.local/schemas/eval-summary.schema.json',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID || `local-${Date.now()}`,
    producer: ci
      ? { type: 'ci', name: 'github-actions', runRef: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }
      : { type: 'local', name: 'eval-starter' },
    productTree: productTree(root),
    subject: {
      promptRef: rel(files.prompt), promptVersion: sha12(files.prompt),
      model, modelVersion, parameters,
      datasetRef: rel(files.dataset), datasetVersion: sha12(files.dataset),
      graderRef: rel(files.grader), graderVersion: sha12(files.grader),
    },
    cases,
  };
  const out = join(root, SUMMARY_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  return out;
}
