import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  explicitPrivateGeoSql,
  latestGoogleMapsActionSql,
} from "../lib/geo-admin-moderation-sql.ts";

const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE geo_points (id INTEGER PRIMARY KEY);
    CREATE TABLE help_organizations (id INTEGER PRIMARY KEY);
    CREATE TABLE moderation_events (
      id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, subject_id TEXT,
      action TEXT NOT NULL, actor_type TEXT, to_status TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX moderation_events_subject_created_idx
      ON moderation_events(resource_type,subject_id,created_at);
    INSERT INTO geo_points(id) VALUES (1),(2),(3),(4);
    INSERT INTO help_organizations(id) VALUES (1),(2),(3);
  `);
  const stmt = db.prepare("INSERT INTO moderation_events (id,resource_type,subject_id,action,actor_type,to_status,created_at) VALUES (?,?,?,?,?,?,?)");
  const rows = [
    ["a", "GEO_POINT", "1", "GEO_VISIBILITY_CHANGED", "ADMIN", "SKIPPED", "2026-10-01"],
    ["b", "GEO_POINT", "2", "GEO_VISIBILITY_CHANGED", "SYSTEM", "SKIPPED", "2026-10-01"],
    ["c", "GEO_POINT", "2", "GEO_VISIBILITY_CHANGED", "ADMIN", "RESOLVED", "2026-10-02"],
    ["d", "GEO_POINT", "1", "GOOGLE_MAPS_NOT_REQUIRED", "ADMIN", null, "2026-10-03"],
    ["e", "GEO_POINT", "1", "GOOGLE_MAPS_REQUIRED_AGAIN", "ADMIN", null, "2026-10-04"],
    // Equal timestamps must keep the existing lexical id DESC tie-breaker.
    ["f", "GEO_POINT", "1", "GOOGLE_MAPS_NOT_REQUIRED", "ADMIN", null, "2026-10-04"],
    ["g", "GEO_POINT", "3", "GOOGLE_MAPS_REQUIRED_AGAIN", "ADMIN", null, "2026-10-05"],
    ["h", "GEO_POINT", "3", "UNRELATED", "ADMIN", null, "2026-10-06"],
    ["i", "HELP_ORGANIZATION", "1", "GOOGLE_MAPS_NOT_REQUIRED", "ADMIN", null, "2026-10-03"],
    ["j", "HELP_ORGANIZATION", "1", "GOOGLE_MAPS_REQUIRED_AGAIN", "ADMIN", null, "2026-10-08"],
    ["k", "HELP_ORGANIZATION", "2", "GOOGLE_MAPS_NOT_REQUIRED", "ADMIN", null, "2026-10-08"],
    ["l", "HELP_ORGANIZATION", "2", "OTHER", "ADMIN", null, "2026-10-09"],
    ["m", "GEO_POINT", null, "GOOGLE_MAPS_NOT_REQUIRED", "ADMIN", null, "2026-10-10"],
  ];
  for (const row of rows) stmt.run(...row);
  return db;
}

const oldGeoSql = `
  WITH explicit_private AS (
    SELECT DISTINCT subject_id FROM moderation_events
    WHERE resource_type='GEO_POINT' AND action='GEO_VISIBILITY_CHANGED'
      AND actor_type='ADMIN' AND to_status='SKIPPED'
  ), map_review_ranked AS (
    SELECT subject_id,action,ROW_NUMBER() OVER (
      PARTITION BY subject_id ORDER BY created_at DESC,id DESC
    ) AS row_number FROM moderation_events
    WHERE resource_type='GEO_POINT'
      AND action IN ('GOOGLE_MAPS_NOT_REQUIRED','GOOGLE_MAPS_REQUIRED_AGAIN')
  ), map_review AS (
    SELECT subject_id,action FROM map_review_ranked WHERE row_number=1
  )
  SELECT g.id,
    CASE WHEN ep.subject_id IS NULL THEN 0 ELSE 1 END AS explicit_private,
    mr.action AS map_review_action
  FROM geo_points g
  LEFT JOIN explicit_private ep ON ep.subject_id=CAST(g.id AS TEXT)
  LEFT JOIN map_review mr ON mr.subject_id=CAST(g.id AS TEXT)
  ORDER BY g.id`;

const newGeoSql = `
  SELECT g.id,
    CASE WHEN ${explicitPrivateGeoSql("g.id")} THEN 1 ELSE 0 END AS explicit_private,
    ${latestGoogleMapsActionSql("g.id", "GEO_POINT")} AS map_review_action
  FROM geo_points g ORDER BY g.id`;

const oldOrganizationSql = `
  WITH organization_map_review_ranked AS (
    SELECT subject_id,action,ROW_NUMBER() OVER (
      PARTITION BY subject_id ORDER BY created_at DESC,id DESC
    ) AS row_number FROM moderation_events
    WHERE resource_type='HELP_ORGANIZATION'
      AND action IN ('GOOGLE_MAPS_NOT_REQUIRED','GOOGLE_MAPS_REQUIRED_AGAIN')
  ), organization_map_review AS (
    SELECT subject_id,action FROM organization_map_review_ranked WHERE row_number=1
  )
  SELECT o.id,omr.action AS organization_map_review_action
  FROM help_organizations o
  LEFT JOIN organization_map_review omr ON omr.subject_id=CAST(o.id AS TEXT)
  ORDER BY o.id`;

const newOrganizationSql = `
  SELECT o.id,
    ${latestGoogleMapsActionSql("o.id", "HELP_ORGANIZATION")} AS organization_map_review_action
  FROM help_organizations o ORDER BY o.id`;

test("indexed per-location moderation agrees with global ranked CTEs, including ties and overrides", () => {
  const db = fixture();
  try {
    const originalGeo = db.prepare(oldGeoSql).all();
    const indexedGeo = db.prepare(newGeoSql).all();
    assert.deepEqual(indexedGeo, originalGeo);
    assert.deepEqual(indexedGeo.map(row => [row.id, row.explicit_private, row.map_review_action]), [
      [1, 1, "GOOGLE_MAPS_NOT_REQUIRED"],
      [2, 0, null],
      [3, 0, "GOOGLE_MAPS_REQUIRED_AGAIN"],
      [4, 0, null],
    ]);
    assert.deepEqual(db.prepare(newOrganizationSql).all(), db.prepare(oldOrganizationSql).all());
  } finally { db.close(); }
});

test("the moderation lookup uses the existing subject index instead of full-history rankings", () => {
  const db = fixture();
  try {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${newGeoSql}`).all().map(row => String(row.detail));
    assert.ok(plan.some(line => line.includes("moderation_events_subject_created_idx")),
      "expected indexed subject lookup: " + plan.join(" / "));
    assert.ok(!plan.some(line => /SCAN (private_decision|map_decision)\b/.test(line)),
      "do not scan all moderation events: " + plan.join(" / "));
  } finally { db.close(); }
});

test("GEO admin query uses per-row lookups while retaining other canonical location ranking", () => {
  assert.match(operatorStore, /CASE WHEN \$\{explicitPrivateGeoSql\('g\.id'\)\} THEN 1 ELSE 0 END AS explicit_private/);
  assert.match(operatorStore, /\$\{latestGoogleMapsActionSql\('g\.id', 'GEO_POINT'\)\} AS map_review_action/);
  assert.match(operatorStore, /\$\{latestGoogleMapsActionSql\('o\.id', 'HELP_ORGANIZATION'\)\} AS organization_map_review_action/);
  assert.doesNotMatch(operatorStore, /map_review_ranked AS|organization_map_review_ranked AS|SELECT DISTINCT subject_id\s+FROM moderation_events/);
  assert.match(operatorStore, /organization_locations_ranked AS/);
  assert.match(operatorStore, /GEO_BASE_CTE/);
});
