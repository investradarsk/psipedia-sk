import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  hashHelpBackfillValue,
  prepareReviewedHelpBackfill,
  helpLegacyCoverageQueries,
  helpLegacyFieldCandidateQueries,
} from "../lib/help-sql-reviewed-backfill.mjs";

const SOURCE_REV = "2026-10-01T10:00:00.000Z";
const TARGET_REV = "2026-10-02T12:00:00.000Z";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "CREATE TABLE help_cases (" +
    "id INTEGER PRIMARY KEY,slug TEXT,category TEXT,status TEXT,updated_at TEXT," +
    "image_url TEXT,excerpt TEXT,description TEXT);" +
    "CREATE TABLE adoption_dogs (" +
    "id INTEGER PRIMARY KEY,slug TEXT,status TEXT,updated_at TEXT,updated_by TEXT," +
    "created_by TEXT,main_image TEXT,short_description TEXT,description TEXT);" +
    "CREATE TABLE help_organizations (" +
    "id INTEGER PRIMARY KEY,slug TEXT,status TEXT,updated_at TEXT,updated_by TEXT," +
    "import_key TEXT,image_url TEXT,short_description TEXT,description TEXT);"
  );
  sqlite.prepare("INSERT INTO help_cases VALUES (?,?,?,?,?,?,?,?)")
    .run(11, "falco", "adopcia", "published", SOURCE_REV,
      "/legacy-falco.jpg", "Pôvodný opis", "Dlhší pôvodný príbeh");
  sqlite.prepare("INSERT INTO adoption_dogs VALUES (?,?,?,?,?,?,?,?,?)")
    .run(21, "falco", "ACTIVE", TARGET_REV, "admin",
      "adoption-staging-import:v1", null, "Novší krátky opis", "Novší príbeh");
  sqlite.prepare("INSERT INTO help_cases VALUES (?,?,?,?,?,?,?,?)")
    .run(12, "pomoc-oz-labka", "utulky", "published", SOURCE_REV,
      "/legacy-org.jpg", "Združenie", "Dlhý text útulku");
  sqlite.prepare("INSERT INTO help_organizations VALUES (?,?,?,?,?,?,?,?,?)")
    .run(22, "pomoc-oz-labka", "PUBLISHED", TARGET_REV, "admin",
      "help-org:pomoc-oz-labka", null, "Nové krátke info", "");
  const calls = [];
  const database = {
    prepare(sql) {
      calls.push(sql);
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          const row = statement.get(...(this.values ?? []));
          return row ?? null;
        },
      };
    },
  };
  return { sqlite, database, calls };
}
function receipt(overrides = {}) {
  return {
    agenda: "adoptions", field: "main_image",
    sourceId: 11, targetId: 21, slug: "falco",
    sourceUpdatedAt: SOURCE_REV, targetUpdatedAt: TARGET_REV,
    sourceSha256: hashHelpBackfillValue("/legacy-falco.jpg"),
    targetWas: "NULL", approved: true, ...overrides,
  };
}

test("reviewed exact identity plans only one guarded, atomic SQL column update", async () => {
  const { sqlite, database, calls } = fixture();
  try {
    const plan = await prepareReviewedHelpBackfill(database, receipt());
    assert.equal(plan.decision, "READY");
    assert.equal(plan.agenda, "adoptions");
    assert.equal(plan.field, "main_image");
    assert.match(plan.statement.sql, /^UPDATE adoption_dogs SET main_image=\?,updated_at=\?,updated_by=\?/);
    assert.match(plan.statement.sql, /main_image IS NULL/);
    assert.match(plan.statement.sql, /EXISTS \(SELECT 1 FROM help_cases h/);
    assert.match(plan.statement.sql, /h.image_url=\?/);
    assert.equal(calls.every((query) => query.startsWith("SELECT ")), true,
      "planning must never perform a write");
    const updated = sqlite.prepare(plan.statement.sql).run(...plan.statement.binds);
    assert.equal(updated.changes, 1);
    const canonical = sqlite.prepare("SELECT * FROM adoption_dogs WHERE id=21").get();
    assert.equal(canonical.main_image, "/legacy-falco.jpg");
    assert.equal(canonical.short_description, "Novší krátky opis");
    assert.equal(canonical.description, "Novší príbeh");
    assert.equal(canonical.updated_by, "help-sql-reviewed-backfill:v1");
    const second = await prepareReviewedHelpBackfill(database, receipt());
    assert.equal(second.decision, "ALREADY_APPLIED");
    assert.equal(second.statement, undefined);
  } finally { sqlite.close(); }
});

test("explicitly empty target requires an EXACT reviewed EMPTY receipt", async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.exec("UPDATE adoption_dogs SET main_image='' WHERE id=21");
    const blocked = await prepareReviewedHelpBackfill(database, receipt());
    assert.equal(blocked.reason, "CANONICAL_NOT_APPROVED_BLANK");
    const approved = await prepareReviewedHelpBackfill(database, receipt({ targetWas: "EMPTY" }));
    assert.equal(approved.decision, "READY");
    assert.match(approved.statement.sql, /main_image = ''/);
    assert.equal(sqlite.prepare(approved.statement.sql).run(...approved.statement.binds).changes, 1);
  } finally { sqlite.close(); }
});

test("a newer Admin/Notion/partner revision never gets overwritten", async () => {
  const { sqlite, database } = fixture();
  try {
    sqlite.exec("UPDATE adoption_dogs SET main_image='/manual.jpg',updated_at='2026-11-19T22:00:00.000Z' WHERE id=21");
    const blocked = await prepareReviewedHelpBackfill(database, receipt());
    assert.equal(blocked.reason, "CANONICAL_REVISION_CHANGED");
    assert.equal(sqlite.prepare("SELECT main_image FROM adoption_dogs WHERE id=21").get().main_image, "/manual.jpg");
  } finally { sqlite.close(); }
});

test("source or canonical changes BETWEEN plan and execution fail SQL guards", async () => {
  for (const side of ["source", "target"]) {
    const { sqlite, database } = fixture();
    try {
      const plan = await prepareReviewedHelpBackfill(database, receipt());
      assert.equal(plan.decision, "READY");
      if (side === "source")
        sqlite.exec("UPDATE help_cases SET image_url='/new-source.jpg' WHERE id=11");
      else
        sqlite.exec("UPDATE adoption_dogs SET main_image='/admin.jpg' WHERE id=21");
      assert.equal(sqlite.prepare(plan.statement.sql).run(...plan.statement.binds).changes, 0);
      const actual = sqlite.prepare("SELECT main_image FROM adoption_dogs WHERE id=21").get();
      assert.equal(actual.main_image, side === "source" ? null : "/admin.jpg");
    } finally { sqlite.close(); }
  }
});

test("reject deleted, changed, unreviewed or ambiguous legacy sources", async () => {
  const { sqlite, database } = fixture();
  try {
    assert.equal((await prepareReviewedHelpBackfill(database, receipt({
      sourceUpdatedAt: "2026-10-01T11:00:00.000Z",
    }))).reason, "SOURCE_REVISION_CHANGED");
    assert.equal((await prepareReviewedHelpBackfill(database, receipt({
      sourceSha256: "a".repeat(64),
    }))).reason, "SOURCE_VALUE_CHANGED");
    sqlite.exec("UPDATE help_cases SET image_url='' WHERE id=11");
    assert.equal((await prepareReviewedHelpBackfill(database, receipt())).reason, "SOURCE_EMPTY_OR_INVALID");
    sqlite.exec("UPDATE help_cases SET image_url='/legacy-falco.jpg' WHERE id=11");
    sqlite.prepare("INSERT INTO help_cases VALUES (?,?,?,?,?,?,?,?)")
      .run(13, "falco", "adopcia", "published", SOURCE_REV, "/other.jpg", "", "");
    assert.equal((await prepareReviewedHelpBackfill(database, receipt())).reason, "IDENTITY_NOT_UNIQUE_OR_MISSING");
    await assert.rejects(() => prepareReviewedHelpBackfill(database, receipt({ approved: false })),
      /HELP_BACKFILL_REVIEW_REQUIRED/);
  } finally { sqlite.close(); }
});

test("backfill allowlist excludes private contacts, lost-found type ambiguity and prototype keys", async () => {
  const { sqlite, database } = fixture();
  try {
    for (const changes of [
      { agenda: "lost-found" }, { field: "public_phone" },
      { field: "gallery_json" }, { field: "updated_at" },
      { field: "__proto__" }, { agenda: "__proto__" },
    ]) {
      await assert.rejects(() => prepareReviewedHelpBackfill(database, receipt(changes)),
        /HELP_BACKFILL_FIELD_NOT_ALLOWLISTED/);
    }
    assert.equal((await prepareReviewedHelpBackfill(database, receipt({
      sourceId: 12,
    }))).reason, "IDENTITY_MISMATCH");
  } finally { sqlite.close(); }
});

test("organization backfill requires exact verified import key and preserves new description", async () => {
  const { sqlite, database } = fixture();
  try {
    const reviewed = receipt({
      agenda: "organizations", field: "image_url",
      sourceId: 12, targetId: 22, slug: "pomoc-oz-labka",
      sourceSha256: hashHelpBackfillValue("/legacy-org.jpg"),
    });
    const plan = await prepareReviewedHelpBackfill(database, reviewed);
    assert.equal(plan.decision, "READY");
    assert.equal(sqlite.prepare(plan.statement.sql).run(...plan.statement.binds).changes, 1);
    const profile = sqlite.prepare("SELECT image_url,short_description,description FROM help_organizations WHERE id=22").get();
    assert.equal(profile.image_url, "/legacy-org.jpg");
    assert.equal(profile.short_description, "Nové krátke info");
    assert.equal(profile.description, "");
    sqlite.exec("UPDATE help_organizations SET import_key='unverified' WHERE id=22");
    assert.equal((await prepareReviewedHelpBackfill(database, reviewed)).reason, "PROVENANCE_NOT_VERIFIED");
  } finally { sqlite.close(); }
});

test("coverage reports aggregate counts only: no row IDs or user content", () => {
  const { sqlite } = fixture();
  try {
    const q = helpLegacyCoverageQueries();
    assert.deepEqual(q.map((x) => x.category), ["adopcia", "utulky"]);
    for (const query of q) {
      assert.match(query.sql, /^SELECT COUNT\(\*\) AS legacy_total/);
      assert.doesNotMatch(query.sql, /h\.\*|t\.\*|email|phone|source_data_json/i);
      const stats = sqlite.prepare(query.sql).get();
      assert.equal(stats.legacy_total, 1);
      assert.equal(stats.matched, 1);
      assert.equal(stats.unmatched, 0);
    }
  } finally { sqlite.close(); }
});


test("field-specific aggregate counts never select user content or grant approval", () => {
  const { sqlite } = fixture();
  try {
    const queries = helpLegacyFieldCandidateQueries();
    assert.equal(queries.length, 6);
    assert.deepEqual(queries.map(x => x.agenda),
      ["adoptions", "adoptions", "adoptions",
        "organizations", "organizations", "organizations"]);
    const counts = Object.fromEntries(queries.map(query => {
      assert.match(query.sql, /^SELECT COUNT\(\*\) AS joined_pairs/);
      assert.doesNotMatch(query.sql, /SELECT\s+(?:h|t)\.(?:id|name|email|phone)/i);
      const data = sqlite.prepare(query.sql).get();
      assert.equal(data.joined_pairs, 1);
      assert.ok(data.potential_missing + data.different_nonempty <= data.joined_pairs);
      return [query.agenda + ":" + query.field, data];
    }));
    assert.equal(counts["adoptions:main_image"].potential_missing, 1);
    assert.equal(counts["adoptions:description"].different_nonempty, 1);
    assert.equal(counts["organizations:image_url"].potential_missing, 1);
    assert.equal(counts["organizations:description"].potential_missing, 1);
    assert.equal(counts["organizations:short_description"].different_nonempty, 1);
  } finally { sqlite.close(); }
});

test("empty legacy cohorts return count 0, never null or invented target data", () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec("DELETE FROM help_cases");
    for (const query of [...helpLegacyCoverageQueries(), ...helpLegacyFieldCandidateQueries()]) {
      const values = sqlite.prepare(query.sql).get();
      assert.ok(Object.values(values).every(value => value === 0));
    }
  } finally { sqlite.close(); }
});
