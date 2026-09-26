# CGHS Registry Audit — Phase 4

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Phase 3 baseline: `04aac2a373ef3cf12062a465d9fcbfdedf6bc8ff`

## Audit scope

This audit searched the repository for CGHS master data, rate lists, code tables, registry-like files, rule documents, legacy mapping logic, fixtures, tests, comments, and hardcoded dictionaries. The audit separates source evidence from business authority.

Search categories used:

- CGHS master/rate references;
- JSON/CSV/XLS/XLSX/PDF-style data files;
- code/rate/mapping/rule modules;
- legacy Python normalization;
- historical docs and reports;
- unit/integration fixtures;
- comments containing CGHS code examples and mapping claims.

No real hospital bill PDF or official CGHS PDF master/rate document was found in this checkout.

## Authority hierarchy adopted for Phase 4

| Level | Source class | May establish validated mapping? | Notes |
|---:|---|---|---|
| 1 | Explicitly approved CGHS master/rate source | Yes | None found in repo. |
| 2 | Explicitly approved project rule source | Yes | The Phase 4 instruction provides the locked rules implemented in this phase. |
| 3 | Verified test-backed local rules | Yes for test architecture only | Synthetic fixtures prove deterministic behavior but are not production CGHS authority. |
| 4 | Legacy project mappings | No | May inform tests/audit only. Must not silently validate mappings. |
| 5 | Parser evidence | No | Parser candidates preserve source facts; they are not business validation. |
| 6 | Heuristic inference | No | May at most produce review candidates. |

## Discovered CGHS knowledge sources

| Source | Source type | Version/date | Authority level | Machine-readable | Coverage | Conflicts / gaps | Consumers | Safe as executable authority? |
|---|---|---|---:|---|---|---|---|---|
| `src/services/cghs/data/hfos-reference-rates.json` | Embedded HFOS/reference-rate snapshot extracted from legacy HTML | `version: null`, `effective_date: null`; file SHA-256 `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`; metadata source SHA `40152488c6d8eab690afcd46e940ea1c9fcb34e4f50598afb520e9086f822e5f` | 4 / UNVERIFIED | Yes, JSON | 1,998 code/rate records | Metadata explicitly says `RATE_SOURCE_UNDEFINED`; no official source document or effective date evidence; rates cannot be treated as authoritative | `src/services/cghs/rate-list/*`, existing `evaluateBill()` | No. Phase 4 may load it as active partial/unverified registry, but exact matches from it remain review-required. |
| `CGHS_Billing_Suite_Pro.html` | Legacy single-file application with embedded `MASTER_CGHS` | No authoritative publication date; SHA-256 `40152488c6d8eab690afcd46e940ea1c9fcb34e4f50598afb520e9086f822e5f` | 4 / LEGACY | Semi-readable JavaScript inside HTML | Historical 1,998-code master used by the legacy app | Not an official master document; embedded app logic is broad and includes legacy transformations | Legacy app only; extracted into `hfos-reference-rates.json` | No. Audit/reference only. |
| `tests/fixtures/rates/authoritative-test-rates.json` | Synthetic unit-test rate source | `version: test-1`, `effective_date: 2026-09-26`; SHA-256 `ad5771cd9f0f015c58cd8d8112705143eda8088e3fecb11ebed0ec0921db8494` | 3 / TEST_ONLY | Yes, JSON | 8 synthetic rates | Explicitly says not CGHS production authority | `tests/unit/rate-list.test.js`, `tests/unit/rule-engine.test.js` | Only inside tests. Not production authority. |
| `src/services/cghs/rate-list/loader.js` | Existing rate-source loader | Source-level module | 4 / LEGACY infrastructure | Yes, code | Loads JSON source and validates metadata through existing validator | Existing authority enum only had `AUTHORITATIVE` and `RATE_SOURCE_UNDEFINED`; not enough for Phase 4 source hierarchy | Existing `createBundledRateRepository()` | Infrastructure safe; loaded data authority depends on validated registry. |
| `src/services/cghs/rate-list/validator.js` | Existing rate-source validator | Source-level module | 4 / LEGACY infrastructure | Yes, code | Validates existing rate source metadata and checksum | Does not model Phase 4 registry source references, effective ranges, active registry, or rule provenance | Existing rate-list tests | Infrastructure only. Not a mapping authority. |
| `src/services/cghs/rate-list/repository.js` | Existing lookup repository | Source-level module | 4 / LEGACY infrastructure | Yes, code | Exact code lookup plus custom-code overlay | Uses unverified HFOS snapshot; not sufficient for Phase 4 validated mappings | Existing rule engine | Infrastructure only. Phase 4 adds separate resolver. |
| `src/services/cghs/rules/cc001.js` | Existing deterministic derived rule | Source-level module | 4 / LEGACY mapping logic | Yes, code | ICU room-rent count -> `CC001` | Useful but was part of older EnhancementPlan; Phase 4 rewrites as explicit rule object and requires source counts | Existing `rule-engine.js` tests | Not automatically. Re-encoded as explicit Phase 4 project rule. |
| `src/services/cghs/rules/wc001.js` | Existing deterministic derived rule | Source-level module | 4 / LEGACY mapping logic | Yes, code | Ward room-rent count -> `WC001` | Same as above | Existing `rule-engine.js` tests | Not automatically. Re-encoded explicitly. |
| `src/services/cghs/rules/cn002.js` | Existing deterministic derived rule | Source-level module | 4 / LEGACY mapping logic | Yes, code | `CN002 = ICU × 3 + Ward × 2` | Requires reliable ICU/Ward evidence; missing/ambiguous counts must review | Existing `rule-engine.js` tests | Not automatically. Re-encoded explicitly. |
| `src/services/cghs/rules/cc002.js` | Existing oxygen derived rule | Source-level module | 4 / LEGACY mapping logic | Yes, code | Oxygen rows; full day/half day; `C002`/`CC002` context | Legacy unqualified oxygen single-unit behavior is not adopted as Phase 4 validated mapping | Existing `rule-engine.js` tests | Partially. Phase 4 only validates explicit half/full day rules. |
| `src/services/cghs/rules/room-evidence.js` | Existing room evidence classifier | Source-level module | 4 / LEGACY evidence logic | Yes, code | ICU/Ward/HDU classification | HDU ambiguous; classifier is not registry authority | Existing derived rules | Evidence helper only. |
| `src/services/cghs/rules/rule-engine.js` | Existing EnhancementPlan rule engine | Source-level module | 4 / LEGACY mapping/plan logic | Yes, code | Direct codes, room rules, oxygen, patient-payable exclusions | Produces EnhancementPlan entries and older execution summary; Phase 4 must not produce portal actions | Existing plan/evaluate tests | No for Phase 4 authority. Preserved but not replaced. |
| `app (1).py` | Legacy Python parser/portal automation | No official version; SHA-256 `2f13e024b032146546b1e98ed421db6507fa2ef3187a561476943b6d38f6a25d` | 4 / LEGACY | Yes, code | Broad `VALID_CODES`, CGHS category compositions, oxygen/room logic, Selenium executor | Contains broad category and candidate generation comments such as `C + C002 => CC002`; must not be treated as authoritative without explicit rules | Legacy portal path | No. Portal automation must not be modified or invoked by Phase 4. |
| `RULES.md` | Binding project safety rules | Current repository document; SHA-256 `6e54341744d95335ca218afed21e7db23d55bec0a8c1ccb6bac46c6feed3af08` | 2 / PROJECT_APPROVED safety policy | Markdown | Determinism, no guessing, Patient Payable separation, no fuzzy portal selection, unverified rates visible | Does not enumerate all Phase 4 locked mappings | Human and implementation policy | Yes for safety invariants, not as code/rate table. |
| `docs/SOURCE_AUDIT.md` | Prior source audit | Current repository document; SHA-256 `917e4afe22d21b1faed288a8a31ec36496e997c0aa9d50a1fa7db9e488654543` | 2 / PROJECT_APPROVED audit evidence | Markdown | Documents parser gap, raw alias emission, existing rate source status, missing locked mappings | Historical test counts and stale notes are not current validation | Human audit, Phase planning | Yes for audit findings; not as registry data. |
| `tests/fixtures/bills/oxygen-cases.json` | Synthetic bill fixture | Test fixture | 3 / TEST_ONLY | JSON | Oxygen-related parser/rule examples | Synthetic only | Existing tests | Tests only. |
| `tests/fixtures/bill-text/semantic-bill.json` | Synthetic normalized bill text fixture | Test fixture | 3 / TEST_ONLY | JSON | Parser/rule semantics | Synthetic only | Existing parser/rule tests | Tests only. |
| `tests/fixtures/parser/*.expected.json` | Phase 3 synthetic parser golden expectations | Test fixture | 3 / TEST_ONLY | JSON | Description `(CODE)` evidence expectations | Parser evidence only, not CGHS validation | Phase 3 parser tests | Tests only. |
| `tests/unit/rate-list.test.js` | Existing test-backed rate repository behavior | Test code | 3 / TEST_ONLY | JavaScript | Bundled snapshot remains `RATE_SOURCE_UNDEFINED`; custom local rules | Tests use synthetic authority | Node test suite | Tests only. |
| `tests/unit/rule-engine.test.js` | Existing test-backed room/oxygen/Patient Payable behavior | Test code | 3 / TEST_ONLY | JavaScript | Derived room/oxygen behavior and exclusion | Uses older EnhancementPlan engine | Node test suite | Tests only. |
| `src/services/custom-codes/custom-code-registry.js` | Local custom code registry | Source-level module | Operator local / not CGHS authority | JSON runtime store | Custom/local operator-approved records | Operator-specific; not a CGHS master source | Existing plan flow | Not Phase 4 registry authority. |
| Phase 4 user instruction in Arena task | Explicit project rule source supplied for this phase | 2026-09-27 conversation instruction | 2 / PROJECT_APPROVED | Text instruction | Locked C-family mappings, C002/C003 outcomes, derived rules, category compositions, raw alias protection | Does not provide production rates or official CGHS master file | Phase 4 implementation | Yes for explicit deterministic rule definitions only. Not a master/rate source. |

## Audit findings

1. No approved official CGHS master/rate source is present in this repository.
2. The 1,998-record HFOS snapshot is machine-readable but explicitly `RATE_SOURCE_UNDEFINED`; it is not production authority.
3. Existing Node and Python rules are useful evidence of historical behavior but are not automatically authoritative.
4. Existing tests provide deterministic local proof, not external CGHS authority.
5. The Phase 4 instruction itself is the approved project source for the locked mappings implemented in this phase.
6. Raw parser candidates remain evidence only. They must be resolved through the Phase 4 registry/rule engine.
7. No XLS/XLSX CGHS master or rate source was found. JSON and CSV import support is implemented; XLSX is not implemented because no approved XLSX source exists and the project has no XLSX dependency.

## Safe-to-use conclusion

- Safe as partial active registry: `src/services/cghs/data/hfos-reference-rates.json`, but only with `authorityStatus = UNVERIFIED`; it cannot produce direct validated mappings.
- Safe as validated project rules: the explicit locked Phase 4 mappings and safety constraints supplied by the user instruction, encoded as named deterministic rules.
- Safe as tests only: all `tests/fixtures/*` registry/rate/resolution data.
- Not safe as executable authority: legacy HTML, legacy Python normalization, broad comments, parser evidence, fuzzy matches, and unverified rate snapshots.
