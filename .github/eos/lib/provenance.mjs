// Provenance statements, read offline (ADR-012).
//
// SLSA provenance and GitHub artifact attestations are in-toto Statements. They come wrapped in a
// DSSE envelope, inside a Sigstore bundle, or as JSON Lines of either. This reads the SUBJECTS:
// which artifact digests the provenance is about. That is enough to prove the provenance is about
// what this release ships. It is NOT enough to prove the provenance is genuine: that needs the
// signer's certificate chain and the transparency log, which is what `gh attestation verify` (the
// github-attestation provider adapter) checks. EOS Core stays offline and says so.

function statementOf(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (Array.isArray(doc.subject)) return doc;
  const envelope = doc.dsseEnvelope || (doc.payload && doc.payloadType ? doc : null);
  if (envelope?.payload) {
    try { return statementOf(JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'))); } catch { return null; }
  }
  return null;
}

/**
 * Every subject named by a provenance file (JSON, or JSON Lines).
 * @returns {{subjects: Array<{name:string, sha256:string}>, problems: string[]}}
 */
export function provenanceSubjects(text, label = 'provenance') {
  const subjects = [];
  const problems = [];
  const docs = [];
  const trimmed = text.trim();
  try { docs.push(JSON.parse(trimmed)); } catch {
    for (const [i, line] of trimmed.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try { docs.push(JSON.parse(line)); } catch { problems.push(`${label}: line ${i + 1} is not JSON`); }
    }
  }
  for (const doc of docs) {
    const statement = statementOf(doc);
    if (!statement) { problems.push(`${label}: an entry is neither an in-toto Statement, a DSSE envelope nor a Sigstore bundle`); continue; }
    for (const s of statement.subject) {
      const sha256 = s?.digest?.sha256;
      if (typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256)) subjects.push({ name: String(s.name ?? ''), sha256 });
    }
  }
  if (!docs.length && !problems.length) problems.push(`${label}: empty`);
  return { subjects, problems };
}
