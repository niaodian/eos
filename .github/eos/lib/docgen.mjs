// Documentation generated FROM the machine-readable policy.
//
// THE PROBLEM: the same rule lived in four places — `.eos/gates.json` (what actually runs),
// `docs/`, `.github/prompts/` and `.github/agents/` (what people and agents read). Nothing kept
// them in step, so the prose drifted from the engine one edit at a time and the drift was only ever
// discovered by someone acting on documentation that had quietly stopped being true.
//
// THE RULE: the machine-readable policy is the only authority. Anything that restates it is
// GENERATED from it, and `eos docs --check` fails the build when a generated file no longer matches
// what the policy would produce. That turns "the docs are stale" from something you notice into
// something CI refuses.
//
// The precedent is lib/workspace-rule.mjs, which already renders the always-on workspace rule from
// `.eos/project.json` and is policed by S14. This applies the same pattern to the gate reference,
// the workflow state machines and the evidence graph.
import { gateInputs } from './state.mjs';

export const GENERATED_DIR = 'docs/eos/generated';

const BANNER = (source) => [
  '<!-- GENERATED FILE — DO NOT EDIT.',
  `     Source of truth: ${source}`,
  '     Regenerate:      node .github/eos/eos.mjs docs --write',
  '     CI check:        node .github/eos/eos.mjs docs --check',
  '',
  '     Editing this file by hand is pointless: the next --write overwrites it, and --check fails',
  '     the build in the meantime. Change the policy instead; the prose follows. -->',
  '',
].join('\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

/** The gate reference: every gate, every check, every fix — straight out of .eos/gates.json. */
export function renderGateReference(gates) {
  const out = [BANNER('.eos/gates.json'), '# Gate reference', '',
    `${gates.gates.length} gates, ${gates.gates.reduce((n, g) => n + g.checks.length, 0)} checks. This is a projection of the gate definitions the engine executes — if a rule is here, it runs.`,
    '', '## Summary', '', '| Gate | Code | Scope | Version | Waivable | Checks |', '|---|---|---|---|---|---|'];
  for (const g of gates.gates) {
    out.push(`| \`${g.id}\` | ${g.code} | ${g.scope} | ${g.version} | ${g.waivable === false ? 'no' : 'yes'} | ${g.checks.length} |`);
  }
  for (const g of gates.gates) {
    out.push('', `## ${g.code} · \`${g.id}\``, '', `**${esc(g.title)}**`, '');
    if (g.summary) out.push(esc(g.summary), '');
    out.push('| Check | What it verifies | How to satisfy it |', '|---|---|---|');
    for (const c of g.checks) out.push(`| \`${c.id}\` | ${esc(c.title)} | ${esc(c.fix)} |`);
  }
  out.push('');
  return out.join('\n');
}

/** The workflow: state machines as diagrams, and the policy matrix as a table. */
export function renderWorkflow(workflow) {
  const out = [BANNER('.eos/workflow.json'), '# Workflow', '',
    `Profiles: ${Object.keys(workflow.profiles).map((p) => `\`${p}\``).join(' · ')}. Default: \`${workflow.defaultProfile}\`.`, ''];

  out.push('## State machines', '');
  for (const [name, machine] of Object.entries(workflow.stateMachines || {})) {
    out.push(`### \`${name}\``, '', '```mermaid', 'stateDiagram-v2');
    out.push(`  [*] --> ${machine.initial}`);
    for (const t of machine.transitions || []) {
      const label = t.requiresGate ? ` : ${t.requiresGate}` : '';
      out.push(`  ${t.from} --> ${t.to}${label}`);
    }
    for (const terminal of machine.terminal || []) out.push(`  ${terminal} --> [*]`);
    out.push('```', '');
  }

  out.push('## Gate policy by profile and change type', '',
    'Each cell is what the profile requires of that gate for that kind of change. `required` must pass, `waivable` can be lifted by an approved unexpired waiver, `not_applicable` is recorded as a decision rather than skipped.', '');
  for (const [profileName, profile] of Object.entries(workflow.profiles)) {
    const gateIds = [...new Set(Object.values(profile.changeTypes).flatMap((c) => Object.keys(c.gates)))];
    out.push(`### \`${profileName}\``, '', esc(profile.description), '',
      `| Change type | ${gateIds.map((g) => `\`${g}\``).join(' | ')} |`,
      `|---|${gateIds.map(() => '---').join('|')}|`);
    for (const [ct, def] of Object.entries(profile.changeTypes)) {
      const cells = gateIds.map((g) => ({ required: '**required**', waivable: 'waivable', not_applicable: '–' }[def.gates[g]] ?? '?'));
      out.push(`| \`${ct}\` | ${cells.join(' | ')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

/**
 * The evidence graph: which files each gate's recorded result is bound to.
 *
 * This is the same function the engine uses to decide staleness, so the picture cannot drift from
 * the behaviour: if an edge is drawn here, editing that file really does invalidate that gate.
 */
export function renderEvidenceGraph(snapshot) {
  const gates = snapshot.gates?.gates || [];
  const out = [BANNER('.eos/gates.json + lib/state.mjs gateInputs()'), '# Evidence dependency graph', '',
    'An edge means: editing that file makes this gate\'s recorded evidence STALE. Drawn from the same `gateInputs()` the engine uses to decide staleness, so the diagram cannot disagree with the behaviour.', '',
    '```mermaid', 'graph LR'];
  const seen = new Set();
  for (const def of gates) {
    const scopeType = def.scope;
    const scopeId = scopeType === 'story' ? (snapshot.stories[0]?.id || 'STORY-EXAMPLE') : scopeType === 'release' ? 'RELEASE-EXAMPLE' : 'product';
    const inputs = gateInputs(snapshot, def.id, scopeType, scopeId);
    const gateNode = `G_${def.id.replace(/[^A-Za-z0-9]/g, '_')}`;
    out.push(`  ${gateNode}["${def.code} ${def.id}"]`);
    for (const input of inputs) {
      const fileNode = `F_${input.replace(/[^A-Za-z0-9]/g, '_')}`;
      if (!seen.has(fileNode)) { out.push(`  ${fileNode}(["${input}"])`); seen.add(fileNode); }
      out.push(`  ${fileNode} --> ${gateNode}`);
    }
  }
  out.push('```', '',
    '> Governance files (`.eos/gates.json`, `.eos/workflow.json`) are bound to EVERY gate and are left out of the diagram — an edge from each of them to each gate would say less, not more. Changing either invalidates all recorded evidence by design.', '');
  return out.join('\n');
}

/** Everything EOS generates, as path -> content. */
export function generateDocs(snapshot) {
  return {
    [`${GENERATED_DIR}/gates.md`]: renderGateReference(snapshot.gates),
    [`${GENERATED_DIR}/workflow.md`]: renderWorkflow(snapshot.workflow),
    [`${GENERATED_DIR}/evidence-graph.md`]: renderEvidenceGraph(snapshot),
  };
}
