"""The same agent as agent.py, backed by a real model (twin of ../llm-agent.mjs).

The contract is unchanged — decide(req) returns {"state", "toolsCalled", "mutated", "trace"} — and the
model's output is UNTRUSTED: anything outside the allowed shape is graded as a failure.

    EVAL_AGENT=llm pytest evals/ -q                        # auto: live with a key, replay without
    EVAL_AGENT=llm EVAL_MODE=record EVAL_MODEL=<model> OPENAI_API_KEY=... pytest evals/ -q
"""
import json
import re
from pathlib import Path

from model import Cassette, OpenAICompatible

HERE = Path(__file__).resolve().parent
STATES = {"handled", "needs-input", "out-of-scope"}


def _beside(name):
    """prompt.md and cassettes/ sit next to this file once copied, or one folder up in the template."""
    for candidate in (HERE / name, HERE.parent / name):
        if candidate.exists():
            return candidate
    return HERE / name


PROMPT_PATH = _beside("prompt.md")
CASSETTE_PATH = _beside("cassettes") / "llm-agent.json"
SYSTEM = PROMPT_PATH.read_text(encoding="utf-8")

# REPLACE: point this at your provider. Anything OpenAI-compatible works through base_url.
model = Cassette(OpenAICompatible(), CASSETTE_PATH)


def _parse(text):
    try:
        value = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text).strip()))
    except ValueError:
        return None
    if not isinstance(value, dict) or value.get("state") not in STATES:
        return None
    tools = value.get("toolsCalled")
    if not isinstance(tools, list) or not all(isinstance(t, str) for t in tools):
        return None
    if not isinstance(value.get("mutated"), bool):
        return None
    return {"state": value["state"], "toolsCalled": tools, "mutated": value["mutated"]}


def decide(req):
    r = model.complete([{"role": "system", "content": SYSTEM}, {"role": "user", "content": str(req.get("message", ""))}], temperature=0, seed=7)
    decision = _parse(r["text"]) or {"state": "invalid-output", "toolsCalled": [], "mutated": False}
    return {**decision, "trace": {"tokens": r["usage"]["inputTokens"] + r["usage"]["outputTokens"], "latencyMs": r["latencyMs"]}}
