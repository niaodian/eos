// EOS commands — the agent platforms: generate what each one reads from the one source. (ADR-017)
//
// Registered in ./index.mjs. A handler receives (snapshot, flags) and returns an exit code (./shared.mjs).
import { planSkillSync, applySkillSync, listSkills, isEosSkill, SKILLS_DIR, SKILL_MIRRORS } from '../lib/skills.mjs';
import { EXIT, emit } from './shared.mjs';

const USAGE = `usage: node .github/eos/eos.mjs agents sync [--write | --check] [--json]

  ${SKILLS_DIR}/eos-*/ is the one source of EOS's workflows (Agent Skills). Copilot, Codex, Cursor
  and Antigravity read it directly; Claude Code reads only ${SKILL_MIRRORS.claude}/, so it gets a
  generated, byte-identical copy. "agentPlatforms" in .eos/project.json narrows what is generated.

  sync           show what would change
  sync --write   generate it (never touches a skill that is not eos-*)
  sync --check   fail when a generated copy differs from its source (CI runs this)`;

export const agentsCommands = {
  agents(snapshot, flags) {
    const sub = flags._[1];
    if (sub !== 'sync') {
      console.log(sub ? `unknown agents subcommand "${sub}"\n\n${USAGE}` : USAGE);
      return sub ? EXIT.ERROR : EXIT.FAIL;
    }
    const { platforms, rows, problems } = planSkillSync(snapshot.root, snapshot.project);
    const changes = rows.filter((r) => r.action !== 'current');
    // A skill that would not load is not copied anywhere: --write refuses, and --check fails, until it is fixed.
    const refused = flags.write && problems.length > 0;
    if (flags.write && !refused) applySkillSync(snapshot.root, changes);
    const verb = { add: flags.write ? 'added' : 'would add', update: flags.write ? 'updated' : 'would update', remove: flags.write ? 'removed' : 'would remove', unlink: flags.write ? 'unlinked' : 'would unlink' };
    const sources = listSkills(snapshot.root).filter(isEosSkill).length;
    const lines = ['EOS agents sync · skills', '',
      `  source     ${SKILLS_DIR}/ — ${sources} EOS skill(s)`,
      `  platforms  ${platforms.join(', ')}`, ''];
    for (const p of problems) lines.push(`  ERROR ${p}`);
    if (problems.length) lines.push('');
    for (const r of changes) lines.push(`  ${(refused ? `would ${r.action}` : verb[r.action]).padEnd(13)} ${r.path}`);
    if (!changes.length) lines.push(`  every generated copy matches ${SKILLS_DIR}/ (${rows.length} file(s))`);
    lines.push('');
    const drifted = changes.length > 0;
    let code = EXIT.OK;
    if (flags.check && (drifted || problems.length)) {
      lines.push(drifted
        ? `  ${changes.length} generated file(s) differ from ${SKILLS_DIR}/. Edit the skill there, never the copy, then run \`node .github/eos/eos.mjs agents sync --write\` and commit both.`
        : `  Fix the skill(s) above: a skill whose name does not match its directory silently fails to load.`, '', 'FAIL', '');
      code = EXIT.FAIL;
    } else if (refused) {
      lines.push('  Nothing was written: fix the skill(s) above first — a broken skill is not copied anywhere.', '', 'FAIL', '');
      code = EXIT.FAIL;
    } else if (!flags.write && !flags.check && drifted) {
      lines.push('  Nothing was written. Re-run with --write to apply, or --check to fail on drift.', '');
    } else if (flags.check) {
      lines.push('PASS', '');
    }
    emit(flags, { source: SKILLS_DIR, platforms, problems, drifted, written: !!flags.write && !refused, files: changes }, lines.join('\n'));
    return code;
  },
};
