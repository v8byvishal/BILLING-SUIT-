# Portal Security Review — Phase 06

## Summary

Phase 6 adds a backend-only portal preflight and safe execution gate. It preserves the existing legacy Selenium/CDP implementation but prevents untrusted renderer state from authorizing portal mutation.

## Trust boundary

Renderer/UI is untrusted for:

- CDP readiness;
- authentication state;
- portal page identity;
- bill/patient context;
- action list;
- action selector;
- action quantity;
- final code;
- validation flag;
- plan hash;
- Python/CDP operation details.

Backend services load and validate all authoritative state from Storage.

## Controlled IPC surface

Phase 6 exposes only these portal operations through the existing IPC contract:

- `portal.preflight`
- `portal.getPreflight`
- `portal.startExecution`
- `portal.getExecution`
- `portal.cancelExecution`
- `portal.getExecutionSummary`
- `portal.revalidate`

No raw CDP, Python, shell, selector, or filesystem operation is exposed to the renderer.

## Disabled legacy direct mutation

The old `portal:execute` legacy handler now fails with a Phase 6 message. Legacy `portal:preview` no longer emits direct mutable action requests and points callers to controlled Phase 6 preflight/start operations.

## Python bridge hardening

The existing bridge remains narrow:

- fixed script path;
- fixed spawn arguments;
- `shell:false`;
- JSON stdin/stdout contract;
- explicit contract version;
- explicit allowlisted operations `inspect_portal_state` and `execute_plan_action_batch`;
- validated action object fields;
- no arbitrary command strings;
- no raw selectors from renderer;
- no credential fields.

## Credential policy

Phase 6 does not implement credential automation. It does not:

- collect portal usernames/passwords;
- store passwords;
- inject credentials;
- persist cookies/tokens;
- store browser profiles;
- automate login.

Operator authentication remains manual in the approved browser session.

## Discharge policy

Phase 6 does not implement discharge automation. No IPC operation exposes discharge mutation.

## Final bill policy

Phase 6 does not implement final PDF generation. Portal execution result persistence is separate from final-bill composition.

## Data retention policy

Runtime Storage data, patient PDFs, screenshots, DOM captures, cookies, tokens, browser profiles, final bills, and other PHI-bearing artifacts must not be committed to Git.

The code changes add only synthetic fixtures and deterministic mock tests.

## Fail-closed defaults

The default preflight inspector cannot prove portal DOM controls or bill context by URL/title alone and therefore blocks. A trusted adapter/inspector must supply identity/auth/control/context proof.

## Remaining risks

| Risk | Mitigation in Phase 6 | Status |
|---|---|---|
| Real portal DOM drift | Required controls check + post-action verification | Partially mitigated; live portal not verified |
| Wrong authenticated patient/bill context | Portal bill context check | Default blocks unless proven |
| Legacy Selenium unexpected behavior | State machine, duplicate checks, verification, bounded retries | Mitigated, requires live testing |
| Legacy screenshots contain PHI | Diagnostics documented as runtime-only, not Git artifacts | Procedural control |
| Electron runtime unavailable in sandbox | Desktop launch reported BLOCKED, not PASS | Known environment issue |

## Live verification status

```text
LIVE_PORTAL: NOT VERIFIED
```
