import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".map-data-export");

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function parseWranglerJson(output) {
  const text = output.trim();
  try { return JSON.parse(text); } catch {}
  const firstArray = text.indexOf("[");
  const lastArray = text.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) return JSON.parse(text.slice(firstArray, lastArray + 1));
  throw new Error("D1 command did not return JSON");
}

function rows(payload) {
  return (Array.isArray(payload) ? payload : [payload])
    .flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function assertReadOnlySql(sql) {
  const trimmed = sql.trim();
  invariant(/^(SELECT|WITH|PRAGMA)\b/i.test(trimmed), "Only SELECT/WITH/PRAGMA SQL is allowed");
  invariant(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(trimmed),
    "Mutation/DDL keyword rejected by read-only export");
  const statements = trimmed.split(";").map((part) => part.trim()).filter(Boolean);
  invariant(statements.length === 1, "Multiple SQL statements are not allowed");
}

function runWrangler(args) {
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(bin, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || "D1 read failed").trim());
  return result.stdout || "";
}

function readQuery(db, configPath, sql) {
  assertReadOnlySql(sql);
  return rows(parseWranglerJson(runWrangler([
    "d1", "execute", db, "--remote", "--config", configPath, "--command", sql, "--json",
  ])));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ONLINE_SENTINELS = new Set([
  "online",
  "slovensko",
  "cele slovensko",
  "cela slovenska republika",
  "slovenska republika",
  "sr",
  "nationwide",
]);

const PHYSICAL_CATEGORY_HINTS = new Set([
  "veterinari",
  "salony-a-sluzby",
  "fyzioterapia",
  "hotely-a-opatrovanie",
  "kynologicke-kluby",
]);

function isOnlineSentinel(value) {
  const normalized = normalizeText(value);
  return normalized ? ONLINE_SENTINELS.has(normalized) : false;
}

function hasSpecificCity(value) {
  const normalized = normalizeText(value);
  return Boolean(normalized) && !ONLINE_SENTINELS.has(normalized);
}

export function classifyOnlineDirectory(row) {
  const address = String(row.address ?? "").trim();
  const city = String(row.city ?? "").trim();
  const region = String(row.region ?? "").trim();
  const coverage = String(row.coverage ?? "").trim();
  const locationHint = String(row.location_hint ?? "").trim();
  const category = String(row.category ?? "").trim();

  const evidenceAddress = Boolean(address) && !isOnlineSentinel(address);
  const evidenceSpecificCity = hasSpecificCity(city);
  const onlineSentinel = [address, city, region, coverage, locationHint].some(isOnlineSentinel);
  const physicalCategoryHint = PHYSICAL_CATEGORY_HINTS.has(category);

  if (evidenceAddress || evidenceSpecificCity) {
    return {
      classification: "ONLINE_TRUE_WITH_PHYSICAL_EVIDENCE",
      reason: [
        evidenceAddress ? "street/address present" : "",
        evidenceSpecificCity ? "specific city present" : "",
      ].filter(Boolean).join("; "),
      evidence_address: evidenceAddress ? 1 : 0,
      evidence_specific_city: evidenceSpecificCity ? 1 : 0,
      physical_category_hint: physicalCategoryHint ? 1 : 0,
      online_sentinel: onlineSentinel ? 1 : 0,
    };
  }

  if (onlineSentinel && !physicalCategoryHint) {
    return {
      classification: "LIKELY_ONLINE_ONLY",
      reason: "online/nationwide sentinel with no street address or specific city",
      evidence_address: 0,
      evidence_specific_city: 0,
      physical_category_hint: 0,
      online_sentinel: 1,
    };
  }

  return {
    classification: "AMBIGUOUS",
    reason: physicalCategoryHint
      ? "category usually implies physical service, but no street address or specific city"
      : "insufficient physical-vs-online evidence",
    evidence_address: 0,
    evidence_specific_city: 0,
    physical_category_hint: physicalCategoryHint ? 1 : 0,
    online_sentinel: onlineSentinel ? 1 : 0,
  };
}

export function protectCsvFormula(value) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvEscape(value) {
  const text = protectCsvFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(records, columns) {
  return [
    columns.join(","),
    ...records.map((record) => columns.map((column) => csvEscape(record[column])).join(",")),
  ].join("\n") + "\n";
}

function countBy(records, key) {
  const out = new Map();
  for (const record of records) {
    const value = String(record[key] ?? "");
    out.set(value, (out.get(value) || 0) + 1);
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b, "sk"));
}

function uniqueCount(records, key) {
  return new Set(records.map((row) => row[key]).filter((value) => value !== null && value !== undefined && value !== "")).size;
}

function numberEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  invariant(Number.isSafeInteger(value) && value >= 0, `${name} must be a non-negative integer`);
  return value;
}

async function writeCsv(name, records, columns) {
  await fs.writeFile(path.join(outDir, name), toCsv(records, columns), "utf8");
}

async function main() {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "Protected D1 credential is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account id is required");

  const resources = JSON.parse(await fs.readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"));
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const configPath = path.join(outDir, "wrangler.json");
  await fs.writeFile(configPath, JSON.stringify({
    name: "psipedia-sk",
    compatibility_date: "2026-08-23",
    d1_databases: [{
      binding: resources.d1.binding,
      database_name: resources.d1.database_name,
      database_id: resources.d1.database_id,
    }],
  }, null, 2));

  const db = resources.d1.database_name;

  const directory = readQuery(db, configPath, `
    SELECT
      d.id,
      d.slug,
      d.name,
      d.category,
      COALESCE(
        NULLIF(json_extract(d.source_data_json, '$."Typ služby"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Typ poskytovateľa"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Typ klubu"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Plemeno"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Plemená"'), ''),
        ''
      ) AS subcategory,
      d.status,
      d.archived_at,
      d.published_at,
      d.online,
      d.address,
      d.city,
      d.district,
      d.region,
      COALESCE(
        NULLIF(json_extract(d.source_data_json, '$."PSČ"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."PSC"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."postal_code"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."postalCode"'), ''),
        ''
      ) AS postal_code,
      d.website_url,
      COALESCE(
        NULLIF(json_extract(d.source_data_json, '$."Telefón"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Telefon"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."phone"'), ''),
        ''
      ) AS public_phone,
      COALESCE(
        NULLIF(json_extract(d.source_data_json, '$."Pokrytie"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Oblasť pôsobenia"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Lokalita / pokrytie"'), ''),
        ''
      ) AS coverage,
      COALESCE(
        NULLIF(json_extract(d.source_data_json, '$."Lokalita"'), ''),
        NULLIF(json_extract(d.source_data_json, '$."Miesto"'), ''),
        ''
      ) AS location_hint,
      o.id AS organization_id,
      o.slug AS organization_slug,
      o.name AS organization_name
    FROM directory_profiles d
    LEFT JOIN help_organizations o
      ON o.directory_profile_id = d.id
      AND o.status = 'PUBLISHED'
      AND o.archived_at IS NULL
    WHERE d.status = 'published'
      AND d.archived_at IS NULL
    ORDER BY d.category ASC, d.id ASC
  `).map((row) => ({
    ...row,
    online: Number(row.online || 0),
  }));

  const events = readQuery(db, configPath, `
    SELECT
      e.id,
      e.slug,
      e.title AS name,
      e.start_date,
      e.start_time,
      e.end_date,
      e.end_time,
      e.status,
      e.cancelled,
      CASE
        WHEN LOWER(TRIM(COALESCE(e.region,''))) = 'online'
          OR LOWER(TRIM(COALESCE(e.city,''))) = 'online'
          OR LOWER(TRIM(COALESCE(e.venue,''))) = 'online'
        THEN 1 ELSE 0
      END AS online,
      CASE
        WHEN LOWER(TRIM(COALESCE(e.region,''))) = 'online'
          OR LOWER(TRIM(COALESCE(e.city,''))) = 'online'
          OR LOWER(TRIM(COALESCE(e.venue,''))) = 'online'
        THEN 'ONLINE' ELSE 'PHYSICAL'
      END AS physical_state,
      e.venue,
      e.address,
      e.city,
      '' AS district,
      e.region,
      e.event_type,
      e.organizer,
      e.website_url,
      e.registration_url
    FROM managed_events e
    WHERE e.status = 'published'
      AND e.cancelled = 0
      AND COALESCE(e.end_date, e.start_date) >= DATE('now')
      AND LOWER(TRIM(COALESCE(e.region,''))) <> 'online'
    ORDER BY e.start_date ASC, e.start_time ASC, e.id ASC
  `).map((row) => ({
    ...row,
    cancelled: Number(row.cancelled || 0),
    online: Number(row.online || 0),
  }));

  const organizations = readQuery(db, configPath, `
    SELECT
      o.id AS organization_id,
      o.slug AS organization_slug,
      o.name AS organization_name,
      o.directory_profile_id,
      o.website_url,
      o.status AS organization_status,
      o.published_at AS organization_published_at,
      o.archived_at AS organization_archived_at,
      o.address AS organization_address,
      o.city AS organization_city,
      o.district AS organization_district,
      o.region AS organization_region,
      l.id AS location_id,
      l.role AS location_role,
      l.label AS location_label,
      l.address AS location_address,
      l.city AS location_city,
      l.district AS location_district,
      l.region AS location_region,
      l.country_code,
      l.is_primary,
      l.sort_order,
      g.public_visibility,
      g.public_precision,
      g.geocode_status
    FROM help_organizations o
    LEFT JOIN organization_locations l ON l.organization_id = o.id
    LEFT JOIN geo_points g ON g.organization_location_id = l.id
    WHERE o.status = 'PUBLISHED'
      AND o.archived_at IS NULL
    ORDER BY o.id ASC, l.sort_order ASC, l.id ASC
  `).map((row) => ({
    ...row,
    is_primary: row.is_primary == null ? "" : Number(row.is_primary),
    sort_order: row.sort_order == null ? "" : Number(row.sort_order),
  }));

  const onlineDirectory = directory
    .filter((row) => Number(row.online) === 1)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      address: row.address,
      city: row.city,
      district: row.district,
      region: row.region,
      postal_code: row.postal_code,
      website_url: row.website_url,
      public_phone: row.public_phone,
      coverage: row.coverage,
      location_hint: row.location_hint,
      organization_id: row.organization_id,
      organization_slug: row.organization_slug,
      ...classifyOnlineDirectory(row),
    }));

  const directoryColumns = [
    "id","slug","name","category","subcategory","status","archived_at","published_at","online",
    "address","city","district","region","postal_code","website_url","public_phone","coverage","location_hint",
    "organization_id","organization_slug","organization_name",
  ];
  const eventColumns = [
    "id","slug","name","start_date","start_time","end_date","end_time","status","cancelled","online",
    "physical_state","venue","address","city","district","region","event_type","organizer","website_url","registration_url",
  ];
  const organizationColumns = [
    "organization_id","organization_slug","organization_name","directory_profile_id","website_url",
    "organization_status","organization_published_at","organization_archived_at",
    "organization_address","organization_city","organization_district","organization_region",
    "location_id","location_role","location_label","location_address","location_city","location_district","location_region",
    "country_code","is_primary","sort_order","public_visibility","public_precision","geocode_status",
  ];
  const onlineColumns = [
    "id","slug","name","category","subcategory","address","city","district","region","postal_code","website_url",
    "public_phone","coverage","location_hint","organization_id","organization_slug","classification","reason",
    "evidence_address","evidence_specific_city","physical_category_hint","online_sentinel",
  ];

  await writeCsv("directory_row_level_export.csv", directory, directoryColumns);
  await writeCsv("events_row_level_export.csv", events, eventColumns);
  await writeCsv("organizations_row_level_export.csv", organizations, organizationColumns);
  await writeCsv("directory_online_semantics_audit.csv", onlineDirectory, onlineColumns);

  const directoryExported = directory.length;
  const eventsExported = events.length;
  const organizationsExported = uniqueCount(organizations, "organization_id");
  const organizationLocationsExported = uniqueCount(organizations, "location_id");
  const onlineTotal = onlineDirectory.length;
  const onlinePhysical = onlineDirectory.filter((row) => row.classification === "ONLINE_TRUE_WITH_PHYSICAL_EVIDENCE").length;
  const onlineOnly = onlineDirectory.filter((row) => row.classification === "LIKELY_ONLINE_ONLY").length;
  const onlineAmbiguous = onlineDirectory.filter((row) => row.classification === "AMBIGUOUS").length;

  const expected = {
    directory: numberEnv("EXPECTED_DIRECTORY_COUNT"),
    events: numberEnv("EXPECTED_EVENT_COUNT"),
    organizations: numberEnv("EXPECTED_ORGANIZATION_COUNT"),
    organizationLocations: numberEnv("EXPECTED_ORGANIZATION_LOCATION_COUNT"),
  };
  const actual = {
    directory: directoryExported,
    events: eventsExported,
    organizations: organizationsExported,
    organizationLocations: organizationLocationsExported,
  };
  const blockers = Object.entries(expected)
    .filter(([, value]) => value !== null)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}: expected ${value}, got ${actual[key]}`);

  const categoryBreakdown = countBy(onlineDirectory, "category").map(([category, total]) => {
    const subset = onlineDirectory.filter((row) => row.category === category);
    return {
      category,
      total,
      physical: subset.filter((row) => row.classification === "ONLINE_TRUE_WITH_PHYSICAL_EVIDENCE").length,
      onlineOnly: subset.filter((row) => row.classification === "LIKELY_ONLINE_ONLY").length,
      ambiguous: subset.filter((row) => row.classification === "AMBIGUOUS").length,
    };
  });

  const missing = {
    directory_address_blank: directory.filter((row) => !String(row.address ?? "").trim()).length,
    directory_city_blank: directory.filter((row) => !String(row.city ?? "").trim()).length,
    directory_postal_code_blank: directory.filter((row) => !String(row.postal_code ?? "").trim()).length,
    directory_public_phone_blank: directory.filter((row) => !String(row.public_phone ?? "").trim()).length,
    event_venue_blank: events.filter((row) => !String(row.venue ?? "").trim()).length,
    event_address_blank: events.filter((row) => !String(row.address ?? "").trim()).length,
    event_city_blank: events.filter((row) => !String(row.city ?? "").trim()).length,
    organization_location_address_blank: organizations.filter((row) => row.location_id && !String(row.location_address ?? "").trim()).length,
  };

  const status = blockers.length ? "BLOCKED" : "COMPLETE";
  const categoryTable = [
    "| Category | online=true | physical evidence | likely online-only | ambiguous |",
    "|---|---:|---:|---:|---:|",
    ...categoryBreakdown.map((row) => `| ${row.category} | ${row.total} | ${row.physical} | ${row.onlineOnly} | ${row.ambiguous} |`),
  ].join("\n");

  const report = `# MAP ROW-LEVEL AUDIT EXPORT — ${status}

Generated: ${new Date().toISOString()}

## Safety

- Mode: **STRICT READ-ONLY**
- Production SQL gate accepts only SELECT/WITH/PRAGMA and rejects mutation/DDL keywords.
- No geocoding.
- No backfill/import.
- No writes to directory_profiles, managed_events, help_organizations, organization_locations, geo_points or feature flags.
- directory internal_email and the full source_data_json are intentionally excluded.
- CSV cells beginning with formula-control characters are neutralized.

## Counts

| Dataset | Exported | Expected |
|---|---:|---:|
| directory_profiles | ${directoryExported} | ${expected.directory ?? "not asserted"} |
| current/upcoming physical managed_events | ${eventsExported} | ${expected.events ?? "not asserted"} |
| published help_organizations | ${organizationsExported} | ${expected.organizations ?? "not asserted"} |
| organization_locations | ${organizationLocationsExported} | ${expected.organizationLocations ?? "not asserted"} |

## Directory online semantics

- online=true total: **${onlineTotal}**
- online=true with physical evidence: **${onlinePhysical}**
- likely online-only: **${onlineOnly}**
- ambiguous: **${onlineAmbiguous}**

${categoryTable}

The row-level IDs and reasons are in `directory_online_semantics_audit.csv`.

## Canonical-model notes

- `directory_profiles` has no dedicated `phone`, `postal_code` or `subcategory` column. The export reads only known public aliases from `source_data_json`; it never emits the full JSON.
- `managed_events` has no canonical `district` column and no online boolean. The export leaves district empty and derives online/physical state from the same location sentinel semantics used by the existing production readiness audit.
- `organization_locations` has no independent publication-status column. Organization publication state plus location role/primary/sort order are exported; current geo visibility/status is included when a linked geo_point exists.

## Missing-field inventory

```json
${JSON.stringify(missing, null, 2)}
```

## Files

- directory_row_level_export.csv
- events_row_level_export.csv
- organizations_row_level_export.csv
- directory_online_semantics_audit.csv
- summary.md

${blockers.length ? `## Blockers\n\n${blockers.map((item) => `- ${item}`).join("\n")}\n` : ""}

**MAP ROW-LEVEL AUDIT EXPORT — ${status}${blockers.length ? ` — ${blockers.join("; ")}` : ""}**
`;

  await fs.writeFile(path.join(outDir, "summary.md"), report, "utf8");

  console.log(`[map-data-export] ${status} directory=${directoryExported} events=${eventsExported} organizations=${organizationsExported} locations=${organizationLocationsExported} online=${onlineTotal}`);
  if (blockers.length) {
    throw new Error(`Row-level export count assertions failed: ${blockers.join("; ")}`);
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirectRun) {
  await main();
}
