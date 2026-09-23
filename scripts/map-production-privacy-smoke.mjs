import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".map-production-readiness");

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function parse(output) {
  const text = output.trim();
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("D1 command did not return JSON");
}

function rows(payload) {
  return (Array.isArray(payload) ? payload : [payload])
    .flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function run(args) {
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
  invariant(/^\s*(SELECT|PRAGMA)\b/i.test(sql), "Only read-only SQL is allowed");
  return rows(parse(run(["d1", "execute", db, "--remote", "--config", configPath, "--command", sql, "--json"])));
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("sk-SK").replace(/\s+/g, " ");
}

function sourceAddress(row) {
  if (row.target_type === "DIRECTORY_PROFILE") return row.directory_address || "";
  if (row.target_type === "ORGANIZATION_LOCATION") return row.organization_address || "";
  return row.event_address || "";
}

function sourceLocalityParts(row) {
  if (row.target_type === "DIRECTORY_PROFILE") return [row.directory_city, row.directory_district, row.directory_region];
  if (row.target_type === "ORGANIZATION_LOCATION") return [row.organization_city, row.organization_district, row.organization_region];
  return [row.event_city, "", row.event_region];
}

function itemId(row) {
  if (row.target_type === "DIRECTORY_PROFILE" && row.directory_profile_id != null) {
    return "service:" + row.directory_profile_id;
  }
  if (row.target_type === "ORGANIZATION_LOCATION" && row.organization_id != null && row.organization_location_id != null) {
    return "organization:" + row.organization_id + ":location:" + row.organization_location_id;
  }
  if (row.target_type === "MANAGED_EVENT" && row.managed_event_id != null) {
    return "event:" + row.managed_event_id;
  }
  return null;
}

function coordinatesValid(row) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function geoPublic(row) {
  return (row.public_visibility === "EXACT_PUBLIC" || row.public_visibility === "APPROXIMATE_PUBLIC")
    && row.geocode_status === "RESOLVED"
    && coordinatesValid(row)
    && Boolean(row.resolved_source_fingerprint)
    && row.source_fingerprint === row.resolved_source_fingerprint;
}

function canonicalPublic(row, today) {
  if (row.target_type === "DIRECTORY_PROFILE") {
    return row.directory_status === "published" && row.directory_archived_at == null && Number(row.directory_online || 0) === 0;
  }
  if (row.target_type === "ORGANIZATION_LOCATION") {
    return row.organization_status === "PUBLISHED" && row.organization_archived_at == null;
  }
  if (row.target_type === "MANAGED_EVENT") {
    const lastDate = row.event_end_date || row.event_start_date || "";
    return row.event_status === "published"
      && Number(row.event_cancelled || 0) === 0
      && normalize(row.event_region) !== "online"
      && Boolean(row.event_start_date)
      && lastDate >= today;
  }
  return false;
}

function collectKeys(value, found = new Set()) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const child of value) collectKeys(child, found);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    found.add(key);
    collectKeys(child, found);
  }
  return found;
}

function bratislavaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return map.year + "-" + map.month + "-" + map.day;
}

async function fetchCategory(category) {
  const params = new URLSearchParams({
    north: "50",
    south: "47",
    east: "23",
    west: "16",
    zoom: "12",
    limit: "500",
    category,
  });
  const response = await fetch("https://psipedia.sk/api/map?" + params.toString(), {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  invariant(response.status === 200, "Production /api/map privacy smoke requires HTTP 200");
  const body = await response.json();
  invariant(body?.mode === "items" && Array.isArray(body.items), "Privacy smoke requires item-mode map response");
  invariant(body?.meta?.truncated === false, "Privacy smoke refuses truncated production API coverage");
  return body;
}

async function main() {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "Protected D1 credential is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account id is required");

  const resources = JSON.parse(await fs.readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"));
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");
  await fs.mkdir(outDir, { recursive: true });

  const configPath = path.join(outDir, "privacy-wrangler.json");
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
  const geoSchema = readQuery(db, configPath,
    "SELECT COUNT(*) count FROM sqlite_schema WHERE type='table' AND name='geo_points'");
  if (Number(geoSchema[0]?.count || 0) !== 1) {
    const report = {
      auditMode: "READ_ONLY",
      generatedAt: new Date().toISOString(),
      productionTarget: { databaseName: db, databaseId: resources.d1.database_id },
      status: "SKIPPED_GEO_SCHEMA_UNAVAILABLE",
      skipped: true,
      passed: false,
    };
    await fs.writeFile(path.join(outDir, "privacy-smoke.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("[map-privacy] SKIPPED — geo_points is unavailable; pre-0064 readiness evidence retained");
    return;
  }

  const geoRows = readQuery(db, configPath, `
    SELECT
      g.target_type, g.directory_profile_id, g.organization_location_id, g.managed_event_id,
      g.public_visibility, g.public_precision, g.geocode_status,
      g.latitude, g.longitude, g.source_fingerprint, g.resolved_source_fingerprint,
      g.manual_override, g.last_error_code,
      d.status AS directory_status, d.archived_at AS directory_archived_at, d.online AS directory_online,
      d.category AS directory_category, d.address AS directory_address, d.city AS directory_city,
      d.district AS directory_district, d.region AS directory_region,
      l.organization_id, l.role AS organization_location_role, l.address AS organization_address,
      l.city AS organization_city, l.district AS organization_district, l.region AS organization_region,
      o.status AS organization_status, o.archived_at AS organization_archived_at,
      e.status AS event_status, e.cancelled AS event_cancelled, e.start_date AS event_start_date,
      e.end_date AS event_end_date, e.address AS event_address, e.city AS event_city, e.region AS event_region
    FROM geo_points g
    LEFT JOIN directory_profiles d ON d.id=g.directory_profile_id
    LEFT JOIN organization_locations l ON l.id=g.organization_location_id
    LEFT JOIN help_organizations o ON o.id=l.organization_id
    LEFT JOIN managed_events e ON e.id=g.managed_event_id
    ORDER BY g.id
  `);

  const today = bratislavaDateKey();
  const allowed = new Set();
  const unsafe = new Set();
  const approximateSources = new Map();
  let invalidApproxPrecision = 0;
  let sensitiveExactWithoutManual = 0;
  let organizationExactWithoutManualReview = 0;

  const sensitiveCategories = new Set(["chovatelske-stanice", "chovatelske-kluby", "treneri", "vencenie", "kynologicke-kluby"]);

  for (const row of geoRows) {
    const id = itemId(row);
    if (!id) continue;
    const safe = geoPublic(row) && canonicalPublic(row, today);
    if (safe) allowed.add(id); else unsafe.add(id);

    if (row.public_visibility === "APPROXIMATE_PUBLIC" && row.public_precision === "EXACT") {
      invalidApproxPrecision += 1;
    }
    if (row.target_type === "DIRECTORY_PROFILE"
      && row.public_visibility === "EXACT_PUBLIC"
      && sensitiveCategories.has(row.directory_category)
      && Number(row.manual_override || 0) !== 1) {
      sensitiveExactWithoutManual += 1;
    }
    if (row.target_type === "ORGANIZATION_LOCATION"
      && row.public_visibility === "EXACT_PUBLIC"
      && (row.organization_location_role === "LEGAL_SEAT" || row.organization_location_role === "UNSPECIFIED" || !row.organization_location_role)
      && Number(row.manual_override || 0) !== 1) {
      organizationExactWithoutManualReview += 1;
    }

    if (safe && row.public_visibility === "APPROXIMATE_PUBLIC") {
      const address = normalize(sourceAddress(row));
      const localities = sourceLocalityParts(row).map(normalize).filter(Boolean);
      if (address && !localities.includes(address)) approximateSources.set(id, address);
    }
  }

  const payloads = await Promise.all(["services", "organizations", "events"].map(fetchCategory));
  const items = payloads.flatMap((payload) => payload.items);
  const forbiddenFields = new Set([
    "address", "sourceFingerprint", "resolvedSourceFingerprint", "normalizedQuery",
    "queryFingerprint", "lastErrorCode", "manualUpdatedBy", "manualOverride", "provider",
  ]);
  let unexpectedApiItems = 0;
  let unsafeApiItems = 0;
  let approximateStreetLeaks = 0;
  let forbiddenPayloadFieldCount = 0;

  for (const payload of payloads) {
    const keys = collectKeys(payload);
    for (const key of forbiddenFields) if (keys.has(key)) forbiddenPayloadFieldCount += 1;
  }

  for (const item of items) {
    if (!allowed.has(item.id)) unexpectedApiItems += 1;
    if (unsafe.has(item.id)) unsafeApiItems += 1;
    const privateAddress = approximateSources.get(item.id);
    if (privateAddress) {
      const display = normalize(item.displayLocation);
      if (display && display.includes(privateAddress)) approximateStreetLeaks += 1;
    }
  }

  const failures = {
    invalidApproxPrecision,
    sensitiveExactWithoutManual,
    organizationExactWithoutManualReview,
    unexpectedApiItems,
    unsafeApiItems,
    approximateStreetLeaks,
    forbiddenPayloadFieldCount,
  };
  const passed = Object.values(failures).every((value) => value === 0);
  const report = {
    auditMode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    productionTarget: { databaseName: db, databaseId: resources.d1.database_id },
    geoRows: geoRows.length,
    allowedPublicRows: allowed.size,
    unsafeRows: unsafe.size,
    apiItemsChecked: items.length,
    approximateSourcesChecked: approximateSources.size,
    categories: Object.fromEntries(["services", "organizations", "events"].map((category, index) => [
      category,
      payloads[index].items.length,
    ])),
    status: passed ? "PASS" : "FAIL",
    skipped: false,
    failures,
    passed,
  };
  await fs.writeFile(path.join(outDir, "privacy-smoke.json"), JSON.stringify(report, null, 2) + "\n");
  invariant(passed, "Production map privacy smoke failed");
  console.log("[map-privacy] READ_ONLY PASS — apiItems=" + items.length + "; geoRows=" + geoRows.length);
}

await main();
