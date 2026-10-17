-- Prepared only. Do not auto-apply to production. Keep all posts, attempts and media intact.
-- A deleted post remains addressable by id and retains its notion_page_id tombstone.
ALTER TABLE facebook_image_posts ADD COLUMN deleted_at TEXT;
ALTER TABLE facebook_image_posts ADD COLUMN deleted_by TEXT;
CREATE INDEX facebook_image_posts_trash_idx
  ON facebook_image_posts(deleted_at, updated_at DESC, id);
