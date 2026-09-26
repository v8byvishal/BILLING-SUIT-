# Portal Preflight — Phase 06

`PortalPreflightService` is the backend trust boundary between a validated `EnhancementPlan` and any portal execution attempt.

## API

```js
preflight({ billSessionId, planId, planSha256 })
```

Returns:

```json
{
  "preflightId": "...",
  "billSessionId": "...",
  "planId": "...",
  "planSha256": "...",
  "timestamp": "...",
  "status": "READY | BLOCKED | UNAVAILABLE | UNKNOWN | NOT_CHECKED",
  "checks": [],
  "blockingReasons": [],
  "warnings": [],
  "diagnostics": {},
  "cdp": {},
  "portal": {},
  "authentication": {},
  "controls": {}
}
```

## Check result shape

Every check records:

```json
{
  "name": "CDP_ENDPOINT",
  "status": "PASS | FAIL | WARN | NOT_CHECKED",
  "severity": "BLOCKING | WARNING | INFO",
  "message": "...",
  "observed": {},
  "errorCode": "...",
  "timestamp": "..."
}
```

Any `FAIL` with `BLOCKING` severity prevents execution.

## Required checks implemented

| Check | Purpose |
|---|---|
| `PLAN_EXISTS` | Loads authoritative persisted plan from Storage. |
| `PLAN_ID` | Confirms requested plan id matches persisted plan. |
| `PLAN_HASH` | Recalculates canonical hash and compares to stored/requested hash. |
| `PLAN_VALIDATION` | Runs independent `EnhancementPlanValidator`. |
| `PLAN_NOT_STALE` | Blocks parser/registry/rule-set version drift. |
| `PLAN_READY` | Requires `READY_FOR_PORTAL_VALIDATION`. |
| `BILL_SESSION` | Confirms plan belongs to requested bill session. |
| `SOURCE_BILL` | Verifies source bill exists and hash is unchanged. |
| `EXECUTABLE_ACTIONS` | Requires at least one validated action. |
| `ACTIONS_VALIDATED` | Confirms all execution candidates are validated plan actions. |
| `REGISTRY_RULE_CONTEXT` | Confirms registry and rule context exists. |
| `REGISTRY_AUTHORITY_PARTIAL` | Warning when registry context is not official authoritative. |
| `CDP_ENDPOINT` | Checks `127.0.0.1:9222/json/list` or configured CDP endpoint. |
| `CDP_TARGET` | Requires a usable browser page target and expected portal-like target. |
| `PORTAL_IDENTITY` | Requires trusted inspector to prove portal page identity. |
| `AUTHENTICATION` | Requires trusted inspector to prove authenticated state. |
| `PORTAL_CONTROLS` | Requires trusted inspector to prove required controls exist. |
| `PORTAL_BLOCKING_STATE` | Blocks known modals/overlays/blocking states. |
| `PORTAL_BILL_CONTEXT` | Requires trusted context verification before mutation. |

## CDP health check

`CdpHealthCheck` calls:

```text
http://127.0.0.1:9222/json/list
```

It verifies:

- endpoint responds;
- JSON is an array;
- at least one target exists;
- target type is `page` or `webview`;
- target URL parses syntactically;
- a portal-like target is discoverable for deeper inspection.

It does not expose arbitrary CDP command execution to the renderer.

## Portal identity/auth/control checks

The default inspector is intentionally fail-closed for DOM-level controls and bill context. URL/title metadata alone is not enough for READY. A trusted adapter/inspector must prove the actual application markers.

Known existing portal markers are documented from `app (1).py`:

- Treatment Plan header;
- Procedure input;
- Dropdown options;
- Speciality input/clear;
- Quantity input;
- Reason dropdown;
- Plus button;
- Treatment table rows.

If identity, authentication, required controls, or bill context cannot be independently proven, preflight blocks.

## Snapshot persistence

Snapshots are written under:

```text
Storage/Source_Bills/<billSessionId>/execution/<preflightId>.preflight.json
Storage/Source_Bills/<billSessionId>/execution/latest.preflight.json
```

Execution references a READY snapshot and performs a final backend revalidation before scheduling actions.

## Fail-closed outcomes

- CDP unavailable → `UNAVAILABLE`
- Portal target missing → `UNAVAILABLE`
- Plan stale/hash mismatch/source mismatch → `BLOCKED`
- Authentication unverified → `BLOCKED`
- Portal identity ambiguous → `BLOCKED`
- Controls unavailable → `BLOCKED`
- Bill context unverified → `BLOCKED`
