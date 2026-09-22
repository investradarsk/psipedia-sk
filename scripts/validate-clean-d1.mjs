import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "../db/schema.ts";
import * as foundationSchema from "../db/foundation-schema.ts";
import * as lostFoundSchema from "../db/lost-found-dogs-schema.ts";
import * as adoptionSchema from "../db/adoption-schema.ts";
import * as helpOrganizationSchema from "../db/help-organization-schema.ts";
import * as partnerSchema from "../db/partner-schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostingConfig = JSON.parse(await fs.readFile(path.join(root, ".openai", "hosting.json"), "utf8"));
const resourceConfig = JSON.parse(await fs.readFile(path.join(root, "config", "cloudflare-resources.json"), "utf8"));
const sourceWranglerConfig = JSON.parse(await fs.readFile(path.join(root, "wrangler.jsonc"), "utf8"));
const canonicalD1Binding = resourceConfig.d1?.binding;
assert.equal(typeof canonicalD1Binding, "string", "canonical Cloudflare resource config must declare the D1 binding");
assert.ok(canonicalD1Binding, "canonical D1 binding must not be empty");
assert.equal(hostingConfig.d1, canonicalD1Binding, ".openai/hosting.json must mirror the canonical D1 binding");
assert.equal(typeof sourceWranglerConfig.compatibility_date, "string", "wrangler.jsonc must declare compatibility_date");

const canonicalMigrationsDir = path.join(root, "drizzle");
const workDir = path.join(root, ".tmp", "clean-d1");
const stagedMigrationsDir = path.join(workDir, "migrations");
const stateDir = path.join(workDir, "state");
const configPath = path.join(workDir, "wrangler.json");
const bootstrapPath = path.join(workDir, "legacy-adoption-bootstrap.sql");
const adoptionBoundary = "0038_adoption_staging_data.sql";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }

  return result.stdout ?? "";
}

function wrangler(args, options) {
  return run(npx, ["wrangler", ...args], options);
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function listCanonicalMigrations() {
  return (await fs.readdir(canonicalMigrationsDir))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function stageMigrations(names) {
  await fs.mkdir(stagedMigrationsDir, { recursive: true });
  for (const name of names) {
    await fs.copyFile(path.join(canonicalMigrationsDir, name), path.join(stagedMigrationsDir, name));
  }
}

async function writeConfig() {
  const config = {
    name: "psipedia-clean-d1-validation",
    main: "../../worker/index.ts",
    compatibility_date: sourceWranglerConfig.compatibility_date,
    d1_databases: [
      {
        binding: canonicalD1Binding,
        database_name: "psipedia-clean-d1-validation",
        database_id: "00000000-0000-0000-0000-000000000000",
        migrations_dir: "./migrations",
      },
    ],
  };
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function d1Args(...args) {
  return [
    "d1",
    ...args,
    "--local",
    "--config",
    configPath,
    "--persist-to",
    stateDir,
  ];
}

function applyMigrations() {
  wrangler(d1Args("migrations", "apply", canonicalD1Binding));
}

function executeSqlFile(filePath) {
  wrangler(d1Args("execute", canonicalD1Binding, "--file", filePath));
}

function query(sqlText) {
  const output = wrangler([...d1Args("execute", canonicalD1Binding, "--command", sqlText), "--json"], { capture: true });
  const parsed = JSON.parse(output);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.flatMap((entry) => entry.results ?? []);
}

async function writeLegacyAdoptionBootstrap() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "data", "imports", "adoptions-ready-2026-09-13.json"), "utf8"),
  );
  assert.equal(manifest.readyCount, 36, "adoption bootstrap manifest must declare 36 READY rows");
  assert.equal(manifest.ready.length, 36, "adoption bootstrap manifest must contain 36 READY rows");
  assert.equal(new Set(manifest.ready.map((row) => row.slug)).size, 36, "adoption bootstrap slugs must be unique");

  const slugs = manifest.ready.map((row) => sql(row.slug)).join(", ");
  const createdAt = "2026-09-13T00:00:00.000Z";
  const columns = [
    "slug", "title", "category", "status", "excerpt", "description", "organization", "dog_name", "breed",
    "city", "region", "action_label", "action_url", "contact_note", "image_url", "verified", "urgent", "resolved",
    "seo_json", "created_at", "updated_at", "published_at", "created_by", "updated_by",
  ];

  const values = manifest.ready.map((row) => [
    row.slug,
    row.title,
    "adopcia",
    "published",
    row.excerpt,
    row.description ?? "",
    row.organization,
    row.dogName ?? "",
    row.breed ?? "",
    row.city,
    row.region,
    "Adoptovať",
    row.actionUrl,
    row.contactNote ?? "",
    row.imageUrl,
    1,
    0,
    0,
    "{}",
    createdAt,
    createdAt,
    createdAt,
    "clean-d1-validation:legacy-fixture",
    "clean-d1-validation:legacy-fixture",
  ].map(sql).join(", "));

  const bootstrap = `-- Local validation fixture only. Never applied as a migration or to remote D1.\n` +
    `-- Reconstructs the exact legacy adoption precondition required by immutable migration 0038.\n` +
    `DELETE FROM help_cases WHERE category = 'adopcia' AND slug IN (${slugs});\n` +
    `INSERT INTO help_cases (${columns.join(", ")}) VALUES\n  (${values.join("),\n  (")});\n` +
    `DROP TABLE IF EXISTS __psipedia_clean_d1_fixture_guard;\n` +
    `CREATE TABLE __psipedia_clean_d1_fixture_guard (ok INTEGER NOT NULL CHECK (ok = 1));\n` +
    `INSERT INTO __psipedia_clean_d1_fixture_guard (ok)\n` +
    `SELECT CASE WHEN COUNT(*) = 36 THEN 1 ELSE 0 END\n` +
    `FROM help_cases WHERE category = 'adopcia' AND status = 'published' AND slug IN (${slugs});\n` +
    `DROP TABLE __psipedia_clean_d1_fixture_guard;\n`;

  await fs.writeFile(bootstrapPath, bootstrap);
}

function collectExpectedSchema() {
  const expected = new Map();
  const modules = [schema, foundationSchema, lostFoundSchema, adoptionSchema, helpOrganizationSchema, partnerSchema];

  for (const schemaModule of modules) {
    for (const value of Object.values(schemaModule)) {
      try {
        const config = getTableConfig(value);
        if (!config?.name || !Array.isArray(config.columns)) continue;
        expected.set(config.name, config.columns.map((column) => column.name).sort());
      } catch {
        // Schema modules may export non-table helpers; only SQLite tables are part of this contract.
      }
    }
  }

  assert.ok(expected.size > 0, "expected Drizzle schema table set must not be empty");
  return expected;
}

function validateSchema() {
  const expected = collectExpectedSchema();
  const actualTables = new Set(
    query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
      .map((row) => row.name),
  );

  const missingTables = [...expected.keys()].filter((name) => !actualTables.has(name));
  assert.deepEqual(missingTables, [], `missing Drizzle tables after full migration chain: ${missingTables.join(", ")}`);

  for (const [table, expectedColumns] of expected) {
    const actualColumns = new Set(
      query(`PRAGMA table_info(${JSON.stringify(table)});`).map((row) => row.name),
    );
    const missingColumns = expectedColumns.filter((column) => !actualColumns.has(column));
    assert.deepEqual(
      missingColumns,
      [],
      `missing Drizzle columns after full migration chain for ${table}: ${missingColumns.join(", ")}`,
    );
  }

  return expected.size;
}

function validateMigrationMetadata(canonicalMigrations) {
  const applied = query("SELECT name FROM d1_migrations ORDER BY id;").map((row) => row.name);
  assert.deepEqual(applied, canonicalMigrations, "d1_migrations must exactly match the canonical SQL chain");
}

function validateCriticalState() {
  const [adoptions] = query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
           COUNT(DISTINCT organization_id) AS organizations
    FROM adoption_dogs
    WHERE created_by = 'adoption-staging-import:v1';
  `);
  assert.equal(Number(adoptions.total), 36, "canonical adoption cohort must contain 36 rows");
  assert.equal(Number(adoptions.active), 36, "canonical adoption cohort must contain 36 ACTIVE rows");
  assert.equal(Number(adoptions.organizations), 4, "canonical adoption cohort must map to 4 organizations");

  const [fixture] = query(
    "SELECT COUNT(*) AS total FROM help_cases WHERE created_by = 'clean-d1-validation:legacy-fixture';",
  );
  assert.equal(Number(fixture.total), 36, "local legacy fixture must remain isolated to 36 rows");
}

async function main() {
  const canonicalMigrations = await listCanonicalMigrations();
  const boundaryIndex = canonicalMigrations.indexOf(adoptionBoundary);
  assert.ok(boundaryIndex > 0, `${adoptionBoundary} must exist in the canonical migration chain`);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  await writeConfig();
  await writeLegacyAdoptionBootstrap();

  const beforeDataMigration = canonicalMigrations.slice(0, boundaryIndex);
  const fromDataMigration = canonicalMigrations.slice(boundaryIndex);

  console.log(`[clean-d1] applying ${beforeDataMigration.length} canonical migrations to an empty local D1`);
  await stageMigrations(beforeDataMigration);
  applyMigrations();

  console.log("[clean-d1] restoring the historical local-only adoption precondition required by 0038");
  executeSqlFile(bootstrapPath);

  console.log(`[clean-d1] applying remaining ${fromDataMigration.length} canonical migrations unchanged`);
  await stageMigrations(fromDataMigration);
  applyMigrations();

  validateMigrationMetadata(canonicalMigrations);
  const tableCount = validateSchema();
  validateCriticalState();

  console.log(`[clean-d1] PASS — ${canonicalMigrations.length} migrations, ${tableCount} Drizzle tables, schema and critical state verified`);
}

await main();
