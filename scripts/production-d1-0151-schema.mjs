/**
 * Strict, owner-reviewed schema contract for 0151 content-history rollout.
 * This migration adds only audit objects, and never edits existing section
 * or visual rows. Hash is computed from the existing immutable SQL bytes.
 */
export const PINNED_SHA256_0151 = "fa660b6c0487118aed66b5e3a3c8e532e6a592e853013f318e588a2ceeb72cc4";
export const TABLE_0151 = "admin_content_revision_history";
export const INDEX_0151 = "admin_content_revision_entity_idx";
export const TRIGGERS_0151 = Object.freeze([
  "admin_section_revision_update",
  "admin_visual_revision_insert",
  "admin_visual_revision_update",
  "admin_visual_revision_delete",
  "admin_content_revision_no_update",
  "admin_content_revision_no_delete",
]);
export const OBJECTS_0151 = Object.freeze([TABLE_0151, INDEX_0151, ...TRIGGERS_0151]);

function check(value, message) {
  if (!value) throw new Error("0151: " + message);
}
function map(schema) {
  return new Map((schema?.objects ?? []).map(row => [String(row.name), row]));
}
export function assertContentHistory0151Prerequisites(schema) {
  const names = map(schema);
  check(names.get("portal_section_settings")?.type === "table", "missing sections source table");
  check(names.get("section_visuals")?.type === "table", "missing visual source table");
  const sections = new Set((schema?.portalSectionSettingsColumns ?? []).map(row => String(row.name)));
  const visuals = new Set((schema?.sectionVisualColumns ?? []).map(row => String(row.name)));
  for (const name of [
    "slug", "label", "eyebrow", "description", "intro", "hero_config_json",
    "subpages_json", "position", "visible", "updated_at", "updated_by",
  ]) check(sections.has(name), "missing sections source field: " + name);
  for (const name of [
    "visual_key", "section_slug", "subsection_slug", "image_url", "image_key",
    "alt_text", "desktop_x", "desktop_y", "desktop_zoom",
    "mobile_x", "mobile_y", "mobile_zoom", "updated_at", "updated_by",
  ]) check(visuals.has(name), "missing visual source field: " + name);
  return true;
}
export function assertContentHistory0151Schema(schema) {
  assertContentHistory0151Prerequisites(schema);
  const names = map(schema);
  check(names.get(TABLE_0151)?.type === "table", "missing immutable history table");
  check(names.get(INDEX_0151)?.type === "index", "missing history lookup index");
  for (const name of TRIGGERS_0151) check(names.get(name)?.type === "trigger", "missing audit trigger " + name);
  const tableSql = String(names.get(TABLE_0151)?.sql ?? "").replace(/\s+/g, " ");
  for (const fragment of [
    "id INTEGER PRIMARY KEY AUTOINCREMENT",
    "entity_type TEXT NOT NULL",
    "entity_key TEXT NOT NULL",
    "operation TEXT NOT NULL",
    "before_json TEXT", "after_json TEXT",
    "actor TEXT NOT NULL", "occurred_at TEXT NOT NULL",
    "CHECK(entity_type IN ('section','section_visual'))",
    "CHECK(operation IN ('INSERT','UPDATE','DELETE'))",
  ]) check(tableSql.includes(fragment), "history table constraint drift: " + fragment);
  const indexSql = String(names.get(INDEX_0151)?.sql ?? "").replace(/\s+/g, " ");
  check(indexSql.includes("ON admin_content_revision_history(entity_type,entity_key,id DESC)"),
    "history lookup index shape drift");
  const expectedTriggers = [
    ["admin_section_revision_update", "portal_section_settings", "AFTER UPDATE", "OLD.label", "NEW.updated_by"],
    ["admin_visual_revision_insert", "section_visuals", "AFTER INSERT", "NEW.visual_key", "NEW.updated_by"],
    ["admin_visual_revision_update", "section_visuals", "AFTER UPDATE", "OLD.visual_key", "NEW.updated_by"],
    ["admin_visual_revision_delete", "section_visuals", "AFTER DELETE", "OLD.visual_key", "system:visual-reset-or-delete"],
    ["admin_content_revision_no_update", TABLE_0151, "BEFORE UPDATE", "RAISE(ABORT", "append-only"],
    ["admin_content_revision_no_delete", TABLE_0151, "BEFORE DELETE", "RAISE(ABORT", "append-only"],
  ];
  for (const [name, table, event, marker, last] of expectedTriggers) {
    const row = names.get(name);
    const sql = String(row?.sql ?? "").replace(/\s+/g, " ");
    check(String(row?.tbl_name) === table && sql.includes(event) &&
      sql.includes(marker) && sql.includes(last), "trigger definition drift: " + name);
    if (table !== TABLE_0151) check(sql.includes("INSERT INTO admin_content_revision_history"),
      "change trigger must append its audit event: " + name);
  }
  return true;
}
export function assertContentHistory0151NotApplied(targetMigration, targetApplied) {
  if (targetMigration === "0151_admin_content_revision_history.sql") {
    check(!targetApplied, "already applied; refusing to dispatch a repeat migration");
  }
}
