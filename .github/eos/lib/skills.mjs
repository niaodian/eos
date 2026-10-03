// EOS workflows as Agent Skills — one source, generated mirrors. (ADR-017)
//
// Until 2.1 EOS shipped its slash commands as VS Code prompt files (.github/prompts/*.prompt.md).
// VS Code no longer loads prompt files in Agent Host sessions and recommends Agent Skills instead;
// Claude Code, Codex, Cursor and Antigravity converge on the same open format (SKILL.md). So every EOS
// workflow is now a skill, written once:
//
//   .agents/skills/eos-*/SKILL.md     THE source — read natively by Copilot (VS Code, CLI, cloud
//                                     agent), Codex, Cursor and Antigravity
//   .claude/skills/eos-*/             a byte-identical GENERATED mirror — Claude Code reads only this
//
// `eos agents sync` writes the mirror, `--check` fails on drift (CI runs it). Only `eos-` directories
// are ever written or removed: a team's own skills, wherever they live, are never touched. Copies,
// not symlinks — Windows checkouts without symlink support turn a link into a plain file.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AGENT_PLATFORMS } from '../../hooks/lib/project-config.mjs';

export const SKILLS_DIR = '.agents/skills';
/** Platform → where it needs its own copy of the skills (platforms not listed read SKILLS_DIR). */
export const SKILL_MIRRORS = { claude: '.claude/skills' };
/** Every project-level directory an agent may load skills from, the source first. */
export const PROJECT_SKILL_DIRS = [SKILLS_DIR, '.github/skills', '.claude/skills'];

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STANDARD_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
// EOS's own skills stay portable: no client-specific field, so every platform reads the same file.
const PORTABLE_KEYS = new Set(['name', 'description']);
export const isEosSkill = (name) => /^eos-/.test(name);

/** Skill directories (containing SKILL.md) under `dir`. */
export function listSkills(root, dir = SKILLS_DIR) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(full, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

export const skillExists = (root, name) => typeof name === 'string' && NAME.test(name) && existsSync(join(root, SKILLS_DIR, name, 'SKILL.md'));

/**
 * The top-level frontmatter keys of a SKILL.md (a deliberately small YAML reader: `key: value`,
 * quoted values, and folded/literal blocks for a long description).
 * @returns {{fields: Record<string,string>, error: string|null}}
 */
export function skillFrontmatter(text) {
  const m = String(text).replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { fields: {}, error: 'no YAML frontmatter (--- … ---) at the top' };
  const fields = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^[>|][-+]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      value = block.filter(Boolean).join(value.startsWith('>') ? ' ' : '\n');
    }
    fields[kv[1]] = value.replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return { fields, error: null };
}

/** Problems that would stop a skill loading, per the Agent Skills specification (agentskills.io). */
export function skillProblems(root, name, dir = SKILLS_DIR) {
  const rel = `${dir}/${name}/SKILL.md`;
  let text;
  try { text = readFileSync(join(root, rel), 'utf8'); } catch { return [`${rel} does not exist`]; }
  const { fields, error } = skillFrontmatter(text);
  if (error) return [`${rel}: ${error}`];
  const problems = [];
  if (!fields.name) problems.push(`${rel}: no "name"`);
  else if (fields.name !== name) problems.push(`${rel}: name "${fields.name}" must equal its directory "${name}", or the skill silently fails to load`);
  if (!NAME.test(name) || name.length > 64) problems.push(`${rel}: "${name}" must be 1–64 lowercase letters, digits and single hyphens`);
  if (!fields.description) problems.push(`${rel}: no "description" — agents decide when to load a skill from it`);
  else if (fields.description.length > 1024) problems.push(`${rel}: description is ${fields.description.length} characters (at most 1024)`);
  const allowed = isEosSkill(name) && dir === SKILLS_DIR ? PORTABLE_KEYS : STANDARD_KEYS;
  const extra = Object.keys(fields).filter((k) => !allowed.has(k));
  if (extra.length) {
    problems.push(isEosSkill(name)
      ? `${rel}: ${extra.join(', ')} — EOS skills carry only name and description, so every platform reads the same file (ADR-017)`
      : `${rel}: ${extra.join(', ')} is not an Agent Skills field`);
  }
  return problems;
}

/** The platforms a project generates files for: declared `agentPlatforms`, or every one EOS knows. */
export const platformsOf = (project) => (Array.isArray(project?.agentPlatforms) ? project.agentPlatforms : AGENT_PLATFORMS);

function filesUnder(root, rel, out = []) {
  const full = join(root, rel);
  for (const e of readdirSync(full, { withFileTypes: true })) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) filesUnder(root, child, out);
    else if (e.isFile()) out.push(child);
  }
  return out;
}

const bytes = (root, rel) => { try { return readFileSync(join(root, rel)); } catch { return null; } };

/**
 * What `eos agents sync` would do. Pure: reads, writes nothing.
 * @returns {{platforms: string[], rows: Array<{path:string, action:'current'|'add'|'update'|'remove', platform:string}>, problems: string[]}}
 */
export function planSkillSync(root, project) {
  const platforms = platformsOf(project);
  const sources = listSkills(root).filter(isEosSkill);
  const problems = listSkills(root).flatMap((n) => skillProblems(root, n));
  const rows = [];
  for (const [platform, mirror] of Object.entries(SKILL_MIRRORS)) {
    const wanted = new Map();
    if (platforms.includes(platform)) {
      for (const name of sources) {
        for (const src of filesUnder(root, `${SKILLS_DIR}/${name}`)) wanted.set(`${mirror}${src.slice(SKILLS_DIR.length)}`, src);
      }
    }
    for (const [target, src] of wanted) {
      const have = bytes(root, target);
      const want = bytes(root, src);
      rows.push({ platform, path: target, source: src, action: have === null ? 'add' : have.equals(want) ? 'current' : 'update' });
    }
    // Only eos- directories are EOS's to remove; a team's own skills in the mirror stay.
    if (existsSync(join(root, mirror))) {
      for (const name of readdirSync(join(root, mirror)).filter(isEosSkill)) {
        if (!statSync(join(root, mirror, name)).isDirectory()) continue;
        for (const f of filesUnder(root, `${mirror}/${name}`)) if (!wanted.has(f)) rows.push({ platform, path: f, action: 'remove' });
      }
    }
  }
  return { platforms, rows: rows.sort((a, b) => a.path.localeCompare(b.path)), problems };
}

/** Carry out a plan: copy what is missing or different, delete what no source produces any more. */
export function applySkillSync(root, rows) {
  for (const r of rows) {
    const full = join(root, r.path);
    if (r.action === 'add' || r.action === 'update') {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, readFileSync(join(root, r.source)));
    } else if (r.action === 'remove') {
      rmSync(full, { force: true });
    }
  }
  // An eos- mirror directory left empty by removals goes too.
  for (const mirror of Object.values(SKILL_MIRRORS)) {
    const dir = join(root, mirror);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter(isEosSkill)) {
      const d = join(dir, name);
      try { if (statSync(d).isDirectory() && !filesUnder(root, `${mirror}/${name}`).length) rmSync(d, { recursive: true, force: true }); } catch { /* raced */ }
    }
  }
  return rows;
}
