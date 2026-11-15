/**
 * Read-only offline preflight for the Directory contact/location cutover.
 * Accepts an authorized, local D1 SELECT JSON export. Never connects to D1
 * or writes records; output contains aggregate counts and IDs, not contacts.
 *
 * Required columns: id, category, source_data_json, website_url, district.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTACT_ALIASES = {
  publicPhone: ["Telefón", "Telefon", "phone"],
  publicEmail: ["E-mail", "Email", "email"],
  websiteUrl: ["Web", "Webstránka"],
  facebookUrl: ["Facebook"],
  instagramUrl: ["Instagram"],
};

const text = value => value === null || value === undefined ? "" : String(value).trim();

function exportRows(value) {
  if (Array.isArray(value) && value.every(item => item && typeof item === "object" && Array.isArray(item.results))) {
    return value.flatMap(item => item.results);
  }
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.results)) return value.results;
  throw new Error("Export must be an array of rows or D1 JSON with results.");
}

function addFinding(result, key, id) {
  result.counts[key] = (result.counts[key] ?? 0) + 1;
  if (!result.sampleIds[key]) result.sampleIds[key] = [];
  if (result.sampleIds[key].length < 25 && Number.isSafeInteger(id) && id > 0) {
    result.sampleIds[key].push(id);
  }
}

/**
 * Compare current columns with existing import aliases without choosing a winner.
 * A conflict always requires an explicit decision; this tool does not mutate
 * fields, promote old imported data, or infer from prose.
 */
export function inspectDirectoryCanonicalStorage(input) {
  const rows = exportRows(input);
  const report = {
    scanned: rows.length,
    counts: {},
    sampleIds: {},
    readOnly: true,
    valuesIncluded: false,
  };

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      addFinding(report, "invalid_row", 0);
      continue;
    }
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      addFinding(report, "invalid_id", 0);
      continue;
    }
    if (typeof row.source_data_json !== "string") {
      addFinding(report, "missing_source_json", id);
      continue;
    }
    let source;
    try {
      source = JSON.parse(row.source_data_json);
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error("Not an object");
      }
    } catch {
      addFinding(report, "invalid_source_json", id);
      continue;
    }

    for (const [field, aliases] of Object.entries(CONTACT_ALIASES)) {
      const values = aliases.map(key => text(source[key])).filter(Boolean);
      if (new Set(values).size > 1) addFinding(report, field + "_alias_conflict", id);
      if (aliases.slice(1).some(key => text(source[key]))) {
        addFinding(report, field + "_uses_legacy_alias", id);
      }
      if (field === "websiteUrl") {
        const column = text(row.website_url);
        if (!column && values.length) addFinding(report, "website_only_in_source_json", id);
        if (column && values.some(value => value !== column)) {
          addFinding(report, "website_column_source_conflict", id);
        }
      }
    }

    const districtColumn = text(row.district);
    const districtLegacy = text(source.Okres);
    if (!districtColumn && districtLegacy) addFinding(report, "district_only_in_source_json", id);
    if (districtColumn && districtLegacy && districtColumn !== districtLegacy) {
      addFinding(report, "district_column_source_conflict", id);
    }
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Usage: node scripts/directory-canonical-storage-preflight.mjs <local-D1-export.json>\n");
    process.exitCode = 2;
  } else {
    try {
      const report = inspectDirectoryCanonicalStorage(JSON.parse(readFileSync(resolve(file), "utf8")));
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } catch (error) {
      process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
      process.exitCode = 1;
    }
  }
}
