// Agent platforms: one source, a generated configuration per platform (P2-1b/c/d, ADR-019).
//
// What must hold for every platform: EOS writes its own entry into a configuration file the team
// shares and never touches the rest; the generated hook really runs the guardrail in that platform's
// dialect; the generated MCP entry really starts a server; and what EOS cannot merge safely it
// refuses, instead of half-writing.
//   node --test .github/eos/agent-platforms.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { project, write, run, runJson, cleanup, testEnv, REPO_ROOT, APP_PROJECT, SPAWN_TIMEOUT_MS } from './test-support.mjs';
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
  assert.deepEqual(settings.hooks.PreToolUse.map((h) => h.matcher), ['Write', 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit']);
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
  assert.match(refused.json.problems.join('\n'), /\.codex\/config\.toml defines the MCP server "eos" itself \(\[mcp_servers\.eos\]\)/);
  assert.equal(read(dir, '.codex/config.toml'), 'model = "o4"\n\n[mcp_servers.eos]\ncommand = "my-own-eos"\n');
  assert.equal(existsSync(join(dir, '.codex/hooks.json')), false, 'nothing at all is written while a problem stands');
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 1);
});

test('the Antigravity hook runs from .agents/, the directory the platform starts it in (PL-2)', { skip: process.platform === 'win32' && 'the hook command is a POSIX shell line' }, () => {
  const dir = sandbox({ ...APP_PROJECT, agentPlatforms: ['antigravity'] });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  const command = json(dir, '.agents/hooks.json')['eos-guardrail'].PreToolUse[0].hooks[0].command;
  const payload = (c) => JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: c } } });
  const inAgentsDir = (c) => boundedSpawnSync('sh', ['-c', command], { cwd: join(dir, '.agents'), input: payload(c), encoding: 'utf8', env: cleanEnv({ ...process.env }) });
  const denied = inAgentsDir(['git', 'push', '--force'].join(' '));
  assert.equal(denied.status, 0, denied.stderr);
  assert.equal(JSON.parse(denied.stdout).decision, 'deny');
  const allowed = inAgentsDir('ls');
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, '{}');
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

test('the Claude Code hook is one plain command line that every reader runs — sh, PowerShell, VS Code — and covers the PowerShell tool', () => {
  const group = json(REPO_ROOT, '.claude/settings.json').hooks.PreToolUse.find((g) => JSON.stringify(g).includes('deny-dangerous.js'));
  assert.ok(group.matcher.split('|').includes('PowerShell'), group.matcher);
  const [handler] = group.hooks;
  // VS Code reads this file too and ignores `args`: an exec-form hook ran a bare `node` there and
  // blocked every tool call of the session. No args, and no placeholder a shell would have to expand.
  assert.equal(handler.args, undefined);
  assert.equal(handler.command, 'node .github/hooks/deny-dangerous.js --format claude');
  assert.doesNotMatch(handler.command, /[$%`'"]/);
  const denied = ['git', 'push', '--force'].join(' ');
  for (const tool of ['Bash', 'PowerShell']) {
    // The command line split on spaces is exactly what any shell runs, sh or PowerShell.
    const [cmd, ...rest] = handler.command.split(' ');
    assert.equal(cmd, 'node');
    const r = boundedSpawnSync(process.execPath, rest, { cwd: REPO_ROOT, input: JSON.stringify({ tool_name: tool, tool_input: { command: denied } }), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', `${tool}: ${r.stdout}`);
  }
});

test('the shipped .mcp.json starts a server that answers', async () => {
  const { mcpServers: { eos } } = json(REPO_ROOT, '.mcp.json');
  const child = spawn(eos.command, eos.args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: SPAWN_TIMEOUT_MS, env: testEnv() });
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

test('a file of the team\'s own where EOS writes one is never replaced or removed — and one that already runs the guardrail is accepted', () => {
  const teamHook = '#!/bin/sh\n./scripts/team-audit.sh\n';
  const dir = sandbox(APP_PROJECT, { '.clinerules/hooks/PreToolUse': teamHook });
  // Cline is not declared (the default): the team's hook is not EOS's to remove.
  const synced = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(synced.code, 0, synced.out);
  assert.ok(!synced.json.files.some((f) => f.path.startsWith('.clinerules/')), JSON.stringify(synced.json.files));
  assert.equal(read(dir, '.clinerules/hooks/PreToolUse'), teamHook);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  // Declared: refused, with the way out — never overwritten.
  write(dir, '.eos/project.json', { ...APP_PROJECT, agentPlatforms: ['copilot', 'cline'] });
  const refused = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.json.problems.join('\n'), /\.clinerules\/hooks\/PreToolUse is your own .* make it run the guardrail yourself \(node \.github\/hooks\/deny-dangerous\.js --format cline\)/);
  assert.equal(read(dir, '.clinerules/hooks/PreToolUse'), teamHook);
  // The team wires the guardrail into its own script: accepted as it is.
  const wired = `${teamHook}node .github/hooks/deny-dangerous.js --format cline\n`;
  write(dir, '.clinerules/hooks/PreToolUse', wired);
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.equal(read(dir, '.clinerules/hooks/PreToolUse'), wired);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  // With no file of the team's there, EOS writes its own — and that one goes with its platform.
  rmSync(join(dir, '.clinerules/hooks/PreToolUse'));
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.match(read(dir, '.clinerules/hooks/PreToolUse'), /GENERATED by `eos agents sync`/);
  write(dir, '.eos/project.json', { ...APP_PROJECT, agentPlatforms: ['copilot'] });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.equal(existsSync(join(dir, '.clinerules/hooks/PreToolUse')), false);
});

test('EOS owns its hook handlers, not a team\'s matcher group: mixed groups keep the team\'s hooks, and EOS\'s group stays where it sits', () => {
  const team = { type: 'command', command: './scripts/team-audit.sh' };
  const guard = { type: 'command', command: 'node .github/hooks/deny-dangerous.js --format claude' };
  const mixed = { permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [team, guard] }] } };
  const dir = sandbox(APP_PROJECT, { '.claude/settings.json': mixed });
  // The team already runs the guardrail in a group of its own: that arrangement is theirs.
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.deepEqual(json(dir, '.claude/settings.json'), mixed);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  // Claude is no longer declared: only the guardrail handler goes; the team's hook and file stay.
  write(dir, '.eos/project.json', { ...APP_PROJECT, agentPlatforms: ['copilot'] });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.deepEqual(json(dir, '.claude/settings.json'), { permissions: mixed.permissions, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [team] }] } });

  // EOS's own group, with a team group appended after it: no drift, and no reordering.
  const fresh = sandbox();
  assert.equal(run(fresh, ['agents', 'sync', '--write']).code, 0);
  const settings = json(fresh, '.claude/settings.json');
  settings.hooks.PreToolUse.push({ matcher: 'Write', hooks: [{ type: 'command', command: './scripts/team-lint.sh' }] });
  write(fresh, '.claude/settings.json', settings);
  assert.equal(run(fresh, ['agents', 'sync', '--check']).code, 0, 'the team\'s hook after EOS\'s is not drift');
  // An outdated EOS group is updated in place: the team's group stays second.
  settings.hooks.PreToolUse[0].hooks[0].timeout = 5;
  write(fresh, '.claude/settings.json', settings);
  assert.equal(run(fresh, ['agents', 'sync', '--write']).code, 0);
  assert.deepEqual(json(fresh, '.claude/settings.json').hooks.PreToolUse.map((g) => g.matcher), ['Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit', 'Write']);
  assert.equal(json(fresh, '.claude/settings.json').hooks.PreToolUse[0].hooks[0].timeout, 30);
});

test('a Codex config that already spells "eos" another way — or makes mcp_servers inline — is refused, never made invalid', () => {
  for (const toml of [
    '[mcp_servers]\neos = { command = "node", args = ["x"] }\ngithub = { command = "gh" }\n',
    'mcp_servers.eos.command = "node"\n',
    '[mcp_servers.eos.env]\nTOKEN_ENV = "X"\n',
    'mcp_servers = { github = { command = "gh" } }\n',
  ]) {
    const dir = sandbox({ ...APP_PROJECT, agentPlatforms: ['codex'] }, { '.codex/config.toml': toml });
    const r = runJson(dir, ['agents', 'sync', '--write']);
    assert.equal(r.code, 1, `${toml}\n${r.out}`);
    assert.match(r.json.problems.join('\n'), /\.codex\/config\.toml (defines the MCP server "eos" itself|declares mcp_servers as an inline table)/);
    assert.equal(read(dir, '.codex/config.toml'), toml, 'nothing written');
  }
});

test('an undeclared platform\'s config that EOS cannot read is none of its business — unless EOS\'s entry is stuck inside', () => {
  const jsonc = '{\n  // Gemini CLI accepts comments\n  "theme": "dark"\n}\n';
  const dir = sandbox(APP_PROJECT, { '.gemini/settings.json': jsonc });
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.equal(read(dir, '.gemini/settings.json'), jsonc);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  write(dir, '.gemini/settings.json', '{\n  // ours\n  "hooks": { "BeforeTool": [{ "hooks": [{ "command": "node .github/hooks/deny-dangerous.js --format gemini" }] }] }\n}\n');
  const stuck = runJson(dir, ['agents', 'sync', '--check']);
  assert.equal(stuck.code, 1);
  assert.match(stuck.json.problems.join('\n'), /\.gemini\/settings\.json is not plain JSON .* still holds EOS's entry for gemini, which is no longer declared — remove that entry by hand/);
});

test('the upgrade dry run previews what --write will do to the agent-platform files, with the new generator', () => {
  const dir = sandbox(APP_PROJECT, { '.clinerules/hooks/PreToolUse': '#!/bin/sh\n./mine.sh\n', '.mcp.json': { mcpServers: { db: { command: 'db-mcp' } } } });
  const r = runJson(dir, ['upgrade', '--from', REPO_ROOT, '--base', REPO_ROOT]);
  assert.equal(r.code, 0, r.out);
  const preview = r.json.generated.preview;
  assert.deepEqual(preview.platforms, ['copilot', 'claude', 'antigravity']);
  assert.ok(preview.files.some((f) => f.path === '.mcp.json' && f.action === 'update'), JSON.stringify(preview.files));
  assert.ok(!preview.files.some((f) => f.path.startsWith('.clinerules/')), 'the team\'s Cline hook is not in the plan');
  assert.match(run(dir, ['upgrade', '--from', REPO_ROOT, '--base', REPO_ROOT]).out, /Not compared \(generated\)[^\n]*\n(?: {4}would [^\n]*\n)*? {4}would update {2}\.mcp\.json/);
});

test('the orchestrators read correctly where they are rendered: Copilot\'s handoff UI is only ever named as Copilot\'s', () => {
  // Antigravity and Codex get each .github/agents body as it is, without the handoffs frontmatter
  // that draws Copilot's buttons. An instruction to "offer the handoff button above" means nothing
  // there, so every sentence that names Copilot's UI must say it is Copilot's.
  const dir = sandbox();
  assert.equal(run(dir, ['agents', 'sync', '--platform', 'codex', '--write']).code, 0);
  const COPILOT_UI = /handoff button|agent picker|mode selector/i;
  for (const name of ['eos-architecture', 'eos-design', 'eos-discovery', 'eos-guide', 'eos-plan', 'eos-review']) {
    for (const rel of [`.agents/agents/${name}.md`, `.codex/agents/${name}.toml`]) {
      const sentences = read(dir, rel).replace(/\s+/g, ' ').split(/(?<=[.;:!?])\s+/);
      const unqualified = sentences.filter((s) => COPILOT_UI.test(s) && !/Copilot/.test(s));
      assert.deepEqual(unqualified, [], `${rel} names Copilot's UI as if every platform had it`);
    }
  }
});
