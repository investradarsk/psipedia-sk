# ADDRESS-DATA-1A — Reference Dataset Foundation

## Scope

This workstream creates the versioned reference-data foundation only. It does not change DIRECTORY_PROFILE rows, geo_points, PUBLIC_MAP_ENABLED, Geoapify behaviour, Admin/Partner address UX, or legacy address data.

## Frozen source contract

- Provider: Ministerstvo vnútra SR
- Dataset: Register adries / RAGEO Open Data
- Catalog: https://rageo.minv.sk/opendata/katalog.json
- Primary ingest: eight `address_by_nuts3_{NUTS3}.geojson` snapshots
- Update frequency: daily
- License: CC BY 4.0
- Geometry: GeoJSON Point in OGC CRS84, coordinates `[longitude, latitude]`
- Stable address identity: `identifier`
- Municipality identity: `lau2_id`
- Street source key: `street_id`
- Postal code: `postalcode` on each address row

The importer uses a strict source-property allowlist and does not import resident, owner, tenant, or other person records.

## Storage architecture

ADDRESS-DATA-1A intentionally keeps the address reference database separate from the main application D1.

Target Cloudflare resource:

- database name: `psipedia-address-reference`
- reserved future Worker binding: `ADDRESS_REFERENCE_DB`
- runtime binding in 1A: **disabled**

The reference schema is `address-reference/schema.sql`; it is not a numbered migration in `drizzle/`.

## Municipality mapping

`data/address-reference/municipality-lau2-mapping.json` contains all 2,927 Psipedia locality mappings.

- 2,925 exact deterministic district-scoped matches
- 2 explicit reviewed overrides:
  - Valaškovce (vojenský obvod) → Valaškovce
  - Záhorie (vojenský obvod) → Záhorie
- 0 unmapped
- fuzzy mapping forbidden

## Controlled candidate preparation

```bash
npm run address-reference:prepare
```

Preparation:

1. downloads metadata + eight regional snapshots, unless a test source directory is supplied;
2. validates CC BY 4.0 metadata;
3. computes SHA-256 per regional source;
4. requires FeatureCollection + CRS84;
5. streams features without loading the national dataset into memory;
6. applies exact source-schema, address-ID, municipality, PSČ, street/municipality-number and coordinate gates;
7. writes a local candidate SQLite DB under ignored `.address-reference/`;
8. verifies duplicate IDs and FK/orphan conditions;
9. marks the candidate integrity PASS only after all gates succeed;
10. emits JSON + Markdown candidate reports.

This command performs no Cloudflare writes.

## Atomic release contract

The runtime pointer is `address_reference_runtime.active_release_id`, never "latest imported".

A failed/quarantined candidate cannot be activated. The schema trigger rejects activation unless integrity is PASS. On successful activation the old ACTIVE becomes PREVIOUS_GOOD. Rollback can swap the two release IDs without redownloading the upstream source.

## Production sequence after merge

No production operation is performed by the PR itself.

1. Create the dedicated Cloudflare D1 database named `psipedia-address-reference`.
2. Record its Cloudflare database ID in protected operations documentation/configuration; do not bind it to the Worker yet.
3. From current `main`, manually dispatch **Address Reference Schema** and enter `APPLY-address-reference-schema`.
4. Verify the schema workflow is green.
5. Run a controlled candidate preparation against current RAGEO data and retain its checksums/report.
6. A separately reviewed controlled rollout imports that validated candidate into the dedicated D1.
7. Verify row counts, FKs, source checksums and lifecycle diff before switching `active_release_id`.
8. Retain at least ACTIVE + PREVIOUS_GOOD.
9. ADDRESS-DATA-1B may then add server-side lookup access and the runtime binding.

Steps 1–8 require explicit operator action. This PR does not dispatch them.

## Attribution

Release provenance retains provider, dataset, catalog URL, source-modified timestamps, regional SHA-256 values and CC BY 4.0 attribution metadata.
