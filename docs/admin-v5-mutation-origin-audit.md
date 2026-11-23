# Admin V5-09 — mutation origin and Access audit

Scope: shared PR #1577, `/api/admin` routes at the V5-09 audit of 24 November 2026. The repository tree contains **190** `app/api/admin/**/route.ts` files (including GET-only routes, retired handlers and active mutators); this is a route-file count, not a count of mutating operations. The inventory was checked against exported POST, PUT, PATCH and DELETE handlers. Only confirmed, isolated deficiencies with known callers were changed.

## Authentication and provenance model

- Cloudflare Access admission and the Worker's verified JWT/authorization marker remain mandatory. The API must never trust Access identity headers merely because the caller submitted them. `getAdminApiUser` and `requireAdminMutation` in `lib/admin-auth.ts` retain this existing boundary.
- Existing `rejectUntrustedAdminMutationOrigin` in `lib/admin-mutation-origin.ts` rejects explicit cross-origin `Origin` values and `Sec-Fetch-Site: cross-site` / `same-site`, including conflicts between otherwise matching `Origin` and Fetch Metadata.
- **Strict provenance** accepts an exact target-origin `Origin` (scheme, host and port must match), or an absent `Origin` accompanied by `Sec-Fetch-Site: same-origin`. It rejects both headers absent, `null` origin and standalone `Sec-Fetch-Site: none`. The same-origin Fetch Metadata fallback is important for real browser/PWA fetches.
- The existing non-strict `requireAdminMutation(request)` policy remains unchanged for routes not yet audited. We deliberately did not make all Admin endpoints globally fail closed, because this would risk breaking unidentified legitimate clients.

## Confirmed fixes committed to the shared branch

| Endpoint family | Mutation(s) | Proven caller | Adjustment |
|---|---|---|---|
| `/api/admin/uploads` | POST (all folders) | `lib/admin-image-upload.ts`, photo editors and PWA | Single strict guard before R2, including `facebook-images` |
| `/api/admin/analytics-device` | POST | `components/admin-pwa-settings.tsx` | Strict guard; GET and secure HttpOnly cookie unchanged |
| `/api/admin/address-research-import/apply` | POST | `components/admin-address-research-import.tsx` | Migrated existing guard to strict mode; preview remains read-only |
| `/api/admin/name-days`, `/[id]`, `/import` | POST, PUT, DELETE, POST | `components/admin-dog-name-day-dashboard.tsx` | Central strict guard before JSON parse, D1 write or archive |
| `/api/admin/monetization` | POST, PATCH | `components/admin-monetization-dashboard.tsx` | Central strict guard; GET unchanged |
| `/api/admin/outreach/campaigns`, `/[id]`, `/prepare`, `/preview`, `/send`, `/responses/[id]` | POST, PATCH, POST, POST, POST, PATCH | `components/admin-outreach-dashboard.tsx`, `components/admin-outreach-campaign.tsx` | Central strict guard before campaign state changes or sending messages; retain existing `assertOutreachJsonMutation` content-type check |

The above comprises **15 exported write methods in 13 route files**. All matching calls from the investigated UI use relative same-origin `fetch`. No Partner API, Worker authentication, AdminShell, Article, Event or Services V3 API was changed.

## Existing safeguards retained rather than weakened

- `/api/admin/bulk/execute`, `/bulk/preflight` already have explicit exact-`Origin` and JSON checks; do not replace them with a weaker compatibility guard.
- `/api/admin/push/subscription` and `/push/history` have deliberate explicit-`Origin` checks; Admin PWA push settings use same-origin fetch.
- `/api/admin/address-enrichment/*` uses `requireAutomationAdminMutation`, which requires an explicit matching `Origin` and JSON content type.
- Retired legacy automation handlers return the retired response without performing writes.

## Deliberately excluded: parallel V5 workstreams

The broader inventory also identifies direct identity-only write paths and older compatibility guards; their origin policy must be reviewed with their actual callers and ownership before migration. Examples to coordinate rather than modify here:

- `/api/admin/data-quality/media/[id]/accept` and `/data-quality/media/run`: related to V5-05 quality.
- `/api/admin/editorial-authors` and `/api/admin/news-tips/[id]`: article/editorial family, coordinate with V5-07.
- `/api/admin/sections`: sections editor, coordinate with V5-01.
- Notion and synchronization actions: V5-06.
- Help/directory, Events, Partners and Services V3: respective parallel owners or explicit exclusions.

These examples are **not asserted to be remediated** by V5-09. For every follow-on migration, check the endpoint's actual callers, its Access identity requirement, exact Origin and Fetch Metadata semantics, expected status codes, and tests before changing defaults. Do not interpret `getAdminApiUser()` alone as sufficient CSRF protection.

## Regression coverage

`tests/admin-v5-mutation-origin.test.mjs` with the offline-only loader and dedicated GitHub Actions workflow covers allowed exact-`Origin` and Fetch Metadata fallback, disallowed cross-site and conflicting headers, missing provenance, anonymous and unconfigured identities, spoofed request-level Access headers, GET continuity, PWA analytics cookie, and absence of write-side effects on blocked requests. The synthetic Facebook-image upload fixture now supplies the browser's `Sec-Fetch-Site: same-origin` signal without relaxing production policy.

No force push, new pull request, or merge was performed by this workstream.
