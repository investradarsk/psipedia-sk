#!/usr/bin/env node
/**
 * Offline-only builder for aggregate public facet coverage SQL.
 * No Cloudflare/D1 connection, data modification, row export or PII.
 * Buckets are mutually exclusive. Five confirmed-value columns show
 * whether public options can actually yield any results.
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
    "WITH definitions(facet, category, storage_key, allowed) AS (VALUES\n    ", definitions,
    "\n), published AS (SELECT category,\n",
    "  CASE WHEN json_valid(source_data_json) THEN\n",
    "    CASE WHEN json_type(source_data_json) = 'object' THEN source_data_json ELSE '{}' END\n",
    "  ELSE '{}' END AS doc,\n",
    "  CASE WHEN json_valid(source_data_json) THEN\n",
    "    CASE WHEN json_type(source_data_json) = 'object' THEN 0 ELSE 1 END\n",
    "  ELSE 1 END AS malformed\n",
    "  FROM directory_profiles WHERE status = 'published'),\n",
    "classified AS (SELECT d.facet, d.category, d.allowed,\n",
    "  p.category IS NOT NULL AS present, COALESCE(p.malformed,0) AS malformed,\n",
    "  json_extract(p.doc, '$.\"' || d.storage_key || '\"') AS value\n",
    "  FROM definitions d LEFT JOIN published p ON p.category = d.category),\n",
    "labelled AS (SELECT c.*, CASE\n",
    "  WHEN NOT present THEN 'absent'\n",
    "  WHEN malformed = 1 THEN 'malformed'\n",
    "  WHEN value IS NULL OR value = '' THEN 'missing'\n",
    "  WHEN value = 'unknown' THEN 'unknown'\n",
    "  WHEN EXISTS (SELECT 1 FROM json_each(allowed) a WHERE a.value = c.value) THEN 'confirmed'\n",
    "  ELSE 'invalid' END AS bucket FROM classified c)\n",
    "SELECT facet, category,\n",
    "  SUM(CASE WHEN present THEN 1 ELSE 0 END) AS published_profiles,\n",
    "  SUM(CASE WHEN bucket = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_values,\n",
    "  SUM(CASE WHEN bucket = 'unknown' THEN 1 ELSE 0 END) AS explicit_unknown,\n",
    "  SUM(CASE WHEN bucket = 'missing' THEN 1 ELSE 0 END) AS missing_values,\n",
    "  SUM(CASE WHEN bucket = 'malformed' THEN 1 ELSE 0 END) AS malformed_json,\n",
    "  SUM(CASE WHEN bucket = 'invalid' THEN 1 ELSE 0 END) AS invalid_values,\n",
    ...["yes","no","ambulance","clinic","hospital"].map(v=>
      "  SUM(CASE WHEN bucket = 'confirmed' AND value = '"+v+"' THEN 1 ELSE 0 END) AS confirmed_"+v+(v==="hospital"?"\n":" ,\n").replace(" ,",",")
    ),
    "FROM labelled GROUP BY facet, category ORDER BY category, facet;",
  ].join("");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("OFFLINE SQL GENERATOR ONLY: no remote D1 query was executed.\n");
  process.stdout.write(buildFacetCoverageSql() + "\n");
}
