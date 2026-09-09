// Loaders for the tracked EOS registries (.eos/workflow.json, gates.json, agent-map.json) and the
// local, non-authoritative focus file. Every loader is FAIL-CLOSED: a missing or invalid file
// returns `null` plus errors, never a permissive default, because everything downstream (gate
// policy, transitions, routing) is derived from these files.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from './schema.mjs';

export const EOS_DIR = '.eos';
export const WORKFLOW_PATH = '.eos/workflow.json';
export const GATES_PATH = '.eos/gates.json';
export const AGENT_MAP_PATH = '.eos/agent-map.json';
export const ACTIVE_WORK_PATH = '.eos/local/active-work.json';
/** Bumping this invalidates every previously written evidence file. */
export const EVALUATOR_VERSION = '1.0.0';

export const posix = (p) => p.split(/[\\/]/).join('/');

function readJson(root, rel) {
  const full = join(root, rel);
  if (!existsSync(full)) return { present: false, data: null, error: null };
  try {
    return { present: true, data: JSON.parse(readFileSync(full, 'utf8')), error: null };
  } catch (e) {
    return { present: true, data: null, error: `${rel}: invalid JSON (${e.message})` };
  }
}

function loadSchema(root, name) {
  const { data, error } = readJson(root, `.eos/schemas/${name}`);
  return { schema: data, error };
}

function loadValidated(root, rel, schemaName) {
  const errors = [];
  const { present, data, error } = readJson(root, rel);
  if (error) return { present, data: null, errors: [error] };
  // ABSENT is not the same as INVALID: a repository where EOS was never installed must be routed to
  // activation, while a corrupt file must be a hard ERROR. Callers decide, so absence carries no error.
  if (!present) return { present: false, data: null, errors: [] };
  const { schema, error: schemaError } = loadSchema(root, schemaName);
  if (schemaError) errors.push(schemaError);
  if (schema) {
    const v = validate(schema, data, { label: rel });
    if (!v.valid) errors.push(...v.errors);
  }
  return { present: true, data: errors.length ? null : data, errors };
}

export function loadWorkflow(root) {
  const { present, data, errors } = loadValidated(root, WORKFLOW_PATH, 'workflow.schema.json');
  return { present, workflow: data, errors };
}

export function loadGates(root) {
  const { present, data, errors } = loadValidated(root, GATES_PATH, 'gate-definition.schema.json');
  if (data) {
    const ids = new Set();
    for (const g of data.gates) {
      if (ids.has(g.id)) errors.push(`${GATES_PATH}: duplicate gate id "${g.id}"`);
      ids.add(g.id);
    }
  }
  return { present, gates: errors.length ? null : data, errors };
}

export function loadAgentMap(root) {
  const { present, data, errors } = loadValidated(root, AGENT_MAP_PATH, 'agent-map.schema.json');
  return { present, agentMap: errors.length ? null : data, errors };
}

/**
 * Resolve an action to its agent / prompt / skills, reporting BLOCKED when the referenced Copilot
 * asset does not exist. `agent: "agent"` is VS Code's built-in agent and has no file.
 */
export function resolveAction(root, agentMap, actionId) {
  const entry = agentMap?.actions?.[actionId];
  if (!entry) {
    return { agent: null, prompt: null, skills: [], handoff: '', blocked: `no entry for action "${actionId}" in ${AGENT_MAP_PATH}` };
  }
  const problems = [];
  if (entry.agent && entry.agent !== 'agent' && !existsSync(join(root, `.github/agents/${entry.agent}.agent.md`))) {
    problems.push(`agent "${entry.agent}" is mapped to action "${actionId}" but .github/agents/${entry.agent}.agent.md does not exist`);
  }
  if (entry.prompt && !existsSync(join(root, `.github/prompts/${entry.prompt}.prompt.md`))) {
    problems.push(`prompt "/${entry.prompt}" is mapped to action "${actionId}" but .github/prompts/${entry.prompt}.prompt.md does not exist`);
  }
  return {
    agent: entry.agent ?? null,
    prompt: entry.prompt ?? null,
    skills: entry.skills || [],
    handoff: entry.handoff || '',
    blocked: problems.length ? problems.join('; ') : null,
  };
}

/** BMAD skills live at user level, so absence is diagnosable but never fatal to the router. */
export function skillDiagnostics(skills) {
  const roots = [process.env.HOME, process.env.USERPROFILE].filter(Boolean);
  const dirs = [];
  for (const home of roots) {
    for (const rel of ['.agents/skills', '.claude/skills', '.copilot/skills']) {
      const d = join(home, rel);
      if (existsSync(d)) dirs.push(d);
    }
  }
  if (!dirs.length) return { checked: false, missing: [], note: 'no user-level skill directory found — skill availability was not checked' };
  const installed = new Set();
  for (const d of dirs) {
    try { for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) installed.add(e.name); } catch { /* unreadable */ }
  }
  const missing = skills.filter((s) => !installed.has(s));
  return { checked: true, missing, note: missing.length ? `not installed at user level: ${missing.join(', ')}` : '' };
}

/** Local focus only. Any authority-looking key is dropped on read (defence in depth). */
export function loadActiveWork(root) {
  const { present, data, error } = readJson(root, ACTIVE_WORK_PATH);
  if (!present || error || !data || typeof data !== 'object') return { present: false, activeWork: null, errors: error ? [error] : [] };
  const { schema } = loadSchema(root, 'active-work.schema.json');
  const cleaned = {
    schemaVersion: 1,
    scopeType: data.scopeType,
    scopeId: data.scopeId,
    ...(data.changeType ? { changeType: data.changeType } : {}),
    ...(data.note ? { note: data.note } : {}),
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
  const errors = [];
  if (schema) {
    const v = validate(schema, cleaned, { label: ACTIVE_WORK_PATH });
    if (!v.valid) errors.push(...v.errors);
  }
  return { present: true, activeWork: errors.length ? null : cleaned, errors };
}
