import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MAP_FOUNDATION_MIGRATIONS = Object.freeze([
  "0063_partner_claims_verification.sql",
  "0064_geo_foundation.sql",
]);
export const MAP_FOUNDATION_BASE = "0062_profile_reviews_foundation.sql";

const PARTNER_0063_OBJECTS = Object.freeze([
  "table:partner_claims",
  "table:partner_resource_verifications",
  "index:partner_claims_pending_unique",
  "index:partner_claims_status_created_idx",
  "index:partner_claims_account_created_idx",
  "index:partner_claims_resource_status_idx",
  "index:partner_resource_verifications_account_resource_unique",
  "index:partner_resource_verifications_status_submitted_idx",
  "index:partner_resource_verifications_resource_status_idx",
]);

const GEO_0064_OBJECTS = Object.freeze([
  "table:geo_points",
  "index:geo_points_directory_unique",
  "index:geo_points_organization_location_unique",
  "index:geo_points_event_unique",
  "index:geo_points_status_updated_idx",
  "index:geo_points_public_spatial_idx",
  "index:geo_points_provider_query_idx",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function migrationIndex(name) {
  const match = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(name);
  invariant(match, `Invalid migration filename: ${name}`);
  return Number(match[1]);
}

export function migrationsThrough(files, target) {
  const targetIndex = migrationIndex(target);
  const migrations = files
    .filter((name) => /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name))
    .sort((a, b) => migrationIndex(a) - migrationIndex(b));
  invariant(migrations.includes(target), `Missing target migration: ${target}`);
  const selected = migrations.filter((name) => migrationIndex(name) <= targetIndex);
  for (let index = 0; index <= targetIndex; index += 1) {
    invariant(selected.some((name) => migrationIndex(name) === index),
      `Migration chain has a gap before target: ${String(index).padStart(4, "0")}`);
  }
  return selected;
}

function parseJsonOutput(output, label) {
  const text = output.trim();
  invariant(text, `${label} returned empty output`);
  try {
    return JSON.parse(text);
  } catch {
    for (const start of [text.indexOf("["), text.indexOf("{")].filter((value) => value >= 0).sort((a, b) => a - b)) {
      for (const endChar of ["]", "}"]) {
        const end = text.lastIndexOf(endChar);
        if (end <= start) continue;
        try { return JSON.parse(text.slice(start, end + 1)); } catch {}
      }
    }
  }
  throw new Error(`${label} did not return parseable JSON`);
}

function rowsFromD1Json(payload) {
  return (Array.isArray(payload) ? payload : [payload])
    .flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function runWrangler(args, { capture = true } = {}) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["wrangler", ...args], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`wrangler failed (${result.status}): ${(result.stderr || "").trim() || "<no stderr>"}`);
  }
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result.stdout || "";
}

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relative), "utf8"));
}

async function writeJson(relative, value) {
  const target = path.join(repoRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function migrationFiles() {
  const entries = await fs.readdir(path.join(repoRoot, "drizzle"), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name);
}

async function prepare(target) {
  const [resources, generated, files] = await Promise.all([
    readJson("config/cloudflare-resources.json"),
    readJson("dist/server/wrangler.json"),
    migrationFiles(),
  ]);
  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID is required");
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");

  const canonical = resources.d1;
  const binding = (generated.d1_databases || []).find((entry) => entry?.binding === canonical.binding);
  invariant(generated.name === "psipedia-sk", "Unexpected Worker name");
  invariant(binding?.database_name === canonical.database_name, "Generated D1 database_name mismatch");
  invariant(binding?.database_id === canonical.database_id, "Generated D1 database_id mismatch");

  const root = path.join(repoRoot, ".production-map-foundation");
  await fs.mkdir(root, { recursive: true });
  const scopedDir = await fs.mkdtemp(path.join(root, `scoped-${migrationIndex(target)}-`));
  const migrationsDir = path.join(scopedDir, "migrations");
  await fs.mkdir(migrationsDir, { recursive: true });
  for (const fileName of migrationsThrough(files, target)) {
    await fs.copyFile(path.join(repoRoot, "drizzle", fileName), path.join(migrationsDir, fileName));
  }
  const config = {
    ...generated,
    d1_databases: (generated.d1_databases || []).map((entry) =>
      entry?.binding === canonical.binding ? { ...entry, migrations_dir: "./migrations" } : entry),
  };
  const configPath = path.join(scopedDir, "wrangler.json");
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { resources, generated, files, configPath, root };
}

function execute(databaseName, configPath, sql) {
  return rowsFromD1Json(parseJsonOutput(runWrangler([
    "d1", "execute", databaseName, "--remote", "--config", configPath, "--command", sql, "--json",
  ]), "wrangler d1 execute"));
}

function scalar(databaseName, configPath, sql) {
  return Number(execute(databaseName, configPath, sql)[0]?.count ?? 0);
}

function history(databaseName, configPath) {
  return execute(databaseName, configPath, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
}

function schemaObjects(databaseName, configPath) {
  return execute(databaseName, configPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name");
}

function objectKeys(objects) {
  return new Set(objects.map((row) => `${row.type}:${row.name}`));
}

function assertObjects(objects, required, label) {
  const keys = objectKeys(objects);
  const missing = required.filter((key) => !keys.has(key));
  invariant(missing.length === 0, `${label} missing schema objects: ${missing.join(", ")}`);
}

function stableHash(rows) {
  const normalized = rows.map((row) => JSON.stringify(row, Object.keys(row).sort())).sort().join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function partnerPreservationState(databaseName, configPath) {
  const outbox = execute(databaseName, configPath,
    "SELECT id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,last_attempt_at,provider_message_id,last_error,sent_at,created_at,updated_at FROM partner_notification_outbox ORDER BY id");
  const audit = execute(databaseName, configPath,
    "SELECT id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at FROM partner_audit_events ORDER BY id");
  return {
    outboxCount: outbox.length,
    outboxHash: stableHash(outbox),
    auditCount: audit.length,
    auditHash: stableHash(audit),
    accounts: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_accounts"),
    resources: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_resources"),
    memberships: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_memberships"),
    commercial: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM partner_commercial_interests"),
  };
}

function assertPreserved(before, after) {
  for (const key of ["outboxCount","outboxHash","auditCount","auditHash","accounts","resources","memberships","commercial"]) {
    invariant(before[key] === after[key], `0063 preservation check failed: ${key}`);
  }
}

function findStringByKey(value, key) {
  if (!value || typeof value !== "object") return null;
  if (typeof value[key] === "string" && value[key]) return value[key];
  for (const child of Object.values(value)) {
    const found = findStringByKey(child, key);
    if (found) return found;
  }
  return null;
}

async function recoveryBookmark(databaseName, configPath) {
  const payload = parseJsonOutput(runWrangler([
    "d1", "time-travel", "info", databaseName, "--config", configPath, "--json",
  ]), "wrangler d1 time-travel info");
  const bookmark = findStringByKey(payload, "bookmark");
  invariant(bookmark, "D1 Time Travel did not return a recovery bookmark");
  return bookmark;
}

function expectedPrefix(files, target) {
  return migrationsThrough(files, target);
}

function assertHistoryExactly(actual, expected, label) {
  invariant(
    actual.length === expected.length && actual.every((name, index) => name === expected[index]),
    `${label}: production migration history does not match repository exactly`,
  );
}

async function preflight() {
  await fs.rm(path.join(repoRoot, ".production-map-foundation"), { recursive: true, force: true });
  const prepared = await prepare("0064_geo_foundation.sql");
  const db = prepared.resources.d1.database_name;
  const names = history(db, prepared.configPath).map((row) => String(row.name));
  const latest = names.at(-1) ?? null;
  invariant(
    [MAP_FOUNDATION_BASE, MAP_FOUNDATION_MIGRATIONS[0], MAP_FOUNDATION_MIGRATIONS[1]].includes(latest),
    `Production must be exactly at 0062, 0063, or 0064; latest=${latest ?? "<none>"}`,
  );
  assertHistoryExactly(names, expectedPrefix(prepared.files, latest), "preflight");

  const objects = schemaObjects(db, prepared.configPath);
  const keys = objectKeys(objects);
  if (latest === MAP_FOUNDATION_BASE) {
    invariant(!keys.has("table:partner_claims") && !keys.has("table:partner_resource_verifications"),
      "0063 physical objects already exist before history");
    invariant(!keys.has("table:geo_points"), "0064 geo_points already exists before history");
  } else {
    assertObjects(objects, PARTNER_0063_OBJECTS, "0063");
  }
  if (latest === MAP_FOUNDATION_MIGRATIONS[0]) {
    invariant(!keys.has("table:geo_points"), "0064 geo_points exists before migration history");
  }
  if (latest === MAP_FOUNDATION_MIGRATIONS[1]) {
    assertObjects(objects, GEO_0064_OBJECTS, "0064");
  }

  const bookmark = await recoveryBookmark(db, prepared.configPath);
  const preservation = latest === MAP_FOUNDATION_BASE ? partnerPreservationState(db, prepared.configPath) : null;
  const report = {
    rollout: MAP_FOUNDATION_MIGRATIONS,
    latestRecordedMigration: latest,
    apply0063: latest === MAP_FOUNDATION_BASE,
    apply0064: latest !== MAP_FOUNDATION_MIGRATIONS[1],
    resumeMode: latest !== MAP_FOUNDATION_BASE,
    productionTarget: {
      worker: prepared.generated.name,
      accountId: prepared.resources.account_id,
      databaseName: db,
      databaseId: prepared.resources.d1.database_id,
      binding: prepared.resources.d1.binding,
    },
    recoveryMechanism: "D1 Time Travel",
    recoveryBookmark: bookmark,
    geoPointsPresent: keys.has("table:geo_points"),
    safeToContinue: true,
  };
  await writeJson(".production-map-foundation/preflight-report.json", report);
  await writeJson(".production-map-foundation/preflight-internal.json", { preservation });
  console.log(`[map-foundation] preflight PASS — latest=${latest}; apply0063=${report.apply0063}; apply0064=${report.apply0064}`);
}

function previousMigration(target) {
  return target === MAP_FOUNDATION_MIGRATIONS[0] ? MAP_FOUNDATION_BASE : MAP_FOUNDATION_MIGRATIONS[0];
}

async function applyStep(target) {
  invariant(MAP_FOUNDATION_MIGRATIONS.includes(target), `Unsupported target: ${target}`);
  const prepared = await prepare(target);
  const db = prepared.resources.d1.database_name;
  const names = history(db, prepared.configPath).map((row) => String(row.name));
  if (names.at(-1) === target) {
    console.log(`[map-foundation] ${target} already applied; no-op`);
    return;
  }
  invariant(names.at(-1) === previousMigration(target),
    `Cannot apply ${target}; latest=${names.at(-1) ?? "<none>"}, expected=${previousMigration(target)}`);
  runWrangler([
    "d1", "migrations", "apply", db, "--remote", "--config", prepared.configPath,
  ], { capture: false });
}

async function verify0063() {
  const prepared = await prepare(MAP_FOUNDATION_MIGRATIONS[0]);
  const db = prepared.resources.d1.database_name;
  const names = history(db, prepared.configPath).map((row) => String(row.name));
  assertHistoryExactly(names, expectedPrefix(prepared.files, MAP_FOUNDATION_MIGRATIONS[0]), "verify 0063");
  const objects = schemaObjects(db, prepared.configPath);
  assertObjects(objects, PARTNER_0063_OBJECTS, "0063");
  const internal = await readJson(".production-map-foundation/preflight-internal.json");
  const after = partnerPreservationState(db, prepared.configPath);
  if (internal.preservation) assertPreserved(internal.preservation, after);
  const claims = scalar(db, prepared.configPath, "SELECT COUNT(*) AS count FROM partner_claims");
  const verifications = scalar(db, prepared.configPath, "SELECT COUNT(*) AS count FROM partner_resource_verifications");
  await writeJson(".production-map-foundation/step-0063-report.json", {
    target: MAP_FOUNDATION_MIGRATIONS[0],
    latestRecordedMigration: names.at(-1),
    partnerClaims: claims,
    partnerResourceVerifications: verifications,
    preservationProof: internal.preservation ? "PASS" : "RESUME_STRUCTURAL_ONLY",
  });
  console.log("[map-foundation] verify 0063 PASS");
}

async function verify0064() {
  const prepared = await prepare(MAP_FOUNDATION_MIGRATIONS[1]);
  const db = prepared.resources.d1.database_name;
  const names = history(db, prepared.configPath).map((row) => String(row.name));
  assertHistoryExactly(names, expectedPrefix(prepared.files, MAP_FOUNDATION_MIGRATIONS[1]), "verify 0064");
  const objects = schemaObjects(db, prepared.configPath);
  assertObjects(objects, PARTNER_0063_OBJECTS, "0063");
  assertObjects(objects, GEO_0064_OBJECTS, "0064");
  const geoCount = scalar(db, prepared.configPath, "SELECT COUNT(*) AS count FROM geo_points");
  invariant(geoCount === 0, `0064 is schema-only and must not seed geo_points; found ${geoCount}`);
  await writeJson(".production-map-foundation/step-0064-report.json", {
    target: MAP_FOUNDATION_MIGRATIONS[1],
    latestRecordedMigration: names.at(-1),
    geoPoints: geoCount,
    schemaOnly: true,
  });
  console.log("[map-foundation] verify 0064 PASS — geo_points=0");
}

async function postflight() {
  const prepared = await prepare(MAP_FOUNDATION_MIGRATIONS[1]);
  const db = prepared.resources.d1.database_name;
  const names = history(db, prepared.configPath).map((row) => String(row.name));
  assertHistoryExactly(names, expectedPrefix(prepared.files, MAP_FOUNDATION_MIGRATIONS[1]), "postflight");
  const objects = schemaObjects(db, prepared.configPath);
  assertObjects(objects, PARTNER_0063_OBJECTS, "0063");
  assertObjects(objects, GEO_0064_OBJECTS, "0064");
  const geoCount = scalar(db, prepared.configPath, "SELECT COUNT(*) AS count FROM geo_points");
  await writeJson(".production-map-foundation/postflight-report.json", {
    rollout: MAP_FOUNDATION_MIGRATIONS,
    latestRecordedMigration: names.at(-1),
    productionTarget: {
      accountId: prepared.resources.account_id,
      databaseName: db,
      databaseId: prepared.resources.d1.database_id,
    },
    geoPoints: geoCount,
    readyForMapApi: true,
    migration0065OrLaterApplied: false,
  });
  console.log("[map-foundation] postflight PASS — production history ends exactly at 0064");
}

async function cli() {
  const command = process.argv[2];
  if (command === "preflight") return preflight();
  if (command === "apply-step") return applyStep(process.argv[3]);
  if (command === "verify-0063") return verify0063();
  if (command === "verify-0064") return verify0064();
  if (command === "postflight") return postflight();
  throw new Error("Usage: production-d1-map-foundation.mjs <preflight|apply-step TARGET|verify-0063|verify-0064|postflight>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli();
}
