import { env } from "cloudflare:workers";
import {
  auditExistingDirectoryDuplicates,
  type DirectoryAuditRow,
} from "./directory-duplicate-audit";

// Read-only: no DDL, no writes, no external APIs, no Notion synchronizer.
// The hard ceiling must be surfaced as INCOMPLETE rather than silently
// treating an unseen part of D1 as free of duplicates.
const MAX_ROWS = 5000;
const safeSource = "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END";
const sourceText = (key: string) => `NULLIF(TRIM(CAST(json_extract(${safeSource}, '$."${key}"') AS TEXT)), '')`;

export async function getDirectoryDuplicateAudit() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Databáza D1 nie je pripojená.");
  const rows = await database.prepare(`
    SELECT
      id, name, category, status, city, website_url,
      COALESCE(${sourceText("Telefón")}, ${sourceText("Telefon")}, ${sourceText("phone")}) AS phone,
      COALESCE(${sourceText("E-mail")}, ${sourceText("Email")}, ${sourceText("email")}) AS email,
      ${sourceText("_psipedia_additional_categories")} AS additional_categories_json
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
