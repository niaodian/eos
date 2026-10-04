// EOS guardrail — PreToolUse. A LOCAL "speed bump" that denies obvious destructive,
// supply-chain-poisoning and secret-leaking operations before a tool runs. By default the output
// conforms to the VS Code / Copilot PreToolUse hookSpecificOutput schema; `--format <platform>`
// speaks another agent's hook dialect (ADR-019) — the rules are the same for every platform.
//   copilot · claude · codex · qwen   {"hookSpecificOutput":{"permissionDecision":"deny",…}}
//   gemini · antigravity              {"decision":"deny","reason":…}
//   cursor                            {"permission":"deny","user_message":…,"agent_message":…}
//   devin                             {"decision":"block","reason":…}
//   cline                             {"cancel":true,"errorMessage":…}
//   kiro                              exit code 2, the reason on stderr
// The hook only ever DENIES. On allow it prints `{}` (kiro: nothing), never a decision, because an
// explicit "allow" would skip the platform's own approval prompt.
// HONEST SCOPE: hooks are a VS Code *Preview* feature (format and behavior may change, and differ
// per agent harness — re-verify on your version); this is a per-machine denylist and is NOT run in
// CI. It is defense in depth, NOT the authority: the authoritative gates are the CI hard checks
// (validate-config / eos-doctor / secret-scan) + branch protection + human review. [audit G1/G2]
//
// The rules live in ./lib/secret-rules.mjs, shared with secret-scan.mjs so the two cannot drift.
// Each field of the tool call is judged on its own: commands get the destructive-command rules, but
// only over what they EXECUTE (heredoc bodies, quoted arguments and comments are data); content
// written to a file gets the secret rules, and the command rules only when the file is a shell
// script, Makefile or Dockerfile; prose and the old text an edit replaces are not commands. A payload
// that is not JSON is scanned as raw text with every rule. An internal error in THIS hook fails
// OPEN, with a warning on stderr: a broken speed bump must not stop all work — CI still decides.
const hookSpecific = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const DENY = {
  copilot: hookSpecific,
  claude: hookSpecific,
  codex: hookSpecific,
  qwen: hookSpecific,
  gemini: (reason) => ({ decision: 'deny', reason }),
  antigravity: (reason) => ({ decision: 'deny', reason }),
  cursor: (reason) => ({ permission: 'deny', user_message: reason, agent_message: reason }),
  devin: (reason) => ({ decision: 'block', reason }),
  cline: (reason) => ({ cancel: true, errorMessage: reason }),
  kiro: null, // exit code 2
};
const at = process.argv.indexOf('--format');
const format = at === -1 ? 'copilot' : process.argv[at + 1];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', async () => {
  let out = format === 'kiro' ? '' : '{}';
  try {
    if (!Object.hasOwn(DENY, format)) throw new Error(`unknown --format "${format}" (expected ${Object.keys(DENY).join(', ')})`);
    const { evaluateToolCall } = await import('./lib/secret-rules.mjs');
    const verdict = evaluateToolCall(raw);
    if (verdict.decision === 'deny') {
      if (format === 'kiro') {
        process.stderr.write(`${verdict.reason}\n`);
        process.exitCode = 2;
      } else {
        out = JSON.stringify(DENY[format](verdict.reason));
      }
    }
  } catch (e) {
    process.stderr.write(`EOS guardrail: internal error, this call was NOT checked (CI remains the authority): ${e && e.message ? e.message : e}\n`);
  }
  process.stdout.write(out);
});
