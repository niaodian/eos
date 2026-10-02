// EOS guardrail — PreToolUse. A LOCAL "speed bump" that denies obvious destructive,
// supply-chain-poisoning and secret-leaking operations before a tool runs. Output conforms to the
// VS Code / Copilot PreToolUse hookSpecificOutput schema.
// HONEST SCOPE: hooks are a VS Code *Preview* feature (format and behavior may change, and differ
// per agent harness — re-verify on your version); this is a per-machine denylist and is NOT run in
// CI. It is defense in depth, NOT the authority: the authoritative gates are the CI hard checks
// (validate-config / eos-doctor / secret-scan) + branch protection + human review. [audit G1/G2]
//
// The rules live in ./lib/secret-rules.mjs, shared with secret-scan.mjs so the two cannot drift.
// Each field of the tool call is judged on its own: commands get the destructive-command rules,
// content written to a file gets the secret rules (and the command rules unless the file is
// documentation), prose and the old text an edit replaces are not treated as commands. A payload
// that is not JSON is scanned as raw text with every rule. An internal error in THIS hook fails
// OPEN, with a warning on stderr: a broken speed bump must not stop all work — CI still decides.
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', async () => {
  let out = '{}';
  try {
    const { evaluateToolCall } = await import('./lib/secret-rules.mjs');
    const verdict = evaluateToolCall(raw);
    if (verdict.decision === 'deny') {
      out = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      });
    }
  } catch (e) {
    process.stderr.write(`EOS guardrail: internal error, this call was NOT checked (CI remains the authority): ${e && e.message ? e.message : e}\n`);
  }
  process.stdout.write(out);
});
