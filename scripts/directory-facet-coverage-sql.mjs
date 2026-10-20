#!/usr/bin/env node
/**
 * Offline-only builder for aggregate public facet coverage SQL.
 * No Cloudflare/D1 connection, data modification, row export or PII.
 */
import { pathToFileURL } from "node:url";
import { directoryFilterRegistry } from "../lib/directory-filter-contract.ts";
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
export function buildFacetCoverageSql() {
  const definitions = directoryFilterRegistry.map((d) => "(" + [
    d.id, d.category, d.d1.key,
    JSON.stringify(d.allowedValues.filter((v) => v !== "unknown")),
  ].map(quote).join(", ") + ")").join(",\n    ");
  return [
    "WITH definitions(facet, category, storage_key, allowed) AS (VALUES\n    ",definitions,
    "\n), published AS (SELECT category,\n",
    "  CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END AS doc,\n",
    "  CASE WHEN json_valid(source_data_json) THEN 0 ELSE 1 END AS malformed\n",
    "  FROM directory_profiles WHERE status = 'published'),\n",
    "classified AS (SELECT d.facet, d.category, d.allowed,\n",
    "  p.category IS NOT NULL AS present, p.malformed,\n",
    "  json_extract(p.doc, '$.\"' || d.storage_key || '\"') AS value\n",
    "  FROM definitions d LEFT JOIN published p ON p.category = d.category)\n",
    "SELECT facet, category,\n",
    "  SUM(CASE WHEN present THEN 1 ELSE 0 END) AS published_profiles,\n",
    "  SUM(CASE WHEN present AND EXISTS (SELECT 1 FROM json_each(allowed) a WHERE a.value=value) THEN 1 ELSE 0 END) AS confirmed_values,\n",
    "  SUM(CASE WHEN present AND value='unknown' THEN 1 ELSE 0 END) AS explicit_unknown,\n",
    "  SUM(CASE WHEN present AND (value IS NULL OR value='') THEN 1 ELSE 0 END) AS missing_values,\n",
    "  SUM(CASE WHEN present AND malformed=1 THEN 1 ELSE 0 END) AS malformed_json,\n",
    "  SUM(CASE WHEN present AND value IS NOT NULL AND value <> 'unknown'\n",
    "    AND NOT EXISTS (SELECT 1 FROM json_each(allowed) a WHERE a.value=value) THEN 1 ELSE 0 END) AS invalid_values\n",
    "FROM classified GROUP BY facet, category ORDER BY category, facet;",
  ].join("");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("OFFLINE SQL GENERATOR ONLY: no remote D1 query was executed.\n");
  process.stdout.write(buildFacetCoverageSql() + "\n");
}
