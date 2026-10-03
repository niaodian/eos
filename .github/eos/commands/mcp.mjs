// eos mcp — EOS's read and verify commands as Model Context Protocol tools, on stdio. (ADR-018)
import { serve } from '../lib/mcp.mjs';
import { EXIT } from './shared.mjs';

export const mcpCommands = {
  /** From here on stdout belongs to the protocol. Runs until the client closes stdin or stops it. */
  async mcp(snapshot) {
    const stop = new AbortController();
    const onSignal = () => stop.abort();
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    await serve({ cwd: snapshot.root, signal: stop.signal });
    return EXIT.OK;
  },
};
