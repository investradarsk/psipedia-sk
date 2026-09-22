import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_MIGRATIONS = Object.freeze([
  "0058_public_integrity_cleanup.sql",
  "0059_partner_auth_foundation.sql",
  "0060_partner_memberships_admin.sql",
  "0061_partner_commercial_interests.sql",
]);

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
    "index:partner_memberships_active_unique",
    "index:partner_memberships_account_active_idx",
    "index:partner_memberships_resource_active_idx",
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

const REVIEW_TABLES = Object.freeze([
  "review_authors",
  "review_auth_notification_outbox",
  "profile_reviews",
  "profile_review_rating_values",
  "profile_review_provider_replies",
  "profile_review_helpful_votes",
  "profile_review_reports",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJsonOutput(output, label) {
  const text = output.trim();
  invariant(text, `${label} returned empty output`);
  try {
    return JSON.parse(text);
  } catch {
    const firstArray = text.indexOf("[");
    const lastArray = text.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      try { return JSON.parse(text.slice(firstArray, lastArray + 1)); } catch {}
    }
    const firstObject = text.indexOf("{");
    const lastObject = text.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      try { return JSON.parse(text.slice(firstObject, lastObject + 1)); } catch {}
    }
  }
  throw new Error(`${label} did not return parseable JSON`);
}

function rowsFromD1Json(payload) {
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

function runWrangler(args) {
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
  return result.stdout || "";
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function prepareConfig() {
  const resources = await readJson("config/cloudflare-resources.json");
  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID is required");
  invariant(resources.account_id === process.env.CLOUDFLARE_ACCOUNT_ID, "Cloudflare account mismatch");

  const dir = path.join(repoRoot, ".production-d1-history-audit");
  await fs.mkdir(dir, { recursive: true });
  const configPath = path.join(dir, "wrangler.json");
  const config = {
    name: "psipedia-sk",
    compatibility_date: "2026-08-23",
    d1_databases: [{
      binding: resources.d1.binding,
      database_name: resources.d1.database_name,
      database_id: resources.d1.database_id,
    }],
  };
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { resources, dir, configPath };
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

function objectKey(row) {
  return `${row.type}:${row.name}`;
}

function signatureState(schemaObjects, signatures) {
  const keys = new Set(schemaObjects.map(objectKey));
  const present = signatures.filter((signature) => keys.has(signature));
  return {
    expected: signatures,
    present,
    missing: signatures.filter((signature) => !keys.has(signature)),
    state: present.length === 0 ? "NONE" : present.length === signatures.length ? "FULL" : "PARTIAL",
  };
}

export function classifyHistoryAudit({
  historyNames,
  migration0058LegacyRows,
  signature0059,
  signature0060,
  signature0061,
  migration0061AuditActionsPresent,
  laterPhysicalObjects,
}) {
  const missingHistory = EXPECTED_MIGRATIONS.filter((name) => !historyNames.includes(name));
  const structuralStates = [signature0059.state, signature0060.state, signature0061.state];
  const anyPartial = structuralStates.includes("PARTIAL");
  const allNone = structuralStates.every((state) => state === "NONE");
  const allFull = structuralStates.every((state) => state === "FULL");
  const anyFull = structuralStates.includes("FULL");

  if (missingHistory.length === 0) {
    return { classification: "HISTORY_COMPLETE_THROUGH_0061", missingHistory, safeToRun0062Preflight: true };
  }
  if (laterPhysicalObjects.length > 0 || anyPartial) {
    return { classification: "PARTIAL_SCHEMA_DRIFT", missingHistory, safeToRun0062Preflight: false };
  }
  if (allFull && migration0061AuditActionsPresent) {
    return { classification: "HISTORY_SCHEMA_DRIFT", missingHistory, safeToRun0062Preflight: false };
  }
  if (allNone) {
    return {
      classification: "MIGRATION_BACKLOG",
      missingHistory,
      safeToRun0062Preflight: false,
      migration0058LogicalState: migration0058LegacyRows === 0 ? "CLEAN_OR_ALREADY_EFFECTIVE" : "LEGACY_ROWS_REMAIN",
    };
  }
  if (anyFull) {
    return { classification: "MIXED_HISTORY_SCHEMA_DRIFT", missingHistory, safeToRun0062Preflight: false };
  }
  return { classification: "UNRESOLVED_HISTORY_STATE", missingHistory, safeToRun0062Preflight: false };
}

async function audit() {
  const { resources, dir, configPath } = await prepareConfig();
  const databaseName = resources.d1.database_name;

  const infoPayload = parseJsonOutput(
    runWrangler(["d1", "info", databaseName, "--config", configPath, "--json"]),
    "wrangler d1 info",
  );
  const serializedInfo = JSON.stringify(infoPayload);
  invariant(serializedInfo.includes(resources.d1.database_id), "D1 info database ID does not match canonical production target");
  invariant(serializedInfo.includes(resources.d1.database_name), "D1 info database name does not match canonical production target");

  const history = execute(databaseName, configPath, "SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
  const historyNames = history.map((row) => String(row.name));
  const schemaObjects = execute(
    databaseName,
    configPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name",
  );
  const schemaByName = new Map(schemaObjects.map((row) => [String(row.name), row]));

  const signature0059 = signatureState(schemaObjects, SIGNATURES["0059_partner_auth_foundation.sql"]);
  const signature0060 = signatureState(schemaObjects, SIGNATURES["0060_partner_memberships_admin.sql"]);
  const signature0061 = signatureState(schemaObjects, SIGNATURES["0061_partner_commercial_interests.sql"]);

  const auditSql = String(schemaByName.get("partner_audit_events")?.sql ?? "");
  const migration0061AuditActionsPresent = [
    "COMMERCIAL_INTEREST_CREATED",
    "COMMERCIAL_INTEREST_STATUS_CHANGED",
    "COMMERCIAL_INTEREST_NOTE_UPDATED",
  ].every((value) => auditSql.includes(value));

  const legacy0058Checks = {
    puppyTaxonomy: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE category='Výcvik' AND portal_section='steniatka' AND portal_subpage IN ('pred-kupou-psa','vyber-plemena','vyber-chovatela')"),
    talentCategory: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE slug='psi-talent-2026-galanta' AND category='Výcvik'"),
    malformedSlugs: scalar(databaseName, configPath,
      "SELECT COUNT(*) AS count FROM managed_articles WHERE slug IN ('co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit','zakladny-vycvik-psat','ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk','viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka','banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py')"),
  };
  const migration0058LegacyRows = Object.values(legacy0058Checks).reduce((sum, value) => sum + value, 0);

  const directoryColumns = execute(databaseName, configPath, "PRAGMA table_info('directory_profiles')");
  const archivedAtPresent = directoryColumns.some((row) => row.name === "archived_at");
  const physicalReviewTables = REVIEW_TABLES.filter((name) => schemaByName.get(name)?.type === "table");
  const laterPhysicalObjects = [
    ...(archivedAtPresent ? ["column:directory_profiles.archived_at"] : []),
    ...physicalReviewTables.map((name) => `table:${name}`),
    ...(schemaByName.has("partner_claims") ? ["table:partner_claims"] : []),
    ...(schemaByName.has("partner_resource_verifications") ? ["table:partner_resource_verifications"] : []),
    ...(schemaByName.has("geo_points") ? ["table:geo_points"] : []),
  ];

  const classification = classifyHistoryAudit({
    historyNames,
    migration0058LegacyRows,
    signature0059,
    signature0060,
    signature0061,
    migration0061AuditActionsPresent,
    laterPhysicalObjects,
  });

  const safeCounts = {};
  for (const table of ["partner_accounts", "partner_resources", "partner_memberships", "partner_commercial_interests"]) {
    if (schemaByName.get(table)?.type === "table") {
      safeCounts[table] = scalar(databaseName, configPath, `SELECT COUNT(*) AS count FROM ${table}`);
    }
  }

  const report = {
    auditMode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    productionTarget: {
      worker: "psipedia-sk",
      binding: resources.d1.binding,
      databaseName: resources.d1.database_name,
      databaseId: resources.d1.database_id,
      accountId: resources.account_id,
    },
    migrationHistory: {
      latest: historyNames.at(-1) ?? null,
      names: historyNames,
      expected0058Through0061: EXPECTED_MIGRATIONS,
      missing0058Through0061: EXPECTED_MIGRATIONS.filter((name) => !historyNames.includes(name)),
    },
    physicalEvidence: {
      migration0058: {
        evidenceType: "DATA_ONLY_LOGICAL_CHECK",
        legacyRows: migration0058LegacyRows,
        checks: legacy0058Checks,
        note: "A clean result cannot prove that migration 0058 was recorded or executed; it only shows its legacy predicates no longer match rows.",
      },
      migration0059: signature0059,
      migration0060: signature0060,
      migration0061: {
        ...signature0061,
        commercialAuditActionsPresent: migration0061AuditActionsPresent,
      },
      laterThan0061: laterPhysicalObjects,
    },
    safeCounts,
    decision: classification,
  };

  await fs.writeFile(path.join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[history-audit] latest recorded migration: ${report.migrationHistory.latest ?? "<none>"}`);
  console.log(`[history-audit] missing 0058-0061: ${report.migrationHistory.missing0058Through0061.join(", ") || "<none>"}`);
  console.log(`[history-audit] 0058 legacy rows: ${migration0058LegacyRows}`);
  console.log(`[history-audit] 0059 physical state: ${signature0059.state}`);
  console.log(`[history-audit] 0060 physical state: ${signature0060.state}`);
  console.log(`[history-audit] 0061 physical state: ${signature0061.state}; audit actions=${migration0061AuditActionsPresent}`);
  console.log(`[history-audit] later physical objects: ${laterPhysicalObjects.join(", ") || "<none>"}`);
  console.log(`[history-audit] classification: ${classification.classification}`);

  if (!classification.safeToRun0062Preflight) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await audit();
}
