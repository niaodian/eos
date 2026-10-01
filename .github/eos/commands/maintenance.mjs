// EOS commands — the EOS installation itself: doctor, init, stack, docs, migrations, SBOM, starter packs, policy lock.
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gateInputs, gateCollections } from '../lib/state.mjs';
import { evidenceIntegrity } from '../lib/gates.mjs';
import { readIntent } from '../lib/record.mjs';
import { readLedgerSnapshot, transitionConflicts } from '../lib/ledger.mjs';
import { listEvidence, evidenceFreshness, validateEvidenceShape } from '../lib/evidence.mjs';
import { syncWorkspaceRule } from '../lib/workspace-rule.mjs';
import { generateDocs } from '../lib/docgen.mjs';
import { policyChanges, planLock, checkPolicy, readLock, readPolicy, policySnapshot, policyDigest, POLICY_LOCK_PATH } from '../lib/policy.mjs';
import { planMigration, applyMigration } from '../lib/migrate.mjs';
import { buildSbom, sbomFreshness, sbomDigest, SBOM_PATH } from '../lib/sbom.mjs';
import { PACKS, packDeclaration, packIds } from '../lib/packs.mjs';
import { loadWaivers } from '../lib/waivers.mjs';
import { writeFileAtomic } from '../lib/atomic.mjs';
import { resolveAction } from '../lib/registry.mjs';
import { EXIT, emit } from './shared.mjs';

const VSCODE_TASKS = JSON.stringify({
  version: '2.0.0',
  tasks: [
    { label: 'EOS: Next', type: 'shell', command: 'node .github/eos/eos.mjs next', problemMatcher: [], presentation: { reveal: 'always', panel: 'dedicated' } },
    { label: 'EOS: Resume', type: 'shell', command: 'node .github/eos/eos.mjs resume', problemMatcher: [], presentation: { reveal: 'always', panel: 'dedicated' } },
    { label: 'EOS: Verify Current Gate', type: 'shell', command: 'node .github/eos/eos.mjs check --gate ${input:eosGate} --scope ${input:eosScope}', problemMatcher: [] },
    { label: 'EOS: Release Status', type: 'shell', command: 'node .github/eos/eos.mjs release-status', problemMatcher: [] },
    { label: 'EOS: Doctor', type: 'shell', command: 'node .github/eos/eos.mjs doctor', problemMatcher: [] },
  ],
  inputs: [
    { id: 'eosGate', type: 'promptString', description: 'Gate id (activation | prd-ready | story-ready | verified | release-ready)', default: 'story-ready' },
    { id: 'eosScope', type: 'promptString', description: 'Scope id (for example STORY-012)', default: 'product' },
  ],
}, null, 2) + '\n';

export const maintenanceCommands = {
  /**
   * Regenerate every document that restates the machine-readable policy — and, with --check, fail
   * when a committed one no longer matches what the policy would produce.
   *
   * The same rule used to live in `.eos/gates.json`, in `docs/`, in the prompts and in the agent
   * definitions, with nothing keeping them in step. Prose drifts from the engine one edit at a
   * time, and the drift is only ever found by someone who acted on documentation that had quietly
   * stopped being true. Generation makes the policy the only authority; --check makes CI enforce it.
   */
  docs(snapshot, flags) {
    if (!snapshot.gates || !snapshot.workflow) {
      console.log('EOS docs — .eos/gates.json and .eos/workflow.json must both be readable to generate from them.');
      return EXIT.ERROR;
    }
    const generated = generateDocs(snapshot);
    const rows = [];
    for (const [rel, body] of Object.entries(generated)) {
      const full = join(snapshot.root, rel);
      const before = existsSync(full) ? readFileSync(full, 'utf8') : null;
      const drifted = before !== body;
      if (drifted && flags.write) { mkdirSync(dirname(full), { recursive: true }); writeFileAtomic(full, body); }
      rows.push({ path: rel, present: before !== null, drifted, action: drifted ? (flags.write ? 'written' : 'would write') : 'up to date' });
    }
    const drift = rows.filter((r) => r.drifted);
    const json = { generated: rows, drifted: drift.length, mode: flags.write ? 'write' : flags.check ? 'check' : 'plan' };
    const lines = ['EOS docs · generated from the machine-readable policy', ''];
    for (const r of rows) lines.push(`  ${r.action.padEnd(12)} ${r.path}`);
    lines.push('');
    if (flags.check && drift.length) {
      lines.push(`  ${drift.length} generated file(s) no longer match the policy they are generated from.`,
        '  Run `node .github/eos/eos.mjs docs --write` and commit the result, in the same change that',
        '  altered the policy — documentation that describes a rule the engine no longer applies is',
        '  worse than no documentation, because people act on it.', '', 'FAIL', '');
      emit(flags, json, lines.join('\n'));
      return EXIT.FAIL;
    }
    if (!flags.write && !flags.check) lines.push('  Nothing was written. Re-run with --write to apply, or --check to fail on drift.', '');
    lines.push(flags.check ? 'PASS' : '', '');
    emit(flags, json, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Where every governance file stands relative to this engine, and what it would take to bring
   * them into line.
   *
   * `schemaVersion` was being written into every governance file and read by nothing, which made it
   * decoration rather than a contract. This reads it.
   */
  migrate(snapshot, flags) {
    const plan = flags.apply ? applyMigration(snapshot.root) : planMigration(snapshot.root);
    const json = {
      schemaVersion: 1,
      mode: flags.apply ? 'apply' : 'plan',
      files: plan.files,
      changes: plan.changes.map(({ after, ...rest }) => rest),
      blocked: plan.blocked,
      written: plan.written || [],
      ok: plan.ok,
    };
    const lines = ['EOS migrate · governance file versions', ''];
    for (const f of plan.files) lines.push(`  ${f.state.padEnd(12)} ${f.path.padEnd(26)} ${f.detail}`);
    lines.push('');
    if (plan.blocked.length) {
      lines.push('Blocked');
      for (const b of plan.blocked) lines.push(`  ${b.path} — ${b.reason}`);
      lines.push('', '  Nothing was migrated. A file this engine cannot fully understand is never rewritten',
        '  by it: an old engine reinterpreting a newer file is how governance state gets silently',
        '  corrupted. Upgrade EOS instead.', '', 'FAIL', '');
      emit(flags, json, lines.join('\n'));
      return EXIT.FAIL;
    }
    if (!plan.changes.length) {
      lines.push('  Every governance file matches the version this engine writes. Nothing to migrate.', '', 'PASS', '');
      emit(flags, json, lines.join('\n'));
      return EXIT.OK;
    }
    lines.push(flags.apply ? 'Applied' : 'Would change (review this before --apply)');
    for (const c of plan.changes) {
      lines.push(`  ${c.path}  schemaVersion ${c.from} → ${c.to}  [${c.steps.join(', ')}]`);
      for (const d of c.diff.slice(0, 20)) lines.push(`      ${d}`);
      if (c.diff.length > 20) lines.push(`      … and ${c.diff.length - 20} more change(s)`);
    }
    lines.push('');
    if (!flags.apply) lines.push('  Nothing was written. Re-run with --apply once the diff above is what you expect.', '');
    lines.push('PASS', '');
    emit(flags, json, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Generate or verify the software bill of materials.
   *
   * An SBOM nobody can tie to a build is a document, not evidence, so the generated file binds the
   * commit, the product-tree digest and the lockfile digests. That makes it invalidatable by the
   * same rules as gate evidence: change what it describes, and it stops describing it.
   */
  sbom(snapshot, flags) {
    const { sbom, notes } = buildSbom(snapshot);
    const full = join(snapshot.root, SBOM_PATH);
    if (flags.check) {
      const fresh = sbomFreshness(snapshot);
      const json = { path: SBOM_PATH, status: fresh.status, reasons: fresh.reasons, components: sbom.components.length };
      const lines = [`EOS sbom · ${fresh.status}`, ''];
      for (const r of fresh.reasons) lines.push(`  ${r}`);
      if (fresh.status === 'FRESH') lines.push(`  ${SBOM_PATH} describes the current tree (${sbom.components.length} component(s))`);
      lines.push('', fresh.status === 'FRESH' ? 'PASS' : 'FAIL', '');
      emit(flags, json, lines.join('\n'));
      return fresh.status === 'FRESH' ? EXIT.OK : EXIT.FAIL;
    }
    const body = `${JSON.stringify(sbom, null, 2)}\n`;
    const changed = !existsSync(full) || readFileSync(full, 'utf8') !== body;
    if (flags.write && changed) writeFileAtomic(full, body);
    const json = { path: SBOM_PATH, written: !!(flags.write && changed), components: sbom.components.length, notes, digest: sbomDigest(sbom) };
    const lines = [`EOS sbom · ${sbom.components.length} component(s)`, '',
      `  ${flags.write ? (changed ? 'written' : 'up to date') : 'would write'}  ${SBOM_PATH}`,
      `  bound to    commit ${snapshot.commit ? snapshot.commit.slice(0, 8) : '(no git)'} · tree ${(sbom.metadata.properties.find((p) => p.name === 'eos:productTreeDigest')?.value || '').slice(0, 12)}`, ''];
    // Anything that could NOT be resolved has to be loud: an unexplained short component list reads
    // as "clean" when it actually means "unknown".
    if (notes.length) { lines.push('Not resolved'); for (const n of notes) lines.push(`  ${n}`); lines.push(''); }
    if (!flags.write) lines.push('  Nothing was written. Re-run with --write to apply, or --check to verify freshness.', '');
    emit(flags, json, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Scaffold the project DECLARATION for a known shape of project.
   *
   * Deliberately not an application skeleton: EOS does not scaffold product code, and a
   * half-maintained app template inside a governance repository rots faster than anything else in
   * it. What a newcomer actually gets wrong is the declaration — an `application` with no
   * `commands.test`, or a `config-only` that should not be one — and both of those are silent.
   *
   * Never overwrites. A declaration that already exists is the project's own decision.
   */
  new(snapshot, flags) {
    const id = flags._[1];
    if (!id) {
      const lines = ['EOS starter packs', '', '  Each pack writes a correct .eos/project.json for a known shape of project.', '  It does NOT scaffold application code — use your ecosystem\'s own tool for that.', ''];
      for (const packId of packIds()) lines.push(`  ${packId.padEnd(16)} ${PACKS[packId].title}`);
      lines.push('', '  node .github/eos/eos.mjs new <pack> --write', '');
      emit(flags, { packs: packIds().map((p) => ({ id: p, title: PACKS[p].title })) }, lines.join('\n'));
      return EXIT.OK;
    }
    const declaration = packDeclaration(id);
    if (!declaration) {
      console.log(`unknown pack "${id}" — known packs: ${packIds().join(', ')}`);
      return EXIT.FAIL;
    }
    const rel = '.eos/project.json';
    const full = join(snapshot.root, rel);
    const exists = existsSync(full);
    const body = `${JSON.stringify(declaration, null, 2)}\n`;

    const lines = [`EOS new · ${id} — ${PACKS[id].title}`, ''];
    if (exists) {
      lines.push(`  refused  ${rel} already exists.`,
        '  A project declaration is a decision this project has already made; overwriting it would',
        '  silently change which gates apply. Edit it by hand, or delete it first if you meant to',
        '  start over.', '');
      emit(flags, { pack: id, written: false, reason: 'declaration already exists', declaration }, lines.join('\n'));
      return EXIT.FAIL;
    }
    if (flags.write) { mkdirSync(dirname(full), { recursive: true }); writeFileAtomic(full, body); }
    lines.push(`  ${flags.write ? 'written' : 'would write'}  ${rel}`, '',
      `  projectType      ${declaration.projectType}`,
      `  stacks           ${declaration.stacks.join(', ')}`,
      `  paradigms        ${declaration.productParadigms.join(', ')}`,
      `  workflowProfile  ${declaration.workflowProfile}${declaration.complianceProfile ? `\n  complianceProfile ${declaration.complianceProfile}` : ''}`,
      `  commands         ${Object.entries(declaration.commands).map(([k, v]) => `${k}: ${v}`).join('\n                   ')}`, '');
    if (PACKS[id].notes.length) { lines.push('Before you rely on this'); for (const n of PACKS[id].notes) lines.push(`  · ${n}`); lines.push(''); }
    lines.push('Next',
      '  1. Replace the commands above with what CI actually runs — an unrunnable command fails closed.',
      '  2. node .github/eos/eos.mjs stack sync --write   (put the stack in the always-on rule)',
      '  3. node .github/eos/eos.mjs next                 (start the guided loop)', '');
    if (!flags.write) lines.push('  Nothing was written. Re-run with --write to apply.', '');
    emit(flags, { pack: id, written: !!flags.write, declaration, notes: PACKS[id].notes }, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Policy integrity: no gate gets weaker without a reason and a second person's sign-off.
   *
   *   policy diff  [--against <ref>]                   every change since the base, classified
   *   policy lock  [--against <ref>] [--write] [--reason "<why>"]
   *   policy check [--against <ref>]                   the CI gate (default subcommand)
   */
  policy(snapshot, flags) {
    const sub = flags._[1] || 'check';
    const against = typeof flags.against === 'string' ? flags.against : null;
    const KIND_ORDER = { WEAKENING: 0, REVIEW: 1, STRENGTHENING: 2, INFO: 3 };
    const listChanges = (changes) => [...changes]
      .sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind])
      .map((c) => `  ${c.kind.padEnd(13)} ${c.id}\n                ${c.detail}`);

    if (sub === 'diff') {
      const { base, changes, errors } = policyChanges(snapshot.root, against);
      const lines = [`EOS policy diff · against ${base ? base.label : '(nothing to compare with)'}`, ''];
      if (!changes.length) lines.push('  no policy change');
      lines.push(...listChanges(changes), '', ...errors.map((e) => `  ERROR ${e}`));
      const needing = changes.filter((c) => c.requiresAck).length;
      if (needing) lines.push(`  ${needing} change(s) need acknowledgement: \`eos policy lock --write --reason "<why>"\`, then a second person fills in "approver".`, '');
      emit(flags, { base, changes, errors }, lines.join('\n'));
      return errors.length ? EXIT.ERROR : EXIT.OK;
    }

    if (sub === 'lock') {
      const actor = process.env.EOS_ACTOR || process.env.USER || process.env.USERNAME || 'unknown';
      const reason = typeof flags.reason === 'string' ? flags.reason : null;
      const plan = planLock(snapshot.root, { against, reason, actor, write: !!flags.write });
      const lines = [`EOS policy lock · against ${plan.base ? plan.base.label : '(nothing to compare with)'}`, ''];
      lines.push(...listChanges(plan.changes.filter((c) => c.requiresAck)));
      if (!plan.changes.some((c) => c.requiresAck)) lines.push('  no change needs acknowledgement');
      lines.push('', `  digest  ${plan.lock.policyDigest.slice(0, 16)}…`, ...plan.errors.map((e) => `  ERROR ${e}`));
      if (plan.refused) {
        lines.push('', `  REFUSED — ${plan.refused}`, '');
        emit(flags, { ...plan, written: false }, lines.join('\n'));
        return EXIT.FAIL;
      }
      if (plan.drafted.length) {
        lines.push('', `  ${plan.drafted.length} acknowledgement(s) drafted with an EMPTY approver. A second person must fill in`,
          `  "approver" in ${POLICY_LOCK_PATH} and commit it; until then \`eos policy check\` fails.`);
      }
      lines.push('', plan.written ? `  written ${POLICY_LOCK_PATH}` : '  Nothing was written. Re-run with --write to apply.', '');
      emit(flags, plan, lines.join('\n'));
      return plan.errors.length ? EXIT.ERROR : EXIT.OK;
    }

    if (sub === 'check') {
      const r = checkPolicy(snapshot.root, { against });
      const lines = [`EOS policy check · against ${r.base ? r.base.label : '(nothing to compare with)'}`, ''];
      const shown = r.changes.filter((c) => c.requiresAck);
      lines.push(shown.length ? `  ${shown.length} change(s) needing acknowledgement, ${r.changes.length - shown.length} other change(s)` : `  ${r.changes.length} policy change(s), none weakening`);
      for (const n of r.notes) lines.push(`  NOTE  ${n}`);
      for (const p of r.problems) lines.push(`  ERROR ${p}`);
      lines.push('', r.ok ? 'PASS' : 'FAIL', '');
      emit(flags, r, lines.join('\n'));
      return r.ok ? EXIT.OK : EXIT.FAIL;
    }

    console.log(`unknown policy subcommand "${sub}" — use diff, lock or check`);
    return EXIT.FAIL;
  },

  init(snapshot, flags) {
    const planned = [
      { path: '.vscode/tasks.json', body: VSCODE_TASKS },
      { path: '.eos/local/.gitkeep', body: '' },
    ];
    const lines = ['EOS init', ''];
    let created = 0;
    for (const f of planned) {
      const full = join(snapshot.root, f.path);
      if (existsSync(full)) { lines.push(`  kept    ${f.path} (already exists — never overwritten)`); continue; }
      if (!flags.write) { lines.push(`  would create ${f.path}`); continue; }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, f.body, 'utf8');
      created++;
      lines.push(`  created ${f.path}`);
    }
    if (!flags.write) lines.push('', '  Nothing was written. Re-run with --write to create the missing files.');
    lines.push('', '  Next: node .github/eos/eos.mjs next', '');
    emit(flags, { wrote: flags.write ? created : 0, planned: planned.map((p) => p.path) }, lines.join('\n'));
    return EXIT.OK;
  },

  /**
   * Put the locked stack where agents actually read it. G4 and S14 can only say the workspace rule
   * is wrong; this is the one command that makes it right, deterministically, from the declaration
   * CI already executes — so the prose cannot drift from the commands.
   */
  stack(snapshot, flags) {
    const sub = flags._[1];
    if (sub !== 'sync') {
      console.log(`unknown "stack" subcommand ${sub ? `"${sub}"` : '(missing)'} — expected: stack sync [--write]`);
      return EXIT.ERROR;
    }
    const r = syncWorkspaceRule(snapshot.root, snapshot.project, { write: !!flags.write });
    const lines = ['EOS stack sync', ''];
    if (!r.ok) {
      lines.push(`  BLOCKED  ${r.reason}`, '',
        '  This command states what the project declared; it does not guess a stack.', '');
      emit(flags, { ok: false, reason: r.reason, changed: false }, lines.join('\n'));
      return EXIT.BLOCKED;
    }
    const origin = r.source === 'declared-commands'
      ? '.eos/project.json commands (what CI actually runs)'
      : 'stack presets — no commands declared yet, so these are defaults to replace once code lands';
    lines.push(`  source  ${origin}`, `  line    ${r.line}`, '');
    if (!r.changed) {
      lines.push(`  kept    ${r.path} already states this`, '');
    } else if (flags.write) {
      lines.push(`  updated ${r.path}`, '',
        '  Re-run the gate so the recorded result describes this file:',
        '    node .github/eos/eos.mjs check --gate architecture-ready', '');
    } else {
      lines.push(`  would update ${r.path}`, '', '  Nothing was written. Re-run with --write to apply.', '');
    }
    emit(flags, { ok: true, changed: r.changed, wrote: !!(flags.write && r.changed), line: r.line, source: r.source, path: r.path }, lines.join('\n'));
    return EXIT.OK;
  },

  doctor(snapshot, flags) {    const problems = [];
    const notes = [];
    for (const e of snapshot.errors) problems.push({ level: 'ERROR', detail: e });
    for (const e of snapshot.agentMapErrors) problems.push({ level: 'ERROR', detail: e });
    if (!snapshot.workflow) problems.push({ level: 'BLOCKED', detail: '.eos/workflow.json is missing — run `eos init --write` or copy it from the EOS template' });
    if (!snapshot.gates) problems.push({ level: 'BLOCKED', detail: '.eos/gates.json is missing' });
    if (snapshot.agentMap) {
      for (const id of Object.keys(snapshot.agentMap.actions)) {
        const r = resolveAction(snapshot.root, snapshot.agentMap, id);
        if (r.blocked) problems.push({ level: 'BLOCKED', detail: r.blocked });
      }
      const referenced = new Set(Object.keys(snapshot.agentMap.actions));
      for (const id of ['fix-eos-configuration', 'complete-local-activation', 'start-next-change']) {
        if (!referenced.has(id)) notes.push(`action "${id}" has no entry in .eos/agent-map.json — the built-in fallback will be used`);
      }
    }
    const { errors: waiverErrors } = loadWaivers(snapshot.root);
    for (const e of waiverErrors) problems.push({ level: 'ERROR', detail: e });
    // A policy edited after it was locked is exactly the drift the lock exists to catch. Doctor does
    // not compare with a base branch (that is `eos policy check`); it only says the pin is stale.
    const policyLock = readLock(snapshot.root);
    for (const e of policyLock.errors) problems.push({ level: 'ERROR', detail: e });
    if (policyLock.lock && policyLock.lock.policyDigest !== policyDigest(policySnapshot(readPolicy(snapshot.root).files))) {
      problems.push({ level: 'ERROR', detail: `the policy changed since ${POLICY_LOCK_PATH} was written — run \`eos policy lock\` to see what changed` });
    }
    // A gate run that stopped between its ledger entry and its evidence. BLOCKED, not ERROR: nothing
    // is corrupt and nobody tampered with anything — one re-run completes it.
    const intent = readIntent(snapshot.root);
    if (intent.present && intent.interrupted) problems.push({ level: 'BLOCKED', detail: intent.detail });
    if (intent.present && !intent.interrupted) notes.push(intent.detail);
    // Doctor's verdict covers EOS's own wiring. Saying so matters most when it is green: a PASS
    // here has never meant "the product is tested", and on a config-only repository nothing about
    // a product is executed at all. [audit: config-only false PASS]
    if (!snapshot.projectPresent) {
      notes.push('NO PRODUCT CODE VERIFIED — there is no .eos/project.json, so no test/lint/eval command runs. This verdict covers EOS configuration only.');
    } else if (snapshot.project?.projectType === 'config-only') {
      notes.push('NO PRODUCT CODE VERIFIED — .eos/project.json declares "config-only". This verdict covers EOS configuration only; declare "application" (or "library") with commands.test when code lands.');
    }
    for (const { file, evidence } of listEvidence(snapshot.root)) {
      if (!evidence) { problems.push({ level: 'ERROR', detail: `${file}: unreadable evidence` }); continue; }
      const shape = validateEvidenceShape(snapshot.root, evidence);
      if (shape) { problems.push({ level: 'ERROR', detail: `${file}: ${shape}` }); continue; }
      // A hand-edited evidence file is the most valuable thing to forge, so doctor says so loudly
      // instead of leaving it to be discovered at the transition that it would have granted.
      for (const t of evidenceIntegrity(snapshot, evidence)) problems.push({ level: 'ERROR', detail: `${file}: ${t}` });
      const def = snapshot.gates?.gates.find((g) => g.id === evidence.gate);
      const f = evidenceFreshness(snapshot.root, evidence, {
        gateDefinition: def,
        expectedInputs: gateInputs(snapshot, evidence.gate, evidence.scope.type, evidence.scope.id),
        collections: gateCollections(snapshot, evidence.gate, evidence.scope.type, evidence.scope.id),
      });
      if (f.status === 'STALE') notes.push(`${file} is STALE: ${f.reasons[0]}`);
    }
    const { chain } = readLedgerSnapshot(snapshot.root);
    for (const p of chain.problems) problems.push({ level: 'ERROR', detail: `ledger: ${p}` });
    // An unverifiable ledger is BLOCKED, not a note: "PASS (1 note)" would be the same
    // absence-of-proof-as-proof that this layer exists to refuse.
    for (const w of chain.warnings) problems.push({ level: 'BLOCKED', detail: `ledger: ${w}` });
    if (!chain.problems.length) {
      for (const c of transitionConflicts(snapshot.events, snapshot.workflow)) {
        problems.push({ level: 'BLOCKED', detail: `ledger: ${c.scope.id} was moved on two branches at once (seq ${c.seq} starts from ${c.recordedFrom}, the history was in ${c.derived}) — run \`eos ledger --resolve --write\`` });
      }
    }

    const lines = ['EOS doctor', ''];
    for (const n of notes) lines.push(`  NOTE    ${n}`);
    for (const p of problems) lines.push(`  ${p.level.padEnd(7)} ${p.detail}`);
    lines.push('', problems.length ? `FAIL: ${problems.length} problem(s)` : `PASS${notes.length ? ` (${notes.length} note(s))` : ''}`, '');
    emit(flags, { ok: problems.length === 0, problems, notes }, lines.join('\n'));
    return problems.length ? (problems.some((p) => p.level === 'ERROR' && !p.detail.startsWith('ledger')) ? EXIT.BLOCKED : EXIT.BLOCKED) : EXIT.OK;
  },
};
