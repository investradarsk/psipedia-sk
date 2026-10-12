# ADDRESS-ADMIN-CONTRACT-2 — implementation (2/11)

Base: `2c50bea2e7ca1b20f58c1b64a1f5c4ac88614599` (fresh main, includes #784).

## Scope and reuse

`lib/admin-address-contract.ts` is a pure internal proposal/preview module.
`lib/admin-address-adapters.ts` adapts the existing directory input, event input,
organization location record and Google candidate. No existing runtime consumer
is switched over in this phase. Public source files and existing serializers are
unchanged. No DB writes, new columns, provider calls, editor changes, workflow
changes, migrations, Notion changes or automation activation.

The implementation reuses `slovakia-locations` (including its search normalization
and final `resolveSlovakLocation` check), `normalizeSlovakPostalCode`,
`evaluateDirectoryServiceAddress`, existing `GeoSourceLocation` target identity,
and `isGeoRecordStale`. It does not replace the directory address-save guards,
organization primary/write logic, provider mapping or GEO lifecycle.

## Contract decisions for subsequent phases

- `locationMode` is **derived in memory**, not persisted: event Online sentinel or
  `online` flag → ONLINE; organization SERVICE_AREA role → SERVICE_AREA; otherwise
  PHYSICAL. Invalid legacy locality is reviewable, never converted to Online.
  Role/parent/location identity are retained. Mode/role/privacy changes are not
  accepted as address patches; future workflows must handle them explicitly.
- Absent components are `null`. Unknown locality text is retained with issues for
  review. Case, diacritics, Unicode, whitespace, hyphens and the `Okres` prefix
  normalize against the existing snapshot. Missing ancestors are never inferred;
  homonymous cities without a disambiguating hierarchy require review. Foreign
  country data is retained with an unsupported-country issue, not forced into SK.
- Postal codes remain text (`09501` → `095 01`); numeric input is rejected.
  House numbers remain text (`1127/21`, `12/A`). No free-text address splitting.
  Missing street/number is allowed; the existing evaluator handles numberless
  streets and municipality-number formats.
- Structural completeness uses the existing evaluator independently from actual
  service/place confirmation. Its local confirmation argument is only an evaluator
  precondition and is never saved or exposed as evidence. ONLINE/SERVICE_AREA have
  NOT_APPLICABLE physical completeness; supplied contradictory Online fields need
  review. No evaluator result authorizes exact public visibility.
- A Google discovery candidate is always a PROPOSAL. Missing components produce
  `missing` operations, not clears. Raw components and candidate ID remain evidence;
  they cannot patch GEO. Unknown/ambiguous hierarchy components are withheld from
  the patch and flagged for review. Callers must honor `requiresReview`/issues.
  Missing Google country uses SK only as the validation context; no country field
  is synthesized into the proposal. Address format is not guessed.
- Existing GEO metadata is supplied separately by the trusted server loader.
  `GeoPointRecord` alone does not contain Google identity: the caller must use the
  existing operator/Google join to supply ID, matched timestamp and fingerprint.
  CURRENT requires matching nonempty source/Google/resolved fingerprints, matched
  timestamp, RESOLVED status, valid coordinates, exact public visibility/precision,
  PHYSICAL mode and SITE role for organization locations. Incomplete addresses can
  still have a CURRENT place. Any saved Place ID, including STALE, locks mutations.
- Omitted/undefined patch or `unchanged` means preserve; `missing` means source has
  no value and also preserves. `set` requires nonempty text; `clear` requires ADMIN,
  a nonempty reason and matching revision/fingerprint. Imports fill null fields
  only. Existing values, confirmed service address, Google anchor, manual override,
  hidden location and imported legal-seat changes produce explicit conflicts.
  There is no force/unlock flag. Identical normalized values are NOOP.
- Partial relocation cannot retain old street/house/editorial fields silently.
  The proposal must explicitly address existing dependent components. A conflict
  returns the original fields; inputs, Google ID, fingerprints and privacy remain
  unchanged. No target/confirmation/GEO/unknown field is accepted in a patch.
- Preview is **not** authorization or a transaction. Future apply paths must load
  trusted context, recheck target/revision/fingerprint at commit and use existing
  source/GEO reconciliation with concurrency/recovery guarantees. This phase does
  not implement or claim those guarantees for current production write paths.

## Verification

- 53 tests pass: new contract suite plus existing directory-service-address,
  directory-address-policy and public-location-map-contract suites. The new suite
  checks every 8/79/2927 hierarchy entry and a wrong region for every district,
  plus aliases, homonyms, partial/legacy/Online records, adapters, proposal guards,
  privacy, current/stale Google evidence, missing/clear and partial relocation.
- 34 tests pass: existing organization-location-admin and address-simple-1a suites.
- Targeted ESLint and `git diff --check` pass.
- `npm run test:address-admin-contract` is included in the existing
  `test:geo-foundation` chain; no CI YAML changes.
- Full `tsc --noEmit` fails with 1,886 diagnostics (including missing Cloudflare
  ambient types and existing `.ts` import configuration). The complete diagnostic
  output is byte-for-byte identical on a clean worktree of the base SHA, excluding
  the npm invocation warning. No diagnostic names either new module. This is not
  a passing whole-repository typecheck.
- Full build, deployment, live D1/Notion, real provider calls and production
  acceptance are not performed. This is an unintegrated internal contract.

After user merge, phases **3 (D1)** and **4 (Notion schema)** may run in parallel.
Phase 5 waits for 3; editor phases 6/7/8 wait for 5; sync 9 waits for 4 and 5.
No subsequent phase is started by this PR.
