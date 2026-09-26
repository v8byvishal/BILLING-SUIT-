"""Deterministic, Selenium-free decision core used by the legacy portal executor.

No CGHS business rules or selectors live here.  The production browser remains app (1).py;
this module makes exact option/row matching, bounded retry, reconciliation, checkpoints,
and timing independently testable with an offline portal double.
"""
import re
import time
from dataclasses import dataclass, field

CODE_TOKEN = re.compile(r"(?<![A-Z0-9])([A-Z]{1,5}\d{2,6})(?![A-Z0-9])", re.I)
ALIASES = {"DRUG100": {"DRUG100", "DRGU100"}, "CNSU100": {"CNSU100"}}
TERMINAL = {"EXECUTED", "ALREADY_PRESENT", "FAILED", "QUANTITY_MISMATCH", "UNVERIFIED", "DUPLICATE_DETECTED"}


def code_tokens(text):
    return {match.upper() for match in CODE_TOKEN.findall(str(text or ""))}


def option_matches_exact_code(text, code, portal_target=None):
    expected = {str(code).upper(), str(portal_target or code).upper()}
    expected |= ALIASES.get(str(code).upper(), set())
    tokens = code_tokens(text)
    # An expected token plus a second code is ambiguous, not an exact selection.
    return bool(tokens) and tokens.issubset(expected)


def select_exact_option(options, code, portal_target=None):
    matches = [option for option in options if option_matches_exact_code(option, code, portal_target)]
    if len(matches) != 1:
        return None
    return matches[0]


def row_matches_exact_code(code_text, code):
    return option_matches_exact_code(code_text, code)


def reconcile_rows(rows, code, expected_quantity):
    matching = [row for row in rows if row_matches_exact_code(row.get("code", ""), code)]
    quantities = [row.get("quantity") for row in matching]
    numeric = [int(value) for value in quantities if str(value).isdigit()]
    actual = sum(numeric) if numeric else (len(matching) if matching else 0)
    if len(matching) > 1 and actual > expected_quantity:
        return "DUPLICATE_DETECTED", actual
    if actual == expected_quantity:
        return "QUANTITY_VERIFIED", actual
    if matching:
        return "QUANTITY_MISMATCH", actual
    return "ROW_NOT_FOUND", 0


@dataclass
class ActionTrace:
    action_id: str
    code: str
    quantity: int
    state: str = "READY"
    checkpoints: list = field(default_factory=list)
    retries: int = 0
    metrics: dict = field(default_factory=lambda: {"search_ms": 0, "selection_ms": 0, "quantity_ms": 0, "verification_ms": 0, "total_ms": 0})

    def checkpoint(self, event, **details):
        self.state = details.pop("state", self.state)
        self.checkpoints.append({"event": event, "state": self.state, **details})


class PortalExecutionCore:
    def __init__(self, portal, clock=None, max_retries=2):
        self.portal = portal
        self.clock = clock or time.perf_counter
        self.max_retries = max_retries

    def _timed(self, trace, metric, operation):
        started = self.clock()
        try:
            return operation()
        finally:
            trace.metrics[metric] += round((self.clock() - started) * 1000, 3)

    def execute(self, action):
        trace = ActionTrace(action["action_id"], action["code"], action["quantity"])
        total_started = self.clock()
        trace.checkpoint("ACTION_STARTED", state="READY", expected_quantity=trace.quantity)
        if not self.portal.connected:
            return self._finish(trace, "FAILED", "BROWSER_DISCONNECTED", None, total_started)
        if not self.portal.speciality_ok(trace.code):
            return self._finish(trace, "FAILED", "SPECIALITY_SYNC_FAILED", None, total_started)
        pre_status, actual = reconcile_rows(self.portal.rows(), trace.code, trace.quantity)
        if pre_status == "QUANTITY_VERIFIED":
            return self._finish(trace, "ALREADY_PRESENT", "QUANTITY_VERIFIED", actual, total_started)
        if pre_status == "DUPLICATE_DETECTED":
            return self._finish(trace, "DUPLICATE_DETECTED", pre_status, actual, total_started)
        uncertain = False
        for attempt in range(self.max_retries + 1):
            if attempt:
                trace.retries += 1
                status, actual = reconcile_rows(self.portal.rows(), trace.code, trace.quantity)
                trace.checkpoint("RETRY_RECONCILED", state="READY", attempt=attempt, portal_status=status)
                if status == "QUANTITY_VERIFIED":
                    return self._finish(trace, "EXECUTED", "RECONCILED_AFTER_UNCERTAIN_INSERTION", actual, total_started)
                if status == "DUPLICATE_DETECTED":
                    return self._finish(trace, status, status, actual, total_started)
                if uncertain:
                    return self._finish(trace, "UNVERIFIED", "UNCERTAIN_INSERTION_NOT_REPEATED", actual, total_started)
            try:
                trace.state = "SEARCHING"
                options = self._timed(trace, "search_ms", lambda: self.portal.search(trace.code))
                trace.checkpoint("SEARCH_COMPLETED", state="RESULT_FOUND", result_count=len(options))
                selected = select_exact_option(options, trace.code, self.portal.portal_target(trace.code))
                if selected is None:
                    return self._finish(trace, "FAILED", "EXACT_OPTION_NOT_FOUND", None, total_started)
                self._timed(trace, "selection_ms", lambda: self.portal.select(selected))
                trace.checkpoint("OPTION_SELECTED", state="OPTION_SELECTED", option=selected)
                self._timed(trace, "quantity_ms", lambda: self.portal.set_quantity(trace.code, trace.quantity))
                trace.checkpoint("QUANTITY_SET", state="QUANTITY_PENDING")
                try:
                    self.portal.add(trace.code, trace.quantity)
                    uncertain = True
                except TimeoutError:
                    uncertain = True
                    raise
                trace.checkpoint("ROW_PENDING", state="ROW_PENDING")
                status, actual = self._timed(trace, "verification_ms", lambda: reconcile_rows(self.portal.rows(), trace.code, trace.quantity))
                if status == "QUANTITY_VERIFIED":
                    return self._finish(trace, "EXECUTED", status, actual, total_started)
                if status == "QUANTITY_MISMATCH":
                    return self._finish(trace, status, status, actual, total_started)
                if status == "DUPLICATE_DETECTED":
                    return self._finish(trace, status, status, actual, total_started)
                return self._finish(trace, "UNVERIFIED", "ROW_NOT_CREATED", actual, total_started)
            except (TimeoutError, StaleReferenceError) as error:
                trace.checkpoint("TRANSIENT_FAILURE", state="READY", attempt=attempt, error=type(error).__name__)
                if attempt >= self.max_retries:
                    return self._finish(trace, "FAILED", "RETRY_EXHAUSTED", None, total_started)
            except BrowserDisconnectedError:
                return self._finish(trace, "FAILED", "BROWSER_DISCONNECTED", None, total_started)
        return self._finish(trace, "FAILED", "RETRY_EXHAUSTED", None, total_started)

    def _finish(self, trace, status, verification, actual, started):
        trace.metrics["total_ms"] = round((self.clock() - started) * 1000, 3)
        event = "ACTION_VERIFIED" if status in {"EXECUTED", "ALREADY_PRESENT"} else "ACTION_FAILED"
        trace.checkpoint(event, state="ROW_CONFIRMED" if status in {"EXECUTED", "ALREADY_PRESENT"} else "FAILED", status=status)
        return {"action_id": trace.action_id, "code": trace.code, "requested_quantity": trace.quantity, "actual_quantity": actual,
                "action_status": status, "verification_result": verification, "retry_count": trace.retries,
                "metrics": trace.metrics, "checkpoints": trace.checkpoints}

    def execute_batch(self, actions):
        started = self.clock()
        results = [self.execute(action) for action in actions]
        duration = round((self.clock() - started) * 1000, 3)
        successful = sum(r["action_status"] == "EXECUTED" for r in results)
        present = sum(r["action_status"] == "ALREADY_PRESENT" for r in results)
        failed = sum(r["action_status"] not in {"EXECUTED", "ALREADY_PRESENT"} for r in results)
        average = round(sum(r["metrics"]["total_ms"] for r in results) / len(results), 3) if results else 0
        return {"results": results, "metrics": {"action_count": len(actions), "successful_count": successful,
                "already_present_count": present, "failed_count": failed, "total_duration_ms": duration,
                "average_action_duration_ms": average}, "checkpoints": ["RUN_STARTED", "BATCH_COMPLETED"]}


class StaleReferenceError(Exception): pass
class BrowserDisconnectedError(Exception): pass
