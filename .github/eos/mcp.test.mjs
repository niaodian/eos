// `eos mcp` — EOS over the Model Context Protocol, on stdio (P2-1a, ADR-018).
//
// What this server must never be: a way around a person. The tools read state or produce machine
// evidence; every command that needs someone's authority is named, with its reason, as not a tool,
// and that list is held against the command registry so a new command cannot slip in either way.
// What it must always be: a faithful transport. A tool's verdict is the CLI's verdict, unchanged.
//   node --test .github/eos/mcp.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { project, runJson, cleanup, REPO_ROOT, APP_PROJECT, CLI, SPAWN_TIMEOUT_MS } from './test-support.mjs';
import { cleanEnv } from './test-spawn.mjs';
import { TOOLS, NOT_TOOLS, MODERN_VERSIONS, LEGACY_VERSIONS, argumentProblem, serve } from './lib/mcp.mjs';
import { commands } from './commands/index.mjs';

after(cleanup);

const META = 'io.modelcontextprotocol/protocolVersion';
const modern = (params = {}) => ({ ...params, _meta: { [META]: MODERN_VERSIONS[0] } });

/** A real `eos mcp` process: send requests, read answers by id, close stdin and wait for it to exit. */
function server(cwd) {
  const child = spawn(process.execPath, [CLI, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: SPAWN_TIMEOUT_MS, env: cleanEnv({ ...process.env, EOS_ACTOR: 'tester' }) });
  const messages = [];
  const waiting = [];
  let buffer = '';
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.on('data', (d) => {
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      messages.push(JSON.parse(line)); // anything but one JSON message per line breaks the transport
      for (const w of waiting.splice(0)) w();
    }
  });
  const exited = new Promise((done) => child.on('close', (code, signal) => done({ code, signal })));
  let next = 1;
  const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  const answer = (id) => new Promise((done, fail) => {
    const look = () => {
      const m = messages.find((x) => x.id === id);
      if (m) return done(m);
      waiting.push(look);
      return undefined;
    };
    exited.then(() => setImmediate(() => fail(new Error(`no answer to request ${id}; stderr: ${stderr}`))));
    look();
  });
  return {
    child,
    messages,
    send,
    request(method, params) { const id = next++; send({ id, method, ...(params ? { params } : {}) }); return answer(id); },
    notify(method, params) { send({ method, ...(params ? { params } : {}) }); },
    answer,
    async close() { child.stdin.end(); return exited; },
    exited,
  };
}

const LEGACY_INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'eos-test', version: '1' } };

test('a legacy client gets the initialize handshake, the tools, and the instructions that name what is not a tool', async () => {
  const s = server(REPO_ROOT);
  const init = await s.request('initialize', LEGACY_INIT);
  assert.equal(init.result.protocolVersion, '2025-06-18', 'a known version is echoed');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.result.serverInfo.name, 'eos');
  assert.equal(`eos-${init.result.serverInfo.version}`, readFileSync(join(REPO_ROOT, 'docs/eos/VERSION'), 'utf8').trim());
  assert.match(init.result.instructions, /eos_next/);
  assert.match(init.result.instructions, /approving, waiving/);
  s.notify('notifications/initialized');
  const unknown = await s.request('initialize', { ...LEGACY_INIT, protocolVersion: '1999-01-01' });
  assert.equal(unknown.result.protocolVersion, LEGACY_VERSIONS[0], 'an unknown version gets the newest this server speaks');
  assert.deepEqual((await s.request('ping')).result, {});
  const list = await s.request('tools/list');
  assert.equal(list.result.resultType, undefined, 'legacy results carry no resultType');
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal((await s.request('resources/list')).error.code, -32601);
  assert.deepEqual(await s.close(), { code: 0, signal: null });
});

test('a modern client discovers the server and is served statelessly; an unsupported version is refused with what is supported', async () => {
  const s = server(REPO_ROOT);
  const discover = await s.request('server/discover', modern());
  assert.equal(discover.result.resultType, 'complete');
  assert.deepEqual(discover.result.supportedVersions, [...MODERN_VERSIONS, ...LEGACY_VERSIONS]);
  assert.deepEqual(discover.result.capabilities, { tools: {} });
  assert.equal(discover.result._meta['io.modelcontextprotocol/serverInfo'].name, 'eos');
  const list = await s.request('tools/list', modern());
  assert.equal(list.result.resultType, 'complete');
  assert.equal(list.result.tools.length, TOOLS.length);
  assert.deepEqual((await s.request('ping', modern())).result, { resultType: 'complete' });
  const refused = await s.request('tools/list', { _meta: { [META]: '2099-01-01' } });
  assert.equal(refused.error.code, -32022);
  assert.deepEqual(refused.error.data, { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: '2099-01-01' });
  const stillDiscovers = await s.request('server/discover', { _meta: { [META]: '2099-01-01' } });
  assert.equal(stillDiscovers.result.resultType, 'complete', 'discovery is how a client learns the versions — it always answers');
  assert.equal((await s.close()).code, 0);
});

test('every CLI command is either a tool or named as not one, with a reason — and no authority is a tool', () => {
  const mapped = new Set(TOOLS.map((t) => t.argv({ gate: 'G5', stage: 'discovery' })[0]));
  for (const name of Object.keys(commands)) {
    const notTool = Object.hasOwn(NOT_TOOLS, name);
    assert.ok(mapped.has(name) !== notTool, `"${name}" must be exactly one of: mapped by a tool, or listed in NOT_TOOLS`);
    if (notTool) assert.ok(NOT_TOOLS[name].length > 10, `"${name}" needs a reason`);
  }
  for (const name of Object.keys(NOT_TOOLS)) assert.ok(commands[name], `NOT_TOOLS lists "${name}", which is not a command`);
  for (const authority of ['approve', 'waive', 'transition', 'focus', 'release', 'ledger']) assert.ok(!mapped.has(authority), authority);
});

test('no argument combination reaches a writing or authority flag, and every schema is closed', () => {
  const FORBIDDEN = /^--(write|force|apply|resolve|sign|key|to|reason|expires|risk-owner|out|interactive)$/;
  for (const t of TOOLS) {
    const bools = Object.entries(t.properties).filter(([, s]) => s.type === 'boolean').map(([k]) => k);
    const strings = Object.fromEntries(Object.entries(t.properties).filter(([, s]) => s.type === 'string').map(([k, s]) => [k, s.enum?.[0] ?? 'X-1']));
    for (let mask = 0; mask < 2 ** bools.length; mask += 1) {
      const args = { ...strings, ...Object.fromEntries(bools.map((b, i) => [b, !!(mask & (1 << i))])) };
      assert.equal(argumentProblem(t, args), null, `${t.name} ${JSON.stringify(args)}`);
      const argv = t.argv(args);
      assert.ok(!argv.some((a) => FORBIDDEN.test(a)), `${t.name} → ${argv.join(' ')}`);
      if (argv[0] === 'policy') assert.deepEqual(argv, ['policy', 'check'], 'the policy tool only ever checks');
      if (argv[0] === 'stage') assert.equal(argv[1], 'init', 'the stage tool only prints a skeleton');
    }
    assert.equal(t.readOnly, !['eos_check', 'eos_verify', 'eos_resume'].includes(t.name), `${t.name}: readOnlyHint must say whether it records anything`);
  }
});

test('arguments are checked before anything runs: unknown, mistyped, missing, flag-shaped and inherited names are refused', () => {
  const check = TOOLS.find((t) => t.name === 'eos_check');
  const stage = TOOLS.find((t) => t.name === 'eos_stage_skeleton');
  assert.match(argumentProblem(check, {}), /"gate" is required/);
  assert.match(argumentProblem(check, { gate: '--write' }), /not a valid id/);
  assert.match(argumentProblem(check, { gate: 'G5', scope: '-x' }), /not a valid id/);
  assert.match(argumentProblem(check, { gate: 5 }), /must be a string/);
  assert.match(argumentProblem(check, { gate: 'G5', write: true }), /unknown argument "write"/);
  assert.match(argumentProblem(check, JSON.parse('{"gate":"G5","__proto__":{"x":1}}')), /unknown argument "__proto__"/);
  assert.match(argumentProblem(check, { gate: 'G5', constructor: 'x' }), /unknown argument "constructor"/);
  assert.match(argumentProblem(check, ['G5']), /must be an object/);
  assert.match(argumentProblem(stage, { stage: 'release' }), /must be one of/);
  assert.match(argumentProblem(TOOLS.find((t) => t.name === 'eos_next'), { why: 'yes' }), /true or false/);
});

test('a tool returns the CLI\'s own verdict; a FAIL is an answer, a refused call never starts a process', async () => {
  const dir = project({ '.eos/project.json': APP_PROJECT });
  const s = server(dir);
  await s.request('initialize', LEGACY_INIT);
  const next = await s.request('tools/call', { name: 'eos_next', arguments: {} });
  const direct = runJson(dir, ['next']);
  const sc = next.result.structuredContent;
  assert.equal(sc.command, 'eos next --json');
  assert.equal(sc.exitCode, direct.code);
  assert.deepEqual(sc.result.recommendedAction, direct.json.recommendedAction);
  assert.deepEqual(JSON.parse(next.result.content[0].text), sc, 'the text block is the structured result, serialised');
  assert.equal(next.result.isError, false);

  const explain = await s.request('tools/call', modern({ name: 'eos_explain', arguments: { gate: 'G5' } }));
  assert.equal(explain.result.resultType, 'complete');
  assert.equal(explain.result.structuredContent.verdict, 'PASS');
  assert.equal(explain.result.structuredContent.result.gate.code, 'G5');

  const unknownGate = await s.request('tools/call', { name: 'eos_check', arguments: { gate: 'nope' } });
  assert.equal(unknownGate.result.structuredContent.verdict, 'FAIL');
  assert.equal(unknownGate.result.isError, false, 'the CLI answered; the answer is FAIL');
  assert.match(unknownGate.result.structuredContent.output, /unknown gate "nope"/);

  const approve = await s.request('tools/call', { name: 'eos_approve', arguments: { id: 'STORY-1' } });
  assert.equal(approve.error.code, -32602);
  assert.match(approve.error.message, /approving, waiving and state changes are CLI commands a person runs/);
  const flagShaped = await s.request('tools/call', { name: 'eos_check', arguments: { gate: '--write' } });
  assert.equal(flagShaped.error.code, -32602);
  assert.equal((await s.close()).code, 0);
});

test('calls are answered in the order they arrived, and closing stdin still answers what was asked', async () => {
  const s = server(REPO_ROOT);
  s.send({ id: 'a', method: 'tools/call', params: { name: 'eos_explain', arguments: { gate: 'G7' } } });
  s.send({ id: 'b', method: 'tools/call', params: { name: 'eos_explain', arguments: { gate: 'G8' } } });
  s.send({ id: 'c', method: 'tools/call', params: { name: 'eos_explain', arguments: { gate: 'G1' } } });
  s.notify('notifications/cancelled', { requestId: 'b', reason: 'changed my mind' });
  s.child.stdin.end();
  assert.deepEqual(await s.exited, { code: 0, signal: null });
  assert.deepEqual(s.messages.map((m) => m.id), ['a', 'c'], 'a cancelled request is never answered; the rest are, in order');
  assert.deepEqual(s.messages.map((m) => m.result.structuredContent.result.gate.code), ['G7', 'G1']);
});

test('malformed input is answered with JSON-RPC errors and the server keeps going', async () => {
  const s = server(REPO_ROOT);
  s.child.stdin.write('not json\n[1,2]\n{"jsonrpc":"1.0","id":7,"method":"ping"}\n\n');
  const ping = await s.request('ping');
  assert.deepEqual(ping.result, {});
  const errors = s.messages.filter((m) => m.error).map((m) => [m.id, m.error.code]);
  assert.deepEqual(errors, [[null, -32700], [null, -32600], [7, -32600]]);
  assert.equal((await s.close()).code, 0);
});

test('a run past its time limit is an ERROR the client can see; stopping the server ends the run instead of orphaning it', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (d) => { written += d; });
  const served = serve({ input, output, cwd: REPO_ROOT, timeoutMs: 1 });
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'eos_next', arguments: {} } })}\n`);
  await served;
  const timedOut = JSON.parse(written.trim());
  assert.equal(timedOut.result.isError, true);
  assert.equal(timedOut.result.structuredContent.verdict, 'ERROR');
  assert.match(timedOut.result.structuredContent.output, /was stopped/);

  const stop = new AbortController();
  const input2 = new PassThrough();
  const output2 = new PassThrough();
  let written2 = '';
  output2.on('data', (d) => { written2 += d; });
  const served2 = serve({ input: input2, output: output2, cwd: REPO_ROOT, signal: stop.signal });
  input2.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'eos_health', arguments: {} } })}\n`);
  input2.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'eos_doctor', arguments: {} } })}\n`);
  await new Promise((done) => setImmediate(done));
  const started = Date.now();
  stop.abort();
  await served2; // resolves although the input never closed
  assert.ok(Date.now() - started < 1000, 'stopping does not wait for the running command');
  await new Promise((done) => setTimeout(done, 200));
  assert.equal(written2, '', 'nothing is answered after the server was told to stop');
});

test('SIGTERM stops the server and the command it was running', { skip: process.platform === 'win32' && 'POSIX signals' }, async () => {
  const s = server(REPO_ROOT);
  await s.request('initialize', LEGACY_INIT);
  s.send({ id: 'slow', method: 'tools/call', params: { name: 'eos_health', arguments: {} } });
  await new Promise((done) => setTimeout(done, 50));
  s.child.kill('SIGTERM');
  const { code } = await s.exited;
  assert.equal(code, 0, 'the server handled the signal and exited cleanly');
  assert.ok(!s.messages.some((m) => m.id === 'slow'), 'the interrupted call is not answered');
});
