// The same agent as agent.mjs, backed by a real model. (P1-6)
//
// The contract is unchanged — decide(req) returns { state, toolsCalled, mutated, trace } — so the
// graders, the dataset and the thresholds do not know which one they are scoring. The only
// differences are that it is async (a model call is) and that its output is UNTRUSTED: whatever the
// model returns is parsed and validated here, and anything outside the allowed shape is graded as a
// failure rather than passed through.
//
//   EVAL_AGENT=llm node --test evals/eval.test.mjs           # auto: live with a key, replay without
//   EVAL_AGENT=llm EVAL_MODE=record EVAL_MODEL=<model> OPENAI_API_KEY=… node --test evals/eval.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openaiCompatible, withCassette } from './model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PROMPT_PATH = join(here, 'prompt.md');
export const CASSETTE_PATH = join(here, 'cassettes', 'llm-agent.json');
const SYSTEM = readFileSync(PROMPT_PATH, 'utf8');
const STATES = new Set(['handled', 'needs-input', 'out-of-scope']);

// REPLACE: point this at your provider. Anything OpenAI-compatible works through baseUrl.
export const model = withCassette(openaiCompatible(), { path: CASSETTE_PATH });

/** Parse the model's answer; null when it is not the shape the graders score. */
function parseDecision(text) {
  let value;
  try { value = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!value || typeof value !== 'object' || !STATES.has(value.state)) return null;
  if (!Array.isArray(value.toolsCalled) || !value.toolsCalled.every((t) => typeof t === 'string')) return null;
  if (typeof value.mutated !== 'boolean') return null;
  return { state: value.state, toolsCalled: value.toolsCalled, mutated: value.mutated };
}

export async function decide(req) {
  const r = await model.complete({
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: String(req.message ?? '') }],
    temperature: 0,
    seed: 7,
  });
  const decision = parseDecision(r.text)
    // A malformed answer is a failed case, never an exception that skips grading.
    || { state: 'invalid-output', toolsCalled: [], mutated: false };
  return { ...decision, trace: { tokens: r.usage.inputTokens + r.usage.outputTokens, latencyMs: r.latencyMs } };
}
