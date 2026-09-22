# MAP-1C — Map Read API & Spatial Query Layer

MAP-1C adds a provider-neutral, read-only public query layer above canonical Psipedia data and the approved `geo_points` index. It does **not** add the `/mapa` UI, Google Maps JavaScript, a Google API key, GPS / near-me search, radius search, persistent clusters, map ranking, or a production geo backfill.

## Public endpoint

`GET /api/map`

The route is public and read-only. Authentication is not required.

Required query parameters:

- `north` — latitude, -90..90
- `south` — latitude, -90..90 and strictly lower than north
- `east` — longitude, -180..180
- `west` — longitude, -180..180
- `zoom` — generic map zoom level, 3..20

The bbox supports antimeridian-crossing requests when `west > east`. Psipedia's normal Slovak viewport does not cross it, but the contract does not silently return incorrect results.

Optional parameters:

- `category`: `services`, `organizations`, `events`
- `subcategory`: canonical directory category, organization type, or event type depending on the selected category
- `region`: one of the existing Slovak region constants; `Online` is rejected for a physical map
- `district`
- `city`
- `search`: 2..80 characters
- `eventType`: one of the existing Psipedia event types; when supplied the result is event-only
- `eventTiming`: `active` (default), `current`, `upcoming`
- `limit`: item-mode limit, 1..500; default 300

Unknown parameters and invalid enum values return HTTP 400 with `MAP_INVALID_QUERY`.

Search remains inside the requested bbox. It is normalized with Psipedia's existing Slovak diacritic-insensitive search normalization and is sent to D1 as a bound parameter, never interpolated as user SQL.

## Response modes

The response shape is explicit.

High zoom / bounded viewport:

```json
{
  "mode": "items",
  "items": [],
  "meta": {
    "count": 0,
    "matched": 0,
    "truncated": false,
    "bbox": { "north": 49, "south": 48, "east": 19, "west": 17 },
    "zoom": 12,
    "cacheTtlSeconds": 30
  }
}
```

Low zoom / large viewport:

```json
{
  "mode": "clusters",
  "clusters": [],
  "meta": {
    "count": 0,
    "matched": 0,
    "truncated": false,
    "bbox": { "north": 50, "south": 47, "east": 23, "west": 16 },
    "zoom": 7,
    "cacheTtlSeconds": 30
  }
}
```

Zero results are HTTP 200 with the appropriate empty array.

## Public `MapItem`

The public DTO is intentionally small:

- stable response id
- public entity type: `service`, `organization`, or `event`
- canonical entity id
- name
- category / optional subcategory
- canonical href
- latitude / longitude
- public precision
- optional public display location
- city / district / region
- optional service `verified` / `featured` foundation fields
- optional event start/end
- optional organization location role

The API never serializes:

- `source_fingerprint`
- `resolved_source_fingerprint`
- `normalized_query`
- `query_fingerprint`
- `last_error_code`
- manual actor metadata
- moderation details
- provider debug payloads
- private lost/found coordinates
- secrets / API keys

Provider attribution, when needed by the selected data, is response-level metadata rather than repeated on every marker.

## Privacy and geo eligibility

Public eligibility is fail-closed and enforced twice: first in the D1 query, then again before serialization.

A geo record must have all of:

- `public_visibility IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC')`
- `geocode_status = 'RESOLVED'`
- usable coordinates
- non-null `resolved_source_fingerprint`
- `source_fingerprint = resolved_source_fingerprint`

Therefore `HIDDEN`, unclassified, `STALE`, `NEEDS_REVIEW`, `FAILED`, `PENDING`, and `SKIPPED` records never enter the public result.

`EXACT_PUBLIC` may expose the canonical public address in `displayLocation`.

`APPROXIMATE_PUBLIC` exposes only locality-level fields (city / district / region). Its source street is deliberately excluded from the DTO.

The read layer does not recalculate privacy based on directory category. The approved geo state is authoritative.

## Canonical publication rules

Geo eligibility alone is insufficient.

Directory profiles must also be:

- `status = 'published'`
- not archived
- not online-only

Organizations must also be:

- `status = 'PUBLISHED'`
- not archived

Organization markers originate from approved `organization_locations`. SITE, SERVICE_AREA, LEGAL_SEAT, and UNSPECIFIED records are not independently trusted by role: they appear only when their `geo_points` record has already passed the MAP-1B privacy workflow.

Events must also be:

- `status = 'published'`
- not cancelled
- physical, not `Online`
- active according to the existing Europe/Bratislava event lifecycle

Default `eventTiming=active` means current + upcoming. Past events are excluded. The read layer reuses the existing Bratislava date semantics rather than inventing a second definition of "upcoming".

## Canonical hrefs

- service: `/adresar/{category}/{slug}`
- organization: `/organizacie/{slug}`
- event: `/podujatia/{slug}`

The client does not construct canonical routes.

## Organization / directory deduplication

`help_organizations.directory_profile_id` is the only relationship signal used for cross-entity deduplication.

When an organization marker and its explicitly linked directory profile represent the same coordinate, the organization representation wins in mixed / organization-oriented results.

The service representation remains available when the caller explicitly requests `category=services`.

The layer never deduplicates merely because two records share:

- coordinates
- address
- a similar name

Two unrelated businesses on the same physical location remain separate MapItems.

An organization may legitimately expose multiple approved public locations, producing multiple MapItems that all point to the same canonical organization profile.

## Bbox and spatial query strategy

MAP-1C uses the existing `0064_geo_foundation.sql` schema and its public spatial index. No MAP-1C migration is required.

The D1 query applies bbox predicates before assembly:

- latitude between south and north
- ordinary longitude between west and east
- antimeridian requests use `longitude >= west OR longitude <= east`

Each entity source has an internal hard row cap of 5001. The public response is capped separately at 500 items or 250 clusters.

## Zoom and clustering

The server chooses the response mode; the client never guesses the payload shape.

Current conservative strategy:

- zoom <= 10: clusters
- zoom > 10: items for normal bounded viewports
- large viewports may still force clusters at higher zoom

Clusters are deterministic in-memory grid buckets derived for the response only. No cluster rows are stored in D1 and no external geospatial service is required.

Grid sizes:

- zoom <= 6: 1 degree
- zoom 7–8: 0.5 degree
- zoom 9–10: 0.2 degree
- forced high-zoom aggregation: 0.1 degree

A cluster contains:

- deterministic id
- centroid
- count
- service / organization / event counts

This is intentionally simple for the present D1 / Slovakia scale and is not a PostGIS replacement.

## Caching

Successful map responses use short CDN HTTP caching:

- `s-maxage=30`
- `stale-while-revalidate=60`

Errors are `no-store`.

MAP-1C deliberately does not reuse Psipedia's versioned public HTML Cache API. JSON map caching is isolated from the historic HTML asset/version cache path.

No explicit purge infrastructure is added. The short TTL is the current correctness / complexity trade-off.

Bbox cache-key rounding is intentionally not implemented in MAP-1C because widening / shifting a server bbox can create visible edge omissions. MAP-1D should debounce requests on map idle and abort obsolete requests; short TTL bounds the cost of exact viewport keys.

## Abuse protection

The route reuses Psipedia's existing D1 rate limiter:

- 180 origin requests per 60-second window per client IP
- IP is HMAC-derived through `PII_HASH_KEY`
- no raw IP is stored as the rate-limit bucket
- no login
- no CAPTCHA

If rate-limit persistence is temporarily unavailable, the API logs a generic limiter-unavailable event and does not convert the map into an infrastructure outage.

CDN cache hits do not execute the origin limiter.

## Geo unavailable behavior

If the environment has no usable D1 binding or `geo_points` is not present, the route returns:

- HTTP 503
- error code `MAP_GEO_UNAVAILABLE`
- `Cache-Control: no-store`

It does not return a misleading 200 empty map and does not expose a stack trace.

This is deliberately separate from the Production D1 migration workstream.

## Observability

Origin requests log only bounded operational metadata:

- status
- response mode
- returned / matched count
- truncation
- query duration

Validation and geo-unavailable failures log their public error code.

Logs intentionally omit:

- search text
- address data
- bbox contents
- raw IP
- internal geo fingerprints / provider payloads

## Performance guard

The repository includes a deterministic development / CI benchmark that clusters 3000 synthetic points and reports elapsed time. It is an obvious-regression guard only and must not be interpreted as a production SLA.

## MAP-1D boundary

MAP-1D can reuse the exported public DTO and query contract to implement the actual map client.

MAP-1C intentionally leaves out:

- `/mapa` HTML / React map page
- Google Maps JavaScript
- Google Map ID / Advanced Markers
- Google API keys
- client debounce / AbortController implementation
- mobile bottom sheet
- marker visuals
- geolocation / "near me"
- radius search
- premium map ranking
- reviews UI
