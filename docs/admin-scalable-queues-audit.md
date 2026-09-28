# ADMIN-ATTENTION-2 + ADMIN-SEARCH-1 — audit and architecture

Audit base: `main@a9c0a8e170e341365c4367a44e6e2ba93e8ceea0`.

This workstream is intentionally independent from public SEARCH-1 (PR #445) and from the automation engine. No public search implementation, source discovery, source adapter, source-run, entity-matching, canonical-draft or automation-governance code is used by this read model.

## Admin module matrix

| Module | Server search | Server filter | Exact total | Pagination | Bulk all-matching | Error state | Decision |
|---|---|---|---|---|---|---|---|
| Articles | **YES after this PR** | **YES after this PR** | **YES** | **YES**, 50/page | **OFF** | query errors are not converted to empty; result contract exposes OK/EMPTY | Implemented |
| Directory | YES | YES | YES | YES, 50/page | OFF | failure is not masked as empty | Existing contract retained |
| Organizations | YES | YES | YES | YES, 50/page | N/A | failure is not masked as empty | Existing contract retained |
| Adoptions | YES | YES | YES | YES | N/A | failure is not masked as empty | Existing contract retained |
| Help cases | YES | YES | YES | YES, 50/page | N/A | failure is not masked as empty | Existing contract retained |
| Lost / found | YES | YES | YES | YES, 50/page | N/A | canonical store owns errors | Existing contract retained |
| Events | **NO** — full admin list is loaded before UI filtering | **NO** — UI-side | NO filtered server total | UI page slicing only | N/A | not a typed list state | **Backlog P1** |
| Partner accounts | NO for full dataset — LIMIT 250 then decrypted q filtering | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner claims | NO for full dataset — LIMIT 300 then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner verifications | NO for full dataset — LIMIT 300 then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner profile changes | NO for full dataset — LIMIT 300 then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner new profiles | NO for full dataset — bounded list then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner events | NO for full dataset — bounded list then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |
| Partner commercial leads | NO for full dataset — LIMIT 250 then filter | partial/post-query | NO filtered total | NO | N/A | exception | **Backlog P2** |

Events and partner worklists are deliberately not rewritten in this PR. Combining them with the new Attention read model and article query contract would make this a broad multi-domain refactor. Their current fixed-cap/post-query behavior is now explicit backlog rather than silently treated as scalable search.

## Confirmed Attention root cause

The old queue performed fifteen independent source queries with `LIMIT 50`, merged those rows in memory and only then filtered/summarized the loaded slice. A source adapter failure was converted to `[]`, and the exact badge count path converted a failed source count to `0`. This created three indistinguishable cases in the UI: genuinely empty, truncated and unavailable.

## Attention source inventory and ownership

`AUTOMATION_FINDING` is intentionally **not** part of the generic queue read model. Automation candidate/source/POSSIBLE-match review remains owned by the existing automation module and links from the Alerts hub. This PR does not create a duplicate automation queue or change the automation engine.

| Source type | Canonical read source | Active/open rule | Stable time / priority | Owner / resolution target |
|---|---|---|---|---|
| MODERATION_SUBMISSION | `moderation_submissions` | SUBMITTED / PENDING_REVIEW / QUARANTINED for LOST_FOUND_CASE or ADOPTION_DOG | created_at; QUARANTINED/risk flags elevate | moderation owners; existing lost-found/adoption admin |
| PROFILE_REVIEW_MODERATION | `profile_reviews` + resource target | PENDING_REVIEW | created_at; risk flags elevate | profile-review moderation detail |
| NEWS_TIP | `news_tips` | new / reviewing | created_at; medium | editorial tips admin |
| DIRECTORY_CHANGE_REQUEST | `directory_profile_change_requests` | new | created_at; medium | directory change-request admin |
| DIRECTORY_INQUIRY | `directory_inquiries` | new / read | created_at; >24h new is high | inquiries admin |
| ARTICLE_FEEDBACK | `article_feedback` | helpful=0 and new/reviewing | created_at; medium | article-feedback admin |
| ADOPTION_STALE | `adoption_dogs` | ACTIVE/RESERVED and stale verification | last_verified_at/created_at; noindex-stale threshold elevates | adoption detail |
| PARTNER_CLAIM_REVIEW | `partner_claims` | PENDING | created_at; ownership conflict elevates | partner claims |
| PARTNER_PROFILE_CHANGE_REVIEW | moderation + `partner_profile_change_metadata` | SUBMITTED/PENDING_REVIEW/QUARANTINED | created_at; stale base elevates | partner profile changes |
| PARTNER_NEW_PROFILE_REVIEW | moderation + `partner_new_profile_metadata` | SUBMITTED/PENDING_REVIEW/QUARANTINED | created_at; HIGH duplicate confidence elevates | partner new-profile review |
| PARTNER_EVENT_REVIEW | moderation + `partner_event_submission_metadata` | SUBMITTED/PENDING_REVIEW/QUARANTINED | created_at; duplicate/stale/quarantine elevates | partner event review |
| PARTNER_VERIFICATION_REVIEW | `partner_resource_verifications` | PENDING_VERIFICATION | submitted_at/created_at; ownership conflict elevates | partner verification |
| PARTNER_COMMERCIAL_LEAD | `partner_commercial_interests` | NEW | created_at; low | partner commercial lead detail |
| PARTNER_COMMERCIAL_AGREEMENT | `partner_commercial_agreements` | OFFERED, activation-ready AGREED, or active agreement expiring within 14d | created_at; activation-ready is high | commercial agreement detail |
| GEO_LOCATION_ISSUE | `geo_points` + canonical target joins | NEEDS_REVIEW / STALE / FAILED | updated_at; privacy/conflict rules determine severity | canonical directory/org/event geo owner |

Each source has an exact active-count probe. A failed probe is `UNAVAILABLE` with `activeCount=null`; it is never represented as a zero.

## Read-time pagination architecture

The queue remains a read-time model; no materialized Attention table was added.

1. Fifteen source probes establish exact active counts and source availability.
2. Available sources are composed into a normalized `UNION ALL` read model.
3. One aggregate query returns exact available-source totals/facets for the current request.
4. One page query returns at most `pageSize + 1` rows.
5. Default page size is 24; hard maximum is 50.
6. A full Attention page is bounded to at most **17 D1 queries**: 15 probes + one aggregate + one page query.

The cursor is Base64URL-encoded JSON and contains:
- active/history rank,
- priority rank,
- relevant timestamp,
- source type,
- canonical source id,
- a fingerprint of active filters,
- cursor version.

The SQL order is deterministic. Active items sort by priority, oldest relevant time, source type and id. History sorts newest relevant time first, then source type and id. Cursor fields are never used as SQL identifiers; all values are bound parameters. An invalid or filter-incompatible cursor resets safely to the first page and is visible in the UI.

## Availability and count contract

Availability is explicit:
- `OK`: complete available result with items.
- `EMPTY`: successful query with zero matches.
- `PARTIAL`: at least one canonical source is unavailable; available results are shown with a warning.
- `UNAVAILABLE`: no usable queue result can be produced.

The notification badge and source facets use the same source probes as the page. When a source is unavailable its facet is shown as `—`; the badge is marked incomplete instead of asserting a definitive zero.

The old `.catch(() => [])` / failed-count-to-zero behavior is removed from the generic Attention path.

## Actions and concurrency

Attention is orchestration only. It adds no POST/PATCH/DELETE endpoint and does not duplicate partner, review, geo, adoption or automation business logic. Cards deep-link to the canonical owner.

Existing source owners retain their transition guards (for example partner claims/verification use conditional pending-state updates; partner profile/event moderation uses expected-state atomic transitions). Resolving an item changes the canonical source row; the next queue/badge read derives the new state directly, so no detached Attention copy can become stale.

## Article admin query contract

Article list state is server-side and URL-addressable:
- `query` (max 120 chars),
- `status`,
- `sort`,
- `direction`,
- `page`,
- bounded `pageSize`.

Search covers title, slug, excerpt and category. Slovak diacritics are folded in the SQL expression and in the search needle. SQL wildcard characters `%`, `_` and `\\` are escaped. Sort fields/direction come only from allowlists; user input never becomes a SQL identifier.

Example: `/admin?query=zuby&status=draft&page=2`.

The store returns an exact filtered `resultCount` plus global article status counts. The UI no longer searches only the current 50-row page. Bulk “all matching” remains disabled because no safe snapshot/fingerprint mutation contract has been enabled for articles.

## Security and authorization

- Existing `requireAdminPageUser(...)` page guards remain in place.
- No admin authorization layer was weakened or replaced by Cloudflare Access assumptions.
- SQL values are parameterized.
- Sort and filter values are allowlisted/bounded.
- Cursors are validated and filter-bound.
- No PII is placed in queue URLs/cursors.
- Source-failure logs contain source type, operation and safe error code only; raw records/tokens/cookies are not logged.
- No new Attention mutation endpoint exists.

## Performance and migrations

No migration is required by this PR.

Attention page bounds:
- 15 source probes, in parallel,
- one aggregate query,
- one page query,
- 24 default / 50 maximum rows returned to the page.

Article list bounds:
- 50 default rows,
- 100 hard maximum page size,
- one exact filtered count,
- one status-count query,
- one bounded page query.

No unbounded Attention/article list is rendered to the browser.

## Test strategy

Isolated local D1 fixtures cover:
- 61 Attention items in one source, proving rows beyond the old 50-item cap are reachable,
- two cursor pages with no overlap,
- invalid cursor reset,
- explicit EMPTY versus simulated UNAVAILABLE source,
- partial result warning,
- article search across 61 rows with the target deliberately beyond page 1,
- Slovak diacritic search (`zuby` -> `Žlté zúbky`),
- status + URL state across refresh,
- 390 px overflow checks,
- desktop/mobile Chromium and Axe.

No fixture or E2E writes to production.

## Parallel compatibility

Public SEARCH-1 PR #445 changes public search files. This branch does not modify those files. The automation calls left on the Alerts landing page are existing read-only review summaries; no automation engine file or contract is modified.
