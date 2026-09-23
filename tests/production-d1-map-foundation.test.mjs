import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MAP_FOUNDATION_BASE,
  MAP_FOUNDATION_MIGRATIONS,
  migrationsThrough,
} from "../scripts/production-d1-map-foundation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("MAP production rollout is exactly 0063 then 0064", () => {
  assert.equal(MAP_FOUNDATION_BASE, "0062_profile_reviews_foundation.sql");
  assert.deepEqual(MAP_FOUNDATION_MIGRATIONS, [
    "0063_partner_claims_verification.sql",
    "0064_geo_foundation.sql",
  ]);
});

test("scoped MAP rollout excludes 0065 and later", () => {
  const files = Array.from({ length: 66 }, (_, index) => {
    if (index === 62) return MAP_FOUNDATION_BASE;
    if (index === 63) return MAP_FOUNDATION_MIGRATIONS[0];
    if (index === 64) return MAP_FOUNDATION_MIGRATIONS[1];
    if (index === 65) return "0065_partner_profile_changes.sql";
    return `${String(index).padStart(4, "0")}_migration.sql`;
  });
  const selected = migrationsThrough(files, MAP_FOUNDATION_MIGRATIONS[1]);
  assert.equal(selected.at(-1), MAP_FOUNDATION_MIGRATIONS[1]);
  assert.equal(selected.some((name) => name.startsWith("0065_")), false);
});

test("MAP rollout refuses migration gaps", () => {
  const files = Array.from({ length: 65 }, (_, index) => {
    if (index === 62) return MAP_FOUNDATION_BASE;
    if (index === 63) return MAP_FOUNDATION_MIGRATIONS[0];
    if (index === 64) return MAP_FOUNDATION_MIGRATIONS[1];
    return `${String(index).padStart(4, "0")}_migration.sql`;
  }).filter((name) => !name.startsWith("0042_"));
  assert.throws(
    () => migrationsThrough(files, MAP_FOUNDATION_MIGRATIONS[1]),
    /gap before target: 0042/,
  );
});

test("MAP production workflow is manual, protected, sequential and deploy-free", async () => {
  const workflow = await readFile(
    path.join(repoRoot, ".github/workflows/production-d1-map-foundation.yml"),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /group:\s*production-d1-migration/);
  assert.match(workflow, /APPLY-0063-0064-psipedia-sk-db/);
  assert.match(workflow, /apply-step 0063_partner_claims_verification\.sql/);
  assert.match(workflow, /verify-0063/);
  assert.match(workflow, /apply-step 0064_geo_foundation\.sql/);
  assert.match(workflow, /verify-0064/);
  assert.match(workflow, /D1 Time Travel|Time Travel/);
  assert.match(workflow, /\/api\/map/);
  assert.doesNotMatch(workflow, /wrangler\s+deploy|deploy:cloudflare/);
});

test("0064 remains schema-only and cannot seed public coordinates", async () => {
  const migration = await readFile(path.join(repoRoot, "drizzle/0064_geo_foundation.sql"), "utf8");
  assert.match(migration, /CREATE TABLE geo_points/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+geo_points/i);
});

test("rollout runner never performs an automatic Time Travel restore", async () => {
  const script = await readFile(
    path.join(repoRoot, "scripts/production-d1-map-foundation.mjs"),
    "utf8",
  );
  assert.doesNotMatch(script, /time-travel",\s*"restore|time-travel\s+restore/i);
  assert.match(script, /recoveryBookmark/);
});
