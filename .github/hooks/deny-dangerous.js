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
// The hook DENIES, or — since eos-2.8.0, for a change to what judges a project — ASKS a person to
// confirm (copilot, claude, codex, qwen, cursor; every other platform gets a deny). On allow it prints
// `{}` (kiro: nothing), never a decision, because an explicit "allow" would skip the platform's own
// approval prompt. The governance rules (records, identity, protection, merges) are in
// ./lib/governance-rules.mjs.
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
// The one exception: a call that touches EOS's records (ledger, evidence, waivers, policy lock) fails
// CLOSED, so breaking the hook is not a way to write them.
const hookSpecific = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const hookAsk = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } });
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
// "A person confirms" (eos-2.8.0): where a platform has that dialect it is used; everywhere else the
// stricter answer, deny, stands — never a silent allow.
const ASK = { copilot: hookAsk, claude: hookAsk, codex: hookAsk, qwen: hookAsk, cursor: (reason) => ({ permission: 'ask', user_message: reason, agent_message: reason }) };
// The records only EOS's own commands write. Inline, so the hook still refuses to let them be written
// when its rule modules cannot be loaded at all: for these paths an internal error fails CLOSED.
const RECORDS = /\.eos[\\/]+(?:ledger|evidence|waivers)[\\/]|\.eos[\\/]+policy\.lock\.json/i;
const at = process.argv.indexOf('--format');
const format = at === -1 ? 'copilot' : process.argv[at + 1];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', async () => {
  let out = format === 'kiro' ? '' : '{}';
  const refuse = (reason) => {
    if (format === 'kiro') {
      process.stderr.write(`${reason}\n`);
      process.exitCode = 2;
    } else {
      out = JSON.stringify(DENY[format](reason));
    }
  };
  try {
    if (!Object.hasOwn(DENY, format)) throw new Error(`unknown --format "${format}" (expected ${Object.keys(DENY).join(', ')})`);
    const { evaluateToolCall } = await import('./lib/secret-rules.mjs');
    const verdict = evaluateToolCall(raw);
    if (verdict.decision === 'deny') refuse(verdict.reason);
    else if (verdict.decision === 'ask') {
      if (ASK[format]) out = JSON.stringify(ASK[format](verdict.reason));
      else refuse(verdict.reason);
    }
  } catch (e) {
    process.stderr.write(`EOS guardrail: internal error, this call was NOT checked (CI remains the authority): ${e && e.message ? e.message : e}\n`);
    if (RECORDS.test(raw) && Object.hasOwn(DENY, format)) refuse('Blocked by EOS guardrail: it could not check this call, and it touches a record only EOS\'s own commands write (.eos/ledger, evidence, waivers, policy.lock.json) — it fails closed for those.');
  }
  process.stdout.write(out);
});
