#!/usr/bin/env python3
"""Deterministic logical-time regression benchmark; no browser or network."""
import importlib.util, json, pathlib, sys
root = pathlib.Path(__file__).parents[1]
path = root / "src/adapters/legacy-portal/portal_execution_core.py"
spec = importlib.util.spec_from_file_location("portal_execution_core", path)
core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
class Clock:
    def __init__(self): self.t=0
    def __call__(self): self.t += .001; return self.t
class Portal:
    connected=True
    def __init__(self): self.data=[]
    def speciality_ok(self,c): return True
    def rows(self): return list(self.data)
    def search(self,c): return [c+" exact"]
    def portal_target(self,c): return c
    def select(self,o): pass
    def set_quantity(self,c,q): pass
    def add(self,c,q): self.data.append({"code":c,"quantity":q})
actions=[{"action_id":str(i),"code":f"LC{i:03d}","quantity":1} for i in range(1,101)]
result=core.PortalExecutionCore(Portal(),Clock()).execute_batch(actions)
baseline_ms=1001.0
current_ms=result["metrics"]["total_duration_ms"]
threshold=1.10
out={"kind":"offline_logical_time","actions":len(actions),"baseline_ms":baseline_ms,"current_ms":current_ms,"regression_threshold_ratio":threshold,"ratio":round(current_ms/baseline_ms,4),"passed":current_ms <= baseline_ms*threshold}
print(json.dumps(out,sort_keys=True))
sys.exit(0 if out["passed"] else 1)
