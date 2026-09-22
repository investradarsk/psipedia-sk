import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TARGET_MIGRATION,
  buildScopedWranglerConfig,
  selectMigrationsThrough,
} from "../scripts/production-d1-migrate.mjs";

test("REVIEWS-1A-MIG scopes repository migrations through 0062 and excludes 0063", () => {
  const files = [
    ...Array.from({ length: 62 }, (_, index) => `${String(index).padStart(4, "0")}_migration.sql`),
    DEFAULT_TARGET_MIGRATION,
    "0063_partner_claims_verification.sql",
  ];
  const result = selectMigrationsThrough(files, DEFAULT_TARGET_MIGRATION);
  assert.equal(result.targetIndex, 62);
  assert.equal(result.selected.at(-1), DEFAULT_TARGET_MIGRATION);
  assert.deepEqual(result.excludedFuture, ["0063_partner_claims_verification.sql"]);
  assert.equal(result.selected.some((name) => name.startsWith("0063_")), false);
});

test("REVIEWS-1A-MIG refuses a migration gap before target", () => {
  const files = Array.from({ length: 63 }, (_, index) =>
    index === 62 ? DEFAULT_TARGET_MIGRATION : `${String(index).padStart(4, "0")}_migration.sql`,
  ).filter((name) => !name.startsWith("0048_"));
  assert.throws(
    () => selectMigrationsThrough(files, DEFAULT_TARGET_MIGRATION),
    /gap before target: 0048/,
  );
});

test("scoped Wrangler config keeps exact canonical production D1 identity", () => {
  const resources = {
    account_id: "account-a",
    d1: {
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "db-id",
      migrations_dir: "./drizzle",
    },
  };
  const generated = {
    name: "psipedia-sk",
    d1_databases: [{
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "db-id",
      migrations_dir: "../../drizzle",
    }],
  };
  const result = buildScopedWranglerConfig(generated, resources);
  assert.equal(result.d1_databases[0].database_name, "psipedia-sk-db");
  assert.equal(result.d1_databases[0].database_id, "db-id");
  assert.equal(result.d1_databases[0].migrations_dir, "./migrations");
});

test("scoped Wrangler config rejects a different production database id", () => {
  const resources = {
    d1: {
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "canonical-db-id",
    },
  };
  const generated = {
    d1_databases: [{
      binding: "DB",
      database_name: "psipedia-sk-db",
      database_id: "wrong-db-id",
    }],
  };
  assert.throws(
    () => buildScopedWranglerConfig(generated, resources),
    /database_id does not match canonical config/,
  );
});
