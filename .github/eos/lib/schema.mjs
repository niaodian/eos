// Minimal JSON-Schema subset validator — zero external deps, deterministic error strings.
//
// WHY NOT AJV: EOS is a zero-dependency, local-first template. Pulling a validator in would add a
// lockfile, a supply-chain surface and an install step to a repo whose whole point is that it runs
// offline with nothing but Node. The subset below is exactly what `.eos/schemas/*` use:
// type · enum · const · required · properties · additionalProperties · patternProperties ·
// minProperties · items · minItems/maxItems · uniqueItems · minLength/maxLength · minimum/maximum ·
// pattern · anyOf · $ref (#/$defs).
// Anything a schema uses that is NOT implemented here is reported as an error rather than ignored,
// so a schema can never silently stop validating.
const KNOWN = new Set([
  '$schema', '$id', 'title', 'description', 'default', 'examples', '$defs',
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'patternProperties',
  'minProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'anyOf', '$ref',
]);

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function resolveRef(ref, rootSchema) {
  if (!ref.startsWith('#/')) return { error: `unsupported $ref "${ref}" (only local #/... refs)` };
  let node = rootSchema;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) return { error: `unresolvable $ref "${ref}"` };
  }
  return { schema: node };
}

function check(schema, data, path, rootSchema, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) { errors.push(`${path}: no value is allowed here`); return; }

  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) errors.push(`${path}: schema uses unsupported keyword "${key}"`);
  }

  if (schema.$ref) {
    const { schema: target, error } = resolveRef(schema.$ref, rootSchema);
    if (error) { errors.push(`${path}: ${error}`); return; }
    check(target, data, path, rootSchema, errors);
    return;
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
  }
  if (schema.enum && !schema.enum.some((v) => v === data)) {
    errors.push(`${path}: ${JSON.stringify(data)} is not one of ${schema.enum.map((v) => JSON.stringify(v)).join(' | ')}`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    const ok = types.some((t) => (t === 'integer' ? Number.isInteger(data) : t === actual));
    if (!ok) { errors.push(`${path}: expected type ${types.join('|')}, got ${actual}`); return; }
  }
  if (schema.anyOf) {
    const nested = schema.anyOf.map((s) => { const e = []; check(s, data, path, rootSchema, e); return e; });
    if (nested.every((e) => e.length)) errors.push(`${path}: does not match any allowed form (${nested.flat()[0]})`);
  }

  if (typeof data === 'string') {
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${path}: string longer than ${schema.maxLength}`);
    }
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path}: string shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(`${path}: ${JSON.stringify(data)} does not match /${schema.pattern}/`);
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${path}: < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${path}: > maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.uniqueItems === true) {
      // Duplicate membership is not a formatting nit: the same story listed twice in a release
      // manifest would be counted twice and verified once.
      const seen = new Set();
      for (const item of data) {
        const key = JSON.stringify(item);
        if (seen.has(key)) { errors.push(`${path}: duplicate entry ${key.slice(0, 60)}`); break; }
        seen.add(key);
      }
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${path}: expected at most ${schema.maxItems} item(s), got ${data.length}`);
    }
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.items) data.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, rootSchema, errors));
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of schema.required || []) {
      if (!(key in data)) errors.push(`${path}: missing required property "${key}"`);
    }
    if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) {
      errors.push(`${path}: needs at least ${schema.minProperties} propert(ies)`);
    }
    const patterns = Object.entries(schema.patternProperties || {});
    for (const [key, value] of Object.entries(data)) {
      const at = `${path}.${key}`;
      let matched = false;
      if (schema.properties && key in schema.properties) {
        matched = true;
        check(schema.properties[key], value, at, rootSchema, errors);
      }
      for (const [pattern, sub] of patterns) {
        if (new RegExp(pattern).test(key)) { matched = true; check(sub, value, at, rootSchema, errors); }
      }
      if (!matched && schema.additionalProperties === false) {
        errors.push(`${path}: unknown property "${key}"`);
      } else if (!matched && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        check(schema.additionalProperties, value, at, rootSchema, errors);
      }
    }
  }
}

/** @returns {{valid: boolean, errors: string[]}} */
export function validate(schema, data, { label = '$' } = {}) {
  const errors = [];
  try {
    check(schema, data, label, schema, errors);
  } catch (e) {
    // A validator that throws must be an ERROR, never an implicit pass.
    errors.push(`${label}: validator failure — ${e.message}`);
  }
  return { valid: errors.length === 0, errors };
}
