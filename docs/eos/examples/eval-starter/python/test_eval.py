"""pytest entry point: `pytest evals/ -q` (the rag-app starter pack's commands.eval)."""
from run_eval import main


def test_eval_baseline_and_summary():
    assert main() == 0, "eval baseline not met — see docs/evidence/eval-summary.json"
