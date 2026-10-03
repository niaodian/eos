// eos mcp — EOS's read and verify commands as Model Context Protocol tools, on stdio. (ADR-018)
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../lib/mcp.mjs';
import { EXIT } from './shared.mjs';

/**
 * The repository the server answers for. Clients start it from different places — Cursor has no
 * `cwd` field and names the script by `${workspaceFolder}` — so a working directory that is not an
 * EOS project means the repository this CLI belongs to.
 */
export function serverRoot(cwd) {
  return existsSync(join(cwd, '.eos')) ? cwd : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export const mcpCommands = {
  /** From here on stdout belongs to the protocol. Runs until the client closes stdin or stops it. */
  async mcp(snapshot) {
    const stop = new AbortController();
    const onSignal = () => stop.abort();
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    await serve({ cwd: serverRoot(snapshot.root), signal: stop.signal });
    return EXIT.OK;
  },
};
