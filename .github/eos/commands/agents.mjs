// EOS commands — the agent platforms: generate what each one reads from the one source. (ADR-017, ADR-019)
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { planSkillSync, applySkillSync, listSkills, isEosSkill, SKILLS_DIR } from '../lib/skills.mjs';
import { planPlatformSync, applyPlatformSync, declaredPlatforms, parsePlatformFlag, PLATFORM_NOTES, PLATFORM_NAMES } from '../lib/agent-platforms.mjs';
import { AGENT_PLATFORMS, PROJECT_CONFIG_PATH } from '../../hooks/lib/project-config.mjs';
import { writeFileAtomic } from '../lib/atomic.mjs';
import { EXIT, emit } from './shared.mjs';

const USAGE = `usage: node .github/eos/eos.mjs agents sync [--platform <name>[,<name>…]] [--write | --check] [--json]

  One source, a generated copy per agent platform (ADR-017, ADR-019):
    ${SKILLS_DIR}/eos-*/       the workflows (Agent Skills); copied where a platform reads only its own directory
    .github/agents/eos-*      the orchestrator agents; rendered for Antigravity and Codex
    .github/hooks/            the guardrail; each platform's hook runs it in that platform's dialect
    eos mcp                   the MCP server; each platform's configuration gets an "eos" entry
  Shared configuration files (.mcp.json, .claude/settings.json …) keep everything that is not EOS's.

  "agentPlatforms" in .eos/project.json chooses the platforms (absent: copilot, claude, antigravity).
  Known: ${AGENT_PLATFORMS.join(', ')}.

  sync                     show what would change
  sync --write             generate it
  sync --check             fail when a generated file differs from what its source produces (CI runs this)
  sync --platform kiro --write
                           add a platform to agentPlatforms and generate its files (one command)`;

/** Add platforms to the declaration. Every gate binds .eos/project.json, so the caller says so. */
function declarePlatforms(root, platforms) {
  const full = join(root, PROJECT_CONFIG_PATH);
  const doc = JSON.parse(readFileSync(full, 'utf8'));
  doc.agentPlatforms = AGENT_PLATFORMS.filter((p) => platforms.includes(p));
  writeFileAtomic(full, `${JSON.stringify(doc, null, 2)}\n`);
}

export const agentsCommands = {
  agents(snapshot, flags) {
    const sub = flags._[1];
    if (sub !== 'sync') {
      console.log(sub ? `unknown agents subcommand "${sub}"\n\n${USAGE}` : USAGE);
      return sub ? EXIT.ERROR : EXIT.FAIL;
    }
    const requested = parsePlatformFlag(flags.platform === true ? [] : flags.platform);
    if (flags.platform === true || requested.unknown.length) {
      console.log(`${flags.platform === true ? '--platform needs a name' : `unknown agent platform(s): ${requested.unknown.join(', ')}`} — known: ${AGENT_PLATFORMS.join(', ')}\n\n${USAGE}`);
      return EXIT.ERROR;
    }
    const declared = declaredPlatforms(snapshot.project);
    const adding = requested.names.filter((p) => !declared.includes(p));
    if (adding.length && !snapshot.projectPresent) {
      console.log(`--platform adds to "agentPlatforms" in ${PROJECT_CONFIG_PATH}, which does not exist — run \`node .github/eos/eos.mjs init\` first.`);
      return EXIT.FAIL;
    }
    const platforms = AGENT_PLATFORMS.filter((p) => declared.includes(p) || adding.includes(p));
    const skills = planSkillSync(snapshot.root, { agentPlatforms: platforms });
    const generated = planPlatformSync(snapshot.root, platforms);
    const rows = [...skills.rows, ...generated.rows];
    const problems = [...skills.problems, ...generated.problems];
    const changes = rows.filter((r) => r.action !== 'current');
    // Nothing is half-written: a skill that would not load, a file EOS cannot merge into, or a link
    // in the way stops --write, and fails --check, until it is fixed.
    const refused = flags.write && problems.length > 0;
    if (flags.write && !refused) {
      if (adding.length) declarePlatforms(snapshot.root, platforms);
      applySkillSync(snapshot.root, changes.filter((r) => skills.rows.includes(r)));
      applyPlatformSync(snapshot.root, changes.filter((r) => generated.rows.includes(r)));
    }
    const written = !!flags.write && !refused;
    const verb = { add: written ? 'added' : 'would add', update: written ? 'updated' : 'would update', remove: written ? 'removed' : 'would remove', unlink: written ? 'unlinked' : 'would unlink' };
    const sources = listSkills(snapshot.root).filter(isEosSkill).length;
    const lines = ['EOS agents sync', '',
      `  source     ${SKILLS_DIR}/ — ${sources} EOS skill(s); .github/agents, .github/hooks, eos mcp`,
      `  platforms  ${platforms.join(', ')}${Array.isArray(snapshot.project?.agentPlatforms) ? '' : ' (the default — declare "agentPlatforms" to choose)'}`, ''];
    for (const p of adding) lines.push(`  ${written ? 'added' : 'would add'} "${p}" to agentPlatforms in ${PROJECT_CONFIG_PATH} — ${PLATFORM_NAMES[p]}: ${PLATFORM_NOTES[p]}`);
    if (adding.length) lines.push(`  ${PROJECT_CONFIG_PATH} is an input of every gate: re-run \`node .github/eos/eos.mjs verify\` after this.`, '');
    for (const p of problems) lines.push(`  ERROR ${p}`);
    if (problems.length) lines.push('');
    for (const r of changes) lines.push(`  ${(refused ? `would ${r.action}` : verb[r.action]).padEnd(13)} ${r.path}${r.platform ? `  (${r.platform})` : ''}`);
    if (!changes.length) lines.push(`  every generated file matches its source (${rows.length} file(s))`);
    lines.push('');
    const drifted = changes.length > 0 || adding.length > 0;
    let code = EXIT.OK;
    if (flags.check && (drifted || problems.length)) {
      lines.push(drifted
        ? `  ${changes.length} generated file(s) differ from what their source produces. Edit the source (${SKILLS_DIR}/, .github/agents/, .eos/project.json), never the copy, then run \`node .github/eos/eos.mjs agents sync --write\` and commit both.`
        : '  Fix the problem(s) above: nothing is generated around them.', '', 'FAIL', '');
      code = EXIT.FAIL;
    } else if (refused) {
      lines.push('  Nothing was written: fix the problem(s) above first.', '', 'FAIL', '');
      code = EXIT.FAIL;
    } else if (!flags.write && !flags.check && drifted) {
      lines.push('  Nothing was written. Re-run with --write to apply, or --check to fail on drift.', '');
    } else if (flags.check) {
      lines.push('PASS', '');
    }
    const files = changes.map(({ content, mode, source, ...r }) => r);
    emit(flags, {
      source: SKILLS_DIR, platforms, added: written ? adding : [], wouldAdd: written ? [] : adding,
      notes: Object.fromEntries(platforms.map((p) => [p, PLATFORM_NOTES[p]])),
      problems, drifted, written, files,
    }, lines.join('\n'));
    return code;
  },
};
