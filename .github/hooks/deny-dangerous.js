// EOS guardrail — PreToolUse. A LOCAL "speed bump" that denies obvious destructive +
// supply-chain-poison + secret-leak ops before a tool runs. Output conforms to the official
// VS Code PreToolUse hookSpecificOutput schema (docs/agents/reference/hooks-reference.md).
// HONEST SCOPE: hooks are a VS Code *Preview* feature (format/behavior may change — re-verify on
// your version); this is a per-machine denylist that fails OPEN on parse error and is NOT run in
// CI. It is defense-in-depth, NOT the authority. The authoritative gates are the CI hard checks
// (validate-config / eos-doctor / secret-scan) + branch protection + human review. [audit G1/G2]
let s = '';
process.stdin.on('data', (d) => (s += d));
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(s || '{}'); } catch { }
  const text = JSON.stringify(payload); // scans tool_name + tool_input
  const danger = [
    /\brm\s+(-[a-z]*[rf]|--(?:recursive|force))/i, // rm -rf/-fr/-r/-f/-R (any order) + long flags
    /\bfind\b[^\n]*-delete/i,  // mass delete via find
    /DROP\s+TABLE/i,           // destructive SQL
    /\bgit\s+push\b[^\n]*\s(-f|--force)(?![\w-])/, // force push (blocks --force/-f; ALLOWS the safer --force-with-lease)
    /\bgit\s+reset\s+--hard\b/, // discard local work
    /:\s*>\s*\//,              // truncate a root file
    /\bdd\s+if=/i,             // raw disk overwrite
    /\bmkfs\b|>\s*\/dev\/sd[a-z]/i, // format / write to a block device
    /\bchmod\s+-?R?\s*777\b/i, // world-writable
    // Supply-chain poisoning: piping a remote script straight into a shell / interpreter.
    /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba|z|k|c)?sh/i,
    /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b/i,
    /base64\s+-d[^\n]*\|\s*(sudo\s+)?(ba|z)?sh/i,
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
