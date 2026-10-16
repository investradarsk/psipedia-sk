# NOTION-FACEBOOK-IMAGES-SYNC-1

## Isolated source
New Notion database: https://app.notion.com/p/6b412006688d49dfbf47fe418472f2fd

Data source: 2d945afe-0c79-467e-b9e6-6b0f62a27a49

Old Editorial Hub / Facebook database is NOT read or modified. Existing Psipedia Facebook image admin, publisher, scheduled cron and manually created posts stay intact. D1 notion_page_id and sync_hash are reused; no migration is required.

## Runtime setup (after approved merge/deploy)
Cloudflare Worker variables:
- NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID = 2d945afe-0c79-467e-b9e6-6b0f62a27a49
- NOTION_FACEBOOK_IMAGES_SYNC_ENABLED = false until explicit activation.

The existing NOTION_API_TOKEN secret and R2 BUCKET are reused. The Notion integration behind the token must be given access to the NEW database. Old database access is not sufficient.

Synchronization is OFF unless the new flag is true. No configuration or production deployment is changed by merely opening this PR. Check the effective Facebook publisher gate separately. Do not copy tokens into GitHub.

## Import
Existing 5-minute Cron (and the admin-only Synchronizovať Notion button) reads at most 100 recently edited pages from the new database.
- Názov becomes the local title; Text na Facebook is the caption.
- The first Notion file in Obrázok is fetched over a guarded HTTPS download and stored in Psipedia R2 with a stable local media path.
- Ready for automatic publishing only if Stav is Schválené or Naplánované AND Povoliť publikovanie is checked AND image exists AND date is strictly in the future with an explicit time-zone offset.
- Only then is the D1 post marked scheduled and individually APPROVED; existing publisher runs at its previously implemented schedule.
- Everything else becomes a draft, UNREVIEWED, not eligible for publication. Expired dates never catch up automatically.
- The broad admin global publication toggle should remain OFF for one-item testing; it allows all due posts.

## Idempotency and data safety
Notion page ID is unique. Stable content fingerprints skip repeats. Human changes in Psipedia take precedence over new Notion content; manually edited records are not overwritten. Publication attempts, UNCERTAIN and PUBLISHED states are immutable to the importer. No already published post is sent again.

## Result writeback
On a later 5-minute run, published status in D1 writes back:
- Stav = Publikované
- Facebook Post ID
- Facebook URL
- Publikované o

An UNCERTAIN result writes Stav = Chyba and a sanitized Chyba publikovania value. Never automatically retry on an ambiguous Meta result.

## Pilot checklist
1. Verify all CI and PR review; no merge, deployment, production D1 writes, or Facebook publishing without separate consent.
2. Confirm the new data source is shared with the Notion API integration.
3. Set the data source ID and leave new sync flag OFF.
4. Review all scheduled/approved items in production (including manually created items).
5. Approve merge/deploy separately.
6. Create exactly one Notion test page with JPEG/PNG/WebP, Slovak text, future date+timezone, Stav=Schválené and checkbox ON.
7. Approve enabling the new sync flag separately and keep global Facebook toggle OFF.
8. Run manual admin sync and confirm one scheduled D1 row, then verify one Facebook post and status writeback in Notion.

## Known limitations
At most 100 recently edited pages per sweep; durable pagination is needed at larger scale. One attached image per post. Manual local edits require manual conflict handling. An R2 object can remain unreferenced when a DB write fails; do not blindly remove image objects.
