// EOS workflows as Agent Skills — one source, generated mirrors (ADR-017).
//
// The slash commands moved from VS Code prompt files to Agent Skills in .agents/skills/eos-*, the
// directory Copilot, Codex, Cursor and Antigravity read natively. Claude Code reads only
// .claude/skills, so `eos agents sync` keeps a byte-identical copy there. These tests hold the
// template to that, and try the ways the copy could drift or touch what is not EOS's.
//   node --test .github/eos/skills.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, cpSync, rmSync, symlinkSync, lstatSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project, write, run, runJson, cleanup, REPO_ROOT, APP_PROJECT } from './test-support.mjs';
import { listSkills, skillProblems, skillFrontmatter, planSkillSync, SKILLS_DIR } from './lib/skills.mjs';

after(cleanup);

const SHIPPED = listSkills(REPO_ROOT);
const agentMap = JSON.parse(readFileSync(join(REPO_ROOT, '.eos/agent-map.json'), 'utf8'));

test('the template ships its workflows as portable eos-* skills, and no prompt files', () => {
  assert.ok(SHIPPED.length >= 21, SHIPPED.join(', '));
  for (const name of SHIPPED) {
    assert.match(name, /^eos-/, `${name}: EOS's skills are namespaced so a team's own never collide`);
    assert.deepEqual(skillProblems(REPO_ROOT, name), []);
    const { fields } = skillFrontmatter(readFileSync(join(REPO_ROOT, SKILLS_DIR, name, 'SKILL.md'), 'utf8'));
    assert.deepEqual(Object.keys(fields).sort(), ['description', 'name'], `${name}: only the two portable fields`);
    assert.match(fields.description, /\bUse\b/, `${name}: say when to use it — agents load skills by their description`);
  }
  assert.equal(existsSync(join(REPO_ROOT, '.github/prompts')), false, 'VS Code\'s Agent Host no longer loads prompt files');
  assert.equal(existsSync(join(REPO_ROOT, '.github/skills')), false, 'one source: a third copy would show Copilot the same skill three times');
});

test('every slash command the router can recommend is a shipped skill', () => {
  for (const [action, entry] of Object.entries(agentMap.actions)) {
    if (entry.prompt) assert.ok(SHIPPED.includes(entry.prompt), `${action} → /${entry.prompt} has no skill`);
  }
});

test('the shipped Claude Code mirror is byte-identical to the source', () => {
  const { rows, problems } = planSkillSync(REPO_ROOT, null);
  assert.deepEqual(problems, []);
  assert.deepEqual(rows.filter((r) => r.action !== 'current'), [], 'run `node .github/eos/eos.mjs agents sync --write`');
  assert.equal(rows.length, SHIPPED.length, 'one SKILL.md per skill is mirrored');
});

/** A project with the template's skills and mirror, plus a team's own skills in both places. */
function withSkills(declaration = APP_PROJECT) {
  const dir = project({
    '.eos/project.json': declaration,
    '.agents/skills/team-deploy/SKILL.md': '---\nname: team-deploy\ndescription: Our own deploy steps. Use when deploying.\n---\n# ours\n',
    '.claude/skills/team-notes/SKILL.md': '---\nname: team-notes\ndescription: Our notes. Use when asked.\n---\n# ours\n',
  });
  cpSync(join(REPO_ROOT, '.claude/skills'), join(dir, '.claude/skills'), { recursive: true });
  return dir;
}

test('agents sync --check fails on a hand-edited copy and names it; --write restores it', () => {
  const dir = withSkills();
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  write(dir, '.claude/skills/eos-next/SKILL.md', '---\nname: eos-next\ndescription: edited here. Use never.\n---\n');
  const drift = runJson(dir, ['agents', 'sync', '--check']);
  assert.equal(drift.code, 1, drift.out);
  assert.deepEqual(drift.json.files.map((f) => `${f.action} ${f.path}`), ['update .claude/skills/eos-next/SKILL.md']);
  assert.match(run(dir, ['agents', 'sync', '--check']).out, /Edit the skill there, never the copy/);
  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.equal(readFileSync(join(dir, '.claude/skills/eos-next/SKILL.md'), 'utf8'), readFileSync(join(dir, '.agents/skills/eos-next/SKILL.md'), 'utf8'));
});

test('a skill removed from the source leaves the mirror, and a team\'s own skills are never touched', () => {
  const dir = withSkills();
  rmSync(join(dir, '.agents/skills/eos-nfr'), { recursive: true });
  const r = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.files.map((f) => `${f.action} ${f.path}`), ['remove .claude/skills/eos-nfr/SKILL.md']);
  assert.equal(existsSync(join(dir, '.claude/skills/eos-nfr')), false);
  assert.ok(existsSync(join(dir, '.claude/skills/team-notes/SKILL.md')), 'not an eos- skill: not EOS\'s to remove');
  assert.equal(existsSync(join(dir, '.claude/skills/team-deploy')), false, 'not an eos- skill: not EOS\'s to mirror');
});

test('agentPlatforms without claude removes the mirror — and only EOS\'s part of it', () => {
  const dir = withSkills({ ...APP_PROJECT, agentPlatforms: ['copilot', 'codex'] });
  const r = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.platforms, ['copilot', 'codex']);
  assert.deepEqual(readdirSync(join(dir, '.claude/skills')), ['team-notes']);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0, 'no mirror is the expected state now');
});

test('a source skill that would not load is copied nowhere: --write refuses, --check fails', () => {
  const dir = withSkills();
  write(dir, '.agents/skills/eos-new/SKILL.md', '---\nname: eos-renamed\ndescription: mismatched. Use never.\n---\n');
  const refused = run(dir, ['agents', 'sync', '--write']);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /name "eos-renamed" must equal its directory "eos-new"/);
  assert.equal(existsSync(join(dir, '.claude/skills/eos-new')), false);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 1);
});

test('an unknown agent platform is refused by the declaration', () => {
  const dir = project({ '.eos/project.json': { ...APP_PROJECT, agentPlatforms: ['copilot', 'vim'] } }, { git: false });
  const r = run(dir, ['doctor']);
  assert.match(r.out, /unknown agent platform\(s\) "vim"/);
});

const POSIX_LINKS = process.platform === 'win32' && 'creating symlinks needs privileges on Windows';

test('a mirror linked to the source is never written or emptied through the link', { skip: POSIX_LINKS }, () => {
  const dir = withSkills({ ...APP_PROJECT, agentPlatforms: ['copilot', 'codex'] });
  rmSync(join(dir, '.claude/skills'), { recursive: true });
  symlinkSync('../.agents/skills', join(dir, '.claude/skills'));
  const undeclared = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(undeclared.code, 0, undeclared.out);
  assert.deepEqual(undeclared.json.files, [], 'nothing is planned inside a linked mirror');
  assert.ok(existsSync(join(dir, '.agents/skills/eos-adr/SKILL.md')), 'the source is intact');

  write(dir, '.eos/project.json', APP_PROJECT);
  const declared = runJson(dir, ['agents', 'sync', '--write']);
  assert.equal(declared.code, 1, declared.out);
  assert.match(declared.json.problems.join('\n'), /\.claude\/skills is a symbolic link .* Replace the link with a directory/);
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 1);
  assert.ok(existsSync(join(dir, '.agents/skills/eos-adr/SKILL.md')));
});

test('a link where a copy belongs is replaced — the link goes, never what it points at — and a broken one does not crash', { skip: POSIX_LINKS }, () => {
  const dir = withSkills();
  const outside = mkdtempSync(join(tmpdir(), 'eos-outside-'));
  writeFileSync(join(outside, 'precious.md'), 'not EOS\'s\n');
  rmSync(join(dir, '.claude/skills/eos-adr'), { recursive: true });
  symlinkSync(outside, join(dir, '.claude/skills/eos-adr'));
  rmSync(join(dir, '.claude/skills/eos-nfr'), { recursive: true });
  symlinkSync('../../.github/skills/eos-nfr', join(dir, '.claude/skills/eos-nfr')); // broken, as a 2.1 layout would leave it
  rmSync(join(dir, '.claude/skills/eos-next/SKILL.md'));
  symlinkSync(join(outside, 'precious.md'), join(dir, '.claude/skills/eos-next/SKILL.md'));

  const plan = runJson(dir, ['agents', 'sync']);
  assert.equal(plan.code, 0, plan.out);
  const rows = plan.json.files.map((f) => `${f.action} ${f.path}`);
  for (const link of ['.claude/skills/eos-adr', '.claude/skills/eos-nfr', '.claude/skills/eos-next/SKILL.md']) assert.ok(rows.includes(`unlink ${link}`), `${link}: ${rows.join(', ')}`);
  assert.ok(rows.includes('add .claude/skills/eos-next/SKILL.md'));
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 1, 'a link is drift: the mirror holds copies');

  assert.equal(run(dir, ['agents', 'sync', '--write']).code, 0);
  assert.deepEqual(readdirSync(outside), ['precious.md'], 'nothing was written or deleted outside the repository');
  assert.equal(readFileSync(join(outside, 'precious.md'), 'utf8'), 'not EOS\'s\n');
  for (const name of ['eos-adr', 'eos-nfr', 'eos-next']) {
    assert.equal(lstatSync(join(dir, '.claude/skills', name)).isSymbolicLink(), false, name);
    assert.equal(readFileSync(join(dir, '.claude/skills', name, 'SKILL.md'), 'utf8'), readFileSync(join(dir, '.agents/skills', name, 'SKILL.md'), 'utf8'), name);
  }
  assert.equal(run(dir, ['agents', 'sync', '--check']).code, 0);
  rmSync(outside, { recursive: true, force: true });
});
