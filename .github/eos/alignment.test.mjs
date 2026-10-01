// Prompt ↔ policy alignment (ADR-011): what counts as a citation, and what does not.
// The end-to-end check (validate-config S15) is in .github/hooks/validate-config.test.mjs.
//   node --test .github/eos/alignment.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './test-support.mjs';
import { alignmentVocabulary, checkAlignment, scanText } from './lib/alignment.mjs';
import { commands } from './commands/index.mjs';

const read = (rel) => JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
const policy = { gates: read('.eos/gates.json'), workflow: read('.eos/workflow.json'), commands: Object.keys(commands) };
const vocab = alignmentVocabulary(REPO_ROOT, policy);
const scan = (text) => scanText(text, 'x.md', vocab);
const refs = (text) => scan(text).map((p) => `${p.kind}:${p.ref}`);

test('the shipped prompts, agents, instructions and agent map cite nothing the policy does not define', () => {
  const problems = checkAlignment(REPO_ROOT, vocab, { agentMap: read('.eos/agent-map.json') });
  assert.deepEqual(problems.map((p) => `${p.file}:${p.line} ${p.message}`), []);
});

test('the vocabulary comes from the policy, not from this module', () => {
  assert.ok(vocab.gateIds.has('story-ready'));
  assert.ok(vocab.gateCodes.has('G-UX'));
  assert.ok(vocab.enforcedCodes.has('G6') && vocab.enforcedCodes.has('G-EVAL'), 'declared by `verified` in .eos/gates.json');
  assert.ok(vocab.commands.has('check') && vocab.commands.has('policy'));
  assert.ok(vocab.prompts.has('eos-next') && vocab.agents.has('eos-plan'));
  assert.ok(vocab.states.has('READY_FOR_DEV'));
});

test('CLI citations: the command, its --gate, explain and --to are each checked', () => {
  assert.deepEqual(refs('Run `eos chekc --gate story-ready`.'), ['command:chekc']);
  assert.match(scan('Run `eos chekc`.')[0].message, /did you mean "check"/);
  assert.deepEqual(refs('`node .github/eos/eos.mjs check --gate design-ready --scope STORY-012`'), ['gate:design-ready']);
  assert.deepEqual(refs('`eos explain prd-redy`'), ['gate:prd-redy']);
  assert.deepEqual(refs('`eos check --gate G-UX`'), [], 'a gate\'s own code is a valid --gate');
  // G6 is a code the method names, enforced inside `verified`; there is no gate to run by that name.
  assert.deepEqual(refs('`eos check --gate G6`'), ['gate:G6']);
  assert.deepEqual(refs('`eos transition --scope story --id STORY-1 --to RELEASED`'), ['state:RELEASED'], 'RELEASED is a release state, not a story state');
  assert.deepEqual(refs('`eos transition --scope release --id v1 --to RELEASED`'), []);
  assert.deepEqual(refs('`eos transition --to SHIPPED`'), ['state:SHIPPED']);
});

test('placeholders and lookalikes are not citations', () => {
  assert.deepEqual(refs('`eos check --gate <id> --scope <id>`, `--to <STATE>`, `--gate ${input:eosGate}`'), []);
  assert.deepEqual(refs('the `eos-guide` agent, `.github/eos` and `eos.mjs` itself'), []);
  assert.deepEqual(refs('Use relative units (rem/%/clamp), and/or https://example.com/docs/x'), []);
  assert.deepEqual(refs('Version with a `/v1/` path prefix; name the slash command (`/<prompt>`).'), []);
  assert.deepEqual(refs('```bash\ncd /tmp && ls /usr/bin\n```'), [], 'inside a fence, /tmp is a path');
  assert.deepEqual(refs('PASS → FAIL is not a state change'), [], 'only declared states form a transition');
});

test('gate codes, transitions, prompts, agents and scripts in prose', () => {
  assert.deepEqual(refs('Run G4, then G5, G-UX, G6 and G-EVAL; G1–G10.'), []);
  assert.deepEqual(refs('Release at G42.'), ['gate-code:G42']);
  assert.deepEqual(refs('A story moves DRAFT → IN_REVIEW → READY_FOR_DEV.'), []);
  assert.deepEqual(refs('A story moves DRAFT → MERGED.'), ['transition:DRAFT → MERGED']);
  assert.deepEqual(refs('Run /eos-init, then (/spec) or `/release-gate`.'), []);
  assert.deepEqual(refs('Run /ghost-prompt.'), ['prompt:/ghost-prompt']);
  assert.deepEqual(refs('Hand off to the `eos-plan` agent, or Copilot agent: eos-review.'), []);
  assert.deepEqual(refs('Hand off to the `eos-ghost` agent.'), ['agent:eos-ghost']);
  assert.deepEqual(refs('`node .github/hooks/project-gate.mjs` and `.eos/schemas/diagnostic.schema.json`'), []);
  assert.deepEqual(refs('`node .github/hooks/ghost.mjs`'), ['path:.github/hooks/ghost.mjs']);
});

test('frontmatter handoffs: an agent file or a built-in mode', () => {
  const text = ['---', 'name: x', 'handoffs:', '  - label: Plan', '    agent: eos-plan', '  - label: Build', '    agent: agent', '  - label: Lost', '    agent: eos-ghost', '---', 'body', ''].join('\n');
  const problems = scan(text);
  assert.deepEqual(problems.map((p) => `${p.line}:${p.ref}`), ['9:eos-ghost'], 'line numbers point at the citation');
});

test('one citation is reported once per line, not once per pattern that sees it', () => {
  assert.equal(scan('`eos check --gate design-ready` and again `eos check --gate design-ready`').length, 1);
});
