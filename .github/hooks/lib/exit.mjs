// Exit only after stdout and stderr have flushed.
//
// When stdout is a pipe, Node writes to it asynchronously on macOS and Windows; only Linux pipes are
// synchronous. process.exit() straight after a large write therefore discards whatever is still
// queued. On Node 20 / macOS a `verify-release --json` document arrived cut off at exactly 8192
// bytes: still text, no longer JSON, and indistinguishable from a CLI that printed garbage. Any
// consumer that pipes EOS output — a script, a CI step, an editor view — would have read it.

/** Set the exit code, then exit once both streams have drained. */
export function exitAfterFlush(code) {
  process.exitCode = code;
  let open = 2;
  const flushed = () => { if (--open === 0) process.exit(code); };
  // An empty write is queued behind everything already buffered, so its callback means "flushed".
  // It also fires with an error when the reader has gone away (EPIPE), which is just as final.
  process.stdout.write('', flushed);
  process.stderr.write('', flushed);
  // A stream that never calls back must not keep the CLI alive. Unref'd: if nothing else holds the
  // event loop open the process ends on its own, with the exit code set above.
  setTimeout(() => process.exit(code), 5000).unref();
}
