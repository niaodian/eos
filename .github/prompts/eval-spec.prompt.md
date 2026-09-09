---
name: eval-spec
description: Design the evaluation plan for an LLM/agentic feature (eval sets + graders + baseline) — conditional Gate G-EVAL
argument-hint: <path to docs/prd.md>
agent: agent
tools: ['search', 'editFiles']
---
# Evaluation Plan (EOS) — Gate G-EVAL (conditional)

Input: `docs/prd.md` (passed G3). **Design evals BEFORE building the LLM feature** — this is
the eval-driven analogue of ATDD (G5): you cannot verify a non-deterministic system without an
eval set defined up front.

## Scope decision (conditional gate)
This gate applies **only to features with an LLM/agent/RAG component**. For a purely deterministic
feature, write one line in `docs/eval-plan.md`: `SKIP — no LLM/agent component (reason: …)` and proceed.

> **Declare it, don't rely on detection.** Set the paradigm in **`.eos/project.json`** —
> `"productParadigms": ["deterministic", "agentic"]` (or `"evalRequired": true`). That declaration is
> what `eos-doctor` treats as AUTHORITATIVE: an agentic project with no `docs/eval-plan.md` or no
> runnable harness FAILS. SDK/dir auto-discovery still runs as a safety net, but it can never be
> complete — a self-hosted gateway or a private wrapper leaves no fingerprint, so an undeclared
> agentic product can slip past detection. If discovery finds LLM evidence while the declaration says
> deterministic, the doctor fails until you either declare `agentic` or record
> `"evalWaiver": { "reason": "…", "approvedBy": "…" }`.

## Produce `docs/eval-plan.md`
For each LLM-backed acceptance criterion:
1. **Eval dataset** — representative inputs + expected behavior (golden set). Include edge cases,
   adversarial/prompt-injection cases, and empty/ambiguous inputs.
2. **Graders** — how each output is scored: rule-based / embedding-similarity / LLM-as-judge.
   Prefer temperature=0 for testable paths; use tolerance thresholds, never exact-match, for
   generative ones.
3. **Metrics & baseline thresholds** — task success rate, and for RAG: retrieval recall@k,
   faithfulness/groundedness, answer relevance. Record a baseline; ship only if not regressed.
4. **Cost/latency budget** — max tokens & cost per request, p95 per-call latency (ties to C-nfr).
5. **Safety checks** — prompt-injection resistance, no secret/PII leakage, output moderation.

## How to run (local, offline)
- Node: `node --test evals/*.test.mjs` (pass an explicit file/glob — a bare `evals/` dir errors
  under Node 23's `--test`; wrap it in an npm script `"eval": "node --test evals/*.test.mjs"`).
- Python: `pytest evals/ -q`.
- Don't start from scratch: copy `docs/eos/examples/eval-starter/` (a tiny runnable harness —
  dataset + graders + runner + stub) and replace the stub with your agent.

## Gate G-EVAL (for LLM/agentic work)
- [ ] `.eos/project.json` declares the agentic paradigm (this is what turns the gate on).
- [ ] Every LLM-backed AC has ≥1 eval case with a grader and a pass threshold.
- [ ] A regression baseline exists; the eval command runs locally (`commands.eval`).
- [ ] Adversarial/injection and cost/latency cases are included.

Any unmet item => BLOCKER. Evals are designed here (planning) and **run at G7**; a prompt/model/tool
change that regresses the baseline does not ship. Reuse `bmad-eval-runner` only as a pattern
reference — it grades Agent Skills, not your product; the product eval set is project-owned.

Output: `docs/eval-plan.md`. Next: implement (G6) against these evals; verify at G7.
