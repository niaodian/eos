// Exit only after stdout and stderr have flushed. The implementation lives with the hooks
// (../../hooks/lib/exit.mjs) because they are copied into projects and test sandboxes on their own;
// the CLI uses the same one, so there is a single implementation of how an EOS process ends.
export { exitAfterFlush } from '../../hooks/lib/exit.mjs';
