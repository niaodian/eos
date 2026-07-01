// EOS guardrail — PreToolUse. Blocks destructive + supply-chain-poison + secret-leak ops.
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
    // Supply-chain poisoning: piping a remote script straight into a shell.
    /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba)?sh/i,
    // Disabling install-script / integrity safety.
    /\bnpm\s+(i|install|ci)\b[^\n]*--(unsafe-perm|no-verify)/i,
    /\bpip\s+install\b[^\n]*--(trusted-host|index-url\s+http:)/i,
    // Hardcoded secret literals (block before they get written/committed).
    /sk-[A-Za-z0-9]{16,}/,                 // OpenAI-style key
    /AKIA[0-9A-Z]{16}/,                    // AWS access key id
    /gh[pousr]_[A-Za-z0-9]{20,}/,          // GitHub token
    /-----BEGIN\s+(RSA|EC|OPENSSH|PRIVATE)/, // private key block
    /(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{6,}["']/i,
  ];
  if (danger.some((r) => r.test(text))) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Blocked by EOS guardrail: destructive / supply-chain-poison / secret-leak operation detected. Use env vars or a secret store; never hardcode secrets or pipe remote scripts to a shell.',
      },
    }));
  } else {
    process.stdout.write('{}');
  }
});
