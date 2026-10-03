"""Minimal "system under test" stub — REPLACE with your real agent / LLM call.

Contract: given a request, return a decision your graders can score:
{"state", "toolsCalled", "mutated", "trace": {"tokens", "latencyMs"}}.
In production the planner is an LLM constrained to this same output shape; keep it deterministic
(temperature=0 / seed) on testable paths so evals are reproducible.
"""
import math
import re


def decide(req):
    msg = str(req.get("message", "")).lower()
    tools_called = ["lookup"]  # pretend we grounded on a data source
    out_of_scope = re.search(r"(refund|cancel|discount)", msg) is not None
    has_subject = re.search(r"\b(order|address|account)\b", msg) is not None

    state = "handled"
    if out_of_scope:
        state = "out-of-scope"
    elif not has_subject:
        state = "needs-input"

    # trace carries the numbers your budget grader checks.
    trace = {"tokens": math.ceil(len(msg) / 4) + 20, "latencyMs": 5}
    return {"state": state, "toolsCalled": tools_called, "mutated": False, "trace": trace}
