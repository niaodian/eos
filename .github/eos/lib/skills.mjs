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
// not symlinks — Windows checkouts without symlink support turn a link into a plain file. And never
// THROUGH a symlink: a mirror linked to the source would delete the source, and a link out of the
// repository would be written outside it. A link where a copy belongs is replaced — the link itself
// is removed, never what it points at.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

/** Files under a directory, links included as leaves (never followed). */
function filesUnder(root, rel, out = []) {
  const full = join(root, rel);
  for (const e of readdirSync(full, { withFileTypes: true })) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) filesUnder(root, child, out);
    else if (e.isFile() || e.isSymbolicLink()) out.push(child);
  }
  return out;
}

/** The first component of `rel` that is a symbolic link, or null (a missing component ends the search). */
export function linkOnPath(root, rel) {
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join('/');
    let st;
    try { st = lstatSync(join(root, p)); } catch { return null; }
    if (st.isSymbolicLink()) return p;
  }
  return null;
}

const bytes = (root, rel) => { try { return readFileSync(join(root, rel)); } catch { return null; } };

/**
 * What `eos agents sync` would do. Pure: reads, writes nothing.
 * @returns {{platforms: string[], rows: Array<{path:string, action:'current'|'add'|'update'|'remove'|'unlink', platform:string}>, problems: string[]}}
 */
export function planSkillSync(root, project) {
  const platforms = platformsOf(project);
  const sources = listSkills(root).filter(isEosSkill);
  const problems = listSkills(root).flatMap((n) => skillProblems(root, n));
  const rows = [];
  for (const [platform, mirror] of Object.entries(SKILL_MIRRORS)) {
    const declared = platforms.includes(platform);
    // A linked mirror is not EOS's to write into or clean up — whatever it points at, the source
    // included. A platform that needs the copy is told why it cannot have one; otherwise it is left be.
    const mirrorLink = linkOnPath(root, mirror);
    if (mirrorLink) {
      if (declared) {
        problems.push(`${mirrorLink} is a symbolic link — ${platform} gets a generated copy of ${SKILLS_DIR}/ there, and EOS never writes or deletes through a link (it could reach ${SKILLS_DIR}/ itself, or a path outside the repository). Replace the link with a directory, then run \`node .github/eos/eos.mjs agents sync --write\`.`);
      }
      continue;
    }
    const wanted = new Map();
    if (declared) {
      for (const name of sources) {
        // Reading the source through a link is harmless; only writing and deleting are guarded.
        for (const src of filesUnder(root, `${SKILLS_DIR}/${name}`)) wanted.set(`${mirror}${src.slice(SKILLS_DIR.length)}`, src);
      }
    }
    const links = new Set();
    for (const [target, src] of wanted) {
      const link = linkOnPath(root, target);
      if (link) { links.add(link); rows.push({ platform, path: target, source: src, action: 'add' }); continue; }
      const have = bytes(root, target);
      const want = bytes(root, src);
      rows.push({ platform, path: target, source: src, action: have === null ? 'add' : have.equals(want) ? 'current' : 'update' });
    }
    // Only eos- directories are EOS's to remove; a team's own skills in the mirror stay.
    if (existsSync(join(root, mirror))) {
      for (const e of readdirSync(join(root, mirror), { withFileTypes: true }).filter((x) => isEosSkill(x.name))) {
        const rel = `${mirror}/${e.name}`;
        if (e.isSymbolicLink()) { links.add(rel); continue; }
        if (!e.isDirectory()) continue;
        for (const f of filesUnder(root, rel)) {
          if (lstatSync(join(root, f)).isSymbolicLink()) links.add(f);
          else if (!wanted.has(f)) rows.push({ platform, path: f, action: 'remove' });
        }
      }
    }
    for (const link of links) rows.push({ platform, path: link, action: 'unlink' });
  }
  return { platforms, rows: rows.sort((a, b) => a.path.localeCompare(b.path)), problems };
}

/** Carry out a plan: drop links, copy what is missing or different, delete what no source produces any more. */
export function applySkillSync(root, rows) {
  // Links first, so nothing below is written through one. unlink removes the link, never its target.
  for (const r of rows.filter((x) => x.action === 'unlink')) {
    const full = join(root, r.path);
    try { unlinkSync(full); } catch (e) {
      if (e.code === 'ENOENT') continue;
      // Windows removes a directory link with rmdir — which, for a link, removes only the link.
      if (e.code === 'EPERM' || e.code === 'EISDIR') rmdirSync(full); else throw e;
    }
  }
  for (const r of rows) {
    const full = join(root, r.path);
    if (r.action === 'add' || r.action === 'update') {
      const link = linkOnPath(root, r.path);
      if (link) throw new Error(`${link} is a symbolic link — not writing ${r.path} through it`);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, readFileSync(join(root, r.source)));
    } else if (r.action === 'remove') {
      if (linkOnPath(root, r.path)) continue;
      rmSync(full, { force: true });
    }
  }
  // An eos- mirror directory left empty by removals goes too.
  for (const mirror of Object.values(SKILL_MIRRORS)) {
    if (linkOnPath(root, mirror) || !existsSync(join(root, mirror))) continue;
    for (const e of readdirSync(join(root, mirror), { withFileTypes: true }).filter((x) => isEosSkill(x.name) && x.isDirectory())) {
      try { if (!filesUnder(root, `${mirror}/${e.name}`).length) rmSync(join(root, mirror, e.name), { recursive: true, force: true }); } catch { /* raced */ }
    }
  }
  return rows;
}
