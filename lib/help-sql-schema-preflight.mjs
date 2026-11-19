/**
 * Read-only, fail-closed D1 schema preflight for Help. All table identifiers
 * below are developer-owned constants, never request/Notion input.
 *
 * This is a minimum runtime contract, not permission to backfill, cut over or
 * drop legacy columns. A green schema result is NOT proof of data parity.
 */
export const HELP_SQL_REQUIRED_COLUMNS = Object.freeze({
  help_cases: Object.freeze([
    "id", "slug", "title", "category", "status", "excerpt", "description",
    "organization", "city", "region", "image_url", "image_key",
    "thumbnail_display_json", "detail_display_json", "seo_json",
    "updated_at", "published_at",
  ]),
  help_organizations: Object.freeze([
    "id", "name", "slug", "status", "short_description", "description",
    "public_email", "public_phone", "website_url", "facebook_url",
    "instagram_url", "source_data_json", "seo_json", "image_url",
    "thumbnail_display_json", "detail_display_json", "directory_profile_id",
    "updated_at", "published_at",
  ]),
  adoption_dogs: Object.freeze([
    "id", "name", "slug", "status", "sex", "city", "region",
    "organization_id", "organization_name", "main_image", "gallery_json",
    "thumbnail_display_json", "detail_display_json", "short_description",
    "description", "updated_at", "published_at",
  ]),
  lost_found_dog_reports: Object.freeze([
    "id", "type", "slug", "status", "dog_name", "city", "region",
    "description", "main_image", "gallery_json", "thumbnail_display_json",
    "detail_display_json", "public_contact_note", "updated_at", "published_at",
  ]),
  lost_found_dog_private_details: Object.freeze([
    "report_id", "contact_name_encrypted", "contact_phone_encrypted",
    "contact_email_encrypted", "private_note_encrypted",
  ]),
  organization_locations: Object.freeze([
    "id", "organization_id", "role", "is_primary", "city", "region",
  ]),
  notion_agenda_sync: Object.freeze([
    "agenda", "entity_id", "notion_page_id",
  ]),
});

/**
 * Works with D1Database and tiny SQLite fixtures via { prepare().all() }.
 * Only queries SQLite's table-valued PRAGMA. No D1 mutation or Notion call.
 *
 * @param {{prepare: (sql: string) => {all: () => Promise<{results: Array<{name: string}>}>}}} database
 * @returns {Promise<{ready: boolean, status: string, tables: Array<{table: string, exists: boolean, missingColumns: string[], requiredCount: number}>}>}
 */
export async function inspectHelpSqlSchema(database) {
  if (!database || typeof database.prepare !== "function") {
    throw new Error("HELP_SQL_SCHEMA_DATABASE_UNAVAILABLE");
  }
  const tables = [];
  for (const [table, required] of Object.entries(HELP_SQL_REQUIRED_COLUMNS)) {
    // No dynamic identifiers outside this fixed manifest.
    const statement = database.prepare("SELECT name FROM pragma_table_info('" + table + "')");
    const data = await statement.all();
    if (!Array.isArray(data?.results) || data.results.some((row) => typeof row?.name !== "string")) {
      throw new Error("HELP_SQL_SCHEMA_UNREADABLE:" + table);
    }
    const found = new Set(data.results.map((row) => row.name));
    tables.push({
      table,
      exists: found.size > 0,
      missingColumns: required.filter((column) => !found.has(column)),
      requiredCount: required.length,
    });
  }
  const ready = tables.every((table) => table.exists && table.missingColumns.length === 0);
  return { ready, status: ready ? "ready" : "blocked", tables };
}
