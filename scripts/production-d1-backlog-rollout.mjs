import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BACKLOG_MIGRATIONS = Object.freeze([
  "0058_public_integrity_cleanup.sql",
  "0059_partner_auth_foundation.sql",
  "0060_partner_memberships_admin.sql",
  "0061_partner_commercial_interests.sql",
]);

export const BACKLOG_BASE_MIGRATION = "0057_automation_background_run_lock.sql";

const SIGNATURES = Object.freeze({
  "0059_partner_auth_foundation.sql": [
    "table:partner_accounts",
    "table:partner_notification_outbox",
    "index:partner_accounts_email_hash_unique",
    "index:partner_accounts_status_updated_idx",
    "index:partner_notification_outbox_dedupe_unique",
    "index:partner_notification_outbox_status_expiry_idx",
    "index:partner_notification_outbox_account_created_idx",
  ],
  "0060_partner_memberships_admin.sql": [
    "table:partner_resources",
    "table:partner_memberships",
    "table:partner_audit_events",
    "index:partner_resources_directory_unique",
    "index:partner_resources_organization_unique",
    "index:partner_resources_event_unique",
    "index:partner_resources_type_updated_idx",
    "index:partner_memberships_active_unique",
    "index:partner_memberships_account_active_idx",
    "index:partner_memberships_resource_active_idx",
    "index:partner_audit_target_created_idx",
    "index:partner_audit_actor_created_idx",
    "trigger:partner_audit_events_no_update",
    "trigger:partner_audit_events_no_delete",
  ],
  "0061_partner_commercial_interests.sql": [
    "table:partner_commercial_interests",
    "index:partner_commercial_new_resource_unique",
    "index:partner_commercial_new_account_unique",
    "index:partner_commercial_status_created_idx",
    "index:partner_commercial_account_created_idx",
    "index:partner_commercial_resource_created_idx",
  ],
});

const LATER_OBJECTS = Object.freeze([
  "table:review_authors",
  "table:review_auth_notification_outbox",
  "table:profile_reviews",
  "table:profile_review_rating_values",
  "table:profile_review_provider_replies",
  "table:profile_review_helpful_votes",
  "table:profile_review_reports",
  "table:partner_claims",
  "table:partner_resource_verifications",
  "table:geo_points",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function migrationIndex(fileName) {
  const match = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(fileName);
  invariant(match, `Invalid migration filename: ${fileName}`);
  return Number(match[1]);
}

export function repoMigrationsThrough(fileNames, targetMigration) {
  const target = migrationIndex(targetMigration);
  const migrations = fileNames
    .filter((name) => /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name))
    .sort((a, b) => migrationIndex(a) - migrationIndex(b));
  invariant(migrations.includes(targetMigration), `Target migration is missing: ${targetMigration}`);
  const selected = migrations.filter((name) => migrationIndex(name) <= target);
  for (let index = 0; index <= target; index += 1) {
    invariant(selected.some((name) => migrationIndex(name) === index),
      `Migration chain has a gap before target: ${String(index).padStart(4, "0")}`);
  }
  return selected;
}

export function validateBacklogHistory(historyNames, repoFileNames) {
  const expectedBase = repoMigrationsThrough(repoFileNames, BACKLOG_BASE_MIGRATION);
  invariant(
    historyNames.length === expectedBase.length &&
      historyNames.every((name, index) => name === expectedBase[index]),
    `Production migration history must match repository exactly through ${BACKLOG_BASE_MIGRATION}`,
  );
  return { latest: historyNames.at(-1) ?? null, expectedBase };
}

function parseJsonOutput(output, label) {
  const text = output.trim();
  invariant(text, `${label} returned empty output`);
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf("["), text.indexOf("{")].filter((value) => value >= 0).sort((a, b) => a - b);
    for (const start of starts) {
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
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function findStringByKey(value, key) {
  if (!value || typeof value !== "object") return null;
  if (typeof value[key] === "string" && value[key]) return value[key];
  for (const child of Object.values(value)) {
    const result = findStringByKey(child, key);
    if (result) return result;
  }
  return null;
}

function runWrangler(args, { capture = true } = {}) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["wrangler", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`wrangler command failed with exit code ${result.status}: ${(result.stderr || "").trim() || "<no stderr>"}`);
  }
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result.stdout || "";
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function migrationFileNames() {
  const entries = await fs.readdir(path.join(repoRoot, "drizzle"), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name);
}

async function prepareScopedMigration(targetMigration) {
  const [resources, generated, files] = await Promise.all([
    readJson("config/cloudflare-resources.json"),
    readJson("dist/server/wrangler.json"),
    migrationFileNames(),
  ]);

  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID is required");
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");

  const canonical = resources.d1;
  const generatedBinding = (generated.d1_databases || []).find((entry) => entry?.binding === canonical.binding);
  invariant(generated.name === "psipedia-sk", `Unexpected Worker name: ${generated.name ?? "<missing>"}`);
  invariant(generatedBinding, `Generated config is missing D1 binding ${canonical.binding}`);
  invariant(generatedBinding.database_name === canonical.database_name, "Generated D1 database_name mismatch");
  invariant(generatedBinding.database_id === canonical.database_id, "Generated D1 database_id mismatch");

  const selected = repoMigrationsThrough(files, targetMigration);
  const root = path.join(repoRoot, ".production-d1-backlog");
  await fs.mkdir(root, { recursive: true });
  const scopedDir = await fs.mkdtemp(path.join(root, `scoped-${migrationIndex(targetMigration)}-`));
  const migrationsDir = path.join(scopedDir, "migrations");
  await fs.mkdir(migrationsDir, { recursive: true });

  for (const fileName of selected) {
    await fs.copyFile(path.join(repoRoot, "drizzle", fileName), path.join(migrationsDir, fileName));
  }

  const scopedConfig = {
    ...generated,
    d1_databases: (generated.d1_databases || []).map((entry) =>
      entry?.binding === canonical.binding ? { ...entry, migrations_dir: "./migrations" } : entry),
  };
  const configPath = path.join(scopedDir, "wrangler.json");
  await fs.writeFile(configPath, `${JSON.stringify(scopedConfig, null, 2)}\n`);
  return { resources, generated, files, selected, root, scopedDir, configPath };
}

function execute(databaseName, configPath, sql) {
  const output = runWrangler([
    "d1", "execute", databaseName,
    "--remote",
    "--config", configPath,
    "--command", sql,
    "--json",
  ]);
  return rowsFromD1Json(parseJsonOutput(output, "wrangler d1 execute"));
}

function scalar(databaseName, configPath, sql) {
  const rows = execute(databaseName, configPath, sql);
  return Number(rows[0]?.count ?? 0);
}

function migrationHistory(databaseName, configPath) {
  return execute(databaseName, configPath, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
}

function schemaObjects(databaseName, configPath) {
  return execute(
    databaseName,
    configPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name",
  );
}

function schemaKey(row) {
  return `${row.type}:${row.name}`;
}

function assertSignatureFull(objects, migration) {
  const keys = new Set(objects.map(schemaKey));
  for (const signature of SIGNATURES[migration] || []) {
    invariant(keys.has(signature), `Missing schema signature after ${migration}: ${signature}`);
  }
}

function signaturePresence(objects, migration) {
  const keys = new Set(objects.map(schemaKey));
  const expected = SIGNATURES[migration] || [];
  return expected.filter((signature) => keys.has(signature));
}

function assertNoLaterObjects(objects, directoryColumns = []) {
  const keys = new Set(objects.map(schemaKey));
  const found = LATER_OBJECTS.filter((signature) => keys.has(signature));
  if (directoryColumns.some((row) => row.name === "archived_at")) {
    found.push("column:directory_profiles.archived_at");
  }
  invariant(found.length === 0, `Found schema objects from 0062 or later: ${found.join(", ")}`);
}

function legacy0058State(databaseName, configPath) {
  const checks = {
    puppyTaxonomy: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE category='Výcvik' AND portal_section='steniatka' AND portal_subpage IN ('pred-kupou-psa','vyber-plemena','vyber-chovatela')"),
    talentCategory: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE slug='psi-talent-2026-galanta' AND category='Výcvik'"),
    malformedSlugs: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE slug IN ('co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit','zakladny-vycvik-psat','ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk','viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka','banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py')"),
  };
  return {
    checks,
    total: Object.values(checks).reduce((sum, value) => sum + value, 0),
  };
}

function baseCounts(databaseName, configPath) {
  return {
    managedArticles: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM managed_articles"),
    directoryProfiles: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM directory_profiles"),
    helpOrganizations: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM help_organizations"),
    managedEvents: scalar(databaseName, configPath, "SELECT COUNT(*) AS count FROM managed_events"),
  };
}

function partnerSafeCounts(databaseName, configPath, objects) {
  const byName = new Map(objects.map((row) => [row.name, row]));
  const output = {};
  for (const table of ["partner_accounts", "partner_resources", "partner_memberships", "partner_audit_events", "partner_commercial_interests"]) {
    if (byName.get(table)?.type === "table") {
      output[table] = scalar(databaseName, configPath, `SELECT COUNT(*) AS count FROM ${table}`);
    }
  }
  return output;
}

function integrityState(databaseName, configPath) {
  return {
    orphanedResources: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_resources r WHERE (r.directory_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM directory_profiles d WHERE d.id=r.directory_profile_id)) OR (r.help_organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM help_organizations o WHERE o.id=r.help_organization_id)) OR (r.managed_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM managed_events e WHERE e.id=r.managed_event_id))"),
    orphanedMembershipAccounts: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_memberships m WHERE NOT EXISTS (SELECT 1 FROM partner_accounts a WHERE a.id=m.account_id)"),
    orphanedMembershipResources: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_memberships m WHERE NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.id=m.resource_id)"),
    orphanedCommercialAccounts: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_commercial_interests c WHERE NOT EXISTS (SELECT 1 FROM partner_accounts a WHERE a.id=c.account_id)"),
    orphanedCommercialResources: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM partner_commercial_interests c WHERE c.resource_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM partner_resources r WHERE r.id=c.resource_id)"),
  };
}

function assertIntegrityClean(state) {
  for (const [key, value] of Object.entries(state)) {
    invariant(value === 0, `Partner integrity check failed: ${key}=${value}`);
  }
}

function auditEvents(databaseName, configPath) {
  return execute(databaseName, configPath,
    "SELECT id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at FROM partner_audit_events ORDER BY id");
}

function assertRowsPreserved(beforeRows, afterRows, label) {
  const after = new Map(afterRows.map((row) => [String(row.id), row]));
  for (const before of beforeRows) {
    const current = after.get(String(before.id));
    invariant(current, `${label} row disappeared: ${before.id}`);
    invariant(JSON.stringify(current) === JSON.stringify(before), `${label} row changed unexpectedly: ${before.id}`);
  }
}

async function remoteInfo(databaseName, configPath) {
  return parseJsonOutput(
    runWrangler(["d1", "info", databaseName, "--config", configPath, "--json"]),
    "wrangler d1 info",
  );
}

async function recoveryBookmark(databaseName, configPath) {
  const payload = parseJsonOutput(
    runWrangler(["d1", "time-travel", "info", databaseName, "--config", configPath, "--json"]),
    "wrangler d1 time-travel info",
  );
  const bookmark = findStringByKey(payload, "bookmark");
  invariant(bookmark, "D1 Time Travel did not return a recovery bookmark");
  return bookmark;
}

async function preflight() {
  await fs.rm(path.join(repoRoot, ".production-d1-backlog"), { recursive: true, force: true });
  const prepared = await prepareScopedMigration(BACKLOG_MIGRATIONS.at(-1));
  const databaseName = prepared.resources.d1.database_name;

  const info = await remoteInfo(databaseName, prepared.configPath);
  const serialized = JSON.stringify(info);
  invariant(serialized.includes(prepared.resources.d1.database_id), "D1 info database ID mismatch");
  invariant(serialized.includes(prepared.resources.d1.database_name), "D1 info database name mismatch");

  const history = migrationHistory(databaseName, prepared.configPath);
  const historyNames = history.map((row) => String(row.name));
  validateBacklogHistory(historyNames, prepared.files);

  const objects = schemaObjects(databaseName, prepared.configPath);
  for (const migration of BACKLOG_MIGRATIONS.slice(1)) {
    const present = signaturePresence(objects, migration);
    invariant(present.length === 0, `Physical schema drift before backlog rollout: ${migration} already has ${present.join(", ")}`);
  }
  const directoryColumns = execute(databaseName, prepared.configPath, "PRAGMA table_info('directory_profiles')");
  assertNoLaterObjects(objects, directoryColumns);

  const legacy = legacy0058State(databaseName, prepared.configPath);
  const counts = baseCounts(databaseName, prepared.configPath);
  const bookmark = await recoveryBookmark(databaseName, prepared.configPath);

  const internal = {
    baselineHistory: historyNames,
    databaseName,
    databaseId: prepared.resources.d1.database_id,
    accountId: prepared.resources.account_id,
    recoveryBookmark: bookmark,
    legacy0058Before: legacy,
    baseCountsBefore: counts,
  };
  await writeJson(".production-d1-backlog/preflight-internal.json", internal);
  await writeJson(".production-d1-backlog/preflight-report.json", {
    rollout: BACKLOG_MIGRATIONS,
    latestRecordedMigration: historyNames.at(-1) ?? null,
    productionTarget: {
      worker: prepared.generated.name,
      accountId: prepared.resources.account_id,
      databaseName,
      databaseId: prepared.resources.d1.database_id,
      binding: prepared.resources.d1.binding,
    },
    recoveryMechanism: "D1 Time Travel",
    recoveryBookmark: bookmark,
    legacy0058Before: legacy,
    baseCountsBefore: counts,
    laterSchemaObjectsPresent: false,
    physical0059Through0061Present: false,
    safeToApply: true,
  });

  console.log(`[backlog] preflight PASS — latest=${historyNames.at(-1)}; legacy0058=${legacy.total}`);
  console.log(`[backlog] recovery bookmark — ${bookmark}`);
}

function previousMigration(target) {
  const index = BACKLOG_MIGRATIONS.indexOf(target);
  invariant(index >= 0, `Unsupported backlog target: ${target}`);
  return index === 0 ? BACKLOG_BASE_MIGRATION : BACKLOG_MIGRATIONS[index - 1];
}

async function applyStep(target) {
  invariant(BACKLOG_MIGRATIONS.includes(target), `Unsupported backlog target: ${target}`);
  const prepared = await prepareScopedMigration(target);
  const internal = await readJson(".production-d1-backlog/preflight-internal.json");
  invariant(internal.databaseId === prepared.resources.d1.database_id, "Preflight DB identity mismatch");

  const historyBefore = migrationHistory(prepared.resources.d1.database_name, prepared.configPath).map((row) => String(row.name));
  invariant(historyBefore.at(-1) === previousMigration(target),
    `Cannot apply ${target}; current latest migration is ${historyBefore.at(-1) ?? "<none>"}, expected ${previousMigration(target)}`);

  if (target === "0061_partner_commercial_interests.sql") {
    const internalUpdated = {
      ...internal,
      auditEventsBefore0061: auditEvents(prepared.resources.d1.database_name, prepared.configPath),
    };
    await writeJson(".production-d1-backlog/preflight-internal.json", internalUpdated);
  }

  runWrangler([
    "d1", "migrations", "apply", prepared.resources.d1.database_name,
    "--remote",
    "--config", prepared.configPath,
  ], { capture: false });
}

async function verifyStep(target) {
  invariant(BACKLOG_MIGRATIONS.includes(target), `Unsupported backlog target: ${target}`);
  const prepared = await prepareScopedMigration(target);
  const databaseName = prepared.resources.d1.database_name;
  const internal = await readJson(".production-d1-backlog/preflight-internal.json");

  const historyNames = migrationHistory(databaseName, prepared.configPath).map((row) => String(row.name));
  const targetPosition = BACKLOG_MIGRATIONS.indexOf(target);
  const expected = [...internal.baselineHistory, ...BACKLOG_MIGRATIONS.slice(0, targetPosition + 1)];
  invariant(historyNames.length === expected.length && historyNames.every((name, index) => name === expected[index]),
    `Unexpected migration history after ${target}`);

  const objects = schemaObjects(databaseName, prepared.configPath);
  const directoryColumns = execute(databaseName, prepared.configPath, "PRAGMA table_info('directory_profiles')");
  assertNoLaterObjects(objects, directoryColumns);

  const report = {
    target,
    latestRecordedMigration: historyNames.at(-1),
    laterSchemaObjectsPresent: false,
  };

  if (targetPosition >= 0) {
    const legacy = legacy0058State(databaseName, prepared.configPath);
    invariant(legacy.total === 0, `0058 cleanup is incomplete; legacy rows remain: ${legacy.total}`);
    invariant(baseCounts(databaseName, prepared.configPath).managedArticles === internal.baseCountsBefore.managedArticles,
      "managed_articles count changed unexpectedly during 0058 cleanup");
    report.legacy0058 = legacy;
  }
  if (targetPosition >= 1) {
    assertSignatureFull(objects, "0059_partner_auth_foundation.sql");
    report.partnerCounts = partnerSafeCounts(databaseName, prepared.configPath, objects);
  }
  if (targetPosition >= 2) {
    assertSignatureFull(objects, "0060_partner_memberships_admin.sql");
    report.partnerCounts = partnerSafeCounts(databaseName, prepared.configPath, objects);
  }
  if (targetPosition >= 3) {
    assertSignatureFull(objects, "0061_partner_commercial_interests.sql");
    const auditSql = String(objects.find((row) => row.name === "partner_audit_events")?.sql ?? "");
    for (const action of ["COMMERCIAL_INTEREST_CREATED", "COMMERCIAL_INTEREST_STATUS_CHANGED", "COMMERCIAL_INTEREST_NOTE_UPDATED"]) {
      invariant(auditSql.includes(action), `partner_audit_events is missing 0061 action: ${action}`);
    }
    const afterAudit = auditEvents(databaseName, prepared.configPath);
    assertRowsPreserved(internal.auditEventsBefore0061 || [], afterAudit, "partner_audit_events");
    const integrity = integrityState(databaseName, prepared.configPath);
    assertIntegrityClean(integrity);
    report.integrity = integrity;
    report.partnerCounts = partnerSafeCounts(databaseName, prepared.configPath, objects);
    report.preservedAuditRows = (internal.auditEventsBefore0061 || []).length;
  }

  await writeJson(`.production-d1-backlog/step-${String(migrationIndex(target)).padStart(4, "0")}-report.json`, report);
  console.log(`[backlog] verify PASS — ${target}`);
}

async function postflight() {
  const prepared = await prepareScopedMigration(BACKLOG_MIGRATIONS.at(-1));
  const databaseName = prepared.resources.d1.database_name;
  const internal = await readJson(".production-d1-backlog/preflight-internal.json");

  const historyNames = migrationHistory(databaseName, prepared.configPath).map((row) => String(row.name));
  const expected = [...internal.baselineHistory, ...BACKLOG_MIGRATIONS];
  invariant(historyNames.length === expected.length && historyNames.every((name, index) => name === expected[index]),
    "Postflight history is not exactly 0057 baseline plus 0058-0061");

  const objects = schemaObjects(databaseName, prepared.configPath);
  const directoryColumns = execute(databaseName, prepared.configPath, "PRAGMA table_info('directory_profiles')");
  assertNoLaterObjects(objects, directoryColumns);
  for (const migration of BACKLOG_MIGRATIONS.slice(1)) assertSignatureFull(objects, migration);

  const legacy = legacy0058State(databaseName, prepared.configPath);
  invariant(legacy.total === 0, "0058 legacy cleanup predicates still match rows after rollout");

  const countsAfter = baseCounts(databaseName, prepared.configPath);
  for (const [key, value] of Object.entries(internal.baseCountsBefore)) {
    invariant(countsAfter[key] === value, `Base entity count changed unexpectedly: ${key}`);
  }

  const integrity = integrityState(databaseName, prepared.configPath);
  assertIntegrityClean(integrity);

  const auditSql = String(objects.find((row) => row.name === "partner_audit_events")?.sql ?? "");
  for (const action of ["COMMERCIAL_INTEREST_CREATED", "COMMERCIAL_INTEREST_STATUS_CHANGED", "COMMERCIAL_INTEREST_NOTE_UPDATED"]) {
    invariant(auditSql.includes(action), `Missing 0061 audit action after rollout: ${action}`);
  }

  const afterAudit = auditEvents(databaseName, prepared.configPath);
  assertRowsPreserved(internal.auditEventsBefore0061 || [], afterAudit, "partner_audit_events");

  await writeJson(".production-d1-backlog/postflight-report.json", {
    rollout: BACKLOG_MIGRATIONS,
    latestRecordedMigration: historyNames.at(-1),
    productionTarget: {
      accountId: prepared.resources.account_id,
      databaseName,
      databaseId: prepared.resources.d1.database_id,
    },
    legacy0058After: legacy,
    baseCountsBefore: internal.baseCountsBefore,
    baseCountsAfter: countsAfter,
    partnerCounts: partnerSafeCounts(databaseName, prepared.configPath, objects),
    integrity,
    preservedAuditRows: (internal.auditEventsBefore0061 || []).length,
    laterSchemaObjectsPresent: false,
    migration0062OrLaterApplied: false,
    dataIntegrity: "PASS",
    readyFor0062Preflight: true,
  });

  console.log("[backlog] postflight PASS — production history now ends exactly at 0061");
}

async function verifyCurrent() {
  await fs.rm(path.join(repoRoot, ".production-d1-backlog-verification"), { recursive: true, force: true });
  const prepared = await prepareScopedMigration(BACKLOG_MIGRATIONS.at(-1));
  const databaseName = prepared.resources.d1.database_name;

  const info = await remoteInfo(databaseName, prepared.configPath);
  const serialized = JSON.stringify(info);
  invariant(serialized.includes(prepared.resources.d1.database_id), "D1 info database ID mismatch");
  invariant(serialized.includes(prepared.resources.d1.database_name), "D1 info database name mismatch");

  const historyNames = migrationHistory(databaseName, prepared.configPath).map((row) => String(row.name));
  const expectedBase = repoMigrationsThrough(prepared.files, BACKLOG_BASE_MIGRATION);
  const expected = [...expectedBase, ...BACKLOG_MIGRATIONS];
  invariant(
    historyNames.length === expected.length && historyNames.every((name, index) => name === expected[index]),
    "Verification history must end exactly at 0061 with no gaps or later migrations",
  );

  const objects = schemaObjects(databaseName, prepared.configPath);
  const directoryColumns = execute(databaseName, prepared.configPath, "PRAGMA table_info('directory_profiles')");
  assertNoLaterObjects(objects, directoryColumns);
  for (const migration of BACKLOG_MIGRATIONS.slice(1)) assertSignatureFull(objects, migration);

  const legacy = legacy0058State(databaseName, prepared.configPath);
  invariant(legacy.total === 0, "0058 legacy cleanup predicates still match rows");

  const integrity = integrityState(databaseName, prepared.configPath);
  assertIntegrityClean(integrity);

  const auditSql = String(objects.find((row) => row.name === "partner_audit_events")?.sql ?? "");
  for (const action of ["COMMERCIAL_INTEREST_CREATED", "COMMERCIAL_INTEREST_STATUS_CHANGED", "COMMERCIAL_INTEREST_NOTE_UPDATED"]) {
    invariant(auditSql.includes(action), `Missing 0061 audit action during verification: ${action}`);
  }

  await writeJson(".production-d1-backlog-verification/verification-report.json", {
    verificationMode: "read-only",
    latestRecordedMigration: historyNames.at(-1),
    productionTarget: {
      accountId: prepared.resources.account_id,
      databaseName,
      databaseId: prepared.resources.d1.database_id,
    },
    legacy0058After: legacy,
    partnerCounts: partnerSafeCounts(databaseName, prepared.configPath, objects),
    integrity,
    laterSchemaObjectsPresent: false,
    migration0062OrLaterApplied: false,
    dataIntegrity: "PASS",
    readyFor0062Preflight: true,
  });
  console.log("[backlog] verification-only PASS — production history ends exactly at 0061");
}

async function runCli() {
  const command = process.argv[2];
  if (command === "preflight") return preflight();
  if (command === "apply-step") return applyStep(process.argv[3]);
  if (command === "verify-step") return verifyStep(process.argv[3]);
  if (command === "postflight") return postflight();
  if (command === "verify-current") return verifyCurrent();
  throw new Error("Usage: node scripts/production-d1-backlog-rollout.mjs <preflight|apply-step|verify-step|postflight|verify-current> [migration]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
