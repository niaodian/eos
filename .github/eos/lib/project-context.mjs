// Project context — which project are we actually talking about?
//
// EOS, the agent host, and any integration a skill reaches for each form their own opinion of
// "the project root", and those opinions can disagree. When they do, the failure is quiet and
// nasty: a skill resolves its configuration from a DIFFERENT project's runtime, and its output —
// knowledge paths, artifact paths, memory — silently belongs to somewhere else.
//
// This module makes the answer explicit, ordered and reportable. It does not guess, and when it
// cannot tell it says so rather than picking something plausible.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Resolution order, most explicit first. Reported verbatim by `doctor --deep`. */
export const RESOLUTION_ORDER = [
  'cli:--project-root',
  'env:EOS_PROJECT_ROOT',
  'git:toplevel',
  'cwd',
];

const gitTop = (cwd) => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() || null : null;
};

/**
 * Resolve the project root deterministically.
 * @param {object} opts
 * @param {string|null} opts.cliRoot  value of --project-root, if given
 * @param {object} opts.env           environment to read (injectable for tests)
 * @param {string} opts.cwd
 * @returns {{root:string, source:string, candidates:Array<{source:string,value:string|null,used:boolean}>, problems:string[]}}
 */
export function resolveProjectRoot({ cliRoot = null, env = process.env, cwd = process.cwd() } = {}) {
  const problems = [];
  const raw = [
    { source: 'cli:--project-root', value: cliRoot || null },
    { source: 'env:EOS_PROJECT_ROOT', value: env.EOS_PROJECT_ROOT || null },
    { source: 'git:toplevel', value: gitTop(cwd) },
    { source: 'cwd', value: cwd },
  ];
  const candidates = raw.map((c) => ({ ...c, value: c.value ? resolve(cwd, c.value) : null, used: false }));
  const chosen = candidates.find((c) => c.value && existsSync(c.value));
  for (const c of candidates) {
    if (c.value && !existsSync(c.value)) problems.push(`${c.source} points at ${c.value}, which does not exist`);
  }
  if (chosen) chosen.used = true;
  // `cwd` always exists, so this is defensive rather than reachable in practice.
  return { root: chosen ? chosen.value : resolve(cwd), source: chosen ? chosen.source : 'cwd', candidates, problems };
}

/** `--project-root` / `EOS_PROJECT_ROOT` are read here so every entry point agrees. */
export const projectRootFromArgv = (argv) => {
  const i = argv.indexOf('--project-root');
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

/**
 * Does a runtime/config file belong to a DIFFERENT project than the one we resolved?
 *
 * A shared runtime may legitimately provide scripts and capabilities. It must not provide another
 * project's identity, knowledge paths or output paths — that is how one project's artifacts end up
 * written into another's, and it is invisible unless someone looks.
 *
 * Deliberately conservative: it only reports a mismatch it can point at, because a false accusation
 * here is as unhelpful as a missed one.
 *
 * @returns {Array<{file:string, key:string, value:string, reason:string}>}
 */
export function foreignProjectReferences(projectRoot, configFiles) {
  const out = [];
  const here = resolve(projectRoot);
  const hereName = here.split(/[\\/]/).filter(Boolean).pop() || '';
  for (const rel of configFiles) {
    const full = isAbsolute(rel) ? rel : join(here, rel);
    if (!existsSync(full)) continue;
    let text;
    try { text = readFileSync(full, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      // key: value  — enough for YAML/TOML/INI-shaped config without taking a parser dependency.
      const m = line.match(/^\s*["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*[:=]\s*["']?([^"'#\n]+?)["']?\s*$/);
      if (!m) continue;
      const [, key, value] = m;
      if (/^(projectName|project_name|name)$/i.test(key)) {
        if (hereName && value.trim() && value.trim() !== hereName) {
          out.push({ file: rel, key, value: value.trim(), reason: `names project "${value.trim()}" while this project directory is "${hereName}"` });
        }
        continue;
      }
      if (!/(path|dir|root|location|output|folder)$/i.test(key)) continue;
      const v = value.trim();
      if (!v || v.startsWith('{') || v.startsWith('$')) continue; // unresolved template — not a fact yet
      if (!isAbsolute(v)) continue;                                // relative paths stay inside this project
      if (resolve(v) === here || resolve(v).startsWith(here + '/')) continue;
      out.push({ file: rel, key, value: v, reason: `points at ${v}, which is outside this project` });
    }
  }
  return out;
}
