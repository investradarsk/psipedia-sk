-- Prepared only: manual Facebook image planning, no publisher or backfill.
CREATE TABLE facebook_image_posts (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Bratislava' CHECK (time_zone='Europe/Bratislava'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>=1),
  approval_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
  approved_at TEXT,
  approved_by TEXT,
  facebook_post_id TEXT,
  published_at TEXT,
  notion_page_id TEXT,
  sync_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK ((image_url='' AND image_key='') OR (image_key<>'' AND image_url='/media/' || image_key)),
  CHECK (status<>'scheduled' OR (scheduled_at IS NOT NULL AND image_key<>''))
);
CREATE INDEX facebook_image_posts_schedule_idx ON facebook_image_posts(status,scheduled_at,id);
CREATE INDEX facebook_image_posts_updated_idx ON facebook_image_posts(updated_at,id);
CREATE UNIQUE INDEX facebook_image_posts_notion_idx ON facebook_image_posts(notion_page_id) WHERE notion_page_id IS NOT NULL;
