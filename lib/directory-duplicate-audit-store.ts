import { env } from "cloudflare:workers";
import {
  auditExistingDirectoryDuplicates,
  type DirectoryAuditRow,
} from "./directory-duplicate-audit";

// Read-only: no DDL, no writes, no external APIs, no Notion synchronizer.
// The hard ceiling must be surfaced as INCOMPLETE rather than silently
// treating an unseen part of D1 as free of duplicates.
const MAX_ROWS = 5000;

export async function getDirectoryDuplicateAudit() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Databáza D1 nie je pripojená.");
  const rows = await database.prepare(`
    SELECT
      id, name, category, status, city, website_url,
      public_phone AS phone, public_email AS email,
      (SELECT json_group_array(secondary.category)
       FROM directory_profile_additional_categories secondary
       WHERE secondary.profile_id=directory_profiles.id) AS additional_categories_json
    FROM directory_profiles
    WHERE status IN ('published', 'draft')
    ORDER BY id ASC
    LIMIT ${MAX_ROWS + 1}
  `).all<DirectoryAuditRow>();
  const incomplete = rows.results.length > MAX_ROWS;
  return auditExistingDirectoryDuplicates(rows.results.slice(0, MAX_ROWS), {
    incomplete, limit: 150,
  });
}
