#!/usr/bin/env node
/**
 * Offline/read-only audit of an authorized D1 JSON export. NEVER queries live D1 or Notion.
 * Run: node --experimental-strip-types scripts/directory-filter-dry-run.mjs path/to/export.json
 * The file must contain an array or { results: [...] } with category/source_data_json/services_json.
 * Prints aggregates only; no individual profile IDs or PII.
 */
import { readFileSync } from "node:fs";
import { auditDirectoryFilterRows } from "../lib/directory-filter-contract.ts";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node --experimental-strip-types scripts/directory-filter-dry-run.mjs <authorized-d1-json-export>");
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(input) ? input : input?.results;
    if (!Array.isArray(rows) || rows.some((row) =>
      !row || typeof row.category !== "string" || typeof row.source_data_json !== "string"
      || (row.services_json !== undefined && typeof row.services_json !== "string")
    )) throw new Error("Expected array of directory rows with category and source_data_json strings.");
    console.log(JSON.stringify(auditDirectoryFilterRows(rows), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
