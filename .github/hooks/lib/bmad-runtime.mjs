// BMAD runtime compatibility — the honest answer to "will these skills actually activate here?".
//
// EOS-AUD-002: the previous check asked only whether a directory named `bmad-<x>` existed under a
// skills root. It therefore reported PASS for a repository in which every mapped skill would fail
// on its first activation step, because those skills resolve their customization through a
// PROJECT-LOCAL `_bmad/` runtime that EOS does not ship and did not check for.
//
// This module answers the real question, in layers, and never upgrades a missing layer to a pass:
//   1. is the skill installed at all (any skills root)?
//   2. does it have a SKILL.md — i.e. is it a skill, not an empty directory?
//   3. is it DEPRECATED (a shim that forwards elsewhere)?
//   4. does the project provide the runtime its activation steps read?
//   5. are the executables those steps invoke on PATH?
import { existsSync, readFileSync, statSync, accessSync, constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { validate } from '../../eos/lib/schema.mjs';

export const BMAD_LOCK_PATH = '.eos/bmad.lock.json';

/** Every directory a Copilot/Claude/agent skill can be installed into. */
export function skillRoots(root = null) {
  const homes = [process.env.HOME, process.env.USERPROFILE].filter(Boolean);
  const dirs = [];
  for (const home of homes) {
    for (const rel of ['.agents/skills', '.claude/skills', '.copilot/skills']) {
      const d = join(home, rel);
      if (existsSync(d)) dirs.push(d);
    }
  }
  if (root && existsSync(join(root, '.github/skills'))) dirs.push(join(root, '.github/skills'));
  return dirs;
}

/** @returns {{present:boolean, lock:object|null, errors:string[]}} */
export function loadBmadLock(root) {
  const full = join(root, BMAD_LOCK_PATH);
  if (!existsSync(full)) return { present: false, lock: null, errors: [] };
  let parsed;
  try { parsed = JSON.parse(readFileSync(full, 'utf8')); } catch (e) {
    return { present: true, lock: null, errors: [`${BMAD_LOCK_PATH}: invalid JSON (${e.message})`] };
  }
  let schema;
  try { schema = JSON.parse(readFileSync(join(root, '.eos/schemas/bmad-lock.schema.json'), 'utf8')); } catch (e) {
    return { present: true, lock: null, errors: [`.eos/schemas/bmad-lock.schema.json is missing or unreadable (${e.message}) — ${BMAD_LOCK_PATH} cannot be validated`] };
  }
  const v = validate(schema, parsed, { label: BMAD_LOCK_PATH });
  if (!v.valid) return { present: true, lock: null, errors: v.errors.slice(0, 4) };
  return { present: true, lock: parsed, errors: [] };
}

function findSkill(name, roots) {
  for (const dir of roots) {
    const full = join(dir, name);
    try { if (statSync(full).isDirectory()) return full; } catch { /* not here */ }
  }
  return null;
}

/** On PATH *and* executable — an unreadable or non-executable file is not a usable interpreter. */
const onPath = (bin) => (process.env.PATH || '').split(delimiter).filter(Boolean).some((dir) => {
  for (const ext of process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']) {
    try { accessSync(join(dir, bin + ext), constants.X_OK); return true; } catch { /* next */ }
  }
  return false;
});

/**
 * Headless readiness report. Deliberately does NOT start an interactive skill session: activating a
 * facilitation skill would open a conversation, which is not something a doctor may do.
 *
 * @param {object} opts
 * @param {boolean} opts.deep  also check the project runtime + executables the skills invoke
 * @returns {{status:'PASS'|'BLOCKED'|'UNCHECKED', skills:object[], runtime:object, problems:string[], notes:string[]}}
 */
export function bmadReadiness(root, { deep = false, roots = null } = {}) {
  const { present, lock, errors } = loadBmadLock(root);
  if (!present) {
    return { status: 'UNCHECKED', skills: [], runtime: { checked: false }, problems: [], notes: [`${BMAD_LOCK_PATH} is not present — BMAD compatibility is not declared, so it is not checked`] };
  }
  if (!lock) return { status: 'BLOCKED', skills: [], runtime: { checked: false }, problems: errors, notes: [] };

  const dirs = roots || skillRoots(root);
  const problems = [];
  const notes = [];
  const skills = [];

  if (!dirs.length) {
    return {
      status: 'UNCHECKED', skills: [], runtime: { checked: false }, problems: [],
      notes: ['no skills directory found (~/.agents/skills, ~/.claude/skills, ~/.copilot/skills) — skill availability was not checked. EOS works without BMAD; `eos next` still names every step.'],
    };
  }

  for (const req of lock.requiredSkills) {
    const dir = findSkill(req.name, dirs);
    const entry = { name: req.name, action: req.action, installed: !!dir, hasSkillMd: false, deprecated: null };
    if (!dir) {
      // Absence is a NOTE, not a BLOCK: EOS's own gates never call a skill. What must never happen
      // is claiming readiness for a skill that will fail — that is what the layers below catch.
      notes.push(`${req.name} is not installed (action "${req.action}" must be done manually)`);
      skills.push(entry);
      continue;
    }
    const skillMd = join(dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      entry.hasSkillMd = false;
      problems.push(`${req.name}: the directory exists but has no SKILL.md — it cannot activate, and a directory-name check would have called this ready`);
      skills.push(entry);
      continue;
    }
    entry.hasSkillMd = true;
    let text = '';
    try { text = readFileSync(skillMd, 'utf8'); } catch { /* unreadable */ }
    if (/^\s*(#\s*)?DEPRECATED\b/im.test(text) || /description:\s*'?DEPRECATED/i.test(text)) {
      const replacement = lock.deprecatedSkills?.[req.name] || (text.match(/in favor of `([a-z0-9-]+)`/i) || [])[1] || 'its replacement';
      entry.deprecated = replacement;
      problems.push(`${req.name} is DEPRECATED upstream (use ${replacement}) but is still mapped in .eos/agent-map.json`);
    }
    skills.push(entry);
  }

  // A skill that IS installed and mapped must be able to complete its activation steps. Only the
  // requirements of the skills that are ACTUALLY INSTALLED are checked — demanding the tea config
  // for a project that never installed a tea skill would be noise, and treating a globally
  // "optional" executable as optional for a skill that genuinely needs it would be a false green.
  const runtime = { checked: deep, root: lock.runtime.root, present: false, missing: [], executables: [] };
  if (deep) {
    const installed = skills.filter((s) => s.installed);
    const byName = new Map(lock.requiredSkills.map((r) => [r.name, r]));
    const neededConfigs = new Set();
    const neededExecutables = new Map(); // name -> [skills that need it]
    for (const s of installed) {
      const req = byName.get(s.name);
      for (const c of req?.configs || []) neededConfigs.add(c);
      for (const e of req?.executables || []) {
        if (!neededExecutables.has(e)) neededExecutables.set(e, []);
        neededExecutables.get(e).push(s.name);
      }
    }
    runtime.present = existsSync(join(root, lock.runtime.root));
    const missing = [];
    // The shared scripts are needed by every skill; the configs only by the ones that read them.
    if (installed.length) for (const s of lock.runtime.scripts) if (!existsSync(join(root, s.path))) missing.push(s.path);
    for (const c of neededConfigs) if (!existsSync(join(root, c))) missing.push(c);
    runtime.missing = missing;

    for (const exe of lock.runtime.executables) {
      const found = onPath(exe.name);
      const neededBy = neededExecutables.get(exe.name) || [];
      runtime.executables.push({ name: exe.name, found, requiredBy: neededBy });
      if (!found && neededBy.length) {
        problems.push(`${exe.name} is not executable on PATH, but ${neededBy.length} installed mapped skill(s) invoke it on activation: ${neededBy.slice(0, 4).join(', ')}`);
      }
    }
    if (installed.length && missing.length) {
      problems.push(
        `the BMAD project runtime is missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? `, +${missing.length - 3} more` : ''}). `
        + `${installed.length} mapped skill(s) ARE installed and each one resolves its customization through \`${lock.runtime.root}/\` on activation, so they will fail at step 1. `
        + 'Install the BMAD project runtime with its own installer (EOS does not vendor or download it), or unmap those skills — see docs/adr/003-bmad-runtime-boundary.md.',
      );
    }
  }

  return { status: problems.length ? 'BLOCKED' : 'PASS', skills, runtime, problems, notes };
}

/** Deprecated skills that are still referenced by the agent map — a dead-skill mapping. */
export function deprecatedMappings(root, agentMap) {
  const { lock } = loadBmadLock(root);
  if (!lock?.deprecatedSkills) return [];
  const out = [];
  for (const [action, entry] of Object.entries(agentMap?.actions || {})) {
    for (const skill of entry.skills || []) {
      if (lock.deprecatedSkills[skill]) out.push({ action, skill, replacement: lock.deprecatedSkills[skill] });
    }
  }
  return out;
}
