# FACEBOOK ADMIN → NOTION AUTHORITY V1

Status: development PR only. No production migration, merge, deployment, feature-flag activation, or live Meta call.

The Psipedia D1 admin is authoritative after any local change. Existing five-minute Notion synchronization first exports up to 20 locally edited records (with per-row lease and version check), then imports Notion changes. Notion import never overwrites admin-owned rows.

New admin draft/scheduled/published posts create a Notion page in the isolated Facebook obrázky data source. Admin edits overwrite its title, caption, public R2 image reference, schedule, publishing status, Facebook ID/URL and actual published time.

Admin trash moves linked Notion page into recoverable Notion Trash and prevents republishing; restore returns it and syncs fresh canonical fields. Permanent Notion deletion is not exposed through the API. Trashing a published post does not delete the already published Facebook post.

Admin-created Notion pages carry a stable marker PSIPEDIA_ADMIN_ID:<UUID> in Poznámka. Retried creates first search for that marker to prevent duplicate pages after an interrupted response. Existing imported page notes are left untouched.

The D1 sync_hash field is reused for outbound lease and version acknowledgment; crashes recover after an eight-minute lease. If an admin edit races with outbound Notion call, next sweep exports the newer version. No new D1 migration needed.

The new Cloudflare variable NOTION_FACEBOOK_IMAGES_ADMIN_AUTHORITY_ENABLED defaults to false. It MUST remain false until an explicit separate rollout approval. Existing Notion import and Meta publisher remain unchanged.

Rollout: inspect existing manual scheduled/published posts and Notion permissions, test one draft and one scheduled post, inspect create/edit/trash/restore/publish writeback and duplicates, then enable the authority flag. The admin Synchronizovať Notion action shows outbound counters and failures.

Limitations: newest 20 revisions per sweep; very large backlog may take multiple cycles. The Notion API supports recoverable trash, not permanent purge. Individual Meta approval rules remain unchanged.