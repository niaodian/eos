// Agent platforms: one source, a generated configuration per platform (P2-1b/c/d, ADR-019).
//
// What must hold for every platform: EOS writes its own entry into a configuration file the team
// shares and never touches the rest; the generated hook really runs the guardrail in that platform's
// dialect; the generated MCP entry really starts a server; and what EOS cannot merge safely it
// refuses, instead of half-writing.
//   node --test .github/eos/agent-platforms.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { project, write, run, runJson, cleanup, REPO_ROOT, APP_PROJECT, SPAWN_TIMEOUT_MS } from './test-support.mjs';
import { boundedSpawnSync, cleanEnv } from './test-spawn.mjs';
import { planUpgrade, isGeneratedPath } from './lib/upgrade.mjs';
import { CONFIG_FILES, OWNED_FILES } from './lib/agent-platforms.mjs';

after(cleanup);

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const json = (dir, rel) => JSON.parse(read(dir, rel));
const sandbox = (declaration = APP_PROJECT, files = {}) => project({ '.eos/project.json': declaration, ...files }, { withHooks: true });
const ALL = ['copilot', 'claude', 'codex', 'cursor', 'antigravity', 'gemini', 'kiro', 'qwen', 'devin', 'opencode', 'cline'];

test('the template ships what its default platforms read, and nothing for the others', () => {
  const sync = runJson(REPO_ROOT, ['agents', 'sync', '--check']);
  assert.equal(sync.code, 0, sync.out);
  assert.deepEqual(sync.json.platforms, ['copilot', 'claude', 'antigravity']);
  for (const p of ['.mcp.json', '.claude/settings.json', '.agents/hooks.json', '.agents/mcp_config.json', '.agents/agents/eos-guide.md']) assert.ok(existsSync(join(REPO_ROOT, p)), p);
  for (const p of ['.codex', '.cursor', '.gemini', '.kiro', '.qwen', '.devin', 'opencode.json', '.opencode', '.clinerules', '.claude/agents']) assert.equal(existsSync(join(REPO_ROOT, p)), false, p);
  // Trust stays with each platform: nothing is pre-approved.
  for (const f of CONFIG_FILES.filter((x) => existsSync(join(REPO_ROOT, x.path)) && !x.toml)) {
    assert.doesNotMatch(read(REPO_ROOT, f.path), /autoApprove|"trust"\s*:\s*true|alwaysAllow/, f.path);
  }
});

test('--platform adds a platform to the declaration and generates its files, once', () => {
  const dir = sandbox();
  const preview = runJson(dir, ['agents', 'sync', '--platform', 'codex']);
  assert.equal(preview.code, 0, preview.out);
  assert.deepEqual(preview.json.wouldAdd, ['codex']);
  assert.equal(json(dir, '.eos/project.json').agentPlatforms, undefined, 'a preview changes nothing');

  const added = runJson(dir, ['agents', 'sync', '--platform', 'codex', '--write']);
  assert.equal(added.code, 0, added.out);
  assert.deepEqual(json(dir, '.eos/project.json').agentPlatforms, ['copilot', 'claude', 'codex', 'antigravity']);
  assert.match(run(dir, ['agents', 'sync', '--platform', 'codex']).out, /every generated file matches/);
  assert.match(read(dir, '.codex/config.toml'), /^\[mcp_servers\.eos\]\ncommand = "node"\nargs = \["\.github\/eos\/eos\.mjs", "mcp"\]$/m);
  assert.equal(json(dir, '.codex/hooks.json').hooks.PreToolUse[0].hooks[0].command, 'node .github/hooks/deny-dangerous.js --format codex');
  assert.match(read(dir, '.codex/agents/eos-guide.toml'), /^name = "eos-guide"\ndescription = ".+"\ndeveloper_instructions = '''\n# EOS Guide/m);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  assert.equal(runJson(dir, ['agents', 'sync', '--write']).json.files.length, 0, 'a second run changes nothing');

  const unknown = run(dir, ['agents', 'sync', '--platform', 'vim']);
  assert.equal(unknown.code, 3);
  assert.match(unknown.out, /unknown agent platform\(s\): vim — known: copilot, claude/);
});

test('a shared configuration file keeps everything that is not EOS\'s — and narrowing the platforms removes only EOS\'s entries', () => {
  const mine = { permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo mine' }] }] } };
  const servers = { mcpServers: { db: { command: 'db-mcp', args: [] } } };
  const dir = sandbox(APP_PROJECT, { '.claude/settings.json': mine, '.mcp.json': servers });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  const settings = json(dir, '.claude/settings.json');
  assert.deepEqual(settings.permissions, mine.permissions);
  assert.deepEqual(settings.hooks.PreToolUse.map((h) => h.matcher), ['Write', 'Bash|Write|Edit|MultiEdit|NotebookEdit']);
  assert.deepEqual(Object.keys(json(dir, '.mcp.json').mcpServers), ['db', 'eos']);

  // A hand-edited EOS entry is drift; the team's own entries never are.
  const edited = json(dir, '.mcp.json');
  edited.mcpServers.eos.args = ['elsewhere.mjs'];
  edited.mcpServers.db.args = ['--verbose'];
  write(dir, '.mcp.json', edited);
  const drift = runJson(dir, ['agents', 'sync', '--check']);
  assert.equal(drift.code, 1);
  assert.deepEqual(drift.json.files.map((f) => `${f.action} ${f.path}`), ['update .mcp.json']);
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.deepEqual(json(dir, '.mcp.json').mcpServers.db.args, ['--verbose']);

  write(dir, '.eos/project.json', { ...APP_PROJECT, agentPlatforms: ['copilot'] });
  const narrowed = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(narrowed.code, 0, narrowed.out);
  assert.deepEqual(json(dir, '.claude/settings.json'), mine, 'exactly the team\'s file again');
  assert.deepEqual(Object.keys(json(dir, '.mcp.json').mcpServers), ['db', 'eos'], 'copilot still reads .mcp.json');
  assert.equal(existsSync(join(dir, '.claude/skills/eos-next')), false);
  assert.equal(existsSync(join(dir, '.agents/hooks.json')), false, 'a file only EOS wrote goes when its platform does');
});

test('what EOS cannot merge safely is refused, not half-written', () => {
  const dir = sandbox({ ...APP_PROJECT, agentPlatforms: ['claude', 'codex'] }, {
    '.claude/settings.json': '{\n  // a comment: JSONC, not JSON\n  "permissions": {}\n}\n',
    '.codex/config.toml': 'model = "o4"\n\n[mcp_servers.eos]\ncommand = "my-own-eos"\n',
  });
  const refused = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.json.problems.join('\n'), /\.claude\/settings\.json is not plain JSON/);
  assert.match(refused.json.problems.join('\n'), /\.codex\/config\.toml declares \[mcp_servers\.eos\] outside the EOS block/);
  assert.equal(read(dir, '.codex/config.toml'), 'model = "o4"\n\n[mcp_servers.eos]\ncommand = "my-own-eos"\n');
  assert.equal(existsSync(join(dir, '.codex/hooks.json')), false, 'nothing at all is written while a problem stands');
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 1);
});

test('every generated hook runs the guardrail in its platform\'s dialect', { skip: process.platform === 'win32' && 'the hook commands are POSIX shell lines' }, () => {
  const dir = sandbox({ ...APP_PROJECT, agentPlatforms: ALL });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  const denied = ['git', 'push', '--force'].join(' '); // built at runtime: this file is scanned too
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: denied } });
  const sh = (command) => boundedSpawnSync('sh', ['-c', command], { cwd: dir, input: payload, encoding: 'utf8', env: cleanEnv({ ...process.env, CLAUDE_PROJECT_DIR: '' }) });
  const commandOf = {
    claude: json(dir, '.claude/settings.json').hooks.PreToolUse.at(-1).hooks[0].command,
    codex: json(dir, '.codex/hooks.json').hooks.PreToolUse[0].hooks[0].command,
    cursor: json(dir, '.cursor/hooks.json').hooks.beforeShellExecution[0].command,
    antigravity: json(dir, '.agents/hooks.json')['eos-guardrail'].PreToolUse[0].hooks[0].command,
    gemini: json(dir, '.gemini/settings.json').hooks.BeforeTool[0].hooks[0].command,
    qwen: json(dir, '.qwen/settings.json').hooks.PreToolUse[0].hooks[0].command,
    devin: json(dir, '.devin/hooks.v1.json').PreToolUse[0].hooks[0].command,
    kiro: json(dir, '.kiro/hooks/eos-guardrail.json').hooks[0].action.command,
    cline: './.clinerules/hooks/PreToolUse',
  };
  const denies = {
    claude: (o) => o.hookSpecificOutput.permissionDecision === 'deny',
    codex: (o) => o.hookSpecificOutput.permissionDecision === 'deny',
    qwen: (o) => o.hookSpecificOutput.permissionDecision === 'deny',
    cursor: (o) => o.permission === 'deny',
    antigravity: (o) => o.decision === 'deny',
    gemini: (o) => o.decision === 'deny',
    devin: (o) => o.decision === 'block',
    cline: (o) => o.cancel === true,
  };
  for (const [platform, command] of Object.entries(commandOf)) {
    const r = sh(command);
    if (platform === 'kiro') { assert.equal(r.status, 2, `${platform}: ${r.stderr}`); continue; }
    assert.equal(r.status, 0, `${platform}: ${command} → ${r.stderr}`);
    assert.ok(denies[platform](JSON.parse(r.stdout)), `${platform}: ${r.stdout}`);
  }
  assert.ok(statSync(join(dir, '.clinerules/hooks/PreToolUse')).mode & 0o100, 'the Cline hook is executable');
  assert.match(read(dir, '.opencode/plugins/eos-guardrail.js'), /from '\.\.\/\.\.\/\.github\/hooks\/lib\/secret-rules\.mjs'/);
});

test('the shipped .mcp.json starts a server that answers', async () => {
  const { mcpServers: { eos } } = json(REPO_ROOT, '.mcp.json');
  const child = spawn(eos.command, eos.args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: SPAWN_TIMEOUT_MS, env: cleanEnv({ ...process.env }) });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const done = new Promise((resolveDone) => child.on('close', resolveDone));
  child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })}\n`
    + `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'eos_explain', arguments: { gate: 'G7' } } })}\n`);
  assert.equal(await done, 0);
  const answers = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(answers[0].result.serverInfo.name, 'eos');
  assert.equal(answers[1].result.structuredContent.result.gate.code, 'G7');
});

test('eos upgrade leaves generated files out of its three-way comparison', () => {
  for (const p of ['.mcp.json', '.claude/settings.json', '.claude/skills/eos-next/SKILL.md', '.agents/agents/eos-guide.md', '.codex/config.toml', '.qwen/skills/eos-adr/SKILL.md', 'opencode.json']) assert.ok(isGeneratedPath(p), p);
  for (const p of ['.agents/skills/eos-next/SKILL.md', '.github/agents/eos-guide.agent.md', '.github/hooks/guardrails.json', '.claude/agents/team.md', '.agents/agents/team.md']) assert.equal(isGeneratedPath(p), false, p);
  for (const f of [...CONFIG_FILES, ...OWNED_FILES]) assert.ok(isGeneratedPath(f.path), f.path);
  const rows = planUpgrade({ root: REPO_ROOT, next: REPO_ROOT, base: REPO_ROOT });
  assert.ok(rows.length > 100);
  assert.deepEqual(rows.filter((r) => isGeneratedPath(r.path)), []);
});
