# MAP-1D — Public Map UI & Google Maps Renderer

MAP-1D is the public presentation layer above the provider-neutral `GET /api/map` contract delivered by MAP-1C.

It deliberately does not make Google Maps a Psipedia data source. Canonical entity identity, publication state, privacy, geo precision, geocoding, server aggregation and canonical detail URLs stay owned by MAP-1B/MAP-1C.

## Route and SEO

Canonical route:

- `/mapa`

The page has an SSR heading, explanatory copy and links to the canonical Services, Organizations, Events and Help hubs before the client renderer mounts.

The canonical URL always remains `/mapa`. Shareable filters may appear as search parameters, but bbox and zoom stay client state and are not written into browser history.

MAP-1D does not add a main-navigation or homepage link. Code deployment and public launch are separate gates.

## Architecture

```text
Map page (SSR)
  |
  +-- MapExperience
        |
        +-- GET /api/map
        +-- filters / URL state
        +-- loading / empty / truncated / error states
        +-- selected MapItem
        +-- result cards / mobile bottom sheet
        |
        +-- GoogleMapRenderer
              |
              +-- Google Maps JavaScript API
              +-- AdvancedMarkerElement
```

Only `GoogleMapRenderer` knows about Google APIs. Business/filter/result components render the public MAP-1C DTO only.

The browser never calls:

- Google Places Nearby Search
- Google Geocoding
- Geoapify
- any private geo endpoint

## Google loading strategy

Google Maps JavaScript is loaded only after the `/mapa` client renderer mounts.

The thin local loader:

- injects `https://maps.googleapis.com/maps/api/js` once
- requests the current weekly Maps JavaScript API
- uses `google.maps.importLibrary("maps")`
- uses `google.maps.importLibrary("marker")`
- renders `AdvancedMarkerElement`
- handles marker interaction with `gmp-click`
- sets `gmpClickable: true` and marker `title` for keyboard/screen-reader support

No map-wrapper framework and no client cluster dependency are added.

Server `mode=clusters` is authoritative at low zoom. In `mode=items`, MAP-1D renders the returned items directly.

## Google configuration

Runtime variables:

```text
GOOGLE_MAPS_BROWSER_API_KEY=
GOOGLE_MAPS_MAP_ID=
```

These are browser-visible renderer configuration, not server geocoder secrets.

Before public launch the Google Cloud key must be configured with:

- HTTP referrer restrictions for the approved Psipedia origins
- API restriction to Maps JavaScript API
- billing enabled
- explicit quota / budget monitoring appropriate for the project

The Geoapify server credential must never be reused by the frontend.

If either Google Maps value is absent, `/mapa` remains functional as a text-results experience and displays:

`Google Maps nie je nakonfigurovaný`

No Google script is loaded in that state.

## One map instance and billing safety

The Google map object is created once per `GoogleMapRenderer` mount.

Filter, search, pan and zoom changes update data/markers; they do not remount the map.

A development counter, `window.__PSIPEDIA_MAP_INIT_COUNT__`, makes accidental reinitialization visible.

Markers are reconciled by stable public DTO IDs. Existing marker elements are reused when their material signature is unchanged.

## Request lifecycle

Requests are constructed exclusively for `/api/map`.

Relevant changes:

- map idle / bbox
- zoom
- filter
- search

use a 280 ms debounce.

`MapRequestGate`:

- aborts the prior in-flight request immediately when state changes
- assigns a monotonically changing request generation
- rejects stale completions before they can update UI

A lightweight local state machine is sufficient; no additional data-fetching framework is used.

## Filters and URL state

Shareable URL state:

- `category`
- `subcategory`
- `region`
- `district`
- `city`
- `search`
- `eventType`
- `eventTiming`

Viewport and zoom are intentionally not serialized.

Changing region clears district + city. Changing district clears city.

MAP-1D reuses existing Psipedia:

- directory category constants
- Slovak region constants
- event type constants

It does not introduce a third static Slovak locality dataset. District/city remain free-text refinements because MAP-1C does not expose a canonical locality-options endpoint.

## Desktop UX

Desktop uses a split workspace:

- results panel about 330–390 px
- map as the dominant remaining area
- practical viewport-derived height
- visible search, category chips and secondary filters
- independently scrollable result list without body scroll locking

Cards expose only safe DTO fields and use `MapItem.href` for navigation.

## Mobile UX

At the existing public responsive boundary, the map becomes the primary surface.

The results panel becomes a bottom sheet with:

- peek state
- expanded state
- explicit expand/collapse control
- scrollable cards
- safe-area-aware spacing

The filter button opens an accessible modal sheet with:

- touch-sized controls
- Escape close
- focus trap
- focus restoration

The design avoids horizontal overflow at 390 × 844.

No browser geolocation is requested in MAP-1D.

## Marker ↔ card synchronization

Marker click:

- selects the item
- highlights its card
- expands the mobile sheet
- scrolls the card into view

Card click:

- selects the item
- pans/centers the renderer
- may raise zoom to a useful item level
- does not open the detail automatically

The explicit card CTA opens the canonical `MapItem.href`.

## Approximate locations

`precision !== "EXACT"` is presented as:

`Približná poloha`

The card uses only the public locality already supplied by MAP-1C.

MAP-1D never reconstructs or requests a source street address.

Approximate markers also use a dashed visual boundary so precision is not signaled by color alone.

## Clusters

When MAP-1C returns `mode=clusters`:

- the renderer shows cluster markers
- the count is visible
- the result panel shows a cluster-aware summary
- no fake individual result list is invented

Cluster click recenters and increases zoom. The next authoritative `/api/map` response decides whether clusters or items should be shown.

## Loading / empty / truncated / errors

Loading keeps the existing map visible.

Zero result:

`V tejto oblasti sme nenašli záznamy pre zvolené filtre.`

Truncated result:

`Zobrazuje sa iba časť výsledkov. Priblíž mapu alebo spresni filtre.`

Errors are distinct:

- HTTP 400 — filter/client contract issue
- HTTP 429 — rate limited
- HTTP 503 — geo subsystem unavailable
- network failure
- generic server failure
- Google renderer load failure

Recoverable API errors expose `Skúsiť znova`. There is no automatic infinite retry loop.

## Attribution

Google's native map attribution is never hidden.

MAP-1D also renders `meta.attribution` exactly as returned by `/api/map`; it does not invent provider/license text.

MAP-1E verified the current Geoapify terms and updated the authoritative MAP-1C payload. Geoapify-derived public records now carry both `Powered by Geoapify` and `© OpenStreetMap contributors`; the client still renders attribution only from the API contract.

## CSP

Psipedia did not have a global CSP before MAP-1D.

MAP-1D therefore adds a route-scoped `/mapa` policy in the Worker instead of changing every public page.

The allowlist contains only the required Psipedia/Google families for:

- Maps JavaScript
- map tiles/images/connections
- Google fonts used by Google surfaces
- existing consent-gated GA4
- existing optional programmatic ad loader

The policy does not use a bare `*`.

`/mapa` also disables browser geolocation, camera and microphone with `Permissions-Policy`.

## Consent / privacy launch finding

MAP-1E resolves the open MAP-1D consent question conservatively with a service-specific Google Maps opt-in.

Before the visitor explicitly allows Google Maps:

- the Google Maps JavaScript loader is not injected;
- the provider map is not initialized;
- Psipedia text results remain available.

The preference is stored locally as `psipedia-google-maps-consent` and can be revoked on `/cookies`. MAP-1E also adds Google Maps Terms/Privacy disclosures to the map, cookie, privacy and terms surfaces.

The separate `PUBLIC_MAP_ENABLED` runtime flag remains the operational launch gate, so code deployment does not itself enable Google or public navigation.

## Test strategy

Unit/contract tests cover:

- filter parse/serialization
- bbox API construction
- dependent filter reset
- debounce cancellation
- stale request abort
- selected item retention
- approximate labeling
- cluster target behavior
- Google renderer isolation
- Advanced Marker contract
- no Places/Geocoding/Geoapify
- no public navigation launch
- env configuration
- route-scoped CSP

Playwright uses a CI-only test renderer and controlled `/api/map` mocks. It does not consume paid Google API loads.

Desktop covers:

- SSR route
- item results
- marker → card
- card → marker
- filters/URL
- server clusters
- empty
- truncated
- 400
- 429
- 503 + retry
- network failure
- canonical detail href
- config missing
- Axe accessibility

Mobile 390 × 844 covers:

- no horizontal overflow
- bottom sheet peek/expanded
- filter modal
- Escape + focus restoration
- marker/card selection
- screenshots
- Axe accessibility

## Real Google smoke

A real Google smoke is intentionally not a per-PR CI job.

After a restricted staging/production browser key and Map ID exist, manually verify:

- base map loads
- Advanced Markers render
- Google attribution remains visible
- keyboard marker interaction works
- filter changes do not increase the map-init counter
- pan/zoom fetches only `/api/map`
- browser console has no CSP errors

## Public launch gates

Code readiness does not imply launch readiness.

Before adding a prominent navigation/homepage link, verify:

- restricted Google browser key
- Maps JavaScript API restriction
- Map ID
- billing/quota controls
- production `geo_points` schema
- enough RESOLVED public records
- production `/api/map` smoke with real records
- real Google Maps smoke
- provider attribution requirements
- service-specific Maps consent smoke
- CSP smoke with real renderer
- no P1 privacy issue

MAP-1E should own launch/hardening after these gates are satisfied.
