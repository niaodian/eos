// EOS commands — evidence: turn what a runner wrote into the machine summary a gate reads. (ADR-016)
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { findReports, importReports, junitPatterns } from '../lib/test-evidence.mjs';
import { SUMMARY_PATHS } from '../lib/machine-summary.mjs';
import { EXIT, emit } from './shared.mjs';

const USAGE = `usage: node .github/eos/eos.mjs evidence junit [<report.xml>…] [--write] [--json]

  Answers every docs/trace-matrix.md reference from JUnit XML reports and writes
  ${SUMMARY_PATHS.testRun} (dry run without --write). Without files, reads the reports
  matching "evidence.junit" in .eos/project.json.

  Use it when the tests ran in another step or job. When the verified gate runs the tests
  itself, declaring "evidence.junit" is enough: the gate does this conversion on every run.`;

const EXIT_OF = { WRITTEN: EXIT.OK, PLANNED: EXIT.OK, FAIL: EXIT.FAIL, SKIPPED: EXIT.FAIL, STALE: EXIT.BLOCKED, BLOCKED: EXIT.BLOCKED, ERROR: EXIT.ERROR };

export const evidenceCommands = {
  evidence(snapshot, flags) {
    const sub = flags._[1];
    if (sub !== 'junit') {
      console.log(sub ? `unknown evidence subcommand "${sub}"\n\n${USAGE}` : USAGE);
      return sub ? EXIT.ERROR : EXIT.FAIL;
    }
    let inputs = flags._.slice(2);
    if (!inputs.length) {
      const patterns = junitPatterns(snapshot.project);
      if (!patterns) {
        console.log(`No report given and .eos/project.json declares no "evidence.junit".\n\n${USAGE}`);
        return EXIT.FAIL;
      }
      const found = findReports(snapshot.root, patterns);
      if (found.error) { console.log(`EOS ERROR — ${found.error}`); return EXIT.ERROR; }
      inputs = found.files;
    }
    const r = importReports(snapshot.root, inputs, { project: snapshot.project, write: !!flags.write });
    const results = r.summary?.results || [];
    // Every reference answered is a PASS only when the run proved it; anything else is reported, and
    // still written, because a recorded failure is evidence too.
    const notPassing = results.filter((x) => x.status !== 'PASS');
    const status = ['WRITTEN', 'PLANNED'].includes(r.status) && notPassing.length ? 'FAIL' : r.status;
    const lines = [`EOS evidence junit · ${status}`, ''];
    for (const x of results) {
      lines.push(`  ${x.status.padEnd(5)} ${x.ac.padEnd(8)} ${x.testPath}${x.selector ? `::${x.selector}` : ''}${x.match === 'name' ? '   (matched by name)' : ''}`);
      if (x.status !== 'PASS') lines.push(`        ${x.detail}`);
    }
    if (results.length) lines.push('');
    lines.push(`  ${r.detail}`, '');
    if (r.status === 'WRITTEN') lines.push(r.unchanged ? `  kept ${SUMMARY_PATHS.testRun} — it already holds these results` : `  written ${SUMMARY_PATHS.testRun}`, '');
    if (r.status === 'PLANNED') lines.push('  Nothing was written. Re-run with --write to apply.', '');
    emit(flags, { status, reports: r.reports || inputs, written: r.status === 'WRITTEN' && !r.unchanged, unchanged: !!r.unchanged, detail: r.detail, results }, lines.join('\n'));
    return status === 'FAIL' ? EXIT.FAIL : EXIT_OF[r.status] ?? EXIT.ERROR;
  },
};
