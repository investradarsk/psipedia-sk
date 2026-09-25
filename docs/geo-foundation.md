# MAP-1B — Geo Foundation & Operations

`geo_points` is a derived location-resolution/index/cache layer. Canonical business data remains in `directory_profiles`, `organization_locations` and `managed_events`. Lost/found retains its existing separate public/private coordinate model.

## Privacy

Stored public visibility:

- `EXACT_PUBLIC`
- `APPROXIMATE_PUBLIC`
- `HIDDEN`

`NULL` is a migration/operations state meaning unclassified; it is not a fourth public visibility. An unclassified or hidden row cannot contain public coordinates.

Public precision:

- `EXACT`
- `NEIGHBORHOOD`
- `MUNICIPALITY`
- `SERVICE_AREA`
- `APPROXIMATE`

Street address presence never grants `EXACT_PUBLIC`. Sensitive directory categories default to approximate. `LEGAL_SEAT` and `UNSPECIFIED` organization locations require review.

Approximate geocoding queries are constructed only from approved public locality data. Private street addresses are not sent to the geocoder and exact coordinates are never jittered.

## State machine

Stored states: `PENDING`, `RESOLVED`, `NEEDS_REVIEW`, `FAILED`, `STALE`, `SKIPPED`.

Operational reasons are separate (`NO_MATCH`, `AMBIGUOUS`, `LOW_CONFIDENCE`, `RATE_LIMITED`, `PROVIDER_ERROR`, `SOURCE_INCOMPLETE`, privacy conflicts, and related codes).

A deterministic SHA-256 source fingerprint is based only on location-relevant fields. When the canonical source changes, an existing point becomes stale. Unrelated edits such as phone, copy or imagery do not invalidate geo state.

## Manual override

Admin manual coordinates set `resolution_method=MANUAL` and `manual_override=1`. Automatic geocoding is forbidden from overwriting that point. A later source change preserves the manual coordinates and marks the row stale for review. Only an explicit admin reset returns ownership to automatic resolution.

All admin changes write to the existing `moderation_events` audit stream with `resource_type=GEO_POINT`.

## Provider configuration

Primary provider adapter: Geoapify.

Server-only secret: `GEOAPIFY_API_KEY`.

Optional canary-tunable thresholds:

- `GEO_EXACT_CONFIDENCE_THRESHOLD`
- `GEO_CITY_CONFIDENCE_THRESHOLD`

No key is committed and no `NEXT_PUBLIC_*` value is used. Missing credentials leave directory/events/organizations operational; only provider execution is disabled.

Provider responses are normalized into a provider-neutral DTO. Provider-specific IDs are never business identity. Provenance and source-license/attribution text are retained on resolved geo rows for later map attribution.

## Production gates

Full production backfill remains disabled until all gates are independently completed:

1. **Gate A — read-only inventory**: run `scripts/geo-production-inventory.sql` against production D1 using an authorized read-only process.
2. **Gate B — Slovak quality canary**: validate a stratified sample of real Slovak locations and classify results as exact correct / acceptable approximate / wrong / no match / ambiguous.
3. **Gate C — provider configuration**: confirm Geoapify production terms/attribution/quota and store the API key as a server secret.

The admin Operations page allows dry-run classification, bounded explicit initialization, and at most 5 provider canary calls from the UI. There is deliberately no "geocode everything" action.

### Explicit-ID safe onboarding

A2 adds a separate admin-only explicit-ID path without changing the existing ordered bulk initializer.

- `explicit-preview` accepts only an explicit target type plus 1–20 unique positive integer IDs and never writes or calls the provider.
- `explicit-onboard` requires `EXPLICIT-ONBOARD` confirmation and processes only the requested ID set.
- The first supported production contract is intentionally limited to `DIRECTORY_PROFILE + APPROXIMATE_PUBLIC + MUNICIPALITY`.
- Exact requests are blocked rather than upgraded or downgraded.
- Approximate queries are regenerated through `buildGeoQuery()` and checked against a locality-only source before any provider call.
- Manual overrides, stale fingerprints, existing NEEDS_REVIEW/FAILED rows, unpublished or missing canonicals, and query/privacy mismatches fail closed.
- Current RESOLVED rows with matching fingerprints are idempotent no-ops.
- Provider configuration is checked before the first write so a missing Geoapify secret cannot leave newly initialized rows behind.
- Per-target execution reuses the existing geo store, visibility/fingerprint state machine, Geoapify adapter, moderation events and Attention Center.

The explicit operation has no wildcard, range, category-only, or implicit next-candidate mode.

## Safe rollout

Migration `0064_geo_foundation.sql` is schema-only. It does not insert geo rows or call any provider.

Recommended order:

1. apply schema,
2. execute Gate A separately,
3. inspect dry-run classifier,
4. create small bounded operational batches,
5. configure provider,
6. run a small canary,
7. calibrate acceptance thresholds from reviewed Slovak results,
8. only then design/approve a separately gated backfill.

MAP-1B does not add `/mapa` and does not add a public map API.

The runtime is also safe when application code deploys before migration `0064`: canonical directory/event/organization pages continue to work, Attention treats the missing geo source as zero, and geo admin surfaces report that the schema is not ready instead of assuming the table exists.
