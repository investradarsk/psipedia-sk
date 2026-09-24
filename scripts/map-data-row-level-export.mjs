import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".map-data-export");
const ONLINE_MARKERS = new Set(["online", "on-line", "internet", "virtual", "virtuálne", "virtualne"]);

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function lower(value) {
  return text(value).toLocaleLowerCase("sk-SK");
}

function bool(value) {
  return Number(value) === 1 || value === true;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isOnlineMarker(value) {
  return ONLINE_MARKERS.has(lower(value));
}

function hasPhysicalText(value) {
  const v = text(value);
  return Boolean(v) && !isOnlineMarker(v);
}

function parseWranglerJson(output) {
  const raw = text(output);
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("D1 command did not return JSON");
}

function rows(payload) {
  return (Array.isArray(payload) ? payload : [payload])
    .flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function runWrangler(args) {
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(bin, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(text(result.stderr) || "D1 read failed");
  return result.stdout || "";
}

function assertReadOnlySql(sql) {
  const normalized = text(sql).replace(/^--.*$/gm, "").trim();
  invariant(/^(SELECT|PRAGMA)\b/i.test(normalized), "Only SELECT/PRAGMA SQL is allowed");
  invariant(!/\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(normalized), "Mutating SQL is forbidden");
  invariant(!/;\s*\S/.test(normalized), "Multiple SQL statements are forbidden");
}

function readQuery(db, configPath, sql) {
  assertReadOnlySql(sql);
  return rows(parseWranglerJson(runWrangler([
    "d1", "execute", db, "--remote", "--config", configPath, "--command", sql, "--json",
  ])));
}

function one(db, configPath, sql) {
  return readQuery(db, configPath, sql)[0] ?? {};
}

function csvCell(value) {
  const raw = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function toCsv(records, columns) {
  return [columns.join(","), ...records.map((record) => columns.map((column) => csvCell(record[column])).join(","))].join("\n") + "\n";
}

function addressCompleteness({ address, city, region, online = false }) {
  const a = text(address);
  const c = text(city);
  const r = text(region);
  const onlineTokens = [a, c, r].filter(isOnlineMarker).length;
  const physicalTokens = [a, c, r].filter(hasPhysicalText).length;
  if (onlineTokens > 0 && physicalTokens > 0) return "CONFLICTING_FIELDS";
  if (online && onlineTokens > 0 && physicalTokens === 0) return "NO_ADDRESS";
  if (a && c) return "HAS_EXACT_ADDRESS";
  if (!a && c) return "CITY_ONLY";
  if (a && !c) return "PARTIAL_ADDRESS";
  return "NO_ADDRESS";
}

function missingAddressFields({ address, city }) {
  const missing = [];
  if (!text(address)) missing.push("address");
  if (!text(city)) missing.push("city");
  return missing.join("|");
}

function onlineSemantics(row) {
  const address = text(row.address);
  const city = text(row.city);
  const district = text(row.district);
  const region = text(row.region);
  const evidence = [];
  if (hasPhysicalText(address)) evidence.push("address");
  if (hasPhysicalText(city)) evidence.push("city");
  if (hasPhysicalText(district)) evidence.push("district");
  if (hasPhysicalText(region)) evidence.push("region");
  const allLocation = [address, city, district, region];
  const onlineMarkers = allLocation.filter(isOnlineMarker).length;

  let bucket = "INSUFFICIENT_DATA";
  let reason = "No canonical physical-location evidence.";
  if (address && !isOnlineMarker(address) && city && !isOnlineMarker(city)) {
    bucket = "PHYSICAL_AND_ONLINE_LIKELY";
    reason = "online=true coexists with canonical address and city.";
  } else if (onlineMarkers > 0 && evidence.length === 0) {
    bucket = "ONLINE_ONLY_LIKELY";
    reason = "Canonical location fields contain only online markers and no physical evidence.";
  } else if (evidence.length > 0) {
    bucket = "AMBIGUOUS";
    reason = "Canonical location evidence exists but does not establish a public physical premise.";
  }
  return { bucket, reason, evidence: evidence.join("|") };
}

function directoryPrivacyFlag(row, semantics) {
  const completeness = addressCompleteness({ ...row, online: bool(row.online) });
  if (semantics.bucket === "ONLINE_ONLY_LIKELY") return "LIKELY_SERVICE_AREA";
  if (completeness === "HAS_EXACT_ADDRESS") return "EXACT_PUBLIC_REVIEW_REQUIRED";
  return "UNCLEAR";
}

function locationPrivacyFlag(row) {
  if (row.role === "LEGAL_SEAT") return "LEGAL_SEAT_ONLY";
  if (row.role === "SERVICE_AREA") return "LIKELY_SERVICE_AREA";
  if (row.role === "SITE") return "LIKELY_PUBLIC_PREMISE";
  if (addressCompleteness(row) === "HAS_EXACT_ADDRESS") return "EXACT_PUBLIC_REVIEW_REQUIRED";
  return "UNCLEAR";
}

function eventPrivacyFlag(row) {
  return addressCompleteness(row) === "HAS_EXACT_ADDRESS" ? "LIKELY_PUBLIC_PREMISE" : "UNCLEAR";
}

function normalizeKey(value) {
  return lower(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function markPotentialDuplicates(records, keyFn) {
  const counts = new Map();
  for (const row of records) {
    const key = keyFn(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return records.map((row) => {
    const key = keyFn(row);
    return { ...row, potential_duplicate_review: key && (counts.get(key) ?? 0) > 1 ? 1 : 0 };
  });
}

function countWhere(records, predicate) {
  return records.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

function mdTable(object) {
  return Object.entries(object).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
}

export {
  addressCompleteness,
  assertReadOnlySql,
  csvCell,
  locationPrivacyFlag,
  markPotentialDuplicates,
  onlineSemantics,
  toCsv,
};

async function main() {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "Protected D1 credential is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account id is required");

  const resources = JSON.parse(await fs.readFile(path.join(root, "config/cloudflare-resources.json"), "utf8"));
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const configPath = path.join(outDir, "wrangler.json");
  await fs.writeFile(configPath, JSON.stringify({
    name: "psipedia-sk-map-data-export",
    compatibility_date: "2026-08-23",
    d1_databases: [{
      binding: resources.d1.binding,
      database_name: resources.d1.database_name,
      database_id: resources.d1.database_id,
    }],
  }, null, 2));

  const db = resources.d1.database_name;
  const generatedAt = new Date().toISOString();

  const schema = {};
  for (const table of ["directory_profiles", "managed_events", "help_organizations", "organization_locations", "geo_points"]) {
    schema[table] = readQuery(db, configPath, `PRAGMA table_info(${table})`).map((row) => String(row.name));
  }

  const directoryExpected = number(one(db, configPath, "SELECT COUNT(*) count FROM directory_profiles WHERE status='published' AND archived_at IS NULL").count);
  const eventsExpected = number(one(db, configPath, `
    SELECT COUNT(*) count FROM managed_events
    WHERE status='published' AND cancelled=0
      AND COALESCE(end_date,start_date) >= DATE('now')
      AND LOWER(TRIM(COALESCE(region,''))) <> 'online'
  `).count);
  const organizationsExpected = number(one(db, configPath, "SELECT COUNT(*) count FROM help_organizations WHERE status='PUBLISHED' AND archived_at IS NULL").count);
  const locationsExpected = number(one(db, configPath, "SELECT COUNT(*) count FROM organization_locations").count);

  const directoryRaw = readQuery(db, configPath, `
    SELECT d.id,d.slug,d.name,d.category,d.status,d.published_at,d.archived_at,d.online,
      d.address,d.city,d.district,d.region,d.website_url,d.verified,d.featured,
      o.id organization_id,o.slug organization_slug,o.name organization_name,
      g.id geo_point_id,g.geocode_status,g.public_visibility,g.public_precision,
      CASE WHEN g.geocode_status='RESOLVED'
        AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
        AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
        AND g.resolved_source_fingerprint IS NOT NULL
        AND g.source_fingerprint=g.resolved_source_fingerprint THEN 1 ELSE 0 END resolved_public_geo
    FROM directory_profiles d
    LEFT JOIN help_organizations o ON o.directory_profile_id=d.id AND o.status='PUBLISHED' AND o.archived_at IS NULL
    LEFT JOIN geo_points g ON g.directory_profile_id=d.id AND g.target_type='DIRECTORY_PROFILE'
    WHERE d.status='published' AND d.archived_at IS NULL
    ORDER BY d.id
  `);

  let directory = directoryRaw.map((row) => {
    const semantics = bool(row.online) ? onlineSemantics(row) : { bucket: "NOT_APPLICABLE", reason: "online=false", evidence: "" };
    const completeness = addressCompleteness({ ...row, online: bool(row.online) });
    return {
      id: number(row.id), slug: text(row.slug), name: text(row.name), category: text(row.category), subcategory: "",
      published_state: text(row.status), archived_state: row.archived_at ? "ARCHIVED" : "ACTIVE",
      online: bool(row.online) ? 1 : 0,
      street: "", house_number: "", postal_code: "", city: text(row.city), district: text(row.district), region: text(row.region), country: "",
      address: text(row.address), formatted_address: "", website: text(row.website_url), phone: "",
      organization_id: row.organization_id == null ? "" : number(row.organization_id), organization_slug: text(row.organization_slug), organization_name: text(row.organization_name),
      geo_point_id: row.geo_point_id == null ? "" : number(row.geo_point_id), geocode_status: text(row.geocode_status), public_visibility: text(row.public_visibility), public_precision: text(row.public_precision), resolved_public_geo: bool(row.resolved_public_geo) ? 1 : 0,
      physical_evidence: semantics.evidence,
      online_semantic_bucket: semantics.bucket,
      online_semantic_reason: semantics.reason,
      address_completeness: completeness,
      missing_fields: missingAddressFields(row),
      needs_external_research: completeness === "HAS_EXACT_ADDRESS" ? 0 : 1,
      privacy_audit_flag: directoryPrivacyFlag(row, semantics),
      verified: bool(row.verified) ? 1 : 0, featured: bool(row.featured) ? 1 : 0,
      potential_duplicate_review: 0,
    };
  });
  directory = markPotentialDuplicates(directory, (row) => {
    const name = normalizeKey(row.name), address = normalizeKey(row.address), city = normalizeKey(row.city);
    return name && (address || city) ? `${name}|${address}|${city}` : "";
  });

  const eventsRaw = readQuery(db, configPath, `
    SELECT e.id,e.slug,e.title,e.status,e.cancelled,e.start_date,e.start_time,e.end_date,e.end_time,
      e.event_type,e.venue,e.address,e.city,e.region,e.organizer,e.website_url,e.registration_url,
      g.id geo_point_id,g.geocode_status,g.public_visibility,g.public_precision,
      CASE WHEN g.geocode_status='RESOLVED'
        AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
        AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
        AND g.resolved_source_fingerprint IS NOT NULL
        AND g.source_fingerprint=g.resolved_source_fingerprint THEN 1 ELSE 0 END resolved_public_geo
    FROM managed_events e
    LEFT JOIN geo_points g ON g.managed_event_id=e.id AND g.target_type='MANAGED_EVENT'
    WHERE e.status='published' AND e.cancelled=0
      AND COALESCE(e.end_date,e.start_date) >= DATE('now')
      AND LOWER(TRIM(COALESCE(e.region,''))) <> 'online'
    ORDER BY e.start_date,e.start_time,e.id
  `);
  const events = eventsRaw.map((row) => {
    const completeness = addressCompleteness(row);
    const onlineSignals = [row.region, row.city, row.venue].filter(isOnlineMarker).length;
    return {
      id: number(row.id), slug: text(row.slug), name: text(row.title), published_status: text(row.status), cancelled_status: bool(row.cancelled) ? 1 : 0,
      physical_status: onlineSignals === 0 ? "PHYSICAL" : "CONFLICTING_ONLINE_SIGNAL",
      start_date: text(row.start_date), start_time: text(row.start_time), end_date: text(row.end_date), end_time: text(row.end_time), event_type: text(row.event_type), venue_name: text(row.venue),
      street: "", house_number: "", postal_code: "", city: text(row.city), district: "", region: text(row.region), country: "", address: text(row.address), formatted_address: "",
      organizer_name: text(row.organizer), organizer_source_url: "", website_url: text(row.website_url), registration_url: text(row.registration_url),
      geo_point_id: row.geo_point_id == null ? "" : number(row.geo_point_id), geocode_status: text(row.geocode_status), public_visibility: text(row.public_visibility), public_precision: text(row.public_precision), resolved_public_geo: bool(row.resolved_public_geo) ? 1 : 0,
      address_completeness: completeness, missing_fields: missingAddressFields(row), needs_external_research: completeness === "HAS_EXACT_ADDRESS" ? 0 : 1,
      privacy_audit_flag: eventPrivacyFlag(row),
      repeated_venue_review: 0,
    };
  });
  const eventVenueCounts = new Map();
  for (const row of events) {
    const key = [row.venue_name,row.address,row.city].map(normalizeKey).join("|");
    if (key.replaceAll("|", "")) eventVenueCounts.set(key,(eventVenueCounts.get(key)??0)+1);
  }
  for (const row of events) {
    const key = [row.venue_name,row.address,row.city].map(normalizeKey).join("|");
    row.repeated_venue_review = key.replaceAll("|", "") && (eventVenueCounts.get(key)??0)>1 ? 1 : 0;
  }

  const organizationsRaw = readQuery(db, configPath, `
    SELECT o.id,o.slug,o.name,o.type,o.status,o.archived_at,o.website_url,o.source_url,o.directory_profile_id,
      o.address,o.city,o.district,o.region,o.country_code,
      (SELECT COUNT(*) FROM organization_locations l WHERE l.organization_id=o.id) location_count
    FROM help_organizations o
    WHERE o.status='PUBLISHED' AND o.archived_at IS NULL
    ORDER BY o.id
  `);
  const organizations = organizationsRaw.map((row) => ({
    organization_id: number(row.id), slug: text(row.slug), name: text(row.name), type: text(row.type), publication_state: text(row.status), archive_state: row.archived_at ? "ARCHIVED" : "ACTIVE",
    website: text(row.website_url), source_url: text(row.source_url), directory_profile_id: row.directory_profile_id == null ? "" : number(row.directory_profile_id),
    canonical_address: text(row.address), city: text(row.city), district: text(row.district), region: text(row.region), country_code: text(row.country_code),
    location_count: number(row.location_count), multi_location: number(row.location_count)>1 ? 1 : 0,
    address_completeness: addressCompleteness(row), missing_fields: missingAddressFields(row), needs_external_research: addressCompleteness(row)==="HAS_EXACT_ADDRESS"?0:1,
  }));

  const locationsRaw = readQuery(db, configPath, `
    SELECT l.id,l.organization_id,o.name organization_name,o.slug organization_slug,o.status organization_status,
      l.role,l.label,l.address,l.city,l.district,l.region,l.country_code,l.is_primary,l.sort_order,o.source_url,
      g.id geo_point_id,g.geocode_status,g.public_visibility,g.public_precision,
      CASE WHEN g.geocode_status='RESOLVED'
        AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
        AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
        AND g.resolved_source_fingerprint IS NOT NULL
        AND g.source_fingerprint=g.resolved_source_fingerprint THEN 1 ELSE 0 END resolved_public_geo
    FROM organization_locations l
    JOIN help_organizations o ON o.id=l.organization_id
    LEFT JOIN geo_points g ON g.organization_location_id=l.id AND g.target_type='ORGANIZATION_LOCATION'
    ORDER BY l.organization_id,l.sort_order,l.id
  `);
  const locations = locationsRaw.map((row) => {
    const completeness = addressCompleteness(row);
    return {
      location_id: number(row.id), organization_id: number(row.organization_id), organization_name: text(row.organization_name), organization_slug: text(row.organization_slug), organization_status: text(row.organization_status),
      role: text(row.role), label: text(row.label), street: "", house_number: "", postal_code: "", city: text(row.city), district: text(row.district), region: text(row.region), country: text(row.country_code), address: text(row.address), formatted_address: "",
      is_primary: bool(row.is_primary)?1:0, sort_order: number(row.sort_order), public_private_visibility: "", source_url: text(row.source_url),
      geo_point_id: row.geo_point_id == null ? "" : number(row.geo_point_id), geocode_status: text(row.geocode_status), public_visibility: text(row.public_visibility), public_precision: text(row.public_precision), resolved_public_geo: bool(row.resolved_public_geo)?1:0,
      address_completeness: completeness, missing_fields: missingAddressFields(row), needs_external_research: completeness === "HAS_EXACT_ADDRESS" ? 0 : 1,
      privacy_audit_flag: locationPrivacyFlag(row),
    };
  });

  const onlineAudit = directory.filter((row) => row.online === 1).map((row) => ({
    id: row.id,name: row.name,slug: row.slug,category: row.category,address: row.address,street: row.street,house_number: row.house_number,postal_code: row.postal_code,city: row.city,district: row.district,region: row.region,website: row.website,online: row.online,
    physical_evidence: row.physical_evidence,proposed_semantic_bucket: row.online_semantic_bucket,reason: row.online_semantic_reason,address_completeness: row.address_completeness,resolved_public_geo: row.resolved_public_geo,
  }));

  const categories = [...new Set(onlineAudit.map((row) => row.category))].sort((a,b)=>a.localeCompare(b,"sk"));
  const riskRows = categories.map((category) => {
    const categoryRows = onlineAudit.filter((row) => row.category === category);
    return {
      code_path: "lib/map-query.ts:serviceStatement + isPublicMapCandidate; scripts/map-production-readiness.mjs:directoryCoverage",
      category,
      online_true: categoryRows.length,
      physical_and_online_likely: countWhere(categoryRows,(r)=>r.proposed_semantic_bucket==="PHYSICAL_AND_ONLINE_LIKELY"),
      online_only_likely: countWhere(categoryRows,(r)=>r.proposed_semantic_bucket==="ONLINE_ONLY_LIKELY"),
      ambiguous: countWhere(categoryRows,(r)=>r.proposed_semantic_bucket==="AMBIGUOUS"),
      insufficient_data: countWhere(categoryRows,(r)=>r.proposed_semantic_bucket==="INSUFFICIENT_DATA"),
      resolved_public_geo_but_excluded: countWhere(categoryRows,(r)=>r.resolved_public_geo===1),
      false_negative_risk: countWhere(categoryRows,(r)=>r.proposed_semantic_bucket==="PHYSICAL_AND_ONLINE_LIKELY"),
      current_filter: "d.online = 0 / !candidate.online",
    };
  });
  riskRows.push({
    code_path: "lib/map-query.ts:serviceStatement + isPublicMapCandidate; scripts/map-production-readiness.mjs:directoryCoverage",
    category: "TOTAL", online_true: onlineAudit.length,
    physical_and_online_likely: countWhere(onlineAudit,(r)=>r.proposed_semantic_bucket==="PHYSICAL_AND_ONLINE_LIKELY"),
    online_only_likely: countWhere(onlineAudit,(r)=>r.proposed_semantic_bucket==="ONLINE_ONLY_LIKELY"),
    ambiguous: countWhere(onlineAudit,(r)=>r.proposed_semantic_bucket==="AMBIGUOUS"),
    insufficient_data: countWhere(onlineAudit,(r)=>r.proposed_semantic_bucket==="INSUFFICIENT_DATA"),
    resolved_public_geo_but_excluded: countWhere(onlineAudit,(r)=>r.resolved_public_geo===1),
    false_negative_risk: countWhere(onlineAudit,(r)=>r.proposed_semantic_bucket==="PHYSICAL_AND_ONLINE_LIKELY"),
    current_filter: "d.online = 0 / !candidate.online",
  });

  const directoryCounts = {
    total_published: directoryExpected,
    exported: directory.length,
    online_true: countWhere(directory,(r)=>r.online===1),
    online_false: countWhere(directory,(r)=>r.online===0),
    exact_address: countWhere(directory,(r)=>r.address_completeness==="HAS_EXACT_ADDRESS"),
    city_only: countWhere(directory,(r)=>r.address_completeness==="CITY_ONLY"),
    partial: countWhere(directory,(r)=>r.address_completeness==="PARTIAL_ADDRESS"),
    no_address: countWhere(directory,(r)=>r.address_completeness==="NO_ADDRESS"),
    conflicting_fields: countWhere(directory,(r)=>r.address_completeness==="CONFLICTING_FIELDS"),
    likely_physical_and_online: countWhere(directory,(r)=>r.online_semantic_bucket==="PHYSICAL_AND_ONLINE_LIKELY"),
    likely_online_only: countWhere(directory,(r)=>r.online_semantic_bucket==="ONLINE_ONLY_LIKELY"),
    ambiguous_online: countWhere(directory,(r)=>r.online_semantic_bucket==="AMBIGUOUS"),
    insufficient_online: countWhere(directory,(r)=>r.online_semantic_bucket==="INSUFFICIENT_DATA"),
    potential_duplicate_review: countWhere(directory,(r)=>r.potential_duplicate_review===1),
  };
  const eventCounts = {
    current_upcoming_physical_total: eventsExpected,
    exported: events.length,
    exact_address: countWhere(events,(r)=>r.address_completeness==="HAS_EXACT_ADDRESS"),
    city_only: countWhere(events,(r)=>r.address_completeness==="CITY_ONLY"),
    partial: countWhere(events,(r)=>r.address_completeness==="PARTIAL_ADDRESS"),
    no_address: countWhere(events,(r)=>r.address_completeness==="NO_ADDRESS"),
    conflicting_fields: countWhere(events,(r)=>r.address_completeness==="CONFLICTING_FIELDS"),
    already_resolved_in_geo_points: countWhere(events,(r)=>r.resolved_public_geo===1),
    unresolved_no_public_resolved_geo: countWhere(events,(r)=>r.resolved_public_geo!==1),
    repeated_venue_rows: countWhere(events,(r)=>r.repeated_venue_review===1),
  };
  const organizationCounts = {
    published_total: organizationsExpected,
    exported: organizations.length,
    linked_directory_profile_count: countWhere(organizations,(r)=>r.directory_profile_id!==""),
    unlinked_count: countWhere(organizations,(r)=>r.directory_profile_id===""),
    multi_location_organizations: countWhere(organizations,(r)=>r.multi_location===1),
  };
  const locationCounts = {
    total: locationsExpected,
    exported: locations.length,
    SITE: countWhere(locations,(r)=>r.role==="SITE"),
    LEGAL_SEAT: countWhere(locations,(r)=>r.role==="LEGAL_SEAT"),
    SERVICE_AREA: countWhere(locations,(r)=>r.role==="SERVICE_AREA"),
    UNSPECIFIED: countWhere(locations,(r)=>r.role==="UNSPECIFIED"),
    exact_address: countWhere(locations,(r)=>r.address_completeness==="HAS_EXACT_ADDRESS"),
    city_only: countWhere(locations,(r)=>r.address_completeness==="CITY_ONLY"),
    partial: countWhere(locations,(r)=>r.address_completeness==="PARTIAL_ADDRESS"),
    missing: countWhere(locations,(r)=>r.address_completeness==="NO_ADDRESS"),
    conflicting_fields: countWhere(locations,(r)=>r.address_completeness==="CONFLICTING_FIELDS"),
  };

  const completenessChecks = {
    directory: directory.length === directoryExpected,
    events: events.length === eventsExpected,
    organizations: organizations.length === organizationsExpected,
    organization_locations: locations.length === locationsExpected,
  };
  const complete = Object.values(completenessChecks).every(Boolean);
  const rowsNeedingResearch = countWhere(directory,(r)=>r.needs_external_research===1)
    + countWhere(events,(r)=>r.needs_external_research===1)
    + countWhere(locations,(r)=>r.needs_external_research===1);
  const potentialDuplicateReviewCount = directoryCounts.potential_duplicate_review + eventCounts.repeated_venue_rows;

  const files = [
    ["directory_row_level_export.csv", directory],
    ["events_row_level_export.csv", events],
    ["organizations_row_level_export.csv", organizations],
    ["organization_locations_row_level_export.csv", locations],
    ["directory_online_semantics_audit.csv", onlineAudit],
    ["map_source_filter_risk_report.csv", riskRows],
  ];
  for (const [name, records] of files) {
    const columns = records.length ? Object.keys(records[0]) : [];
    await fs.writeFile(path.join(outDir, name), toCsv(records, columns));
  }

  const manifest = {
    audit_mode: "READ_ONLY",
    generated_at: generatedAt,
    production_target: { database_name: db, database_id: resources.d1.database_id },
    schema,
    canonical_model_notes: {
      directory_profiles: "Canonical location fields are address/city/district/region; no separate street, house number, postal code, country, formatted address, subcategory, or public phone columns.",
      managed_events: "Canonical location fields are venue/address/city/region; no district, country, separate street/house/postal, or organizer-source URL column.",
      organization_locations: "Canonical location fields are address/city/district/region/country_code; no visibility/provenance columns on organization_locations itself.",
    },
    counts: { directory: directoryCounts, events: eventCounts, organizations: organizationCounts, organization_locations: locationCounts },
    map_filter_risk: riskRows.at(-1),
    relationships: {
      linked_organization_directory_count: organizationCounts.linked_directory_profile_count,
      multi_location_organizations: organizationCounts.multi_location_organizations,
      repeated_event_venue_rows: eventCounts.repeated_venue_rows,
      potential_duplicate_review_count: potentialDuplicateReviewCount,
    },
    rows_needing_external_address_research: rowsNeedingResearch,
    completeness_checks: completenessChecks,
    complete,
  };
  await fs.writeFile(path.join(outDir, "map_data_export_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const summary = `# Psipedia MAP-DATA-EXPORT — row-level audit\n\n`+
    `Generated: ${generatedAt}\n\n`+
    `Mode: **READ_ONLY**. No D1 mutations, geocoding, geo/privacy changes, backfill, or launch-flag changes are performed.\n\n`+
    `## Canonical schema notes\n\n`+
    `- directory_profiles location model: \`address\`, \`city\`, \`district\`, \`region\`; separate street/house/postal/country/formatted-address fields do not exist.\n`+
    `- managed_events location model: \`venue\`, \`address\`, \`city\`, \`region\`; separate district/country/street/house/postal fields do not exist.\n`+
    `- organization_locations location model: \`address\`, \`city\`, \`district\`, \`region\`, \`country_code\`; visibility/provenance lives in geo_points or organization source metadata, not this table.\n\n`+
    `## Directory\n\n| metric | count |\n|---|---:|\n${mdTable(directoryCounts)}\n\n`+
    `## Events\n\n| metric | count |\n|---|---:|\n${mdTable(eventCounts)}\n\n`+
    `## Organizations\n\n| metric | count |\n|---|---:|\n${mdTable(organizationCounts)}\n\n`+
    `## Organization locations\n\n| metric | count |\n|---|---:|\n${mdTable(locationCounts)}\n\n`+
    `## Online semantics and map-filter risk\n\n`+
    `Current code path excludes directory rows with \`online=true\` in \`lib/map-query.ts\` (SQL \`d.online = 0\`) and again in \`isPublicMapCandidate()\` (\`!candidate.online\`). The production readiness audit also measures directory coverage only with \`d.online=0\`.\n\n`+
    `Potential false-negative risk is conservatively defined here as \`online=true\` rows that also have both a canonical non-online address and city. It is a research flag, not a map-eligibility decision.\n\n`+
    `| metric | count |\n|---|---:|\n`+
    `| online=true | ${directoryCounts.online_true} |\n`+
    `| physical + online likely | ${directoryCounts.likely_physical_and_online} |\n`+
    `| online-only likely | ${directoryCounts.likely_online_only} |\n`+
    `| ambiguous online | ${directoryCounts.ambiguous_online} |\n`+
    `| insufficient online evidence | ${directoryCounts.insufficient_online} |\n`+
    `| resolved public geo but currently excluded | ${riskRows.at(-1).resolved_public_geo_but_excluded} |\n`+
    `| false-negative risk count | ${riskRows.at(-1).false_negative_risk} |\n\n`+
    `## Relationships / duplicate review\n\n`+
    `- linked organization ↔ directory_profile: ${organizationCounts.linked_directory_profile_count}\n`+
    `- multi-location organizations: ${organizationCounts.multi_location_organizations}\n`+
    `- repeated event venue rows flagged for review: ${eventCounts.repeated_venue_rows}\n`+
    `- potential duplicate review rows (directory + repeated event venue rows): ${potentialDuplicateReviewCount}\n\n`+
    `## Completeness gate\n\n| scope | expected | exported | match |\n|---|---:|---:|---|\n`+
    `| directory | ${directoryExpected} | ${directory.length} | ${completenessChecks.directory ? "PASS" : "FAIL"} |\n`+
    `| events | ${eventsExpected} | ${events.length} | ${completenessChecks.events ? "PASS" : "FAIL"} |\n`+
    `| organizations | ${organizationsExpected} | ${organizations.length} | ${completenessChecks.organizations ? "PASS" : "FAIL"} |\n`+
    `| organization_locations | ${locationsExpected} | ${locations.length} | ${completenessChecks.organization_locations ? "PASS" : "FAIL"} |\n\n`+
    `Rows needing external address research: **${rowsNeedingResearch}**\n\n`+
    `${complete ? "MAP ROW-LEVEL AUDIT EXPORT — COMPLETE" : "MAP ROW-LEVEL AUDIT EXPORT — BLOCKED — row-level export count mismatch"}\n`;
  await fs.writeFile(path.join(outDir, "map_data_export_summary.md"), summary);

  console.log(`[map-data-export] READ_ONLY ${complete ? "COMPLETE" : "BLOCKED"} — directory=${directory.length}/${directoryExpected}; events=${events.length}/${eventsExpected}; organizations=${organizations.length}/${organizationsExpected}; locations=${locations.length}/${locationsExpected}; online=${directoryCounts.online_true}; falseNegativeRisk=${riskRows.at(-1).false_negative_risk}`);
  if (!complete) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
