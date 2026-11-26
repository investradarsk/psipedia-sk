-- Numbered additive V2 migration; apply in order after owner approval.
-- A short-lived intent exists only inside the same D1 batch as an authenticated
-- Admin mutation. Other writers (including Notion) never create this intent.
CREATE TABLE IF NOT EXISTS notion_event_admin_edit_intent (
  entity_id INTEGER PRIMARY KEY,
  edit_id TEXT NOT NULL UNIQUE,
  expected_revision TEXT NOT NULL,
  next_revision TEXT NOT NULL,
  editor TEXT NOT NULL,
  fields_json TEXT NOT NULL CHECK (json_valid(fields_json))
);
CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits (
  agenda TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  notion_page_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  edit_id TEXT NOT NULL,
  baseline_version TEXT NOT NULL,
  canonical_revision TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  explicit_clear INTEGER NOT NULL CHECK (explicit_clear IN (0,1)),
  recovery_after TEXT,
  PRIMARY KEY (agenda, entity_id, notion_page_id, field_key)
);
CREATE INDEX IF NOT EXISTS notion_unified_admin_edit_recovery ON notion_unified_admin_field_edits(recovery_after,observed_at);
-- Trigger sees actual OLD/NEW committed values, not submitted form values.
-- No receipt is created for a failed CAS, an unchanged field, or a sync echo.
CREATE TRIGGER IF NOT EXISTS notion_event_admin_field_receipt
AFTER UPDATE ON managed_events
WHEN EXISTS (
  SELECT 1 FROM notion_event_admin_edit_intent i
  WHERE i.entity_id = NEW.id AND i.expected_revision = OLD.updated_at
    AND i.next_revision = NEW.updated_at AND i.editor = NEW.updated_by
)
BEGIN
  INSERT INTO notion_unified_admin_field_edits
    (agenda, entity_id, notion_page_id, field_key, edit_id, baseline_version,
     canonical_revision, observed_at, value_json, explicit_clear)
  SELECT 'events', CAST(NEW.id AS TEXT), m.notion_page_id, n.key,
    i.edit_id || ':' || n.key, COALESCE(s.baseline_version, m.content_hash),
    NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    json_quote(n.value),
    CASE WHEN n.value IS NULL OR (n.type = 'text' AND trim(n.value) = '') THEN 1 ELSE 0 END
  FROM notion_event_admin_edit_intent i
  JOIN event_notion_sync m ON m.event_id = NEW.id
  JOIN json_each(json_object(
    'title', NEW.title,
    'eventType', NEW.event_type,
    'startDate', NEW.start_date,
    'startTime', NEW.start_time,
    'endDate', NEW.end_date,
    'endTime', NEW.end_time,
    'venue', NEW.venue,
    'city', NEW.city,
    'region', NEW.region,
    'address', NEW.address,
    'organizer', NEW.organizer,
    'excerpt', NEW.excerpt,
    'description', NEW.description,
    'practicalInfo', NEW.practical_info,
    'contactPhone', NEW.contact_phone,
    'contactEmail', NEW.contact_email,
    'admissionFee', NEW.admission_fee,
    'websiteUrl', NEW.website_url,
    'registrationUrl', NEW.registration_url,
    'imageUrl', NEW.image_url,
    'imageAlt', NEW.image_alt,
    'internalNotes', NEW.internal_notes,
    'seo.title', json_extract(NEW.seo_json, '$.title'),
    'seo.description', json_extract(NEW.seo_json, '$.description'),
    'seo.focusKeyword', json_extract(NEW.seo_json, '$.focusKeyword'),
    'seo.canonicalUrl', json_extract(NEW.seo_json, '$.canonicalUrl'),
    'seo.noindex', json_extract(NEW.seo_json, '$.noindex'),
    'seo.ogTitle', json_extract(NEW.seo_json, '$.ogTitle'),
    'seo.ogDescription', json_extract(NEW.seo_json, '$.ogDescription'),
    'seo.ogImage', json_extract(NEW.seo_json, '$.ogImage')
  )) n
  JOIN json_each(json_object(
    'title', OLD.title,
    'eventType', OLD.event_type,
    'startDate', OLD.start_date,
    'startTime', OLD.start_time,
    'endDate', OLD.end_date,
    'endTime', OLD.end_time,
    'venue', OLD.venue,
    'city', OLD.city,
    'region', OLD.region,
    'address', OLD.address,
    'organizer', OLD.organizer,
    'excerpt', OLD.excerpt,
    'description', OLD.description,
    'practicalInfo', OLD.practical_info,
    'contactPhone', OLD.contact_phone,
    'contactEmail', OLD.contact_email,
    'admissionFee', OLD.admission_fee,
    'websiteUrl', OLD.website_url,
    'registrationUrl', OLD.registration_url,
    'imageUrl', OLD.image_url,
    'imageAlt', OLD.image_alt,
    'internalNotes', OLD.internal_notes,
    'seo.title', json_extract(OLD.seo_json, '$.title'),
    'seo.description', json_extract(OLD.seo_json, '$.description'),
    'seo.focusKeyword', json_extract(OLD.seo_json, '$.focusKeyword'),
    'seo.canonicalUrl', json_extract(OLD.seo_json, '$.canonicalUrl'),
    'seo.noindex', json_extract(OLD.seo_json, '$.noindex'),
    'seo.ogTitle', json_extract(OLD.seo_json, '$.ogTitle'),
    'seo.ogDescription', json_extract(OLD.seo_json, '$.ogDescription'),
    'seo.ogImage', json_extract(OLD.seo_json, '$.ogImage')
  )) o ON o.key = n.key
  LEFT JOIN notion_unified_field_state s ON s.agenda = 'events'
    AND s.entity_id = CAST(NEW.id AS TEXT) AND s.notion_page_id = m.notion_page_id
    AND s.field_key = n.key
  WHERE i.entity_id = NEW.id
    AND EXISTS (SELECT 1 FROM json_each(i.fields_json) p WHERE p.value = n.key)
    AND (n.type IS NOT o.type OR n.value IS NOT o.value)
    AND COALESCE(s.baseline_version, m.content_hash) IS NOT NULL
  ON CONFLICT(agenda, entity_id, notion_page_id, field_key) DO UPDATE SET
    edit_id = excluded.edit_id, baseline_version = excluded.baseline_version,
    canonical_revision = excluded.canonical_revision, observed_at = excluded.observed_at,
    value_json = excluded.value_json, explicit_clear = excluded.explicit_clear;
END;

-- Directory captures SQL before and after the canonical/sidecar batch.
CREATE TABLE IF NOT EXISTS notion_directory_admin_edit_intent (
  edit_id TEXT PRIMARY KEY,
  entity_id INTEGER NOT NULL,
  notion_page_id TEXT NOT NULL,
  baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)),
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json))
);
