#!/usr/bin/env node
// Plan one run of .github/workflows/eos-ci.yml: is this repository EOS itself, or a project that
// copied it — and if it is EOS, which platforms and runtimes its own tests run on. Prints GitHub
// Actions outputs (key=value lines).
//
// The workflow is copied into every project that starts from the template, and it is two things at
// once: the governance gate every project runs, and EOS's own test suite. EOS's suites, its coverage
// ratchet and its Linux/macOS/Windows matrix test EOS — they assert the template's own declaration,
// its default agent platforms, its skills and its policy lock. In a project that has declared itself
// they fail for reasons that are not the project's defects (one contract and fifteen integration
// cases did in the first adopter-style copy), on Windows and macOS runners the project pays for.
//
// So they run only while .eos/project.json is still the template's own declaration
// ("templateDefault": true): in EOS's repository, its forks and distributions, and in a copy that has
// not run `eos init` yet — where they pass, because the tree is still the template's. The decision is
// read from the declaration by this script, never from a repository name in the workflow, so a team
// that maintains its own distribution of EOS keeps EOS's tests. (ADR-021)
//
// Where EOS's own matrix runs (2.5.0). A pull request runs each platform once, on Node 24 — Linux also
// runs `verify` on 20 and `coverage` on 22, so every supported runtime still runs on every change. The
// default branch, tags, the weekly schedule and a manual run take the full matrix: every runtime the
// README claims, on every platform. A pull request that only changes documentation skips the matrix;
// `verify` still runs everything on Linux.
//
//   node .github/eos/ci-plan.mjs >> "$GITHUB_OUTPUT"      env: EOS_EVENT (github.event_name)
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadProjectConfig } from '../hooks/lib/project-config.mjs';

/** A pull request: Node 24, the current LTS, once on each platform. */
export const LEAN_MATRIX = [
  { os: 'ubuntu-latest', node: '24' },
  { os: 'windows-latest', node: '24' },
  { os: 'macos-latest', node: '24' },
];

/**
 * The default branch, tags, the weekly schedule, a manual run: every runtime the README claims, on
 * every platform. Node 20 is end of life (2026-04-30) but stays while it is the declared minimum
 * (`engines`). Linux runs 20 in `verify` and 22 in `coverage`, so it joins here for 24 only.
 */
export const FULL_MATRIX = [
  ...['windows-latest', 'macos-latest'].flatMap((os) => ['20', '22', '24'].map((node) => ({ os, node }))),
  { os: 'ubuntu-latest', node: '24' },
];

/**
 * Documentation, for the purpose of skipping the matrix: Markdown anywhere, and anything else under
 * docs/ — except the examples and tools there, which are code EOS's suites run on every platform (the
 * eval starter is where a Windows short-path bug was found).
 */
export const isDocumentation = (path) => path.endsWith('.md') || (path.startsWith('docs/') && !/^docs\/eos\/(examples|tools)\//.test(path));

/**
 * @param {{declaration: object|null, event?: string, changedFiles?: string[]|null}} input
 *   declaration: the parsed .eos/project.json (null when absent or unreadable); event:
 *   github.event_name; changedFiles: what a pull request changes (null when it could not be listed)
 * @returns {{self: 'true'|'false', cross_platform: 'true'|'false', matrix: string}}
 */
export function planCi({ declaration, event = '', changedFiles = null }) {
  // Only the template's own declaration says "this is EOS". A missing or unreadable declaration is
  // not EOS's either — EOS always ships one — and validate-config fails that run on its own.
  const self = declaration?.templateDefault === true;
  const pullRequest = event === 'pull_request';
  // Unknown is not documentation: a list that could not be read runs the matrix.
  const docsOnly = pullRequest && Array.isArray(changedFiles) && changedFiles.length > 0 && changedFiles.every(isDocumentation);
  return {
    self: self ? 'true' : 'false',
    cross_platform: self && !docsOnly ? 'true' : 'false',
    matrix: JSON.stringify({ include: pullRequest ? LEAN_MATRIX : FULL_MATRIX }),
  };
}

/** What a pull request changes: its merge commit against the first parent, the base. Null if unknown. */
function pullRequestFiles(cwd) {
  const r = spawnSync('git', ['diff', '--name-only', '-z', 'HEAD^1', 'HEAD'], { cwd, encoding: 'utf8', timeout: 30000 });
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.EOS_EVENT || '';
  const { config } = loadProjectConfig(process.cwd());
  const changedFiles = event === 'pull_request' ? pullRequestFiles(process.cwd()) : null;
  const plan = planCi({ declaration: config, event, changedFiles });
  for (const [k, v] of Object.entries(plan)) process.stdout.write(`${k}=${v}\n`);
  if (plan.self !== 'true') {
    process.stderr.write('EOS CI plan: a project\'s own declaration — the governance checks and its declared commands run; EOS\'s own test suites do not (they test EOS, not this project).\n');
  } else {
    const cells = JSON.parse(plan.matrix).include.map((c) => `${c.os.replace('-latest', '')}/${c.node}`).join(', ');
    process.stderr.write(`EOS CI plan: .eos/project.json is the EOS template's own declaration — EOS's own test suites run.\n  cross-platform: ${plan.cross_platform === 'true' ? cells : `skipped — the pull request changes documentation only (${changedFiles.length} file(s))`}\n`);
  }
}
