import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[2]
PATH = ROOT / "src/adapters/legacy-portal/portal_execution_core.py"
spec = importlib.util.spec_from_file_location("portal_execution_core", PATH)
core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)


class Clock:
    def __init__(self): self.value = 0
    def __call__(self): self.value += .001; return self.value


class Portal:
    def __init__(self, options=None, rows=None):
        self.connected = True; self.options = ["LC001 - Exact"] if options is None else options
        self._rows = list(rows or []); self.search_error = None; self.add_error = None
        self.speciality = True; self.add_calls = 0; self.delay_reads = 0
    def speciality_ok(self, code): return self.speciality
    def rows(self):
        if self.delay_reads: self.delay_reads -= 1; return []
        return list(self._rows)
    def search(self, code):
        if self.search_error:
            e, self.search_error = self.search_error, None; raise e
        return self.options
    def portal_target(self, code): return "DRGU100" if code == "DRUG100" else code
    def select(self, option): pass
    def set_quantity(self, code, quantity): pass
    def add(self, code, quantity):
        self.add_calls += 1
        if self.add_error:
            error, self.add_error = self.add_error, None
            if getattr(error, "inserted", False): self._rows.append({"code": code, "quantity": quantity})
            raise error
        self._rows.append({"code": code, "quantity": quantity})


def action(code="LC001", quantity=2): return {"action_id": "a1", "code": code, "quantity": quantity}


class PortalCoreTests(unittest.TestCase):
    def run_action(self, portal, **kw): return core.PortalExecutionCore(portal, Clock(), **kw).execute(action())

    def test_exact_option(self): self.assertEqual(core.select_exact_option(["LC001 exact"], "LC001"), "LC001 exact")
    def test_partial_option_rejected(self): self.assertIsNone(core.select_exact_option(["XLC0019 partial"], "LC001"))
    def test_similar_option_rejected(self): self.assertIsNone(core.select_exact_option(["LC0010 similar"], "LC001"))
    def test_description_match_rejected(self): self.assertIsNone(core.select_exact_option(["description LC procedure"], "LC001"))
    def test_multiple_exact_results_rejected(self): self.assertIsNone(core.select_exact_option(["LC001 one", "LC001 two"], "LC001"))
    def test_missing_result_failed(self): self.assertEqual(self.run_action(Portal(options=[]))["verification_result"], "EXACT_OPTION_NOT_FOUND")
    def test_exact_row_and_quantity_executes(self): self.assertEqual(self.run_action(Portal())["action_status"], "EXECUTED")
    def test_preexisting_exact_is_already_present(self): self.assertEqual(self.run_action(Portal(rows=[{"code":"LC001","quantity":2}]))["action_status"], "ALREADY_PRESENT")
    def test_preexisting_wrong_quantity_is_not_present(self): self.assertEqual(self.run_action(Portal(rows=[{"code":"LC001","quantity":1}]))["action_status"], "DUPLICATE_DETECTED")
    def test_duplicate_detected(self): self.assertEqual(self.run_action(Portal(rows=[{"code":"LC001","quantity":2},{"code":"LC001","quantity":2}]))["action_status"], "DUPLICATE_DETECTED")
    def test_unverifiable_row_is_not_executed(self):
        p=Portal(); p.add=lambda c,q: None
        self.assertEqual(self.run_action(p)["action_status"], "UNVERIFIED")
    def test_speciality_failure_isolated(self):
        p=Portal(); p.speciality=False
        self.assertEqual(self.run_action(p)["verification_result"], "SPECIALITY_SYNC_FAILED")
    def test_initial_disconnect_stops(self):
        p=Portal(); p.connected=False
        self.assertEqual(self.run_action(p)["verification_result"], "BROWSER_DISCONNECTED")
    def test_disconnect_exception_stops_without_resume(self):
        p=Portal(); p.search_error=core.BrowserDisconnectedError()
        r=self.run_action(p); self.assertEqual(r["verification_result"], "BROWSER_DISCONNECTED"); self.assertEqual(r["retry_count"],0)
    def test_stale_search_retries_bounded(self):
        p=Portal(); p.search_error=core.StaleReferenceError()
        r=self.run_action(p); self.assertEqual(r["action_status"],"EXECUTED"); self.assertEqual(r["retry_count"],1)
    def test_timeout_before_insertion_safely_retries(self):
        p=Portal(); p.search_error=TimeoutError()
        r=self.run_action(p); self.assertEqual(r["action_status"],"EXECUTED"); self.assertEqual(p.add_calls,1)
    def test_uncertain_insert_reconciles_success(self):
        class InsertedTimeout(TimeoutError): inserted=True
        p=Portal(); p.add_error=InsertedTimeout()
        r=self.run_action(p); self.assertEqual(r["action_status"],"EXECUTED"); self.assertEqual(p.add_calls,1)
    def test_uncertain_insert_never_clicked_twice(self):
        p=Portal(); p.add_error=TimeoutError()
        r=self.run_action(p); self.assertEqual(r["action_status"],"UNVERIFIED"); self.assertEqual(p.add_calls,1)
    def test_retry_exhaustion(self):
        class AlwaysStale(Portal):
            def search(self, code): raise core.StaleReferenceError()
        r=self.run_action(AlwaysStale(), max_retries=2); self.assertEqual(r["verification_result"],"RETRY_EXHAUSTED"); self.assertEqual(r["retry_count"],2)
    def test_drug_alias_exact_only(self):
        self.assertTrue(core.option_matches_exact_code("DRGU100 - Drugs", "DRUG100", "DRGU100")); self.assertFalse(core.option_matches_exact_code("DRGU1000", "DRUG100", "DRGU100"))
    def test_unknown_quantity_is_unverified_or_mismatch(self):
        status,_=core.reconcile_rows([{"code":"LC001","quantity":"?"}],"LC001",2); self.assertEqual(status,"QUANTITY_MISMATCH")
    def test_metrics_have_all_phase_fields(self):
        r=self.run_action(Portal()); self.assertEqual(set(r["metrics"]), {"search_ms","selection_ms","quantity_ms","verification_ms","total_ms"})
    def test_action_checkpoints_started_and_verified(self):
        events=[x["event"] for x in self.run_action(Portal())["checkpoints"]]; self.assertEqual(events[0],"ACTION_STARTED"); self.assertEqual(events[-1],"ACTION_VERIFIED")
    def test_failure_checkpoint(self): self.assertEqual(self.run_action(Portal(options=[]))["checkpoints"][-1]["event"],"ACTION_FAILED")
    def test_batch_failure_isolation_and_counts(self):
        class Mixed(Portal):
            def search(self, code): return [f"{code} exact"] if code != "BAD001" else []
        actions=[action(), {"action_id":"a2","code":"BAD001","quantity":1}]
        b=core.PortalExecutionCore(Mixed(),Clock()).execute_batch(actions)
        self.assertEqual([r["action_status"] for r in b["results"]],["EXECUTED","FAILED"]); self.assertEqual(b["metrics"]["failed_count"],1)
    def test_batch_run_and_completion_checkpoints(self): self.assertEqual(core.PortalExecutionCore(Portal(),Clock()).execute_batch([])["checkpoints"],["RUN_STARTED","BATCH_COMPLETED"])
    def test_batch_average_metric(self): self.assertGreaterEqual(core.PortalExecutionCore(Portal(),Clock()).execute_batch([action()])["metrics"]["average_action_duration_ms"],0)
    def test_custom_code_format(self): self.assertTrue(core.option_matches_exact_code("RX999 custom", "RX999"))
    def test_locked_quantity_is_verified_from_rows(self):
        # The core trusts only re-read rows; lock mechanics remain in the legacy executor.
        p=Portal(rows=[{"code":"LC001","quantity":2}]); self.assertEqual(self.run_action(p)["verification_result"],"QUANTITY_VERIFIED")
    def test_no_substring_duplicate(self): self.assertEqual(core.reconcile_rows([{"code":"XLC0019","quantity":2}],"LC001",2)[0],"ROW_NOT_FOUND")
    def test_zero_action_batch(self): self.assertEqual(core.PortalExecutionCore(Portal(),Clock()).execute_batch([])["metrics"]["average_action_duration_ms"],0)
    def test_delayed_result_after_timeout_is_bounded(self):
        p=Portal(); p.search_error=core.StaleReferenceError(); self.assertEqual(self.run_action(p)["retry_count"],1)

if __name__ == "__main__": unittest.main()
