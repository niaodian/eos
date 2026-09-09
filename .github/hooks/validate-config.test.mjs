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
