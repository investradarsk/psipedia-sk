# Facebook 0135 — protected production rollout (prepared for owner approval)

Scope: existing Facebook image automation only. Existing publisher behavior must remain unchanged. 0134 Services V3 production applied and verified: GitHub Actions run 39474059819 (SUCCESS, October 20 2026). Never re-run 0134.

This PR only **adds a manual protected target** to the existing Production D1 Migrate workflow. **No D1 APPLY, Cloudflare deploy, Meta POST, Notion PATCH or flag enablement** is performed by a merge.

## Gate
- Source is exactly `drizzle/0135_facebook_image_safe_retry.sql`, pinned to SHA256 `20892029e977b4535160a5c518cd0714c216e755d727471afea7f9d344937304`. No rewritten SQL.
- Production target `psipedia-sk-db` only, protected environment `production`, dispatched on `main` with exact confirmation `APPLY-0135-psipedia-sk-db`.
- Full canonical history through 0134, exact preceding schema, no 0135 partial/manual schema or in-flight SENDING claim.
- Preflight creates a D1 Time Travel recovery bookmark; before applying it snapshots existing post IDs/states/schedules, attempt records and publisher STOP settings as private digests.
- Apply runs once and only once, in the existing scoped migrations workflow. A second 0135 attempt is refused. Postflight checks history, retry columns/CHECK constraints, exact seven new DDL objects and append-only triggers; existing Facebook posts, attempts and STOP settings must be unchanged. Existing production smoke executes.
- All new retry and scheduling feature flags stay **OFF** by default. Never alter existing `FACEBOOK_IMAGE_PUBLISH_ENABLED` or the current global STOP during schema-only deployment.

## After manually approved migration
1. Check workflow and its safe report, then read-only confirm production D1 history/schema and old publisher behavior.
2. Separately approve V2 activation: `NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED` with an explicit UTC cutover, and `FACEBOOK_IMAGE_SAFE_RETRY_V2_ENABLED`. No historical Notion edit auto-authorizes publication.
3. Inspect old scheduled/uncertain attempts and STOP, then run one owner-approved controlled test of explicit Meta throttling retry with mocked Meta calls first. Never replay ambiguous timeouts, HTTP 5xx or malformed responses.
4. Live acceptance requires separately authorized single-item Facebook testing; migration and offline CI alone never prove Graph API success.

## Cross-workstream issue
Open Notion article Draft PR #929 also contains a **different** prepared `0135_notion_article_editorial_outbox.sql`. It must be renumbered by its owner before that PR can merge; never merge two different 0135 migrations into the canonical migration chain.
