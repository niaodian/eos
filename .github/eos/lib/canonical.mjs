// Stable JSON serialization: the same content always produces the same bytes, whatever the key
// order, indentation or line endings of the file it was read from. Policy digests and signatures
// are computed over this, never over raw file bytes. A CRLF checkout on Windows therefore cannot
// change a digest or break a signature.

/** Sorted keys at every level; `undefined` reads as null, as JSON.parse would never produce it. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
