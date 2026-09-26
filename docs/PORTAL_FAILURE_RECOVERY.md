# Portal Failure Recovery — Phase 06

Phase 6 treats portal mutation as a safety-critical operation. All uncertain states fail closed and are persisted for manual review.

## Startup recovery

On desktop startup the application scans persisted source bills and marks portal runs still in active states as interrupted.

Active states treated as interrupted:

- `PREFLIGHT`
- `READY`
- `RUNNING`
- `PAUSED`
- `CANCELLING`

Interrupted runs are persisted as:

```json
{
  "status": "INTERRUPTED",
  "interruptedAt": "...",
  "requiresReview": true
}
```

They require operator review. They are not silently resumed.

## Persisted run artifacts

Run details:

```text
Storage/Source_Bills/<billSessionId>/execution/<runId>.json
```

Run summary:

```text
Storage/Source_Bills/<billSessionId>/execution/<runId>-summary.json
```

Failure records are appended to the standard Storage failure log. Phase 6 failure entries include `PORTAL_EXECUTION` or `PORTAL_PREFLIGHT` stage and a structured failure code.

## Important failure codes

| Code | Meaning | Recovery |
|---|---|---|
| `PLAN_NOT_FOUND` | Persisted plan missing | Rebuild plan from source bill. |
| `PLAN_HASH_MISMATCH` | Stored/requested/calculated hash mismatch | Stop. Rebuild/revalidate plan. |
| `PLAN_STALE` | Parser, registry, rule-set, or source context drifted | Rebuild plan. |
| `SOURCE_BILL_CHANGED` | Source bill missing or hash changed | Re-import/rebuild; manual review. |
| `PLAN_NOT_READY` | Plan is not ready for portal | Resolve review/blocking items. |
| `INVALID_ACTION` | Action is not a valid Phase 6 portal action | Rebuild/fix plan source. |
| `CDP_UNAVAILABLE` | Chrome debug endpoint unavailable | Start approved Chrome debug session manually. |
| `PORTAL_TARGET_NOT_FOUND` | No portal target in CDP target list | Navigate authenticated Chrome to portal. |
| `PORTAL_IDENTITY_UNVERIFIED` | Target cannot be proven as correct portal | Stop; select correct portal/session. |
| `AUTH_NOT_VERIFIED` | Authenticated state not proven | Operator must authenticate manually. |
| `PORTAL_CONTROLS_MISSING` | Required Treatment Plan controls unavailable | Navigate to correct page; do not execute. |
| `PORTAL_CONTEXT_MISMATCH` | Bill/patient context not proven | Stop; operator review required. |
| `DUPLICATE_DETECTED` | Desired row already present | No further mutation required for that action. |
| `QUANTITY_MISMATCH` | Desired final quantity cannot be reconciled | Manual portal review. |
| `LOCKED_QUANTITY` | Quantity field locked/readonly and unsafe to change | Manual portal review. |
| `SPECIALITY_SYNC_FAILED` | Required speciality could not be synchronized | Manual portal review. |
| `VERIFICATION_FAILED` | Post-action state does not match desired state | Manual portal review. |
| `PORTAL_TIMEOUT` | Portal operation timed out | Review portal before any retry. |
| `CONCURRENCY_LOCKED` | Another run is active for same bill session | Wait for active run/cancel/review. |
| `CANCELLED` | Operator cancellation | Review partial result. |

## Cancellation recovery

Cancellation persists all action states completed before cancellation and marks remaining actions as `CANCELLED` or leaves them terminal according to observed state. A cancelled run is never reported as full success.

## Timeout recovery

On timeout the service re-inspects exact-code portal state before deciding whether the action was applied. If the portal state cannot be proven safe, it records failure and stops blind retry.

## Screenshot / DOM artifacts

Legacy `app (1).py` can capture screenshots/DOM under its diagnostic path. Such artifacts may contain PHI and must not be committed to Git. Phase 6 stores only structured failure references in Storage failure/audit records unless the operator explicitly retrieves runtime diagnostics outside version control.

## Manual review checklist

Before any re-run after failure:

1. Open the persisted run JSON and summary.
2. Confirm which exact codes reached `SUCCESS` or `DUPLICATE`.
3. Verify portal rows and quantities manually.
4. Do not rebuild or execute against a stale plan.
5. Run preflight again.
6. Start only with explicit operator confirmation.
