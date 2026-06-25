// EOS guardrail — PreToolUse. Blocks destructive operations deterministically.
// Output conforms to the official VS Code PreToolUse schema (verified on 1.120.0).
let s = '';
process.stdin.on('data', (d) => (s += d));
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(s || '{}'); } catch { }
  const text = JSON.stringify(payload); // scans tool_name + tool_input
  const danger = [
    /rm\s+-rf\s+[\/~]/,        // rm -rf on absolute/home paths
    /DROP\s+TABLE/i,           // destructive SQL
    /git\s+push\s+--force/,    // force push
    /:\s*>\s*\//,              // truncate a root file
  ];
  if (danger.some((r) => r.test(text))) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Blocked by EOS guardrail: destructive operation detected.',
      },
    }));
  } else {
    process.stdout.write('{}');
  }
});
