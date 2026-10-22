# SERVICES V3 — canonical service filter parity between directory listing and public map

Parent issue: #917. Depends on merged PR #981 (canonical `svc` public listing) and existing MAP-1C read-only map API.

## Change
- The **same** `canonicalPublicServiceWhere` helper is used by directory and map, with a fixed, internally selected SQL alias (`directory_profiles.id` for directory, `d.id` for map).
- Selecting `svc=<canonical id>` on a public directory category and opening the map preserves `category=services`, `subcategory`, `svc` and all other existing location facets in the shared map URL.
- Map UI sharing/return camera and API GET pass `svc` without changing legacy map options or Google SDK behavior.
- The map query applies exact canonical D1 `choice='yes'` **in SQL before** its bounded candidate limit and before clustering. Dynamic options must be ACTIVE/SYNCED with an approved category and kind=service. Built-in options use the same 91-option server registry.
- The map API only accepts `svc` with an explicitly selected `category=services` and nonempty `subcategory`. Duplicate or blank values are rejected. Invalid IDs and disabled flag yield no results (never a broader result set).
- Map category changes clear the canonical service selection; the map desktop/mobile shared filter panel displays an explicit selected-service notice and a **Zrušiť filter služby** control.
- Removes the old disclaimer that the map silently ignores confirmed Services V3 service filtering. Map visibility/fingerprints, exact-location protection, rate limiting and cache policy remain unchanged.

## Release gates
- Still OFF by default. The existing server Cloudflare setting `SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED` introduced by PR #981 is shared by both directory and map. It is intentionally **not** enabled in wrangler.jsonc or production by this PR.
- **No schema migration**, data write, automatic Notion sync, source-data inference, account mutation, merge or deploy.
- Verify actual production D1 options/profile YES coverage and D1 0133 before *separate* owner-approved release toggle. Both the listing and map must be enabled together; do not release them with different feature flags.
- This PR does not provision new catalog records or automatically select an option for a profile.
- Since map uses geolocated public records only, the set of map pins can naturally be smaller than the listing, but must not be larger due to a missing canonical filter.

## Tests
`node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/service-catalog-map-canonical-filter.test.mjs`

Scoped CI workflow: `Services V3 map canonical filter`; existing MAP-1C tests, full PR build and browser smoke remain required.
