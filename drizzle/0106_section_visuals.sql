CREATE TABLE section_visuals (
  visual_key TEXT PRIMARY KEY NOT NULL,
  section_slug TEXT,
  subsection_slug TEXT,
  image_url TEXT NOT NULL,
  image_key TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  desktop_x REAL NOT NULL DEFAULT 0.5 CHECK (desktop_x >= 0 AND desktop_x <= 1),
  desktop_y REAL NOT NULL DEFAULT 0.5 CHECK (desktop_y >= 0 AND desktop_y <= 1),
  desktop_zoom REAL NOT NULL DEFAULT 1 CHECK (desktop_zoom >= 1 AND desktop_zoom <= 3),
  mobile_x REAL NOT NULL DEFAULT 0.5 CHECK (mobile_x >= 0 AND mobile_x <= 1),
  mobile_y REAL NOT NULL DEFAULT 0.5 CHECK (mobile_y >= 0 AND mobile_y <= 1),
  mobile_zoom REAL NOT NULL DEFAULT 1 CHECK (mobile_zoom >= 1 AND mobile_zoom <= 3),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX section_visuals_section_idx
  ON section_visuals(section_slug, subsection_slug, visual_key);
