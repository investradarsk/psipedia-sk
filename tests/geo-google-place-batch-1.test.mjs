import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../drizzle/0098_geo_google_place_batch_1.sql", import.meta.url), "utf8");

const expectedIds = [254, 258, 259, 276, 277, 332, 333, 334, 350, 360, 371, 392, 393, 409, 422, 426, 429, 434, 436];

test("batch 1 is bounded to the researched directory profiles", () => {
  const ids = [...migration.matchAll(/directory_profile_id = (\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(ids, expectedIds);
  assert.equal(ids.length, 19);
});

test("batch 1 only enriches Google Place identity and never canonical addresses or coordinates", () => {
  assert.match(migration, /UPDATE geo_points/g);
  assert.doesNotMatch(migration, /UPDATE\s+directory_profiles/i);
  assert.doesNotMatch(migration, /SET[^;]*(?:latitude|longitude|street|house_number|postal_code|address\s*=)/i);
});

test("every write fails closed on exact current GEO state and source fingerprint", () => {
  const updates = migration.split(/(?=UPDATE geo_points)/).filter((part) => part.startsWith("UPDATE geo_points"));
  assert.equal(updates.length, 19);
  for (const update of updates) {
    assert.match(update, /geocode_status = 'RESOLVED'/);
    assert.match(update, /public_visibility = 'EXACT_PUBLIC'/);
    assert.match(update, /public_precision = 'EXACT'/);
    assert.match(update, /source_fingerprint = '[0-9a-f]{64}'/);
    assert.match(update, /resolved_source_fingerprint = source_fingerprint/);
    assert.match(update, /google_place_source_fingerprint <> source_fingerprint/);
    assert.match(update, /google_place_matched_at = CURRENT_TIMESTAMP/);
  }
});

test("batch 1 stores valid-looking Google Place IDs", () => {
  const placeIds = [...migration.matchAll(/google_place_id = '([^']+)'/g)].map((match) => match[1]);
  assert.equal(placeIds.length, 19);
  assert.ok(placeIds.every((id) => /^ChIJ[-_A-Za-z0-9]+$/.test(id)));
});
