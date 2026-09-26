# CGHS Registry — Phase 4

## Purpose

The CGHS registry is a versioned, validated, auditable data source for deterministic rule resolution. It is separate from parser evidence and separate from executable portal actions.

Phase 4 implements registry architecture and partial unverified bundled registry support. It does not claim an official CGHS master/rate source exists in this repository.

## Source hierarchy

| Level | Source | Authority status | May validate a mapping? |
|---:|---|---|---|
| 1 | Explicitly approved CGHS master/rate source | `AUTHORITATIVE` | Yes |
| 2 | Explicitly approved project rule source | `PROJECT_APPROVED` | Yes |
| 3 | Verified test-backed local rules | `TEST_ONLY` / `VERIFIED_RULE` | Yes for tests and deterministic architecture validation |
| 4 | Legacy project mappings | `LEGACY` | No |
| 5 | Parser evidence | `PARSER_EVIDENCE` | No |
| 6 | Heuristic inference | `HEURISTIC` | No |

Unknown authority is represented as `UNVERIFIED` or `DATE_UNVERIFIED` and cannot produce a direct validated mapping.

## Registry schema

```json
{
  "schemaVersion": 1,
  "registryVersion": "phase4-test-registry-v1",
  "source": {
    "type": "JSON",
    "file": "source-file.json"
  },
  "sourceHash": "sha256-or-source-hash",
  "publishedDate": "2026-09-27",
  "importedAt": "2026-09-27T00:00:00.000Z",
  "authorityStatus": "TEST_ONLY",
  "entries": []
}
```

## Registry entry schema

```json
{
  "entryId": "REG-LB126",
  "code": "LB126",
  "description": "Ferritin",
  "category": "LAB",
  "unit": "COUNT",
  "rate": null,
  "sourceReference": {
    "file": "source-file.json",
    "page": null,
    "sheet": null,
    "row": 1
  },
  "authorityStatus": "TEST_ONLY",
  "effectiveFrom": null,
  "effectiveTo": null
}
```

Rates are optional. Missing rates are not fabricated.

## Validation

`src/services/cghs/registry.js` validates:

- schema version;
- registry version;
- source object;
- source hash;
- registry and entry authority status;
- required entry code;
- malformed codes;
- missing source reference;
- duplicate overlapping code entries;
- conflicting overlapping code descriptions;
- invalid effective dates;
- invalid rates.

Validation returns:

- `PASS`
- `WARN`
- `FAIL`

A `FAIL` registry cannot become active.

## Active registry

Runtime active registry state is stored under Phase 2 external Storage:

```text
Storage/CGHS/registries/<registryVersion>-<hash>.json
Storage/CGHS/validation/<registryVersion>-<hash>.json.validation.json
Storage/CGHS/active-registry.json
```

`active-registry.json` records:

- `registryVersion`
- `sourceHash`
- registry path
- validation path
- authority status
- activation timestamp
- optional operator/reason

Changing the active registry writes an audit event `CGHS_REGISTRY_ACTIVATED`.

## Bundled partial registry

On desktop startup, if no active registry exists, the app can install the bundled HFOS/reference snapshot into Storage as an unverified partial registry.

Source:

```text
src/services/cghs/data/hfos-reference-rates.json
```

Status:

```text
authorityStatus = UNVERIFIED
registry UI status = PARTIAL
```

Exact matches from this source are traceable but review-required. They are not executable authority.

## Supported import formats

Implemented:

- JSON registry (`entries[]`);
- JSON legacy rate source (`records[]`);
- CSV registry with headers.

Not implemented in Phase 4:

- XLS/XLSX import.

No approved XLS/XLSX registry source exists in the repository, and the project currently has no XLSX dependency. XLSX support should be added only when an approved source and dependency/security review exist.

## Effective dates

If registry entries include effective dates, lookup respects the supplied effective date. If an entry has effective dates and no effective date is supplied for resolution, authority becomes `DATE_UNVERIFIED` and the result requires review.

Overlapping entries with conflicting description/rate become conflicts instead of silently selecting a winner.

## Security

Registry data is treated as data only:

- no `eval()`;
- no `new Function()`;
- no shell execution;
- no dynamic JavaScript from registry fields;
- no external API lookup during normal resolution.
