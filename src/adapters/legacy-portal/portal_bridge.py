"""Narrow JSON bridge to the preserved legacy Selenium/CDP executor.

This bridge validates an allowlisted JSON contract, imports the preserved
`app (1).py` implementation, and invokes either a non-mutating portal inspection
or the existing BatchAutomationThread execution path. It does not accept shell
commands, arbitrary Python operations, raw selectors, credentials, cookies, or
browser profile data from callers.
"""

import importlib.util
import json
import os
import sys
from datetime import datetime, timezone

ALLOWED_OPERATIONS = {"inspect_portal_state", "execute_plan_action_batch"}
CDP_ENDPOINT = "127.0.0.1:9222"


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


def validate_common(request):
    if request.get("contract_version") != "1.0.0":
        raise ValueError("Unsupported portal bridge contract")
    operation = request.get("operation")
    if operation not in ALLOWED_OPERATIONS:
        raise ValueError("Unsupported portal bridge operation")
    forbidden = {"command", "shell", "selector", "script", "eval", "password", "token", "cookie", "browser_profile", "discharge"}
    if any(key in request for key in forbidden):
        raise ValueError("Forbidden portal bridge field present")
    return operation


def validate_execute_request(request):
    actions = request.get("actions")
    if not isinstance(actions, list) or not actions:
        raise ValueError("At least one prevalidated portal action is required")
    for action in actions:
        if not action.get("action_id") or not action.get("code"):
            raise ValueError("Every action requires action_id and code")
        quantity = action.get("quantity")
        if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity <= 0:
            raise ValueError("Every action requires a positive integer quantity")
        if action.get("plan_status") not in ("SOURCE_VERIFIED", "RULE_VERIFIED", "CUSTOM_VALID"):
            raise ValueError("Bridge refuses non-executable plan status")


def safe_text(value, limit=200):
    text = str(value or "")
    return text[:limit]


def element_count(driver, locators):
    count = 0
    for strategy, value in locators:
        try:
            for element in driver.find_elements(strategy, value):
                try:
                    if element.is_displayed():
                        count += 1
                except Exception:
                    count += 1
        except Exception:
            continue
    return count


def first_text(driver, locators):
    for strategy, value in locators:
        try:
            for element in driver.find_elements(strategy, value):
                try:
                    if element.is_displayed():
                        text = safe_text(element.text or element.get_attribute("value") or element.get_attribute("innerText"))
                        if text:
                            return text
                except Exception:
                    continue
        except Exception:
            continue
    return ""


def contains_visible_password_input(driver):
    try:
        elements = driver.find_elements("xpath", "//input[@type='password']")
        return any(element.is_displayed() for element in elements)
    except Exception:
        return False


def visible_blocking_elements(driver):
    expressions = [
        "//*[contains(translate(@class,'MODAL','modal'),'modal') and not(contains(translate(@style,'DISPLAY: NONE','display: none'),'display: none'))]",
        "//*[contains(translate(@class,'OVERLAY','overlay'),'overlay') and not(contains(translate(@style,'DISPLAY: NONE','display: none'),'display: none'))]",
        "//*[contains(translate(text(),'SESSION EXPIRED','session expired'),'session expired')]",
    ]
    found = []
    for expression in expressions:
        try:
            for element in driver.find_elements("xpath", expression):
                try:
                    if element.is_displayed():
                        found.append(safe_text(element.text or element.get_attribute("class") or expression, 120))
                except Exception:
                    continue
        except Exception:
            continue
    return found[:5]


def page_contains_expected_context(driver, expected):
    if not isinstance(expected, dict) or not expected:
        return False
    probes = []
    for key in ("billNumber", "uhid", "patientName"):
        value = expected.get(key)
        if isinstance(value, str) and value.strip():
            probes.append(value.strip().lower())
    if not probes:
        return False
    try:
        body_text = (driver.find_element("tag name", "body").text or "").lower()
    except Exception:
        body_text = ""
    return all(probe in body_text for probe in probes)


def inspect_portal_state(legacy, request):
    options = legacy.Options()
    options.add_experimental_option("debuggerAddress", CDP_ENDPOINT)
    driver = legacy.webdriver.Chrome(options=options)

    locators = getattr(legacy, "LOCATORS", {})
    current_url = safe_text(getattr(driver, "current_url", ""), 500)
    title = safe_text(getattr(driver, "title", ""), 200)
    page_text = ""
    try:
        page_text = safe_text(driver.find_element("tag name", "body").text, 2000).lower()
    except Exception:
        page_text = ""

    control_counts = {
        "treatmentPlanHeader": element_count(driver, locators.get("TREATMENT_PLAN_HEADER", [])),
        "procedureInput": element_count(driver, locators.get("PROCEDURE_INPUT", [])),
        "specialityInput": element_count(driver, locators.get("SPECIALITY_INPUT", [])),
        "quantityInput": element_count(driver, locators.get("QUANTITY_INPUT", [])),
        "reasonDropdown": element_count(driver, locators.get("REASON_DROPDOWN", [])),
        "plusButton": element_count(driver, locators.get("PLUS_BUTTON", [])),
        "tableRows": element_count(driver, locators.get("TABLE_ROWS", [])),
    }
    required_present = all(control_counts[name] > 0 for name in ("treatmentPlanHeader", "procedureInput", "specialityInput", "quantityInput", "reasonDropdown", "plusButton"))
    identity_verified = bool(required_present or "cghs" in current_url.lower() or "cghs" in title.lower() or "treatment plan" in page_text)
    login_present = contains_visible_password_input(driver) or "login" in current_url.lower() or "sign in" in page_text or "signin" in page_text
    authenticated = bool(identity_verified and required_present and not login_present)
    blocking = visible_blocking_elements(driver)
    expected_context = request.get("expectedContext") or {}
    bill_context_verified = page_contains_expected_context(driver, expected_context)

    return {
        "run_id": request.get("run_id"),
        "executor": "LEGACY_PYTHON_SELENIUM_CDP",
        "operation": "inspect_portal_state",
        "legacy_source": "app (1).py",
        "cdp_endpoint": CDP_ENDPOINT,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "portal": {
            "identityVerified": identity_verified,
            "portalName": "CGHS" if identity_verified else None,
            "authenticated": authenticated,
            "requiredControls": {key: value > 0 for key, value in control_counts.items()},
            "controlCounts": control_counts,
            "blockingState": {"present": bool(blocking or login_present), "details": blocking + (["login/password prompt visible"] if login_present else [])},
            "billContextVerified": bill_context_verified,
            "url": current_url,
            "title": title,
            "treatmentHeader": first_text(driver, locators.get("TREATMENT_PLAN_HEADER", [])),
        },
    }


def execute_plan_action_batch(legacy, request):
    validate_execute_request(request)
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
        "audit": {"aggregation_log": ["Phase 6 validated EnhancementPlan input"]},
    }
    executor = legacy.BatchAutomationThread([patient], "Medium Network (2.5s)")
    executor.finished_signal.connect(lambda success, message: completed.update(success=bool(success), message=str(message)))
    executor.run()  # synchronous child process; legacy QThread logic remains unchanged
    return {
        "run_id": request.get("run_id"),
        "executor": "LEGACY_PYTHON_SELENIUM_CDP",
        "operation": "execute_plan_action_batch",
        "legacy_source": "app (1).py",
        "cdp_endpoint": CDP_ENDPOINT,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "legacy_finished_signal": completed,
        "results": executor.execution_results,
        "checkpoints": executor.execution_checkpoints,
        "metrics": executor.batch_metrics,
        "fatal_error": executor.fatal_error,
    }


def main():
    repo_root = getattr(sys, "_MEIPASS", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
    try:
        request = json.load(sys.stdin)
        operation = validate_common(request)
        legacy = load_legacy(repo_root)
        if operation == "inspect_portal_state":
            emit_result(inspect_portal_state(legacy, request))
            return 0
        result = execute_plan_action_batch(legacy, request)
        emit_result(result)
        return 0 if not result.get("fatal_error") else 1
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
