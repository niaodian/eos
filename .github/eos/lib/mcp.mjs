// eos mcp — EOS over the Model Context Protocol, on stdio. (ADR-018)
//
// Every mainstream agent can run `node .github/eos/eos.mjs next`; MCP adds structured results and
// one fewer terminal approval. So this is a thin surface over the CLI, not a second engine: each
// tool call runs the CLI with --json in a fresh process, and its verdict and exit code are returned
// as they are. Zero dependencies, newline-delimited JSON-RPC 2.0 on stdin/stdout, no network.
//
// WHAT IS NOT A TOOL is the design. The tools read state or produce machine evidence. Everything
// that needs a person's authority — approve, waive, transition, policy lock/sync, release
// keygen/sign, init/new/upgrade with --write, ledger --resolve --write — stays a CLI action a
// developer runs. An agent that wants one says so; it cannot do it through this server.
//
// Dual-era: a client that opens with `initialize` (protocol revisions up to 2025-11-25) gets that
// handshake; a request carrying `_meta["io.modelcontextprotocol/protocolVersion"]` (2026-07-28) is
// served statelessly, and `server/discover` answers both.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export const MODERN_VERSIONS = ['2026-07-28'];
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'eos.mjs');
const EXIT_NAMES = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED', 3: 'ERROR' };

const ID = '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
const flag = (description) => ({ type: 'boolean', description });

/**
 * The tools: name, what it does, its arguments, and the CLI argv it maps to. Arguments are checked
 * against their schema before an argv is built, and an argv is never passed through a shell.
 */
export const TOOLS = [
  { name: 'eos_next', title: 'Next action', readOnly: true,
    description: 'The single recommended next action for this repository: where it stands, what blocks it, why this action is next, and the exact command or agent to start it with. Call it before starting any work.',
    properties: { why: flag('include the longer reasoning'), all: flag('include the alternatives') },
    argv: (a) => ['next', ...(a.why ? ['--why'] : []), ...(a.all ? ['--all'] : [])] },
  { name: 'eos_status', title: 'Status', readOnly: true,
    description: 'The product baseline state, every story and its state, the governance track, what the release gate will need, policy drift and cross-branch activity.',
    properties: { changed: flag('also list changed files and the evidence they make stale') },
    argv: (a) => ['status', ...(a.changed ? ['--changed'] : [])] },
  { name: 'eos_resume', title: 'Resume', readOnly: false,
    description: 'Restore the work in a new session: the scope in focus, its state, its blockers and the next action. Records the focus locally (no authority).',
    properties: {}, argv: () => ['resume'] },
  { name: 'eos_health', title: 'Health', readOnly: true,
    description: 'One screen of health: blocked work, stale evidence, waivers in force or expired, and the trend.',
    properties: {}, argv: () => ['health'] },
  { name: 'eos_explain', title: 'Explain a gate', readOnly: true,
    description: 'The full rule set of one gate: every check, how to fix it, and which change types it applies to.',
    properties: { gate: { type: 'string', pattern: ID, description: 'gate id (story-ready, verified, release-ready …) or code (G5, G7, G8 …)' } },
    required: ['gate'], argv: (a) => ['explain', a.gate] },
  { name: 'eos_check', title: 'Run a gate', readOnly: false,
    description: 'Run one gate for real — including the project\'s tests for `verified` — and record its evidence and ledger entry. Machine evidence only: it never changes a state.',
    properties: { gate: { type: 'string', pattern: ID, description: 'gate id or code' }, scope: { type: 'string', pattern: ID, description: 'scope id (a story id, a release id, or product)' } },
    required: ['gate'], argv: (a) => ['check', '--gate', a.gate, ...(a.scope ? ['--scope', a.scope] : [])] },
  { name: 'eos_verify', title: 'Verify what changed', readOnly: false,
    description: 'Run the gates this change can have affected (or all with full), and record their evidence.',
    properties: { full: flag('run every applicable gate'), plan: flag('only list the gates that would run') },
    argv: (a) => ['verify', ...(a.full ? ['--full'] : []), ...(a.plan ? ['--plan'] : [])] },
  { name: 'eos_release_status', title: 'Release status', readOnly: true,
    description: 'Aggregate release readiness: every release-gate check for a release candidate.',
    properties: { release: { type: 'string', pattern: ID, description: 'release id (defaults to the active one)' } },
    argv: (a) => ['release-status', ...(a.release ? ['--release', a.release] : [])] },
  { name: 'eos_stage_skeleton', title: 'Stage record skeleton', readOnly: true,
    description: 'The skeleton of a stage\'s machine record (docs/<stage>.json), generated from its schema, with a TODO(eos) placeholder at every answer. Nothing is written.',
    properties: { stage: { type: 'string', enum: ['discovery', 'requirements', 'design', 'architecture', 'telemetry', 'iteration'] } },
    required: ['stage'], argv: (a) => ['stage', 'init', a.stage] },
  { name: 'eos_product_tree', title: 'Product tree', readOnly: true,
    description: 'The identity (digest) of the product tree a verification applies to.',
    properties: {}, argv: () => ['product-tree'] },
  { name: 'eos_doctor', title: 'Doctor', readOnly: true,
    description: 'Is EOS itself wired correctly: configuration, evidence integrity, the ledger, the policy lock.',
    properties: {}, argv: () => ['doctor'] },
  { name: 'eos_policy_check', title: 'Policy check', readOnly: true,
    description: 'Whether the policy matches its lock: no gate weakened without a reason and a second person.',
    properties: {}, argv: () => ['policy', 'check'] },
];

/**
 * Every CLI command that is not a tool, and why. The test suite holds this against the command
 * registry, so a new command cannot become reachable — or silently unreachable — by accident.
 */
const REWRITES = 'rewrites governance files: the developer runs it and reviews the diff';
export const NOT_TOOLS = {
  approve: 'an approval is a second person\'s, never an agent\'s',
  waive: 'accepting a risk is a named person\'s decision',
  transition: 'moving a state is the developer\'s call, made after the gate passes',
  focus: 'what to work on is the developer\'s choice',
  release: 'keys, signatures and release manifests are release authority',
  ledger: 'the ledger is append-only and resolving it is a person\'s decision; eos_doctor verifies it',
  handoff: 'a hand-off package is written for a person',
  report: 'writes a report for people; eos_health returns the same records',
  providers: 'asks external authorities through their own signed-in CLIs, which an MCP host may not see',
  'verify-release': 'asks external authorities through their own signed-in CLIs, which an MCP host may not see',
  init: REWRITES, new: REWRITES, upgrade: REWRITES, stack: REWRITES, agents: REWRITES,
  docs: REWRITES, sbom: REWRITES, migrate: REWRITES, evidence: REWRITES,
  mcp: 'the server itself',
};

const listed = (t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: { type: 'object', additionalProperties: false, properties: t.properties, ...(t.required ? { required: t.required } : {}) },
  annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false },
});

/** Arguments checked against a tool's schema (the small subset the tools use). Null when valid. */
export function argumentProblem(tool, args) {
  if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) return 'arguments must be an object';
  const a = args || {};
  for (const k of Object.keys(a)) if (!Object.hasOwn(tool.properties, k)) return `unknown argument "${k}"`;
  for (const k of tool.required || []) if (a[k] === undefined) return `"${k}" is required`;
  for (const [k, spec] of Object.entries(tool.properties)) {
    const v = a[k];
    if (v === undefined) continue;
    if (spec.type === 'boolean' && typeof v !== 'boolean') return `"${k}" must be true or false`;
    if (spec.type === 'string' && typeof v !== 'string') return `"${k}" must be a string`;
    if (spec.enum && !spec.enum.includes(v)) return `"${k}" must be one of ${spec.enum.join(', ')}`;
    if (spec.pattern && !new RegExp(spec.pattern).test(v)) return `"${k}" is not a valid id`;
  }
  return null;
}

const version = () => {
  try { return readFileSync(join(dirname(CLI), '..', '..', 'docs/eos/VERSION'), 'utf8').trim().replace(/^eos-/, ''); } catch { return '0.0.0'; }
};

export const INSTRUCTIONS = 'EOS is the governance engine of this repository. Call eos_next before starting work: it names the one next action and why. '
  + 'eos_check and eos_verify run gates and record machine evidence. Changing a state, approving, waiving or weakening the policy needs a person: '
  + 'those are CLI commands the developer runs, deliberately not tools here — name the command instead of working around it.';

const WINDOWS = process.platform === 'win32';
const duration = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);

/**
 * Stop a CLI run and everything it started. `eos_check` on `verified` runs project-gate, which runs
 * the project's tests: killing only the CLI left those running, reparented, for as long as they
 * liked. On POSIX a run leads its own process group (it is spawned detached), so the whole group is
 * signalled — TERM, then KILL for whatever is still there after `graceMs`. On Windows `taskkill /T`
 * walks the process tree.
 * @returns {Promise<void>} once the tree is gone, or the grace period is over
 */
export function stopTree(child, { graceMs = 2000 } = {}) {
  if (!child?.pid) return Promise.resolve();
  if (WINDOWS) {
    return new Promise((done) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.on('error', () => { try { child.kill(); } catch { /* already gone */ } done(); });
      killer.on('close', () => done());
    });
  }
  const group = (sig) => { try { process.kill(-child.pid, sig); return true; } catch { return false; } };
  if (!group('SIGTERM')) return Promise.resolve();
  return new Promise((done) => {
    const deadline = Date.now() + graceMs;
    const poll = () => {
      if (!group(0)) { done(); return; }
      if (Date.now() >= deadline) { group('SIGKILL'); done(); return; }
      setTimeout(poll, 25);
    };
    poll();
  });
}

/** The answer to one tool call, from the CLI run it made. */
export function toolResult(argv, { code, signal, out, err, timeoutMs, timedOut = false }) {
  let result = null;
  if (!timedOut) try { result = JSON.parse(out); } catch { /* not JSON: an early refusal, returned as text */ }
  const exitCode = code ?? null;
  const verdict = signal || timedOut ? 'ERROR' : EXIT_NAMES[exitCode] ?? 'ERROR';
  const command = `eos ${argv.join(' ')}`;
  const output = result ? undefined : timedOut
    ? `${command} was stopped after ${duration(timeoutMs)}, its time limit, with everything it started — run it from the CLI to see it through`
    : (`${out}${err}`.trim() || (signal ? `${command} was stopped (${signal})` : `${command} ended with exit ${exitCode}`));
  const structured = { command, exitCode, verdict, ...(result ? { result } : { output }) };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
    // A gate that FAILs answered the question; only EOS being unable to answer is a tool error.
    isError: verdict === 'ERROR',
  };
}

/**
 * Serve MCP on the given streams.
 *
 * Tool calls run one at a time, in the order they arrived: two gates appending to the same ledger
 * at once is a race the CLI never has to consider, so the server does not create one.
 *
 * The input ending means "no more questions": what was already asked is answered, then the server
 * returns. `signal` aborting (SIGTERM, SIGINT) or the output breaking means "stop now": the running
 * CLI run is stopped with every process it started (stopTree), and nothing queued starts.
 * @returns {Promise<void>}
 */
export function serve({ input = process.stdin, output = process.stdout, cwd = process.cwd(), timeoutMs = 15 * 60 * 1000, signal } = {}) {
  const pending = new Map(); // request id → { cancelled, child }
  let queue = Promise.resolve();
  let stopped = false;
  let stopServe = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const trees = [];
    for (const job of pending.values()) { job.cancelled = true; if (job.child) trees.push(stopTree(job.child)); }
    pending.clear();
    // The server returns once what it started is gone, so nothing it ran outlives it.
    Promise.all(trees).then(() => stopServe());
  };
  const send = (msg) => { if (!stopped) output.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`); };
  const error = (id, code, message, data) => send({ id, error: { code, message, ...(data ? { data } : {}) } });
  const serverInfo = { name: 'eos', title: 'EOS — Engineering Operating System', version: version() };

  const run = (id, argv, modern) => new Promise((done) => {
    const job = pending.get(id);
    if (!job || job.cancelled || stopped) { pending.delete(id); done(); return; }
    let out = '';
    let err = '';
    const finish = (answer) => {
      done();
      if (pending.get(id) !== job) return; // cancelled: nothing more may be sent for it
      pending.delete(id);
      answer();
    };
    // Its own process group (POSIX), so stopping it can stop everything it starts (stopTree).
    const child = spawn(process.execPath, [CLI, ...argv], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !WINDOWS });
    job.child = child;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stopTree(child); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); finish(() => error(id, -32603, `eos ${argv[0]} could not start: ${e.message}`)); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      finish(() => {
        const result = toolResult(argv, { code, signal, out, err, timeoutMs, timedOut });
        send({ id, result: modern ? { resultType: 'complete', ...result } : result });
      });
    });
  });

  const callTool = (id, params, modern) => {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return error(id, -32602, `unknown tool "${params?.name}" — the tools read state or run gates; approving, waiving and state changes are CLI commands a person runs`);
    const problem = argumentProblem(tool, params.arguments);
    if (problem) return error(id, -32602, `${tool.name}: ${problem}`);
    if (pending.has(id)) return error(id, -32600, `request id ${JSON.stringify(id)} is already in use`);
    pending.set(id, { cancelled: false, child: null });
    const argv = [...tool.argv(params.arguments || {}), '--json'];
    queue = queue.then(() => run(id, argv, modern));
    return undefined;
  };

  const handle = (msg) => {
    if (Array.isArray(msg)) return error(null, -32600, 'JSON-RPC batches are not part of MCP: send one message per line');
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg && typeof msg === 'object' && msg.id !== undefined && !('result' in msg) && !('error' in msg)) error(msg.id, -32600, 'not a JSON-RPC 2.0 request');
      return undefined; // a response to nothing this server asked, or noise: ignored
    }
    const { id, method, params } = msg;
    if (id === undefined) {
      if (method === 'notifications/cancelled') {
        const job = pending.get(params?.requestId);
        if (job) { job.cancelled = true; pending.delete(params.requestId); if (job.child) stopTree(job.child); }
      }
      return undefined; // notifications/initialized and the rest need no answer
    }
    const requested = params?._meta?.[META_VERSION];
    // Discovery always answers: it is how a client learns which versions this server speaks.
    if (requested !== undefined && !MODERN_VERSIONS.includes(requested) && method !== 'server/discover') {
      return error(id, -32022, 'Unsupported protocol version', { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested });
    }
    const modern = requested !== undefined;
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return send({ id, result: {
          protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions: INSTRUCTIONS,
        } });
      }
      case 'server/discover':
        return send({ id, result: {
          resultType: 'complete',
          supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
          capabilities: { tools: {} },
          _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
          instructions: INSTRUCTIONS,
        } });
      case 'ping':
        return send({ id, result: modern ? { resultType: 'complete' } : {} });
      case 'tools/list':
        return send({ id, result: { ...(modern ? { resultType: 'complete' } : {}), tools: TOOLS.map(listed) } });
      case 'tools/call':
        return callTool(id, params, modern);
      default:
        return error(id, -32601, `method not found: ${method}`);
    }
  };

  return new Promise((resolveServe) => {
    stopServe = resolveServe;
    if (signal?.aborted) { stop(); return; }
    signal?.addEventListener('abort', stop, { once: true });
    output.on?.('error', stop); // the client went away: nobody is left to answer
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on('line', (line) => {
      if (stopped || !line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { error(null, -32700, 'parse error: each line must be one JSON-RPC message'); return; }
      try { handle(msg); } catch (e) { if (msg?.id !== undefined) error(msg.id, -32603, `internal error: ${e.message}`); }
    });
    lines.on('close', () => { queue.then(resolveServe); });
  });
}
