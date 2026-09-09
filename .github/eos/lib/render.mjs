// The six-block output contract. Progressive disclosure is the point: this is all a developer sees
// unless they ask for --why (longer reasoning) or --all (alternatives).
const line = (indent, text) => `${' '.repeat(indent)}${text}`;

export function renderCard(result, { why = false, all = false } = {}) {
  const out = [];
  const { current, recommendedAction: a, blockers, alternatives } = result;
  out.push(`EOS · ${current.scopeId}`, '');

  out.push('Current');
  out.push(line(2, `${current.state}${current.changeType ? ` · ${current.changeType}` : ''}${current.scopeType !== 'story' ? ` · ${current.scopeType}` : ''}`));
  out.push('');

  out.push('Blockers');
  if (!blockers.length) out.push(line(2, 'none'));
  else for (const b of blockers.slice(0, why ? 20 : 5)) out.push(line(2, `${b.gate}/${b.check} — ${b.detail}`));
  if (!why && blockers.length > 5) out.push(line(2, `… ${blockers.length - 5} more (--why)`));
  out.push('');

  out.push('Recommended next');
  out.push(line(2, a ? a.title : 'nothing to do'));
  out.push('');

  out.push('Why');
  out.push(line(2, a ? a.reason : '—'));
  if (why && a?.targetGate) out.push(line(2, `Target gate: ${a.targetGate} — run \`node .github/eos/eos.mjs explain ${a.targetGate}\` for the full rule set.`));
  out.push('');

  out.push('Start');
  if (a?.copilotAgent || a?.copilotPrompt || a?.skills?.length) {
    const bits = [];
    if (a.copilotAgent) bits.push(a.copilotAgent === 'agent' ? 'Copilot agent: the built-in agent' : `Copilot agent: ${a.copilotAgent}`);
    if (a.copilotPrompt) bits.push(`prompt: /${a.copilotPrompt}`);
    if (a.skills?.length) bits.push(`skills: ${a.skills.join(', ')}`);
    out.push(line(2, bits.join(' · ')));
  }
  if (a?.prompt && why) out.push(line(2, `"${a.prompt}"`));
  if (a?.command) out.push(line(2, a.command));
  out.push('');

  out.push('Done when');
  for (const d of a?.doneWhen || []) out.push(line(2, d));

  if (all && alternatives.length) {
    out.push('', 'Alternatives');
    for (const alt of alternatives) out.push(line(2, `${alt.title} — ${alt.reason}`));
  }
  out.push('');
  return out.join('\n');
}

export function renderGate(result, { evidenceFile = null } = {}) {
  const out = [`EOS gate · ${result.gate}${result.code ? ` (${result.code})` : ''} — ${result.status}`, ''];
  if (result.title) out.push(`  ${result.title}`, '');
  for (const c of result.checks) {
    const mark = { PASS: '✓', WAIVED: '~', NOT_APPLICABLE: '–' }[c.status] || '✗';
    out.push(`  ${mark} ${c.status.padEnd(15)} ${c.id}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  if (result.waiver) out.push('', `  WAIVED by ${result.waiver.file}: ${result.waiver.reason}`);
  out.push('');
  const failing = result.checks.filter((c) => !['PASS', 'WAIVED', 'NOT_APPLICABLE'].includes(c.status));
  if (failing.length) {
    out.push('Fix next');
    failing.forEach((c, i) => out.push(`  ${i + 1}. ${c.detail || c.id}${c.fix ? `\n     → ${c.fix}` : ''}`));
    out.push('');
  }
  if (evidenceFile) out.push(`  evidence: ${evidenceFile}`, '');
  return out.join('\n');
}

export function renderExplain(def, policyRows) {
  const out = [`EOS gate · ${def.id} (${def.code}) v${def.version} — ${def.title}`, ''];
  if (def.summary) out.push(`  ${def.summary}`, '');
  out.push('Checks');
  for (const c of def.checks) {
    out.push(`  ${c.id} — ${c.title}`);
    if (c.fix) out.push(`     fix: ${c.fix}`);
  }
  out.push('', 'Applies to');
  for (const [changeType, policy] of policyRows) out.push(`  ${changeType.padEnd(18)} ${policy}`);
  out.push('', `  waivable: ${def.waivable === false ? 'no' : 'yes, with an approved, unexpired waiver'}`, '');
  return out.join('\n');
}
