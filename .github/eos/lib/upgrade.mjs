// Template upgrades — a three-way comparison against the template a project started from. (ADR-015)
//
// A copy of the template diverges two ways at once: EOS ships new versions of its own files, and the
// project edits some of them (a workflow, an instruction file) and owns others outright (its
// declaration, evidence, ledger). Until 2.1 the only path was "diff .github/ and merge by hand".
// `eos upgrade` compares, per file, the template the project started from (BASE), the project as it is
// (LOCAL) and the new template (NEXT):
//
//   LOCAL == NEXT                 current   nothing to do
//   LOCAL == BASE, NEXT exists    update    the project never touched it: take NEXT (add, if new)
//   LOCAL == BASE, NEXT absent    remove    upstream deleted it and the project never touched it
//   NEXT  == BASE                 kept      only the project changed it: LOCAL stays
//   anything else                 conflict  both changed it: NEXT is parked under .eos/local/upgrade/
//                                           for a hand merge; LOCAL is never overwritten
//
// Files a project owns by design are never read or written, whatever either template contains.
// Offline by construction: both templates are directories the developer fetched (degit, or the
// attested release tarball). EOS Core downloads nothing (offline-boundary.test.mjs).
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Paths a project owns by design: never upgraded, whatever either template contains. */
export const PROJECT_OWNED = [
  /^\.eos\/(project|policy\.lock|policy\.upstream|sbom)\.json$/,
  /^\.eos\/(evidence|ledger|waivers|handoffs|local|releases|keys)\//,
  /^docs\/(stories|epics)\//,
  /^(src|api|ops)\//,
  /^(README(\.zh)?\.md|LICENSE|CONTRIBUTING\.md|CODE_OF_CONDUCT\.md|SECURITY\.md|package(-lock)?\.json)$/,
  /^\.github\/CODEOWNERS$/,
];
const SKIP_DIRS = new Set(['.git', 'node_modules']);
export const PARK_DIR = '.eos/local/upgrade';

const owned = (p) => PROJECT_OWNED.some((re) => re.test(p));

function walk(dir, prefix = '', out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) walk(join(dir, e.name), rel, out);
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

function digest(file) {
  try {
    return statSync(file).isFile() ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
  } catch {
    return null;
  }
}

/** The EOS version a tree says it is (docs/eos/VERSION), or null. */
export function templateVersion(dir) {
  try { return readFileSync(join(dir, 'docs/eos/VERSION'), 'utf8').trim() || null; } catch { return null; }
}

/** Is `dir` a copy of the EOS template? */
export const isTemplate = (dir) => existsSync(join(dir, '.github/eos/eos.mjs')) && templateVersion(dir) !== null;

/**
 * What an upgrade would do, file by file. Pure: reads the three trees, writes nothing.
 * @returns {{path: string, action: 'current'|'update'|'add'|'remove'|'kept'|'conflict'}[]}
 */
export function planUpgrade({ root, next, base }) {
  const paths = [...new Set([...walk(next), ...walk(base)])].filter((p) => !owned(p)).sort();
  return paths.map((path) => {
    const n = digest(join(next, path));
    const b = digest(join(base, path));
    const l = digest(join(root, path));
    let action;
    if (n === l) action = 'current';
    else if (l === b) action = n ? (l ? 'update' : 'add') : 'remove';
    else if (n === b) action = 'kept';
    else action = 'conflict';
    return { path, action };
  });
}

/** Carry out a plan. Returns the plan rows, with `parked` set on conflicts NEXT was parked for. */
export function applyUpgrade({ root, next, rows }) {
  const parkDir = `${PARK_DIR}/${templateVersion(next) || 'next'}`;
  for (const r of rows) {
    const from = join(next, r.path);
    const to = join(root, r.path);
    if (r.action === 'update' || r.action === 'add') {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      chmodSync(to, statSync(from).mode); // eos.mjs ships executable
    } else if (r.action === 'remove') {
      unlinkSync(to);
    } else if (r.action === 'conflict' && existsSync(from)) {
      const parked = join(root, parkDir, r.path);
      mkdirSync(dirname(parked), { recursive: true });
      copyFileSync(from, parked);
      r.parked = `${parkDir}/${r.path}`;
    }
  }
  return rows;
}
