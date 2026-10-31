-- 0151: Visual Library owner-reviewed banner drafts and desktop-only releases.
-- Explicit protected production migration required; PR merge NEVER applies it.
-- Existing published banners remain unchanged until an authenticated owner action.
CREATE TABLE visual_library_banner_edits (
  banner_id TEXT NOT NULL,
  variant_index INTEGER NOT NULL CHECK (variant_index BETWEEN 0 AND 2),
  draft_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_json TEXT,
  published_revision INTEGER,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_at TEXT,
  published_by TEXT,
  PRIMARY KEY(banner_id, variant_index)
);
