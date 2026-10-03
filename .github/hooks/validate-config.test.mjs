// validate-config S13 regression tests — the guided-workflow spine (gate definitions, gate policy,
// action→agent map) must fail CI when it is present but broken, and only WARN when it is absent.
//   node --test .github/hooks/validate-config.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, readFileSync, rmSync as rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { boundedSpawnSync } from '../eos/test-spawn.mjs';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HOOKS, '..', '..');
const VALIDATOR = join(HOOKS, 'validate-config.mjs');
const boxes = [];

/** A faithful copy of the template (minus git/node_modules) so S1–S12 keep passing. */
function repo(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-cfg-'));
  boxes.push(dir);
  for (const top of ['.github', '.agents', '.claude', '.eos', 'docs', 'src', 'api', 'ops', 'AGENTS.md', 'README.md', 'README.zh.md']) {
    try { cpSync(join(ROOT, top), join(dir, top), { recursive: true }); } catch { /* optional path */ }
  }
  mutate({
    write: (rel, body) => {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n', 'utf8');
    },
    remove: (rel) => rm(join(dir, rel), { recursive: true, force: true }),
    read: (rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8')),
    readText: (rel) => readFileSync(join(dir, rel), 'utf8'),
  });
  return dir;
}

const run = (dir) => {
  const r = boundedSpawnSync(process.execPath, [VALIDATOR], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

after(() => { for (const d of boxes) rmSync(d, { recursive: true, force: true }); });

test('S13: the shipped configuration passes', () => {
  const { code, out } = run(repo());
  assert.equal(code, 0, out);
});

test('S13: an absent workflow spine only WARNs (repos created before this contract keep working)', () => {
  const { code, out } = run(repo(({ remove }) => {
    remove('.eos/workflow.json');
    remove('.eos/gates.json');
    remove('.eos/agent-map.json');
  }));
  assert.equal(code, 0, out);
  assert.match(out, /S13/);
  assert.match(out, /WARN/);
});

test('S13: a corrupt workflow file is an ERROR, not a warning', () => {
  const { code, out } = run(repo(({ write }) => write('.eos/workflow.json', '{ not json')));
  assert.equal(code, 1, out);
  assert.match(out, /S13.*workflow\.json/s);
});

test('S13: a schema violation in the gate registry fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const g = read('.eos/gates.json');
    g.gates[0].version = 'not-a-version';
    write('.eos/gates.json', g);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /S13/);
});

test('S13: gate policy referencing an unknown gate fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const w = read('.eos/workflow.json');
    w.profiles['standard-product'].changeTypes.FEATURE.gates['ghost-gate'] = 'required';
    write('.eos/workflow.json', w);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /ghost-gate/);
});

test('S13: a transition guarded by an unknown gate fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const w = read('.eos/workflow.json');
    w.stateMachines.story.transitions[0].requiresGate = 'nope';
    write('.eos/workflow.json', w);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /nope/);
});

test('S13: an action mapped to a non-existent agent fails (never a dead recommendation)', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const m = read('.eos/agent-map.json');
    m.actions['design-acceptance-tests'].agent = 'ghost-agent';
    write('.eos/agent-map.json', m);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /ghost-agent/);
});

test('S13: an action mapped to a non-existent prompt fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const m = read('.eos/agent-map.json');
    m.actions['write-prd'].prompt = 'ghost-prompt';
    write('.eos/agent-map.json', m);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /ghost-prompt/);
});

test('S12/S13: an unknown workflowProfile value in the project declaration fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const p = read('.eos/project.json');
    p.workflowProfile = 'Not A Profile';
    write('.eos/project.json', p);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /workflowProfile/);
});

test('S12: complianceProfile only accepts the declared enum', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const p = read('.eos/project.json');
    p.complianceProfile = 'sort-of';
    write('.eos/project.json', p);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /complianceProfile/);
});

// ---------------------------------------------------------------- S14 workspace-rule vs stack
// No later agent reads your tech-stack ADR — every one of them reads the always-on workspace rule.
// G4 makes the locked stack LAND there once; S14 keeps it honest afterwards. The check compares
// which STACK a command belongs to, never the text, so rewording is never reported as drift.
//
// These fixtures mutate the SHIPPED rule file rather than a hand-written stub. A stub is what let
// the first cut of S14 ship a false positive: the real file explains itself with
// `node .github/hooks/project-gate.mjs`, and counting EOS's own Node tooling as project evidence
// flagged every Python and Go repo. Test the file users actually get.
const RULE = '.github/instructions/00-workspace.instructions.md';
// Any label the rule's commands line can start with. Anchoring on `Install:` alone meant that once
// the shipped rule declared only a test command, this replacement silently became a no-op — the
// fixtures then asserted against the UNMODIFIED file, so the cases expecting a pass passed
// vacuously and the cases expecting a failure broke. Mirrors COMMAND_LABELS in lib/workspace-rule.mjs.
const COMMANDS_LINE = /^- (?:Install|Lint|Test|Typecheck|Eval|Audit|Build): .*$/m;
const withCommands = (read, cmds) => {
  const text = read(RULE);
  assert.match(text, COMMANDS_LINE, `${RULE} has no commands line for the fixture to replace`);
  return text.replace(COMMANDS_LINE, `- ${cmds}`);
};
const declare = (extra) => ({ projectType: 'application', stacks: ['python'], commands: { test: 'pytest' }, productParadigms: ['deterministic'], ...extra });

test('S14: prose describing another stack than the one declared fails', () => {
  const { code, out } = run(repo(({ write, readText }) => {
    write('.eos/project.json', declare());
    write(RULE, withCommands(readText, 'Install: `npm ci` · Test: `npm test`.'));
  }));
  assert.equal(code, 1, out);
  assert.match(out, /S14 .*describe a node project/);
});

test('S14: the shipped rule, retargeted to its real stack, passes', () => {
  // Regression for the false positive: this file still contains EOS's own
  // `node .github/hooks/project-gate.mjs`, which must not count as a Node stack.
  for (const cmds of [
    'Install: `pip install -r requirements.txt` · Lint: `ruff check .` · Test: `pytest` · Typecheck: `mypy .`.',
    'Install: `uv sync` · Test: `python -m pytest -q`.',
  ]) {
    const { code, out } = run(repo(({ write, readText }) => {
      write('.eos/project.json', declare());
      write(RULE, withCommands(readText, cmds));
    }));
    assert.equal(code, 0, `${cmds}\n${out}`);
  }
});

test('S14: a stack that IS declared never fails, even alongside another', () => {
  const { code, out } = run(repo(({ write, readText }) => {
    write('.eos/project.json', declare({ stacks: ['node', 'python'] }));
    write(RULE, withCommands(readText, 'Install: `npm ci` · Test: `npm test` · Eval: `pytest evals/`.'));
  }));
  assert.equal(code, 0, out);
});

test('S14: what it cannot prove, it does not report', () => {
  // (a) stack-agnostic commands imply nothing; (b) "other" is unprovable by construction;
  // (c) config-only has not declared a real stack yet — the state every fresh scaffold is in,
  //     which is also why the UNMODIFIED template (Node prose, config-only) still passes.
  const cases = [
    [declare(), 'Test: `make test` · Build: `just build`.'],
    [declare({ stacks: ['other'] }), 'Test: `npm test`.'],
    [{ projectType: 'config-only', stacks: [], productParadigms: ['deterministic'] }, 'Test: `npm test`.'],
  ];
  for (const [proj, cmds] of cases) {
    const { code, out } = run(repo(({ write, readText }) => {
      write('.eos/project.json', proj);
      write(RULE, withCommands(readText, cmds));
    }));
    assert.equal(code, 0, `${JSON.stringify(proj.stacks)} / ${proj.projectType}\n${out}`);
    assert.doesNotMatch(out, /S14/);
  }
});

test('S14: a project-owned Node script still counts as evidence', () => {
  // The EOS-tooling exemption must not become a blanket "ignore every `node` invocation".
  const { code, out } = run(repo(({ write, readText }) => {
    write('.eos/project.json', declare());
    write(RULE, withCommands(readText, 'Test: `node scripts/test.mjs`.'));
  }));
  assert.equal(code, 1, out);
  assert.match(out, /S14 .*describe a node project/);
});

// ---------------------------------------------------------------- workflow modes [audit #12]
// Four tiers, one mechanism: a profile is data in .eos/workflow.json, selected by
// project.json.workflowProfile. The property that matters is that each tier is STRICTLY no weaker
// than the one below it — a "maturity ladder" where a rung quietly permits more than the rung
// below is worse than having no ladder, because adopting it would silently relax a control.
test('the four workflow modes exist and are selectable', () => {
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  for (const name of ['prototype', 'standard-product', 'controlled', 'regulated']) {
    assert.ok(wf.profiles[name], `profile "${name}" is missing`);
    assert.ok(wf.profiles[name].description, `profile "${name}" must say what it is for`);
  }
});

test('each tier is at least as strict as the one below it, gate by gate', () => {
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  const RANK = { not_applicable: 0, waivable: 1, required: 2 };
  const ladder = ['standard-product', 'controlled', 'regulated'];
  for (let i = 1; i < ladder.length; i += 1) {
    const lower = wf.profiles[ladder[i - 1]];
    const upper = wf.profiles[ladder[i]];
    for (const [changeType, def] of Object.entries(lower.changeTypes)) {
      const up = upper.changeTypes[changeType];
      assert.ok(up, `${ladder[i]} dropped change type ${changeType}`);
      for (const [gate, policy] of Object.entries(def.gates)) {
        assert.ok(
          RANK[up.gates[gate]] >= RANK[policy],
          `${ladder[i]}/${changeType}/${gate} is ${up.gates[gate]}, weaker than ${ladder[i - 1]}'s ${policy}`,
        );
      }
    }
  }
});

test('controlled and regulated permit no waivers at all', () => {
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  for (const name of ['controlled', 'regulated']) {
    const waivable = Object.entries(wf.profiles[name].changeTypes)
      .flatMap(([ct, def]) => Object.entries(def.gates).filter(([, p]) => p === 'waivable').map(([g]) => `${ct}/${g}`));
    assert.deepEqual(waivable, [], `${name} must not leave an escape hatch`);
  }
});

test('regulated records a reason for every classification', () => {
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  for (const [ct, def] of Object.entries(wf.profiles.regulated.changeTypes)) {
    assert.equal(def.requiresClassificationReason, true, `${ct} must justify its classification when audited`);
  }
});

test('every profile passes the config validator it ships with', () => {
  const base = JSON.parse(readFileSync(join(ROOT, '.eos/project.json'), 'utf8'));
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  for (const workflowProfile of ['prototype', 'standard-product', 'controlled', 'regulated']) {
    // Selected the way the profile itself declares it must be: a profile that requires the
    // compliance boundary is only valid WITH it (#12).
    const declaration = wf.profiles[workflowProfile].requiresCompliance
      ? { ...base, workflowProfile, complianceProfile: 'regulated', evidencePolicy: 'ci' }
      : { ...base, workflowProfile };
    const { code, out } = run(repo(({ write }) => write('.eos/project.json', declaration)));
    assert.equal(code, 0, `${workflowProfile}\n${out}`);
  }
});

// ---------------------------------------------------------------- regulated needs the boundary [#12]
// A project could select the "regulated" profile without turning the compliance boundary on, and
// then pass releases on evidence the boundary would refuse: a mode NAMED for regulated work, green
// without regulated controls. The profile now declares it, and selecting it alone is an error.
test('S13: the regulated profile without complianceProfile "regulated" fails', () => {
  const base = JSON.parse(readFileSync(join(ROOT, '.eos/project.json'), 'utf8'));
  const { code, out } = run(repo(({ write }) => write('.eos/project.json', { ...base, workflowProfile: 'regulated' })));
  assert.equal(code, 1, out);
  assert.match(out, /S13 .*workflowProfile "regulated" requires "complianceProfile": "regulated"/);
});

test('S13: the regulated profile WITH the compliance boundary passes', () => {
  const base = JSON.parse(readFileSync(join(ROOT, '.eos/project.json'), 'utf8'));
  const { code, out } = run(repo(({ write }) => write('.eos/project.json', {
    ...base, workflowProfile: 'regulated', complianceProfile: 'regulated', evidencePolicy: 'ci',
  })));
  assert.equal(code, 0, out);
});

test('the requirement is data, so any profile can declare it', () => {
  const wf = JSON.parse(readFileSync(join(ROOT, '.eos/workflow.json'), 'utf8'));
  assert.equal(wf.profiles.regulated.requiresCompliance, true, 'the shipped regulated profile declares it');
  for (const name of ['prototype', 'standard-product', 'controlled']) assert.notEqual(wf.profiles[name].requiresCompliance, true, `${name} must not demand it`);
});

// ---------------------------------------------------------------- S15 skills cite only the policy
// Skills, agents and instructions tell agents what to run. A name they cite that the policy does
// not define sends an agent to nothing, while every other check stays green. [#10, ADR-011, ADR-017]
const S15 = (out) => out.split('\n').filter((l) => l.includes('S15'));

test('S15: a skill citing a gate that does not exist fails, and says what does', () => {
  const { code, out } = run(repo(({ write }) => write('.agents/skills/eos-drift/SKILL.md',
    '---\nname: eos-drift\ndescription: drifted\n---\nRun `node .github/eos/eos.mjs check --gate design-ready --scope STORY-001`.\n')));
  assert.equal(code, 1, out);
  assert.match(S15(out).join('\n'), /eos-drift\/SKILL\.md:5: cites gate "design-ready", which \.eos\/gates\.json does not define/);
});

test('S11: a skill that would not load is an error — a name that is not its directory, a non-portable field', () => {
  const { code, out } = run(repo(({ write }) => {
    write('.agents/skills/eos-misnamed/SKILL.md', '---\nname: eos-other\ndescription: loads nowhere\n---\n# x\n');
    write('.agents/skills/eos-vendor/SKILL.md', '---\nname: eos-vendor\ndescription: copilot only\ntools: [search]\n---\n# x\n');
    write('.agents/skills/eos-silent/SKILL.md', '---\nname: eos-silent\n---\n# x\n');
  }));
  assert.equal(code, 1, out);
  assert.match(out, /S11 \.agents\/skills\/eos-misnamed\/SKILL\.md: name "eos-other" must equal its directory "eos-misnamed"/);
  assert.match(out, /S11 \.agents\/skills\/eos-vendor\/SKILL\.md: tools — EOS skills carry only name and description/);
  assert.match(out, /S11 \.agents\/skills\/eos-silent\/SKILL\.md: no "description"/);
});

test('S11: a prompt file left behind by an upgrade is pointed out — VS Code no longer loads it', () => {
  const { out } = run(repo(({ write }) => write('.github/prompts/spec.prompt.md', '---\ndescription: old\n---\nold\n')));
  assert.match(out, /WARN\s+S11 \.github\/prompts\/ still holds 1 prompt file\(s\) — since eos-2\.2\.0/);
});

test('S15: unknown commands, states, transitions, slash commands, agents and scripts are each named', () => {
  const { code, out } = run(repo(({ write }) => write('.github/instructions/drift.instructions.md', [
    '---', 'applyTo: "**/*.drift"', '---',
    'Then run `eos frobnicate`.',
    'Move it with `eos transition --scope story --id STORY-001 --to SHIPPED`.',
    'A story goes DRAFT → MERGED once reviewed.',
    'Use /ghost-skill for the rest, and hand off to the `eos-ghost` agent.',
    'The validator is `node .github/hooks/ghost.mjs`. Release at G42.',
    '',
  ].join('\n'))));
  assert.equal(code, 1, out);
  const lines = S15(out).join('\n');
  assert.match(lines, /drift\.instructions\.md:4: cites `eos frobnicate`, which is not an EOS command/);
  assert.match(lines, /:5: cites --to SHIPPED for a story, which is not a state of the story machine/);
  assert.match(lines, /:6: describes DRAFT → MERGED, which is not a transition/);
  assert.match(lines, /:7: cites \/ghost-skill, but \.agents\/skills\/ghost-skill\/SKILL\.md does not exist/);
  assert.match(lines, /:7: hands off to agent "eos-ghost"/);
  assert.match(lines, /:8: cites \.github\/hooks\/ghost\.mjs, which does not exist/);
  assert.match(lines, /:8: cites G42, which is neither a gate code/);
});

test('S15: renaming a gate in the policy fails every skill and agent that still cites the old name', () => {
  // The drift this check exists for: the policy moves, the prose does not.
  const { code, out } = run(repo(({ read, write }) => {
    const gates = read('.eos/gates.json');
    gates.gates.find((g) => g.id === 'story-ready').id = 'story-approved';
    write('.eos/gates.json', gates);
    const wf = read('.eos/workflow.json');
    write('.eos/workflow.json', JSON.parse(JSON.stringify(wf).replaceAll('"story-ready"', '"story-approved"')));
  }));
  assert.equal(code, 1, out);
  // Not a typo, so no "did you mean": story-approved is too far from story-ready to guess.
  assert.match(S15(out).join('\n'), /eos-plan\.agent\.md:\d+: cites gate "story-ready", which \.eos\/gates\.json does not define/);
});

test('S15: a gate code the method uses is valid only while a gate declares it enforces it', () => {
  // G6 and G-EVAL have no gate of their own: `verified` declares them. Remove the declaration and
  // every prompt citing them is citing nothing.
  const { code, out } = run(repo(({ read, write }) => {
    const gates = read('.eos/gates.json');
    delete gates.gates.find((g) => g.id === 'verified').enforces;
    write('.eos/gates.json', gates);
  }));
  assert.equal(code, 1, out);
  const lines = S15(out).join('\n');
  assert.match(lines, /cites G6, which is neither a gate code/);
  assert.match(lines, /cites G-EVAL, which is neither a gate code/);
});

test('S13: a gate cannot claim to enforce a code through a check it does not have', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const gates = read('.eos/gates.json');
    gates.gates.find((g) => g.id === 'verified').enforces[0].checks = ['no-such-check'];
    gates.gates.find((g) => g.id === 'release-ready').enforces = [{ code: 'G7', title: 'a gate code that is already a gate', checks: ['secret-scan'] }];
    write('.eos/gates.json', gates);
  }));
  assert.equal(code, 1, out);
  assert.match(out, /S13 \.eos\/gates\.json: gate "verified" enforces G6 through check "no-such-check", which it does not have/);
  assert.match(out, /S13 \.eos\/gates\.json: gate "release-ready" declares it enforces G7, which is already the code of gate "verified"/);
});

test('S15: an agent-map handoff that cites a command that does not exist fails', () => {
  const { code, out } = run(repo(({ read, write }) => {
    const am = read('.eos/agent-map.json');
    am.actions['write-prd'].handoff = 'Write the PRD, then run `eos chekc --gate prd-ready`.';
    write('.eos/agent-map.json', am);
  }));
  assert.equal(code, 1, out);
  assert.match(S15(out).join('\n'), /\.eos\/agent-map\.json#write-prd: cites `eos chekc`, which is not an EOS command — did you mean "check"\?/);
});
