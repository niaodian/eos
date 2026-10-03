// EOS commands — stage records: `eos stage init <stage>` writes the skeleton a stage gate reads. (P2-2)
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { STAGE_RECORDS, placeholdersIn } from '../lib/stage-record.mjs';
import { skeletonFor, setAt, coerce, DOC_TEMPLATES } from '../lib/stage-skeleton.mjs';
import { loadSchema, validate } from '../lib/schema.mjs';
import { EXIT, emit } from './shared.mjs';

const STAGES = Object.keys(STAGE_RECORDS);
const USAGE = `usage: node .github/eos/eos.mjs stage init <${STAGES.join('|')}> [--write] [--force] [--interactive] [--json]

  Writes the stage's machine record (docs/<stage>.json) from its schema — every required field, with
  a TODO(eos) placeholder where an answer belongs — and its document template, if they do not exist.
  The gate rejects a record that still holds a placeholder, so a skeleton never advances a stage.

  --interactive  ask for each answer now (also reads answers piped on stdin)
  --force        replace an existing record (a document is never overwritten)`;

async function ask(leaves, record) {
  const answer = (leaf, text) => { const v = coerce(text, leaf.node); if (v !== undefined) setAt(record, leaf.keys, v); };
  if (!process.stdin.isTTY) {
    // Piped answers, one per line in the order the fields are listed. Read them all first: readline
    // emits every buffered line at once, so asking one question at a time would drop the rest.
    const rl = createInterface({ input: process.stdin, terminal: false });
    const lines = [];
    for await (const line of rl) lines.push(line);
    leaves.forEach((leaf, i) => answer(leaf, lines[i]));
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const leaf of leaves) answer(leaf, await rl.question(`${leaf.path} (${leaf.hint}): `));
  } catch {
    // Ctrl-D / Ctrl-C ends the questions; what was answered is kept, the rest stays a placeholder.
  } finally {
    rl.close();
  }
}

export const stageCommands = {
  async stage(snapshot, flags) {
    const [, sub, kind] = flags._;
    if (sub !== 'init' || !STAGES.includes(kind)) {
      console.log(sub === 'init' ? `unknown stage "${kind ?? ''}" — choose ${STAGES.join(', ')}\n\n${USAGE}` : USAGE);
      return EXIT.FAIL;
    }
    const spec = STAGE_RECORDS[kind];
    const { schema, error } = loadSchema(snapshot.root, spec.schema);
    if (!schema) { console.log(`EOS ERROR — ${error}`); return EXIT.ERROR; }
    const { record, leaves } = skeletonFor(schema);
    if (flags.interactive) await ask(leaves, record);
    const left = placeholdersIn(record);
    // Answers given interactively are held to the schema now, not first at the gate.
    const invalid = left.length ? [] : validate(schema, record, { label: spec.path }).errors;
    const recordExists = existsSync(join(snapshot.root, spec.path));
    const docExists = existsSync(join(snapshot.root, spec.doc));
    const writeRecord = flags.write && (!recordExists || flags.force) && !invalid.length;
    const writeDoc = flags.write && !docExists && DOC_TEMPLATES[kind];
    if (writeRecord) {
      mkdirSync(dirname(join(snapshot.root, spec.path)), { recursive: true });
      writeFileSync(join(snapshot.root, spec.path), `${JSON.stringify({ $schema: `../.eos/schemas/${spec.schema}`, ...record }, null, 2)}\n`);
    }
    if (writeDoc) {
      mkdirSync(dirname(join(snapshot.root, spec.doc)), { recursive: true });
      writeFileSync(join(snapshot.root, spec.doc), `${DOC_TEMPLATES[kind].join('\n')}\n`);
    }
    const recordAction = recordExists && !flags.force ? 'kept (exists — --force replaces it)'
      : invalid.length ? 'not written — the answers do not match the schema'
        : writeRecord ? (recordExists ? 'replaced' : 'written') : 'would write';
    const docAction = docExists ? 'kept (exists)' : writeDoc ? 'written' : DOC_TEMPLATES[kind] ? 'would write' : '—';
    const lines = [`EOS stage init · ${kind}`, '',
      `  ${spec.path.padEnd(26)} ${recordAction}`,
      `  ${spec.doc.padEnd(26)} ${docAction}`, ''];
    for (const e of invalid) lines.push(`  ERROR ${e}`);
    if (left.length) {
      lines.push(`  ${left.length} answer(s) to give — the gate rejects the record until each TODO(eos) is replaced:`);
      for (const p of left) lines.push(`    · ${p}`);
      lines.push('');
    }
    lines.push(`  Then: node .github/eos/eos.mjs check --gate ${{ discovery: 'discovery-ready', requirements: 'requirements-ready', design: 'ux-ready', architecture: 'architecture-ready', telemetry: 'telemetry-ready', iteration: 'iteration-ready' }[kind]}${kind === 'iteration' ? ' --scope <release>' : ''}`, '');
    if (!flags.write) lines.push('  Nothing was written. Re-run with --write to apply.', '');
    emit(flags, { stage: kind, record: spec.path, doc: spec.doc, recordAction, docAction, placeholders: left, errors: invalid, skeleton: record }, lines.join('\n'));
    return invalid.length ? EXIT.FAIL : EXIT.OK;
  },
};
