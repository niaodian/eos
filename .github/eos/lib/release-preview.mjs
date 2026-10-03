// The release gate, previewed — what G8 will ask for, said while there is still time to provide it.
//
// Until 2.2 a project learned what a release needs at the release: G8 is where a missing
// `commands.audit`, an NFR target nobody measured, the runbook and the deployment-topology ADR first
// surface — weeks after the stories that could have produced them. Nine of the ten starter packs did
// not even declare the audit G8 runs.
//
// This reads only declarations and the presence of files, never runs anything, so `eos next` stays
// instant. It is a preview, not a verdict: G8 still decides, and checks far more than existence.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SUMMARY_PATHS } from './machine-summary.mjs';
import { RUNBOOKS, findTopologyAdr } from './gate-primitives.mjs';

const CLI = 'node .github/eos/eos.mjs';

/**
 * Each G8 check that needs something the team must PRODUCE ahead of time, and whether it exists yet.
 * @returns {{gate: string, code: string, items: Array<{check: string, ready: boolean, what: string, detail: string}>}|null}
 *   null when the project has not declared itself yet — then the first action is `eos init`, not this.
 */
export function releasePreview(snapshot) {
  const p = snapshot.project;
  if (!p || p.templateDefault) return null;
  const root = snapshot.root;
  const items = [];
  const add = (check, ready, what, detail) => items.push({ check, ready, what, detail });

  const configOnly = p.projectType === 'config-only';
  add('dependency-audit', !!p.commands?.audit, 'a dependency audit (commands.audit)', p.commands?.audit
    ? 'declared — the release gate runs it on the candidate; offline it is DEFERRED, never passed'
    : configOnly
      ? 'declared together with the stack: `eos init <pack> --write` sets commands.audit (npm audit, pip-audit, govulncheck …)'
      : 'not declared — the release gate FAILs without it. Add commands.audit to .eos/project.json (npm audit --audit-level=high, pip-audit, govulncheck ./… — see docs/eos/stack-presets.md)');

  const nfr = existsSync(join(root, SUMMARY_PATHS.nfrSummary));
  add('nfr-evidence', nfr, `NFR measurements (${SUMMARY_PATHS.nfrSummary})`, nfr
    ? 'present — the release gate re-checks every target against docs/requirements.json and the current tree'
    : 'not measured yet — every NFR in docs/requirements.json needs a measured, skipped or deferred result (docs/eos/examples/nfr-summary/)');

  const runbook = RUNBOOKS.find((f) => existsSync(join(root, f)));
  add('ops-artifacts', !!runbook, 'a runbook with rollback, gradual rollout and health/readiness', runbook
    ? `${runbook} exists — the release gate checks it names rollback, gradual rollout and health/readiness`
    : `none yet (looked for ${RUNBOOKS.join(', ')}) — write it with /eos-runbook`);

  const topology = findTopologyAdr(root);
  add('deployment-topology', !!topology, 'a deployment-topology decision (docs/adr/)', topology
    ? `${topology.path} records it`
    : 'not decided yet — record it with /eos-deploy-topology');

  if (p.complianceProfile === 'regulated') {
    const key = p.release?.signing?.publicKey;
    add('manifest-signature', !!key && existsSync(join(root, key)), 'a release signing key (release.signing.publicKey)', key
      ? (existsSync(join(root, key)) ? `${key} — the Regulated track requires every release manifest signed with it` : `${key} is declared but does not exist — \`${CLI} release keygen --write\``)
      : `not declared — the Regulated track requires a signed manifest: \`${CLI} release keygen --write\``);
  }
  return { gate: 'release-ready', code: 'G8', items };
}

/** The not-ready items as diagnostic-style lines (status) or one line (next). */
export function previewLines(preview, { compact = false } = {}) {
  if (!preview) return [];
  const missing = preview.items.filter((i) => !i.ready);
  if (compact) {
    return missing.length
      ? ['', `Ahead at release (${preview.code})`, `  not ready yet: ${missing.map((i) => i.what).join(' · ')}`, `  ${CLI} status lists what each one needs`]
      : [];
  }
  const out = [`Release gate ahead (${preview.code})`];
  for (const i of preview.items) out.push(`  ${i.ready ? '✓' : '·'} ${i.what}`, `      ${i.detail}`);
  out.push('');
  return out;
}
