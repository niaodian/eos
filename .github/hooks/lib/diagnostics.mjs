// One diagnostic vocabulary for every EOS verdict (ADR-010).
//
// Gate results have carried a machine-readable diagnostic since 1.18 — rerunCommand, policySource,
// the artifacts a verdict is about. The hooks only ever printed English, so anything that consumed
// them had to read prose: the gate engine itself decided BLOCKED vs FAIL by searching
// project-gate's output for the word "BLOCKED", output that includes the product's own tests.
//
// With --json a hook writes one report to stdout that conforms to
// .eos/schemas/diagnostic.schema.json. Its problem items have the same shape `eos check --json`
// uses for a gate's failing checks.
//
// This lives in hooks/lib because the hooks are copied into projects and test sandboxes on their
// own: nothing here may import from .github/eos/.

export const DIAGNOSTIC_SCHEMA_PATH = '.eos/schemas/diagnostic.schema.json';

/**
 * Worst wins, in the gate engine's order (SEVERITY in .github/eos/lib/gate-primitives.mjs). A test
 * keeps the two equal; this cannot import that file (see above).
 */
export const REPORT_SEVERITY = { ERROR: 3, BLOCKED: 2, FAIL: 1, NOT_APPLICABLE: 0, PASS: 0 };

export const worstStatus = (statuses, fallback) =>
  statuses.reduce((acc, s) => ((REPORT_SEVERITY[s] ?? REPORT_SEVERITY.ERROR) > (REPORT_SEVERITY[acc] ?? 0) ? s : acc), fallback);

/** `D5 Compliance: …` → { code: 'D5', message: 'Compliance: …' }. A line without a code keeps it whole. */
export function splitCode(line) {
  const m = /^([A-Z][A-Z0-9]*[0-9])\s+([\s\S]+)$/.exec(line);
  return m ? { code: m[1], message: m[2] } : { code: null, message: line };
}

export const wantsJson = (argv = process.argv) => argv.includes('--json');

/**
 * Where human-readable lines go. With --json, stdout carries exactly one JSON document, so
 * everything a person would read moves to stderr: still in the CI log, never in the parser's way.
 */
export const humanOutput = (json) => (json ? (line) => process.stderr.write(`${line}\n`) : (line) => console.log(line));

export function writeReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
