#!/usr/bin/env node
// Plan one run of .github/workflows/eos-ci.yml: is this repository EOS itself, or a project that
// copied it? Prints GitHub Actions outputs (key=value lines).
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
//   node .github/eos/ci-plan.mjs >> "$GITHUB_OUTPUT"
import { pathToFileURL } from 'node:url';
import { loadProjectConfig } from '../hooks/lib/project-config.mjs';

/**
 * @param {{declaration: object|null}} input  the parsed .eos/project.json (null when absent or unreadable)
 * @returns {{self: 'true'|'false'}}
 */
export function planCi({ declaration }) {
  // Only the template's own declaration says "this is EOS". A missing or unreadable declaration is
  // not EOS's either — EOS always ships one — and validate-config fails that run on its own.
  const self = declaration?.templateDefault === true;
  return { self: self ? 'true' : 'false' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = loadProjectConfig(process.cwd());
  const plan = planCi({ declaration: config });
  for (const [k, v] of Object.entries(plan)) process.stdout.write(`${k}=${v}\n`);
  process.stderr.write(plan.self === 'true'
    ? 'EOS CI plan: .eos/project.json is the EOS template\'s own declaration — EOS\'s own test suites run.\n'
    : 'EOS CI plan: a project\'s own declaration — the governance checks and its declared commands run; EOS\'s own test suites do not (they test EOS, not this project).\n');
}
