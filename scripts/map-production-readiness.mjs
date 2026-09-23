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
  return rows(parse(run(["d1","execute",db,"--remote","--config",configPath,"--command",sql,"--json"])));
}

function one(db, configPath, sql) {
  return readQuery(db, configPath, sql)[0] ?? {};
}

function pct(resolved, eligible) {
  return eligible ? Math.round((resolved / eligible) * 1000) / 10 : 0;
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
  const history = readQuery(db, configPath, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
  const directory = one(db, configPath, `
    SELECT COUNT(*) published_total,
      SUM(TRIM(COALESCE(address,''))<>'') has_address,
      SUM(TRIM(COALESCE(address,''))='') no_address,
      SUM(TRIM(COALESCE(city,''))<>'') has_city,
      SUM(TRIM(COALESCE(address,''))='' AND TRIM(COALESCE(city,''))<>'') city_only,
      SUM(TRIM(COALESCE(address,''))<>'' AND TRIM(COALESCE(city,''))<>'') address_and_city,
      SUM(TRIM(COALESCE(address,''))<>'' AND TRIM(COALESCE(city,''))='') address_without_city,
      SUM(UPPER(COALESCE(address,'')) LIKE '%GPS%' OR COALESCE(address,'') LIKE '%°%'
        OR LOWER(COALESCE(address,'')) LIKE '%latitude%'
        OR LOWER(COALESCE(address,'')) LIKE '%longitude%') potential_coordinate_text
    FROM directory_profiles WHERE status='published' AND archived_at IS NULL
  `);
  const directoryByCategory = readQuery(db, configPath, `
    SELECT category,COUNT(*) eligible,
      SUM(TRIM(COALESCE(address,''))<>'') has_address,
      SUM(TRIM(COALESCE(address,''))='' AND TRIM(COALESCE(city,''))<>'') city_only
    FROM directory_profiles WHERE status='published' AND archived_at IS NULL
    GROUP BY category ORDER BY category
  `);
  const organizations = one(db, configPath, `
    SELECT COUNT(*) published_organizations,
      SUM(directory_profile_id IS NOT NULL) linked_to_directory
    FROM help_organizations WHERE status='PUBLISHED' AND archived_at IS NULL
  `);
  const locations = readQuery(db, configPath, `
    SELECT l.role,COUNT(*) location_count,
      SUM(TRIM(COALESCE(l.address,''))<>'') has_address,
      SUM(TRIM(COALESCE(l.address,''))='' AND TRIM(COALESCE(l.city,''))<>'') city_only
    FROM organization_locations l JOIN help_organizations o ON o.id=l.organization_id
    WHERE o.status='PUBLISHED' AND o.archived_at IS NULL
    GROUP BY l.role ORDER BY l.role
  `);
  const multipleLocations = Number(one(db, configPath, `
    SELECT COUNT(*) count FROM (
      SELECT l.organization_id FROM organization_locations l
      JOIN help_organizations o ON o.id=l.organization_id
      WHERE o.status='PUBLISHED' AND o.archived_at IS NULL
      GROUP BY l.organization_id HAVING COUNT(*)>1
    )
  `).count || 0);
  const events = one(db, configPath, `
    SELECT COUNT(*) published_total,
      SUM(cancelled=0 AND COALESCE(end_date,start_date)>=DATE('now')
        AND LOWER(TRIM(COALESCE(region,'')))<>'online') active_or_upcoming_physical,
      SUM(TRIM(COALESCE(venue,''))<>'') has_venue,
      SUM(TRIM(COALESCE(address,''))<>'') has_address,
      SUM(TRIM(COALESCE(city,''))<>'') has_city,
      SUM(LOWER(TRIM(COALESCE(region,'')))='online'
        OR LOWER(TRIM(COALESCE(city,'')))='online'
        OR LOWER(TRIM(COALESCE(venue,'')))='online') online
    FROM managed_events WHERE status='published'
  `);
  const geoPresent = Number(one(db, configPath,
    "SELECT COUNT(*) count FROM sqlite_schema WHERE type='table' AND name='geo_points'").count || 0) === 1;

  let geo = { schemaAvailable: false, total: 0 };
  if (geoPresent) {
    const total = Number(one(db, configPath, "SELECT COUNT(*) count FROM geo_points").count || 0);
    const directoryCoverage = readQuery(db, configPath, `
      SELECT d.category,COUNT(*) eligible,
        SUM(g.geocode_status='RESOLVED'
          AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
          AND g.source_fingerprint=g.resolved_source_fingerprint) resolved
      FROM directory_profiles d LEFT JOIN geo_points g ON g.directory_profile_id=d.id
      WHERE d.status='published' AND d.archived_at IS NULL AND d.online=0
      GROUP BY d.category ORDER BY d.category
    `).map((row) => ({
      category: row.category,
      eligible: Number(row.eligible || 0),
      resolved: Number(row.resolved || 0),
      coverage_pct: pct(Number(row.resolved || 0), Number(row.eligible || 0)),
    }));
    const publicResolved = Number(one(db, configPath, "SELECT COUNT(*) count FROM geo_points WHERE geocode_status='RESOLVED' AND public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC') AND source_fingerprint=resolved_source_fingerprint").count || 0);
    const exactPublic = Number(one(db, configPath, "SELECT COUNT(*) count FROM geo_points WHERE geocode_status='RESOLVED' AND public_visibility='EXACT_PUBLIC' AND source_fingerprint=resolved_source_fingerprint").count || 0);
    const approximatePublic = Number(one(db, configPath, "SELECT COUNT(*) count FROM geo_points WHERE geocode_status='RESOLVED' AND public_visibility='APPROXIMATE_PUBLIC' AND source_fingerprint=resolved_source_fingerprint").count || 0);
    const orgCoverage = one(db, configPath, `
      SELECT COUNT(*) eligible,
        SUM(g.geocode_status='RESOLVED' AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
          AND g.source_fingerprint=g.resolved_source_fingerprint) resolved
      FROM organization_locations l
      JOIN help_organizations o ON o.id=l.organization_id
      LEFT JOIN geo_points g ON g.organization_location_id=l.id
      WHERE o.status='PUBLISHED' AND o.archived_at IS NULL AND l.role='SITE'
    `);
    const eventCoverage = one(db, configPath, `
      SELECT COUNT(*) eligible,
        SUM(g.geocode_status='RESOLVED' AND g.public_visibility IN ('EXACT_PUBLIC','APPROXIMATE_PUBLIC')
          AND g.source_fingerprint=g.resolved_source_fingerprint) resolved
      FROM managed_events e LEFT JOIN geo_points g ON g.managed_event_id=e.id
      WHERE e.status='published' AND e.cancelled=0
        AND COALESCE(e.end_date,e.start_date)>=DATE('now')
        AND LOWER(TRIM(COALESCE(e.region,'')))<>'online'
    `);
    const orgEligible = Number(orgCoverage.eligible || 0), orgResolved = Number(orgCoverage.resolved || 0);
    const eventEligible = Number(eventCoverage.eligible || 0), eventResolved = Number(eventCoverage.resolved || 0);
    geo = {
      schemaAvailable: true,
      total,
      publicResolved,
      exactPublic,
      approximatePublic,
      byTargetType: readQuery(db, configPath, "SELECT target_type,COUNT(*) count FROM geo_points GROUP BY target_type ORDER BY target_type"),
      byVisibility: readQuery(db, configPath, "SELECT COALESCE(public_visibility,'NULL') public_visibility,COUNT(*) count FROM geo_points GROUP BY public_visibility ORDER BY public_visibility"),
      byStatus: readQuery(db, configPath, "SELECT geocode_status,COUNT(*) count FROM geo_points GROUP BY geocode_status ORDER BY geocode_status"),
      byPrecision: readQuery(db, configPath, "SELECT COALESCE(public_precision,'NULL') public_precision,COUNT(*) count FROM geo_points GROUP BY public_precision ORDER BY public_precision"),
      manualOverrides: Number(one(db, configPath, "SELECT COUNT(*) count FROM geo_points WHERE manual_override=1").count || 0),
      directoryCoverage,
      organizations: { eligibleSites: orgEligible, resolvedSites: orgResolved, coverage_pct: pct(orgResolved, orgEligible) },
      events: { eligibleUpcomingPhysical: eventEligible, resolved: eventResolved, coverage_pct: pct(eventResolved, eventEligible) },
    };
  }

  const report = {
    auditMode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    productionTarget: { databaseName: db, databaseId: resources.d1.database_id },
    migration: { latest: history.at(-1)?.name ?? null, names: history.map((row) => row.name) },
    directory,
    directoryByCategory,
    organizations: { ...organizations, locationsByRole: locations, multipleLocations },
    events,
    geo,
  };
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[map-readiness] READ_ONLY PASS — latest=${report.migration.latest}; directory=${directory.published_total}; geoSchema=${geo.schemaAvailable}; geoPoints=${geo.total}`);
}

await main();
