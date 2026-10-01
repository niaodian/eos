// Breaking-change detection for EOS's own schemas.
//
// A schema that gets STRICTER rejects files that used to pass. For EOS that is a breaking change
// shipped to every project on its next upgrade: their discovery records, waivers or project
// declarations stop validating, and validation failure is an ERROR, never a PASS. A new required
// field is the obvious case; a removed enum value, a lower maximum or a property that is no longer
// allowed are the quiet ones.
//
// Each tightening must be either MIGRATED — the governed file's schemaVersion goes up and a
// registered migration carries old files forward — or ACKNOWLEDGED in the policy lock, with a reason
// and a second person, exactly like a weakened gate. Loosening a schema is never flagged: a file
// that passed before still passes.
//
// Conservative by design. Where the comparison cannot prove a change is safe (a different regex, a
// changed $ref) it reports a tightening. A false alarm costs one acknowledgement; a missed break costs
// every downstream project a red build it did not cause.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileAt, gitOut } from './git-base.mjs';
import { CURRENT_VERSIONS, MIGRATIONS } from './migrate.mjs';

const SCHEMA_DIR = '.eos/schemas';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const typesOf = (s) => (s.type === undefined ? null : [].concat(s.type));

/** Every way `b` can reject a document that `a` accepted, as human-readable locations. */
export function schemaTightenings(a, b, at = '$') {
  const out = [];
  if (!isObj(a) || !isObj(b)) {
    if (!same(a, b) && b !== true && b !== undefined) out.push(`${at}: replaced`);
    return out;
  }
  const ta = typesOf(a);
  const tb = typesOf(b);
  if (tb && (!ta || ta.some((t) => !tb.includes(t) && !(t === 'integer' && tb.includes('number'))))) {
    out.push(`${at}: type narrowed to ${tb.join('|')}`);
  }
  if (b.enum) {
    if (!a.enum) out.push(`${at}: now restricted to ${JSON.stringify(b.enum)}`);
    else {
      const removed = a.enum.filter((v) => !b.enum.some((w) => same(v, w)));
      if (removed.length) out.push(`${at}: no longer accepts ${removed.map((v) => JSON.stringify(v)).join(', ')}`);
    }
  }
  if ('const' in b && (!('const' in a) || !same(a.const, b.const))) out.push(`${at}: now must equal ${JSON.stringify(b.const)}`);
  const requiredBefore = new Set(a.required || []);
  for (const r of b.required || []) if (!requiredBefore.has(r)) out.push(`${at}: "${r}" is now required`);

  const openBefore = a.additionalProperties !== false;
  if (b.additionalProperties === false && openBefore) out.push(`${at}: unknown properties are now rejected`);
  else if (isObj(a.additionalProperties) && isObj(b.additionalProperties)) out.push(...schemaTightenings(a.additionalProperties, b.additionalProperties, `${at}.*`));
  else if ((a.additionalProperties === undefined || a.additionalProperties === true) && isObj(b.additionalProperties)) out.push(`${at}: extra properties are now constrained`);

  for (const [name, sa] of Object.entries(a.properties || {})) {
    const sb = b.properties?.[name];
    if (sb !== undefined) out.push(...schemaTightenings(sa, sb, `${at}.${name}`));
    else if (b.additionalProperties === false) out.push(`${at}: property "${name}" is no longer allowed`);
  }
  for (const name of Object.keys(b.properties || {})) {
    // A new property schema constrains values that were previously free — but only where unknown
    // properties used to be allowed. Under additionalProperties:false it is a pure loosening.
    if (!(a.properties && name in a.properties) && openBefore) out.push(`${at}: values of "${name}" are now constrained`);
  }
  for (const [pat, sa] of Object.entries(a.patternProperties || {})) {
    const sb = b.patternProperties?.[pat];
    if (sb !== undefined) out.push(...schemaTightenings(sa, sb, `${at}[/${pat}/]`));
    else if (b.additionalProperties === false) out.push(`${at}: keys matching /${pat}/ are no longer allowed`);
  }
  for (const pat of Object.keys(b.patternProperties || {})) {
    if (!(a.patternProperties && pat in a.patternProperties) && openBefore) out.push(`${at}: keys matching /${pat}/ are now constrained`);
  }

  if (a.items && b.items) out.push(...schemaTightenings(a.items, b.items, `${at}[]`));
  else if (!a.items && b.items) out.push(`${at}: array items are now constrained`);

  for (const k of ['minimum', 'minLength', 'minItems', 'minProperties']) {
    if (b[k] !== undefined && (a[k] === undefined || b[k] > a[k])) out.push(`${at}: ${k} raised to ${b[k]}`);
  }
  for (const k of ['maximum', 'maxLength', 'maxItems']) {
    if (b[k] !== undefined && (a[k] === undefined || b[k] < a[k])) out.push(`${at}: ${k} lowered to ${b[k]}`);
  }
  if (b.uniqueItems && !a.uniqueItems) out.push(`${at}: items must now be unique`);
  if (b.pattern !== undefined && b.pattern !== a.pattern) out.push(`${at}: pattern changed to /${b.pattern}/`);
  if (b.anyOf) {
    if (!a.anyOf) out.push(`${at}: now must match one of ${b.anyOf.length} alternatives`);
    else if (a.anyOf.some((x) => !b.anyOf.some((y) => same(x, y)))) out.push(`${at}: an accepted alternative was removed or changed`);
  }
  if (b.$ref !== undefined && b.$ref !== a.$ref) out.push(`${at}: now refers to ${b.$ref}`);
  for (const [name, da] of Object.entries(a.$defs || {})) {
    if (b.$defs?.[name] !== undefined) out.push(...schemaTightenings(da, b.$defs[name], `#/$defs/${name}`));
    else out.push(`#/$defs/${name}: removed`);
  }
  return out;
}

function schemaNamesAt(root, rev) {
  const out = gitOut(root, ['ls-tree', '--name-only', `${rev}:${SCHEMA_DIR}`]);
  return out === null ? [] : out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.json'));
}

/** Which versioned governance file each schema governs, read from the files' own $schema. */
function governedBy(root) {
  const map = {};
  for (const rel of Object.keys(CURRENT_VERSIONS)) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    try {
      const ref = JSON.parse(readFileSync(full, 'utf8')).$schema;
      if (typeof ref === 'string') map[basename(ref)] = rel;
    } catch { /* an unreadable governed file is reported by migrate, not here */ }
  }
  return map;
}

const versionOf = (text) => { try { return JSON.parse(text).schemaVersion ?? null; } catch { return null; } };

/**
 * Schema changes between a revision and the working tree, in the shape policy.mjs reports.
 * A tightening becomes INFO when it ships with a schemaVersion bump AND a registered migration,
 * and BREAKING (needs acknowledgement) otherwise.
 */
export function schemaChanges(root, rev) {
  const changes = [];
  const dir = join(root, SCHEMA_DIR);
  if (!existsSync(dir)) return changes;
  const governed = governedBy(root);
  const before = new Set(schemaNamesAt(root, rev));
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    if (!before.has(name)) continue; // a new schema cannot reject anything that used to pass
    let a;
    let b;
    try {
      a = JSON.parse(fileAt(root, rev, `${SCHEMA_DIR}/${name}`));
      b = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch { continue; } // an unparseable schema is reported by every reader of it
    const tight = schemaTightenings(a, b);
    if (!tight.length) continue;
    const file = governed[name];
    let migrated = false;
    if (file) {
      const was = versionOf(fileAt(root, rev, file));
      const now = versionOf(existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null);
      migrated = was !== null && now !== null && now > was && typeof MIGRATIONS[file]?.[was] === 'function';
    }
    const summary = `${tight.slice(0, 3).join('; ')}${tight.length > 3 ? ` (+${tight.length - 3} more)` : ''}`;
    changes.push({
      kind: migrated ? 'INFO' : 'BREAKING',
      id: `schema-tightened:${name}`,
      detail: migrated
        ? `${name} is stricter, and ${file} ships a schemaVersion bump with a registered migration: ${summary}`
        : `${name} now rejects documents that used to pass — ${summary}. ${file
          ? `Bump ${file}'s schemaVersion and register a migration in lib/migrate.mjs, or acknowledge it.`
          : 'Nothing versions the documents it validates, so this must be acknowledged and called out in the upgrade guide.'}`,
      requiresAck: !migrated,
    });
  }
  return changes;
}
