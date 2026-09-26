"""Narrow JSON bridge to the preserved legacy Selenium/CDP executor.

This module contains no portal selectors and no CGHS business rules. It validates the
Phase 4 execution contract, imports app (1).py, and invokes BatchAutomationThread,
which remains the actual browser executor.
"""

import importlib.util
import json
import os
import sys
from datetime import datetime, timezone


def emit_result(payload):
    print("VNEXT_RESULT=" + json.dumps(payload, ensure_ascii=False), flush=True)


def load_legacy(repo_root):
    legacy_path = os.path.join(repo_root, "app (1).py")
    spec = importlib.util.spec_from_file_location("cghs_legacy_portal", legacy_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load legacy portal executor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_request(request):
    if request.get("contract_version") != "1.0.0":
        raise ValueError("Unsupported portal execution contract")
    actions = request.get("actions")
    if not isinstance(actions, list) or not actions:
        raise ValueError("At least one prevalidated portal action is required")
    for action in actions:
        if not action.get("action_id") or not action.get("code"):
            raise ValueError("Every action requires action_id and code")
        quantity = action.get("quantity")
        if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity <= 0:
            raise ValueError("Every action requires a positive integer quantity")
        if action.get("plan_status") not in ("SOURCE_VERIFIED", "RULE_VERIFIED"):
            raise ValueError("Bridge refuses non-executable plan status")


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    try:
        request = json.load(sys.stdin)
        validate_request(request)
        legacy = load_legacy(repo_root)
        completed = {"success": False, "message": "Executor did not finish"}
        patient = {
            "name": request.get("bill", {}).get("bill_number") or request.get("bill", {}).get("source_file") or "VNEXT_PLAN",
            "items": [
                {
                    "action_id": action["action_id"],
                    "code": action["code"],
                    "qty": action["quantity"],
                    "phase4_audit": {
                        "source": action.get("source"),
                        "rule_id": action.get("rule_id"),
                        "source_evidence": action.get("source_evidence", []),
                    },
                }
                for action in request["actions"]
            ],
            "audit": {"aggregation_log": ["Phase 4 validated EnhancementPlan input"]},
        }
        executor = legacy.BatchAutomationThread([patient], "Medium Network (2.5s)")
        executor.finished_signal.connect(lambda success, message: completed.update(success=bool(success), message=str(message)))
        executor.run()  # synchronous child process; legacy QThread logic remains unchanged
        emit_result({
            "run_id": request.get("run_id"),
            "executor": "LEGACY_PYTHON_SELENIUM_CDP",
            "legacy_source": "app (1).py",
            "cdp_endpoint": "127.0.0.1:9222",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "legacy_finished_signal": completed,
            "results": executor.execution_results,
            "fatal_error": executor.fatal_error,
        })
        return 0 if not executor.fatal_error else 1
    except Exception as error:
        emit_result({
            "run_id": None,
            "executor": "LEGACY_PYTHON_SELENIUM_CDP",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "results": [],
            "fatal_error": f"Bridge error: {error}",
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
