// The governance report (eos-2.0.0): what an auditor asks for, assembled from the engine's own
// records rather than restated — the ledger, the waivers, the policy lock, the SBOM, the release
// manifests. Offline. `eos report --org` aggregates many repositories' JSON reports into one view,
// which is how an organization sees all of its repositories without a server.
import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readEvents, verifyChain } from './ledger.mjs';
import { loadWaivers } from './waivers.mjs';
import { checkPolicy, readLock, upstreamChanges } from './policy.mjs';
import { sbomFreshness, SBOM_PATH } from './sbom.mjs';
import { listManifests } from './release.mjs';
import { verifyRelease } from './release-integrity.mjs';
import { scopeState } from './state.mjs';
import { trackOf } from './track.mjs';

const CLI = 'node .github/eos/eos.mjs';
const round = (x) => Math.round(x * 1000) / 1000;

function eosVersion(root) {
  try { return readFileSync(join(root, 'docs/eos/VERSION'), 'utf8').trim() || null; } catch { return null; }
}

/** One repository's report. */
export function buildReport(snapshot, { now = new Date() } = {}) {
  const root = snapshot.root;
  const project = snapshot.project || null;
  const declared = !snapshot.projectPresent ? 'missing' : project?.templateDefault ? 'template' : 'declared';
  const track = trackOf(project);
  const attention = [];

  // Gates: every recorded run, from the ledger.
  const { events } = readEvents(root);
  const chain = verifyChain(events, { root });
  const byGate = new Map();
  for (const e of events.filter((x) => x.type === 'gate' && x.gate)) {
    const g = byGate.get(e.gate) || { gate: e.gate, runs: 0, pass: 0, lastStatus: null, lastRunAt: null };
    g.runs += 1;
    if (['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(e.status)) g.pass += 1;
    g.lastStatus = e.status ?? null;
    g.lastRunAt = e.ts ?? null;
    byGate.set(e.gate, g);
  }
  const codes = new Map((snapshot.gates?.gates || []).map((g) => [g.id, g.code]));
  const gates = [...byGate.values()].map((g) => ({ ...g, code: codes.get(g.gate) ?? null, passRate: round(g.runs ? g.pass / g.runs : 0) }))
    .sort((a, b) => a.gate.localeCompare(b.gate));

  // Waivers.
  const items = loadWaivers(root).waivers.map(({ waiver }) => {
    const expiry = new Date(`${waiver.expiresOn}T23:59:59Z`);
    const expired = Number.isNaN(expiry.getTime()) || expiry < now;
    return { gate: waiver.gate, scope: `${waiver.scope?.type}/${waiver.scope?.id}`, status: expired ? 'EXPIRED' : (waiver.approver ? 'ACTIVE' : 'AWAITING_APPROVAL'), expiresOn: waiver.expiresOn ?? null, riskOwner: waiver.riskOwner ?? null };
  });

  // Policy.
  const { present: locked, lock } = readLock(root);
  const policy = checkPolicy(root);
  const up = upstreamChanges(root);
  const upstream = up.vendored?.bundle ? { name: up.vendored.bundle.name, version: up.vendored.bundle.version, pinned: lock?.upstream?.digest === up.digest } : null;

  // Supply chain.
  const sbom = sbomFreshness(snapshot);
  let components = null;
  try { components = (JSON.parse(readFileSync(join(root, SBOM_PATH), 'utf8')).components || []).length; } catch { components = null; }
  const releases = listManifests(root).filter((m) => m.manifest).map((m) => {
    const v = verifyRelease(root, project, m.manifest);
    // `signature` describes the signature that is there: PASS, FAIL — or NOT_APPLICABLE when there is
    // none. Whether its absence matters is the track's question, answered in `attention`.
    const signed = !!m.manifest.signature;
    return { id: String(m.releaseId), state: scopeState(snapshot, 'release', m.releaseId) ?? null, signed, signature: signed ? (v.signature.status === 'PASS' ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE', artifacts: (m.manifest.artifacts || []).length };
  });

  if (declared === 'template') attention.push(`.eos/project.json is still the EOS template's own declaration — run \`${CLI} init\``);
  if (declared === 'missing') attention.push(`.eos/project.json does not exist — run \`${CLI} init\``);
  if (chain.problems.length) attention.push(`the ledger does not verify: ${chain.problems[0]}`);
  for (const w of items.filter((x) => x.status === 'EXPIRED')) attention.push(`waiver for ${w.gate} on ${w.scope} expired on ${w.expiresOn}`);
  if (!policy.ok) attention.push(`policy check fails: ${policy.problems[0]}`);
  if (sbom.status !== 'FRESH') attention.push(`the SBOM is ${sbom.status.toLowerCase()} — run \`${CLI} sbom --write\``);
  for (const r of releases) {
    if (r.signature === 'FAIL') attention.push(`release ${r.id}: its signature does not verify`);
    else if (!r.signed && track.name === 'regulated') attention.push(`release ${r.id} is not signed, and the Regulated track requires it — \`${CLI} release sign --release ${r.id} --key <file>\``);
  }
  if (track.name === 'regulated' && !project?.release?.signing?.publicKey) attention.push(`Regulated track without a release key — run \`${CLI} release keygen --write\``);

  return {
    schemaVersion: 1,
    kind: 'eos-governance-report',
    generatedAt: now.toISOString(),
    eosVersion: eosVersion(root),
    repo: { name: basename(root), commit: snapshot.commit ?? null },
    project: {
      declared,
      projectType: project?.projectType ?? null,
      stacks: project?.stacks || [],
      track: track.name,
      profile: snapshot.profileName || null,
      productCodeVerified: declared === 'declared' && project?.projectType !== 'config-only',
    },
    gates,
    ledger: { events: events.length, intact: chain.problems.length === 0, problems: chain.problems.slice(0, 5) },
    waivers: { active: items.filter((x) => x.status === 'ACTIVE').length, expired: items.filter((x) => x.status === 'EXPIRED').length, items },
    policy: { locked, ok: policy.ok, problems: policy.problems.slice(0, 5), acknowledged: (lock?.acknowledged || []).length, upstream },
    supplyChain: { sbom: sbom.status.toLowerCase(), components, releaseKey: project?.release?.signing?.publicKey ?? null },
    releases,
    attention,
  };
}

const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|');

export function renderReportMarkdown(r) {
  const out = [`# EOS governance report — ${r.repo.name}`, '',
    `Generated ${r.generatedAt}${r.eosVersion ? ` by ${r.eosVersion}` : ''} at ${r.repo.commit ? `\`${r.repo.commit.slice(0, 12)}\`` : 'an uncommitted tree'}.`, '',
    '## Project', '',
    '| Declared | Type | Stacks | Track | Profile | Product code verified |', '|---|---|---|---|---|---|',
    `| ${r.project.declared} | ${cell(r.project.projectType)} | ${cell(r.project.stacks.join(', ') || null)} | ${r.project.track === 'regulated' ? 'Regulated' : 'Standard'} | ${cell(r.project.profile)} | ${r.project.productCodeVerified ? 'yes' : 'no'} |`, '',
    '## Gates', ''];
  if (!r.gates.length) out.push('No gate has run yet.', '');
  else {
    out.push('| Gate | Code | Runs | Passed | Pass rate | Last |', '|---|---|---|---|---|---|');
    for (const g of r.gates) out.push(`| \`${g.gate}\` | ${cell(g.code)} | ${g.runs} | ${g.pass} | ${pct(g.passRate)} | ${cell(g.lastStatus)} |`);
    out.push('');
  }
  out.push(`Ledger: ${r.ledger.events} event(s), ${r.ledger.intact ? 'chain intact' : `**does not verify** — ${cell(r.ledger.problems[0])}`}.`, '',
    `Waivers: ${r.waivers.active} active, ${r.waivers.expired} expired.`, '',
    '## Policy', '',
    `- Lock: ${r.policy.locked ? 'present' : 'none'} · check: ${r.policy.ok ? 'passes' : `**fails** — ${cell(r.policy.problems[0])}`}`,
    `- Acknowledged weakenings: ${r.policy.acknowledged}`,
    `- Organization baseline: ${r.policy.upstream ? `${r.policy.upstream.name}@${r.policy.upstream.version}${r.policy.upstream.pinned ? '' : ' (vendored copy differs from the pinned digest)'}` : 'none'}`, '',
    '## Supply chain', '',
    `- SBOM: ${r.supplyChain.sbom}${r.supplyChain.components !== null ? ` · ${r.supplyChain.components} component(s)` : ''}`,
    `- Release key: ${r.supplyChain.releaseKey ? `\`${r.supplyChain.releaseKey}\`` : 'none'}`, '');
  if (r.releases.length) {
    out.push('| Release | State | Signed | Signature | Artifacts |', '|---|---|---|---|---|');
    for (const x of r.releases) out.push(`| ${cell(x.id)} | ${cell(x.state)} | ${x.signed ? 'yes' : 'no'} | ${cell(x.signature)} | ${x.artifacts} |`);
    out.push('');
  }
  out.push('## Needs attention', '');
  if (!r.attention.length) out.push('Nothing.', '');
  else { for (const a of r.attention) out.push(`- ${a}`); out.push(''); }
  return out.join('\n');
}

/** Many repositories' reports, aggregated. */
export function buildOrgReport(reports, { now = new Date() } = {}) {
  const repositories = reports.map((r) => {
    const runs = r.gates.reduce((n, g) => n + g.runs, 0);
    const passed = r.gates.reduce((n, g) => n + g.pass, 0);
    return {
      name: r.repo.name,
      commit: r.repo.commit,
      eosVersion: r.eosVersion ?? null,
      track: r.project.track,
      productCodeVerified: r.project.productCodeVerified,
      gatePassRate: runs ? round(passed / runs) : null,
      ledgerIntact: r.ledger.intact,
      policyOk: r.policy.ok,
      upstream: r.policy.upstream ? `${r.policy.upstream.name}@${r.policy.upstream.version}` : null,
      expiredWaivers: r.waivers.expired,
      unsignedReleases: r.releases.filter((x) => !x.signed).length,
      attention: r.attention.length,
    };
  });
  const baselines = {};
  for (const r of repositories) if (r.upstream) baselines[r.upstream] = (baselines[r.upstream] || 0) + 1;
  return {
    schemaVersion: 1,
    kind: 'eos-org-governance-report',
    generatedAt: now.toISOString(),
    repositories,
    totals: {
      repositories: repositories.length,
      byTrack: { standard: repositories.filter((r) => r.track === 'standard').length, regulated: repositories.filter((r) => r.track === 'regulated').length },
      needsAttention: repositories.filter((r) => r.attention > 0).length,
      baselines,
    },
  };
}

export function renderOrgMarkdown(o) {
  const out = ['# EOS organization governance report', '',
    `Generated ${o.generatedAt} from ${o.totals.repositories} repository report(s): ${o.totals.byTrack.standard} Standard, ${o.totals.byTrack.regulated} Regulated; ${o.totals.needsAttention} need attention.`, '',
    '| Repository | Track | Code verified | Gate pass rate | Ledger | Policy | Baseline | Expired waivers | Unsigned releases | Attention |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of o.repositories) {
    out.push(`| ${cell(r.name)} | ${r.track === 'regulated' ? 'Regulated' : 'Standard'} | ${r.productCodeVerified ? 'yes' : 'no'} | ${pct(r.gatePassRate)} | ${r.ledgerIntact ? 'intact' : '**broken**'} | ${r.policyOk ? 'ok' : '**fails**'} | ${cell(r.upstream)} | ${r.expiredWaivers} | ${r.unsignedReleases} | ${r.attention} |`);
  }
  out.push('');
  return out.join('\n');
}

/** Read report files for --org; anything that is not a report is refused, not skipped. */
export function readReports(paths) {
  const reports = [];
  const problems = [];
  for (const p of paths) {
    if (!existsSync(p)) { problems.push(`${p} does not exist`); continue; }
    let r;
    try { r = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { problems.push(`${p}: invalid JSON (${e.message})`); continue; }
    if (r?.kind !== 'eos-governance-report' || r.schemaVersion !== 1) { problems.push(`${p} is not an EOS governance report (run \`eos report --format json\` in each repository)`); continue; }
    reports.push(r);
  }
  return { reports, problems };
}
