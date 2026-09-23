# MAP-1E — Production Launch & Hardening

Status of this document: code/operations runbook prepared on 2026-09-23. Public launch remains gated until every production gate below is proven.

## Confirmed production root cause

MAP-1D production smoke returned HTTP 503 from `GET /api/map`.

The successful protected **Production D1 Migrate** run applied and verified only:

`0062_profile_reviews_foundation.sql`

Its preflight reported production at `0061_partner_commercial_interests.sql`, then applied 0062 and completed production smoke.

The public map read layer checks `geo_points` before querying. `geo_points` is created only by:

`0064_geo_foundation.sql`

Therefore the current 503 is expected while production D1 is still at 0062. It is not a Google Maps error.

## Safe D1 path

Do not paste 0063/0064 SQL into Cloudflare manually.

After this MAP-1E PR is merged to `main`, use the protected workflow:

**Production D1 MAP Foundation 0063-0064**

Required confirmation:

`APPLY-0063-0064-psipedia-sk-db`

The workflow:

1. requires `main` and GitHub `production` environment;
2. uses only `CLOUDFLARE_D1_API_TOKEN`;
3. verifies the canonical production DB identity;
4. validates repository migrations and builds the exact production artifact;
5. records a D1 Time Travel bookmark;
6. accepts only production histories ending at 0062, 0063 or 0064;
7. applies 0063 when needed and verifies partner-table preservation;
8. applies 0064 when needed and verifies that `geo_points` is created empty;
9. refuses 0065+ history;
10. requires production `/api/map` to become HTTP 200 with the MAP-1C contract;
11. never deploys the Worker and never auto-restores Time Travel.

The runner is resume-safe if a previous attempt stopped after 0063.

## Read-only production inventory

After this PR is merged, run:

**MAP-1E Production Readiness Audit**

Confirmation:

`AUDIT-MAP-psipedia-sk-db`

This workflow is SELECT-only. It reports safe aggregate data for:

- production migration history;
- published directory address/city completeness;
- directory category breakdown;
- published organizations;
- organization locations by role;
- organizations with multiple locations;
- linked organization/directory profiles;
- published/current physical event coverage;
- repeated event-venue group counts;
- whether `geo_points` exists;
- geo totals by target type, visibility, status and precision;
- manual override count;
- GEO_LOCATION_ISSUE totals/status/error-code breakdown including privacy-critical count;
- public resolved/exact/approximate counts;
- directory category coverage;
- organization SITE coverage;
- upcoming physical event coverage.

Run it once before/after the D1 rollout if an audit trail of the transition is desired, and again after each meaningful geo backfill phase.

The same protected audit also runs a **read-only production privacy smoke** against the real `/api/map` response. Before 0064 it records `SKIPPED_GEO_SCHEMA_UNAVAILABLE` so the pre-migration inventory remains usable; that state is evidence only and is **not** a privacy PASS. Once `geo_points` exists, the privacy smoke must run fully and fails closed when:

- the API is not HTTP 200 or cannot return non-truncated item-mode coverage for the three public categories;
- a public API item is not backed by a currently eligible public `geo_points` row;
- a hidden, stale, pending, failed or otherwise ineligible geo target appears in the public payload;
- an `APPROXIMATE_PUBLIC` row uses `EXACT` precision;
- an `EXACT_PUBLIC + RESOLVED` marker lacks a current admin moderation event proving explicit visibility review (or manual marker placement); a later `GEO_SOURCE_STALE` event invalidates the older approval until the changed exact source is reviewed again;
- an approximate item serializes its source street address;
- raw/internal geo fields such as source fingerprints, provider/error metadata or raw `address` appear in the public payload.

The privacy artifact stores aggregate counts only. It must never persist the private/source street values used for the in-memory leak comparison.

## Geo initialization and canary

MAP-1E intentionally reuses MAP-1B operations instead of creating a second geocoding engine.

Current hard limits:

- dry-run: bounded candidate preview;
- initialization: maximum 100 records per operation;
- production UI defaults are lower;
- canary: maximum 10 provider requests per operation;
- canary does not persist coordinates.

Recommended MVP order:

1. veterinarians;
2. salons/services;
3. physiotherapy;
4. dog hotels/daycare;
5. organization SITE records that are clearly public;
6. upcoming physical event venues;
7. clearly public training centres / cynology areas.

Do not mass-geocode ambiguous exact candidates.

Sensitive types stay conservative:

- breeders;
- walkers;
- trainers/home trainers;
- cynology/breeder clubs;
- organization LEGAL_SEAT;
- private/home-based help or services.

A source street address is not permission to publish an exact marker.

## Geoapify production configuration

Server secret:

`GEOAPIFY_API_KEY`

Requirements:

- server-only secret;
- never `NEXT_PUBLIC_*`;
- never committed to the repository;
- configure in the production runtime only after a real key exists.

Current official provider findings checked on 2026-09-23:

- Free tier permits limited commercial use;
- Free tier includes 3,000 credits/day;
- Free rate limit is up to 5 requests/second;
- one geocoding request consumes one credit;
- storage/caching of geocoding results is permitted;
- Free use requires Geoapify attribution;
- OpenStreetMap attribution must be retained for OSM-derived data.

The public API now emits both:

- `Powered by Geoapify`
- `© OpenStreetMap contributors`

when returned public coordinates have Geoapify provenance.

Do not start production canary/backfill if provider terms materially change.

## Google Maps production configuration

Renderer environment:

`GOOGLE_MAPS_BROWSER_API_KEY`

`GOOGLE_MAPS_MAP_ID`

Launch flag:

`PUBLIC_MAP_ENABLED=1`

The effective public launch gate is fail-closed and requires all three values at the same time:

- `PUBLIC_MAP_ENABLED=1`;
- non-empty `GOOGLE_MAPS_BROWSER_API_KEY`;
- non-empty `GOOGLE_MAPS_MAP_ID`.

If any one is missing:

- Google Maps JS is not loaded;
- `Mapa` is removed from the D1-backed and fallback public navigation;
- direct `/mapa` access remains additive and can still show text results.

Before setting the flag:

1. create/select the production Google Cloud project;
2. enable billing;
3. enable **Maps JavaScript API**;
4. create a production Map ID compatible with Advanced Markers;
5. create a browser API key;
6. restrict the website key to `https://psipedia.sk/*`; the current `www.psipedia.sk` host redirects to the canonical non-www origin, so do not add it unless that routing changes;
7. restrict the key to Maps JavaScript API only;
8. configure usage/quota monitoring;
9. place key/Map ID in the correct production environment mechanism;
10. run a real browser smoke before navigation is enabled.

Do not use an unrestricted browser key.

### Psipedia Cloudflare runtime placement

The current deploy command uses Wrangler with `--keep-vars`, so externally configured Worker variables are preserved across normal deployments.

Use the production Worker runtime configuration as follows:

- `GEOAPIFY_API_KEY` — Cloudflare **Secret** (encrypted server-side binding);
- `GOOGLE_MAPS_BROWSER_API_KEY` — Worker variable configured outside source control;
- `GOOGLE_MAPS_MAP_ID` — Worker variable configured outside source control;
- `PUBLIC_MAP_ENABLED` — Worker variable, keep `0`/unset until the final launch gate.

Recommended rollout order:

1. configure Geoapify secret only when the real provider key exists;
2. configure restricted Google Browser key + Map ID while `PUBLIC_MAP_ENABLED` is still off;
3. complete real renderer/privacy/CSP smoke;
4. set `PUBLIC_MAP_ENABLED=1` only after every launch blocker is cleared.

Never commit credential values to `wrangler.jsonc`, `.env.example`, workflow YAML or documentation.

The current production page itself reports **Google Maps nie je nakonfigurovaný**, so credentials are not presently proven available.

## Current Google cost model

Checked against current Google Maps Platform pricing on 2026-09-23.

Dynamic Maps currently includes 10,000 free map loads per month. In the first paid tier, the published list price is USD 7 per 1,000 additional loads.

Illustrative monthly model before tax/contract discounts:

| Dynamic map loads | Approx. list-price cost |
| ---: | ---: |
| 1,000 | $0 |
| 5,000 | $0 |
| 10,000 | $0 |
| 20,000 | $70 |
| 50,000 | $280 |

A map load is distinct from Psipedia `/api/map` requests. Pan/zoom requests can call Psipedia repeatedly without creating a new Google map instance or a new Dynamic Maps load.

Budget alerts are notifications, not a hard spend cap. Key restrictions and reasonable API quotas remain necessary.

## Google Maps consent and privacy

MAP-1E uses a service-specific opt-in stored under:

`psipedia-google-maps-consent`

Before opt-in:

- Google Maps script is not injected;
- text map results remain usable;
- the UI explains that Google Maps is optional.

After opt-in:

- the renderer may load Google Maps if the production launch flag and credentials are also valid.

The choice can be revoked on `/cookies`; revocation reloads the page so further Google map loading stops.

Public disclosures are present on:

- `/mapa`;
- `/cookies`;
- `/sukromie`;
- `/podmienky-pouzivania`.

Google Maps remains a renderer only. Psipedia does not use Google Places, browser geocoding or browser geolocation in MAP V1.

## CSP and referrer policy

The MAP-1D route-specific CSP remains in place.

Real production renderer smoke must prove that the currently required Google Maps JavaScript domains work without CSP violations. Do not solve a CSP error with a bare wildcard.

The route keeps:

`Referrer-Policy: strict-origin-when-cross-origin`

Because the Maps loader uses `auth_referrer_policy=origin`, verify the final Google API-key website restriction with the real production key before launch.

## Launch navigation

Public navigation uses the effective MAP launch gate:

`PUBLIC_MAP_ENABLED + GOOGLE_MAPS_BROWSER_API_KEY + GOOGLE_MAPS_MAP_ID`

Only when all three are present/valid does `Mapa` get injected directly after `Služby pre psov` without mutating the D1 navigation table.

This design makes rollback immediate: turn the launch flag off (or remove renderer config) and redeploy/configure the runtime. The map link disappears while the rest of Psipedia remains unaffected.

Search indexing is also launch-gated: direct `/mapa` remains `noindex,nofollow` until the effective launch gate is complete. Once flag + Browser key + Map ID are all present, normal index/follow metadata is restored.

No homepage map block is added in MAP-1E.

## Production sequence

Do not enable the navigation flag before these stages are complete:

1. merge/deploy MAP-1E code;
2. run read-only readiness audit;
3. run protected 0063→0064 D1 rollout;
4. verify production `/api/map` returns 200;
5. run readiness audit again;
6. perform MAP-1B dry-run classification;
7. review sensitive/exact candidates;
8. configure `GEOAPIFY_API_KEY`;
9. run small stratified canaries;
10. initialize/backfill only approved MVP records in bounded chunks;
11. re-run readiness/coverage audit;
12. clear actionable GEO_LOCATION_ISSUE items;
13. configure restricted Google browser key + Map ID;
14. verify consent flow;
15. run real Google renderer/CSP/privacy desktop+mobile smoke;
16. set `PUBLIC_MAP_ENABLED=1`;
17. perform final production smoke and monitoring check.

## Hard launch blockers

Keep `PUBLIC_MAP_ENABLED=0` if any of these remain true:

- production `/api/map` is 503;
- 0064 is unavailable;
- public resolved dataset is empty or not useful;
- privacy review is incomplete;
- suspicious exact/private exposure exists;
- required provider attribution is missing;
- Geoapify canary quality is unacceptable;
- Google key is unrestricted or absent;
- Map ID/renderer fails;
- consent gate fails;
- CSP blocks required renderer resources;
- production mobile/desktop smoke fails.

## Operational evidence to retain

For every production phase, keep:

- GitHub Actions run URL;
- migration/readiness artifact;
- current main SHA;
- counts before/after;
- canary attempted/accepted/review/provider-error counts;
- bounded backfill attempted/resolved/review/failed/skipped counts;
- quota usage snapshot;
- final privacy smoke result.

Never store API keys, raw IPs, private addresses or provider secrets in these artifacts.
