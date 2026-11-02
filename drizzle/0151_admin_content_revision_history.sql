-- Stage 4/5: append-only audit of existing editable section and hero rows.
-- No backfill: older values are not reconstructible. All writers are observed at D1.
CREATE TABLE admin_content_revision_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('section','section_visual')),
  entity_key TEXT NOT NULL CHECK(length(entity_key)>0 AND length(entity_key)<=120),
  operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  before_json TEXT,
  after_json TEXT,
  actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX admin_content_revision_entity_idx
  ON admin_content_revision_history(entity_type,entity_key,id DESC);

-- Don't generate phantom revisions for a no-op editor save.
CREATE TRIGGER admin_section_revision_update AFTER UPDATE ON portal_section_settings
WHEN OLD.label IS NOT NEW.label OR OLD.eyebrow IS NOT NEW.eyebrow OR OLD.description IS NOT NEW.description OR OLD.intro IS NOT NEW.intro OR OLD.hero_config_json IS NOT NEW.hero_config_json OR OLD.subpages_json IS NOT NEW.subpages_json OR OLD.position IS NOT NEW.position OR OLD.visible IS NOT NEW.visible
BEGIN
  INSERT INTO admin_content_revision_history(entity_type,entity_key,operation,before_json,after_json,actor)
  VALUES ('section',NEW.slug,'UPDATE',json_object('slug',OLD.slug,'label',OLD.label,'eyebrow',OLD.eyebrow,'description',OLD.description,'intro',OLD.intro,'hero_config_json',OLD.hero_config_json,'subpages_json',OLD.subpages_json,'position',OLD.position,'visible',OLD.visible,'updated_at',OLD.updated_at),json_object('slug',NEW.slug,'label',NEW.label,'eyebrow',NEW.eyebrow,'description',NEW.description,'intro',NEW.intro,'hero_config_json',NEW.hero_config_json,'subpages_json',NEW.subpages_json,'position',NEW.position,'visible',NEW.visible,'updated_at',NEW.updated_at),NEW.updated_by);
END;

CREATE TRIGGER admin_visual_revision_insert AFTER INSERT ON section_visuals
BEGIN
  INSERT INTO admin_content_revision_history(entity_type,entity_key,operation,before_json,after_json,actor)
  VALUES ('section_visual',NEW.visual_key,'INSERT',NULL,json_object('visual_key',NEW.visual_key,'section_slug',NEW.section_slug,'subsection_slug',NEW.subsection_slug,'image_url',NEW.image_url,'image_key',NEW.image_key,'alt_text',NEW.alt_text,'desktop_x',NEW.desktop_x,'desktop_y',NEW.desktop_y,'desktop_zoom',NEW.desktop_zoom,'mobile_x',NEW.mobile_x,'mobile_y',NEW.mobile_y,'mobile_zoom',NEW.mobile_zoom,'updated_at',NEW.updated_at),NEW.updated_by);
END;
CREATE TRIGGER admin_visual_revision_update AFTER UPDATE ON section_visuals
WHEN OLD.visual_key IS NOT NEW.visual_key OR OLD.section_slug IS NOT NEW.section_slug OR OLD.subsection_slug IS NOT NEW.subsection_slug OR OLD.image_url IS NOT NEW.image_url OR OLD.image_key IS NOT NEW.image_key OR OLD.alt_text IS NOT NEW.alt_text OR OLD.desktop_x IS NOT NEW.desktop_x OR OLD.desktop_y IS NOT NEW.desktop_y OR OLD.desktop_zoom IS NOT NEW.desktop_zoom OR OLD.mobile_x IS NOT NEW.mobile_x OR OLD.mobile_y IS NOT NEW.mobile_y OR OLD.mobile_zoom IS NOT NEW.mobile_zoom
BEGIN
  INSERT INTO admin_content_revision_history(entity_type,entity_key,operation,before_json,after_json,actor)
  VALUES ('section_visual',NEW.visual_key,'UPDATE',json_object('visual_key',OLD.visual_key,'section_slug',OLD.section_slug,'subsection_slug',OLD.subsection_slug,'image_url',OLD.image_url,'image_key',OLD.image_key,'alt_text',OLD.alt_text,'desktop_x',OLD.desktop_x,'desktop_y',OLD.desktop_y,'desktop_zoom',OLD.desktop_zoom,'mobile_x',OLD.mobile_x,'mobile_y',OLD.mobile_y,'mobile_zoom',OLD.mobile_zoom,'updated_at',OLD.updated_at),json_object('visual_key',NEW.visual_key,'section_slug',NEW.section_slug,'subsection_slug',NEW.subsection_slug,'image_url',NEW.image_url,'image_key',NEW.image_key,'alt_text',NEW.alt_text,'desktop_x',NEW.desktop_x,'desktop_y',NEW.desktop_y,'desktop_zoom',NEW.desktop_zoom,'mobile_x',NEW.mobile_x,'mobile_y',NEW.mobile_y,'mobile_zoom',NEW.mobile_zoom,'updated_at',NEW.updated_at),NEW.updated_by);
END;
CREATE TRIGGER admin_visual_revision_delete AFTER DELETE ON section_visuals
BEGIN
  INSERT INTO admin_content_revision_history(entity_type,entity_key,operation,before_json,after_json,actor)
  VALUES ('section_visual',OLD.visual_key,'DELETE',json_object('visual_key',OLD.visual_key,'section_slug',OLD.section_slug,'subsection_slug',OLD.subsection_slug,'image_url',OLD.image_url,'image_key',OLD.image_key,'alt_text',OLD.alt_text,'desktop_x',OLD.desktop_x,'desktop_y',OLD.desktop_y,'desktop_zoom',OLD.desktop_zoom,'mobile_x',OLD.mobile_x,'mobile_y',OLD.mobile_y,'mobile_zoom',OLD.mobile_zoom,'updated_at',OLD.updated_at),NULL,'system:visual-reset-or-delete');
END;
-- An older audit event must never be re-written or erased, including after restore.
CREATE TRIGGER admin_content_revision_no_update BEFORE UPDATE ON admin_content_revision_history
BEGIN SELECT RAISE(ABORT,'Content history is append-only'); END;
CREATE TRIGGER admin_content_revision_no_delete BEFORE DELETE ON admin_content_revision_history
BEGIN SELECT RAISE(ABORT,'Content history is append-only'); END;
