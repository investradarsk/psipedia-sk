# MAP-1E — Production Launch & Hardening

MAP-1E closes the gap between the merged map code (MAP-1B/1C/1D) and a safe public production launch.

## Verified starting state

At the beginning of MAP-1E:

- public map UI code was merged through MAP-1D;
- production `GET /api/map` returned HTTP 503;
- the protected Production D1 workflow had successfully applied only through `0062_profile_reviews_foundation.sql`;
- repository migrations already contained:
  - `0063_partner_claims_verification.sql`
  - `0064_geo_foundation.sql`
  - later migrations `0065+`.

The 503 root cause is therefore a production schema lag: the deployed map read layer requires `geo_points`, which is created by 0064.

## Safety rule: no migration skipping

MAP-1E does not jump directly from production 0062 to later application state.

Production rollout is sequential:

1. run protected migration target `0063_partner_claims_verification.sql`;
2. verify 0063;
3. run protected migration target `0064_geo_foundation.sql`;
4. verify 0064;
5. run map production readiness audit.

Each production migration run:

- is manual `workflow_dispatch`;
- requires the protected `production` environment;
- requires `CLOUDFLARE_D1_API_TOKEN`;
- requires a target-specific explicit confirmation string;
- validates canonical account/database identity;
- creates a D1 Time Travel recovery bookmark before mutation;
- uses a scoped migration directory ending exactly at the requested target;
- allows only one newly applied migration per run;
- never runs `wrangler deploy`.

Valid confirmation examples:

- `APPLY-0063-psipedia-sk-db`
- `APPLY-0064-psipedia-sk-db`

The protected workflow intentionally stops at 0064. It cannot use MAP-1E to pull 0065/0066 into production.

## 0063 verification

The 0063 target verifies the existing 0062 Reviews foundation and additionally requires:

- `partner_claims`
- `partner_resource_verifications`
- expected claim/verification indexes
- rebuilt notification outbox indexes
- partner audit indexes/triggers
- claim/verification notification types in the outbox schema
- claim/verification actions in partner audit schema

Canonical partner-resource and membership integrity remains protected by the existing production D1 snapshot checks.

## 0064 verification

The 0064 target verifies all previous foundations and additionally requires:

- `geo_points`
- directory/location/event unique indexes
- status/update index
- public spatial index
- provider/query index
- public visibility and resolved fingerprint constraints
- no lost/found private model inside generic `geo_points`

0064 is schema-only. On the first application, `geo_points` must still contain zero rows immediately after migration.

No provider is called and no geo data is inserted by the migration.

## Why 0064 removes 503 but does not launch the map

After 0064, `/api/map` can query the geo schema and should stop returning `MAP_GEO_UNAVAILABLE`.

However, an empty `geo_points` table means the API may correctly return HTTP 200 with zero results.

Therefore MAP-1E keeps two separate gates:

### Schema ready

- 0064 recorded in D1 migration history
- `geo_points` table exists
- map API returns its normal public contract

### Data ready

At least one current, privacy-approved public geo row exists:

- `EXACT_PUBLIC` or `APPROXIMATE_PUBLIC`
- `RESOLVED`
- coordinates present
- current resolved source fingerprint

Public launch must not confuse schema readiness with useful map-data readiness.

## Read-only production readiness workflow

Workflow:

`MAP-1E Production Readiness`

File:

`.github/workflows/map-production-readiness.yml`

It is manual-only and performs no mutation.

It gathers:

- production 0064 schema status
- latest applied migration
- canonical source counts
- total geo rows
- geo rows by target/status/visibility
- count of current public RESOLVED rows
- public `/api/map` status/contract
- `/mapa` status
- route-scoped CSP evidence
- Permissions-Policy evidence
- safe signal for whether Google renderer configuration is present

The retained artifact intentionally excludes the fetched HTML body.

## Privacy P1 launch gates

Readiness fails closed if any of these are detected:

- sensitive directory categories with RESOLVED `EXACT_PUBLIC` coordinates;
- organization `LEGAL_SEAT` with RESOLVED `EXACT_PUBLIC` coordinates;
- HIDDEN rows with coordinates;
- unclassified rows with coordinates.

Sensitive directory categories currently checked:

- chovatelske-stanice
- chovatelske-kluby
- treneri
- vencenie
- kynologicke-kluby

These checks are defense-in-depth in addition to the 0064 database constraints and MAP-1B classification rules.

## Data rollout remains separately gated

MAP-1E does not enable a full production backfill.

Existing MAP-1B operations remain the only supported operational foundation:

1. read-only inventory;
2. dry-run classification;
3. bounded initialization;
4. Geoapify configuration check;
5. very small provider canary;
6. human review of Slovak results;
7. only then a separately approved data rollout.

The admin UI still caps:

- initialization: bounded batches;
- provider canary: very small non-persistent sample;
- full backfill: disabled.

## Geoapify

Server geocoding still requires:

`GEOAPIFY_API_KEY`

The production readiness report does not expose or log the key.

MAP-1E does not weaken the MAP-1B rule that approximate queries exclude private street addresses.

Provider calls are not part of the D1 schema migration workflow.

## Google Maps launch gate

MAP-1D code can remain deployed with Google configuration absent because text results remain functional.

A real public map launch still requires:

- browser Google Maps API key configured at runtime;
- Map ID;
- referrer restriction;
- Maps JavaScript API restriction;
- billing/quota controls;
- real Google renderer smoke;
- attribution review;
- consent/privacy decision.

The read-only readiness workflow only reports a safe configured/not-configured signal; it never exposes the browser key.

## Public navigation

MAP-1E does not add `/mapa` to the main navigation or homepage automatically.

Prominent discovery should be enabled only after:

- schemaReady = true
- dataReady = true
- `/api/map` = 200 with normal contract
- privacy P1 blockers = 0
- Google renderer launch gate complete
- attribution/consent decisions complete


## Extended read-only inventory and privacy smoke

MAP-1E also retains the broader read-only audit from the original launch-hardening branch.

The readiness workflow requires the explicit confirmation:

`AUDIT-MAP-psipedia-sk-db`

In addition to the scoped 0064 migration readiness report, it executes:

- `scripts/map-production-readiness.mjs` for aggregate canonical coverage and Attention Center inventory;
- `scripts/map-production-privacy-smoke.mjs` to compare eligible production D1 geo rows with the real public `/api/map` payload.

The privacy smoke is SELECT-only. Before 0064 it records `SKIPPED_GEO_SCHEMA_UNAVAILABLE`; that is evidence only and never counts as a privacy PASS.

Once `geo_points` exists, launch readiness requires the privacy smoke to pass. It fails closed for conditions including:

- public API items not backed by currently eligible public geo rows;
- hidden, stale, pending, failed or otherwise ineligible rows appearing publicly;
- `APPROXIMATE_PUBLIC` rows using exact precision;
- exact public rows without a current explicit moderation/manual-placement approval;
- later source-staleness invalidating an older exact-location approval;
- approximate display locations leaking their source street address;
- internal fields such as fingerprints, raw address, provider/error metadata or manual-override metadata appearing in the public payload.

Retained privacy evidence contains aggregate counts only and must not persist private/source street values.

## Geo initialization and bounded rollout

MAP-1E does not mass-geocode production data.

Supported operations remain bounded:

1. read-only inventory and classification;
2. initialization in capped batches;
3. very small Geoapify canaries;
4. human review of sensitive/exact candidates;
5. bounded backfill chunks only after approval.

Sensitive/home-based categories remain conservative. A source street address is not permission to publish an exact marker.

## Geoapify production configuration

Server geocoding uses:

`GEOAPIFY_API_KEY`

Requirements:

- server-only secret;
- never a `NEXT_PUBLIC_*` variable;
- never committed to source control;
- configure only in the production runtime;
- retain required Geoapify and OpenStreetMap attribution for returned provider-derived public data.

Provider calls are never part of the production D1 schema migration.

## Google Maps consent, configuration and launch flag

Renderer configuration uses:

- `GOOGLE_MAPS_BROWSER_API_KEY`
- `GOOGLE_MAPS_MAP_ID`

Public launch additionally requires:

`PUBLIC_MAP_ENABLED=1`

The effective public launch gate is deny-by-default and requires all three values simultaneously. If any is absent, Google Maps JavaScript is not loaded and the public `Mapa` navigation item is not exposed.

Before enabling the flag:

1. enable billing and Maps JavaScript API in the production Google Cloud project;
2. create the production Map ID used by Advanced Markers;
3. create a browser API key;
4. restrict website use to the canonical Psipedia production origin;
5. restrict the key to Maps JavaScript API;
6. configure quota/usage monitoring;
7. configure key and Map ID outside source control;
8. complete a real production browser smoke.

Google Maps uses a service-specific opt-in stored under:

`psipedia-google-maps-consent`

Before consent, the Google script is not injected and text results remain usable. Consent can be revoked from `/cookies`.

Relevant disclosure surfaces are:

- `/mapa`
- `/cookies`
- `/sukromie`
- `/podmienky-pouzivania`

MAP V1 does not use browser geolocation, Google Places or browser-side geocoding.

## Public navigation and indexing

The map navigation item is injected only when the effective launch gate passes. It appears after `Služby pre psov` without mutating the D1 navigation table.

Direct `/mapa` access remains available while launch is disabled, but the route stays `noindex,nofollow` until the effective public launch gate passes.

No homepage map block is introduced by MAP-1E.

## Production launch sequence after schema rollout

After 0063 and 0064 are applied and verified:

1. run MAP-1E Production Readiness with the explicit read-only confirmation;
2. verify production `/api/map` returns the normal HTTP 200 MAP-1C contract;
3. review dry-run classification and sensitive/exact candidates;
4. configure `GEOAPIFY_API_KEY`;
5. run small stratified provider canaries;
6. initialize/backfill only approved records in bounded chunks;
7. rerun readiness and clear actionable `GEO_LOCATION_ISSUE` items;
8. configure restricted Google browser key and Map ID while `PUBLIC_MAP_ENABLED` remains off;
9. verify consent, attribution, CSP and privacy on desktop and mobile;
10. confirm the real Google renderer smoke;
11. set `PUBLIC_MAP_ENABLED=1`;
12. run final production smoke and monitor.

Keep the public launch flag off while any hard blocker remains, including 503/API contract failure, missing 0064, empty/unusable public data, unresolved privacy findings, missing attribution, unacceptable canary quality, unrestricted Google configuration, consent/CSP failure or production browser regressions.

## Operational evidence

Retain, per production phase:

- GitHub Actions run URL;
- exact main SHA;
- migration/readiness artifacts;
- aggregate counts before and after;
- canary/backfill aggregate outcomes;
- final privacy smoke result.

Never retain API keys, raw IPs, private addresses or provider secrets in these artifacts.

## Recovery

Every production mutation creates a D1 Time Travel bookmark in preflight evidence.

If a migration fails or postflight verification detects drift:

- do not continue to the next target;
- preserve the generated artifact;
- use the recorded Time Travel recovery bookmark under the existing production incident process;
- rerun only after the root cause is understood.

## MAP-1E completion definition

MAP-1E code is merge-ready when:

- protected migration workflow safely supports only 0062/0063/0064;
- 0063 and 0064 have target-specific regression tests;
- read-only production readiness workflow exists;
- MAP-1B/1C/1D regressions pass;
- clean D1, lint and production build pass.

Public launch readiness is a separate runtime outcome and is not implied by merging this PR.
