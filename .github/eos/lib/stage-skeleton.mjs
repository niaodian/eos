// Stage-record skeletons — `eos stage init <stage>`. (P2-2)
//
// Every phase keeps a human document and a machine record next to it (stage-record.mjs). Until 2.3
// the record was written by the stage's agent or by hand from the schema, which left every path that
// is not Copilot — another agent, CI, a developer at a terminal — to rediscover the shape.
//
// A skeleton is derived from the record's JSON Schema, so it cannot drift from what the gate reads:
// every required field, and nothing else, with a `TODO(eos)` placeholder where an answer belongs —
// enums, numbers and booleans included, so no decision is pre-made on anyone's behalf. A record that
// still holds a placeholder is rejected by every gate that reads it (stage-record.mjs), so writing a
// skeleton can never advance a stage. The document template carries only headings and HTML
// comments, which the empty-document check does not count as content.
import { PLACEHOLDER } from './stage-record.mjs';

const deref = (node, root) => {
  let n = node;
  for (let hops = 0; n && n.$ref && hops < 16; hops++) n = n.$ref.slice(2).split('/').reduce((o, k) => o?.[k], root);
  return n || {};
};

const firstSentence = (text) => String(text || '').replace(/\s+/g, ' ').split(/(?<=[.;:])\s/)[0].slice(0, 160).replace(/[.;:]$/, '');

/** What the placeholder at `node` asks for. */
function hint(node, parent) {
  if (node.enum) return `one of ${node.enum.join(' | ')}`;
  const types = [].concat(node.type || []);
  const kind = types.includes('boolean') ? 'true or false'
    : types.includes('number') && !types.includes('string') ? 'a number'
      : types.includes('number') ? 'a number or text'
        : node.minLength ? `at least ${node.minLength} characters` : '';
  return [kind, firstSentence(node.description || parent?.description)].filter(Boolean).join(' — ') || 'your answer';
}

/**
 * The skeleton record a schema describes: required fields only, placeholders at every leaf.
 * @returns {{record: object, leaves: Array<{keys: Array<string|number>, path: string, node: object, hint: string}>}}
 */
export function skeletonFor(schema, { alsoInclude = [] } = {}) {
  const leaves = [];
  const build = (raw, keys, parent) => {
    const node = deref(raw, schema);
    if (node.const !== undefined) return node.const;
    if (node.anyOf) return build(node.anyOf.find((a) => deref(a, schema).type !== 'null') || node.anyOf[0], keys, node);
    const types = [].concat(node.type || (node.properties ? 'object' : node.items ? 'array' : 'string'));
    if (types.includes('object') && !node.enum) {
      const out = {};
      // `alsoInclude`: optional top-level fields a stage's skeleton should still ask about (a user-facing
      // product's design record needs `coverage`, which the schema leaves optional for one that has none).
      const wanted = keys.length === 0 ? [...(node.required || []), ...alsoInclude.filter((k) => node.properties?.[k] && !(node.required || []).includes(k))] : node.required || [];
      for (const k of wanted) out[k] = build(node.properties?.[k] || {}, [...keys, k], node);
      return out;
    }
    if (types.includes('array')) {
      return Array.from({ length: node.minItems || 0 }, (_, i) => build(node.items || {}, [...keys, i], node));
    }
    const path = keys.reduce((p, k) => (typeof k === 'number' ? `${p}[${k}]` : p ? `${p}.${k}` : k), '');
    const h = hint(node, parent);
    leaves.push({ keys, path, node, hint: h });
    return `${PLACEHOLDER}: ${path} — ${h}`;
  };
  return { record: build(schema, [], null), leaves };
}

/** Set `value` at `keys` inside `target`. */
export function setAt(target, keys, value) {
  let o = target;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}

/** An interactive answer, typed the way the schema expects; undefined keeps the placeholder. */
export function coerce(answer, node) {
  const text = String(answer ?? '').trim();
  if (!text) return undefined;
  const types = [].concat(node.type || []);
  if (types.includes('boolean')) return /^(y|yes|true|1|是)$/i.test(text) ? true : /^(n|no|false|0|否)$/i.test(text) ? false : undefined;
  if (types.includes('number') && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (node.enum && !node.enum.includes(text)) {
    const match = node.enum.find((e) => String(e).toLowerCase() === text.toLowerCase());
    return match;
  }
  return text;
}

/**
 * The human document of each stage: headings, and guidance in HTML comments only — the
 * empty-document check strips comments, so an unwritten template reads as the placeholder it is.
 */
export const DOC_TEMPLATES = {
  discovery: ['# Discovery', '',
    '## Problem', '<!-- Who has the problem, how often, what it costs them. Name the evidence. -->', '',
    '## What would prove us wrong', '<!-- The observation that would show this problem is not real or not worth solving. -->', '',
    '## Success metric', '<!-- One number, its target and where it is read from. -->', '',
    '## Scope', '<!-- In scope / explicitly out of scope. -->', '',
    '## Open questions', '<!-- Anything that blocks requirements; resolve or record each. -->', ''],
  requirements: ['# Requirements', '',
    '## Functional requirements', '<!-- FR1, FR2 … — each a testable statement. -->', '',
    '## Non-functional requirements', '<!-- NFR1 … with a measurable target (see docs/checklists/C-nfr.md). -->', '',
    '## Operational pre-flight', '<!-- Telemetry, authz, audit, rollback, monitoring, canary, quota, i18n, multi-tenancy, capacity/SLO, DR: ADOPT, SKIP with a reason, or DEFER with an owner and a trigger. -->', '',
    '## Open questions', '<!-- Resolve or record each before the PRD. -->', ''],
  design: ['# Design', '',
    '## Visual contract', '<!-- Tokens, typography, colour, components — or why this product has no user interface. -->', '',
    '## Coverage', '<!-- Flows, states, accessibility, responsive behaviour: covered where, or scoped out with a reason. -->', ''],
  architecture: ['# Architecture', '',
    '## Context', '<!-- The system, its boundaries and its users. -->', '',
    '## Decisions', '<!-- Tech stack, deployment topology, authz, security, audit, rollback, disaster recovery, data model, API and event contracts — each decided (with its ADR) or not applicable with a reason. -->', '',
    '## NFR landing points', '<!-- For every NFR: the component and the mechanism that meets it. -->', ''],
  telemetry: ['# Telemetry plan', '',
    '## Signals', '<!-- Each success metric: the signal, how it is emitted and from where. -->', '',
    '## Dashboards and alerts', '<!-- Where the numbers are read, and who is paged when. -->', '',
    '## Rollout', '<!-- The metric that triggers a rollback. -->', ''],
  iteration: ['# Retrospective', '',
    '## What production taught us', '<!-- Learnings from telemetry, user feedback, incidents, support, evals. -->', '',
    '## Written back', '<!-- Which spec documents changed, and how. -->', '',
    '## Decision', '<!-- Continue, correct course or stop — and who owns it. -->', ''],
};

/** Documents a stage's gate reads besides its main one: `ux-ready` needs BOTH design contracts. */
export const EXTRA_DOCS = {
  design: {
    'docs/EXPERIENCE.md': ['# Experience', '',
      '## Flows', '<!-- The journeys a user takes, step by step, including the unhappy paths. -->', '',
      '## States', '<!-- Empty, loading, error, partial and success states of each screen or command. -->', '',
      '## Accessibility', '<!-- Keyboard, screen-reader, contrast and motion decisions. -->', '',
      '## Responsive behaviour', '<!-- How each flow behaves from a phone to a wide window — or why it does not need to. -->', ''],
  },
};

/** Stage records whose skeleton asks about optional fields too. */
export const SKELETON_OPTIONS = { design: { alsoInclude: ['coverage'] } };

/**
 * `eos stage init story`: the file `story-ready` reads. Its format used to be learned from the
 * gate's error messages — the file name must be `<ID>.md`, there must be a `## Dependencies` section,
 * `Eval case` is a column of its own, and operational clauses are separated by `;`.
 */
export function storyTemplate({ id, title = 'TODO(eos): the story in a few words', acs = ['AC1.1'] }) {
  return ['---', `id: ${id}`, `title: ${title}`, 'changeType: FEATURE', '---', '',
    '<!-- The file name must be exactly <id>.md. Delete these comments once the story is written. -->', '',
    '## Acceptance criteria', '',
    '<!-- One row per criterion defined in docs/prd.md. "Test intent": the test that proves it, as path::test name.',
    '     "Eval case": an EVAL-<n> id for model-backed behaviour; for deterministic behaviour write "N/A — deterministic"',
    '     (the column is required once the project declares the agentic paradigm). -->',
    '| AC | Statement | Test intent | Eval case |', '| --- | --- | --- | --- |',
    ...acs.map((ac) => `| ${ac} | TODO(eos): what the user can do | TODO(eos): tests/<file>::<test name> | N/A — deterministic |`), '',
    '## Operational tasks', '',
    '<!-- Each is ADOPT — <task>; owner: <who>; verify: <how it is proven>, or SKIP — <a real reason>,',
    '     or DEFER — owner: <who>; trigger: <what ends it>. Separate the clauses with ";". -->',
    '- Telemetry: ADOPT — TODO(eos): the signal this story emits; owner: TODO(eos); verify: TODO(eos)',
    '- Authorization: ADOPT — TODO(eos): who may do this and how it is enforced; owner: TODO(eos); verify: TODO(eos)',
    '- Rollback: ADOPT — TODO(eos): how this change is undone; owner: TODO(eos); verify: TODO(eos)', '',
    '## Dependencies', '', '- none — TODO(eos): say why nothing else blocks this story', ''].join('\n');
}
