# SERVICES V3 — public canonical service filtering (OFF by default)

Coordinated by issue #917. Based on merged #972 (Admin lifecycle) and #980 (manual D1 -> Notion mirror UI).

## Problem being fixed
Existing public `service=` filter reads `directory_profiles.services_json`, a historical free-text array. It cannot represent canonical Services V3 selections from `service_profile_option_choices`. Existing V2 public category facets read explicitly keyed `source_data_json`; those remain unchanged.

## Implementation
- A separate `svc=` GET filter selects one **canonical service ID** (not attribute ID). Legacy `service=` and the 21 V2 category facets keep their existing exact behavior, including AND combination.
- Server-side, `svc` is always scoped to a valid service category and published profiles. It matches only an explicit D1 `choice='yes'`; no row or a stored `no` cannot match.
- Built-in IDs are validated against the approved Services V3 static service definitions and their category membership.
- Dynamic `svc.admin.*` IDs must exist in D1 with `kind='service'`, `status='ACTIVE'`, `notion_mirror_status='SYNCED'`, and a matching category in `categories_json`.
- Unknown IDs, wrong categories, invalid/duplicated values or the disabled gate produce **zero matches**, never a silent broadening.
- Available dropdown entries are read only from explicit YES choices on published profiles in the selected category. Dynamic options are filtered by server-controlled eligibility and titled using the canonical D1 label. The dropdown is shared by existing desktop sidebar and mobile dialog, without inventing a new visual system.
- URL serialization preserves `svc` through pagination, q search and clear-one operations.
- The map does not yet consume canonical `svc`; an explicit limitation is shown by the desktop sidebar and mobile link so a broader map isn't misrepresented as filtered.

## Opt-in gate and safety
`SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED=true` is read from server Cloudflare environment. It is intentionally **absent** from Wrangler; default is OFF. When off, no new D1 table query is run unless a caller supplied `svc`, in which case the read-only WHERE is always `1=0` (fail closed).
This PR does not apply D1 migrations, write D1 or Notion, turn on Cloudflare flags, run deployment, change active Notion sync or infer legacy text.

Before production rollout, confirm D1 0133/0134 are actually present in target environment; verify a safe production **read-only** count of published profiles with explicit `yes` canonical service choices; inspect query plans for the `service_profile_option_choices_option_idx` index and responsiveness on mobile/desktop; then require separate owner approval for the public flag. Do not promote the UI based solely on an empty Notion catalog; built-in services don't require Notion pages.

## Tests
Path-scoped Actions workflow: `Services V3 public canonical filter`.
`node --experimental-strip-types --test tests/service-catalog-public-filter.test.mjs`

**Next separate step:** Bring `svc` filtering to the map API and map URL state with the same canonical D1 contract, then consider automatic catalogue mirror dispatch only after an owner-approved production rollout policy.
