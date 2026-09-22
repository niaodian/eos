// validate-config S13 regression tests — the guided-workflow spine (gate definitions, gate policy,
// action→agent map) must fail CI when it is present but broken, and only WARN when it is absent.
//   node --test .github/hooks/validate-config.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, readFileSync, rmSync as rm } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HOOKS, '..', '..');
const VALIDATOR = join(HOOKS, 'validate-config.mjs');
const boxes = [];

/** A faithful copy of the template (minus git/node_modules) so S1–S12 keep passing. */
function repo(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eos-cfg-'));
  boxes.push(dir);
  for (const top of ['.github', '.eos', 'docs', 'src', 'api', 'ops', 'AGENTS.md', 'README.md', 'README.zh.md']) {
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
  const r = spawnSync(process.execPath, [VALIDATOR], { cwd: dir, encoding: 'utf8' });
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
  for (const workflowProfile of ['prototype', 'standard-product', 'controlled', 'regulated']) {
    const { code, out } = run(repo(({ write }) => write('.eos/project.json', { ...base, workflowProfile })));
    assert.equal(code, 0, `${workflowProfile}\n${out}`);
  }
});
