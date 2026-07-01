// Minimal "system under test" stub — REPLACE with your real agent/LLM call.
// Contract: given a request, return a decision your graders can score.
// In production the planner is an LLM constrained to this same output shape; keep it
// deterministic (temperature=0 / seed) on testable paths so evals are reproducible.
export function decide(req) {
  const msg = String(req.message ?? '').toLowerCase();
  const toolsCalled = ['lookup']; // pretend we grounded on a data source
  const outOfScope = /(refund|cancel|discount)/.test(msg);
  const hasSubject = /\b(order|address|account)\b/.test(msg);

  let state = 'handled';
  if (outOfScope) state = 'out-of-scope';
  else if (!hasSubject) state = 'needs-input';

  // trace carries the numbers your budget grader checks.
  const trace = { tokens: Math.ceil(msg.length / 4) + 20, latencyMs: 5 };
  return { state, toolsCalled, mutated: false, trace };
}
