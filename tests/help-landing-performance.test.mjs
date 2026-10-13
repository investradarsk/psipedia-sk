import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getHelpLandingSnapshot,
  HELP_LANDING_GENERIC_SQL,
  HELP_LANDING_ORGANIZATIONS_SQL,
  HELP_LANDING_ADOPTIONS_SQL,
  HELP_LANDING_REPORTS_SQL,
} from "../lib/help-landing-store.ts";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec([
    "CREATE TABLE help_cases (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, category TEXT, status TEXT, resolved INTEGER, excerpt TEXT, organization TEXT, city TEXT, region TEXT, image_url TEXT, thumbnail_display_json TEXT, urgent INTEGER, verified INTEGER, updated_at TEXT)",
    "CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, short_description TEXT, city TEXT, region TEXT, image_url TEXT, thumbnail_display_json TEXT, status TEXT, published_at TEXT, archived_at TEXT, last_verified_at TEXT, updated_at TEXT)",
    "CREATE TABLE organization_locations (id INTEGER PRIMARY KEY, organization_id INTEGER, role TEXT, city TEXT, region TEXT, is_primary INTEGER, sort_order INTEGER)",
    "CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, status TEXT, main_image TEXT, thumbnail_display_json TEXT, organization_id INTEGER, organization_name TEXT, city TEXT, region TEXT, short_description TEXT, published_at TEXT, updated_at TEXT)",
    "CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, type TEXT, status TEXT, slug TEXT, dog_name TEXT, breed TEXT, city TEXT, region TEXT, description TEXT, main_image TEXT, thumbnail_display_json TEXT, event_date TEXT, published_at TEXT, expires_at TEXT)",
  ].join(";") + ";");
  const sql = [];
  const adapter = {
    prepare(statement) {
      sql.push(statement);
      return {
        bind(...values) {
          return {
            async all() {
              return { results: sqlite.prepare(statement).all(...values) };
            },
          };
        },
      };
    },
  };
  return { sqlite, adapter, sql };
}

function fillFixture(sqlite) {
  const help = sqlite.prepare("INSERT INTO help_cases (id,slug,title,category,status,resolved,excerpt,organization,city,region,image_url,thumbnail_display_json,urgent,verified,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= 10; i++) {
    help.run(i, "care-" + i, "Care " + i, "docasna-opatera", "published", 0,
      "Description " + i, "OZ", "Nitra", "Nitriansky kraj", null, null, i <= 2 ? 1 : 0, i === 2 ? 1 : 0, "2026-10-" + String(i).padStart(2, "0"));
  }
  help.run(51, "secret", "Unpublished", "docasna-opatera", "draft", 0, "secret", "OZ", "Nitra", "Nitriansky kraj", null, null, 1, 1, "2099-01-01");
  help.run(52, "done", "Resolved", "docasna-opatera", "published", 1, "done", "OZ", "Nitra", "Nitriansky kraj", null, null, 1, 1, "2099-01-01");
  help.run(53, "fund", "Fund", "zbierky", "published", 0, "Fundraiser", "OZ", "Nitra", "Nitriansky kraj", null, null, 0, 0, "2026-10-12");

  const organizations = sqlite.prepare("INSERT INTO help_organizations (id,name,slug,short_description,city,region,image_url,thumbnail_display_json,status,published_at,archived_at,last_verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= 9; i++) {
    organizations.run(i, "Shelter " + i, "shelter-" + i, "Public shelter", "Nitra", "Nitriansky kraj", null, null,
      "PUBLISHED", "2026-09-01", null, i === 1 ? "2026-10-01" : null, "2026-10-" + String(i).padStart(2, "0"));
  }
  organizations.run(51, "Archived", "archived", "no", "Nitra", "Nitriansky kraj", null, null, "PUBLISHED", "2026-09-01", "2026-10-01", null, "2099-01-01");
  organizations.run(52, "Draft", "draft", "no", "Nitra", "Nitriansky kraj", null, null, "DRAFT", null, null, null, "2099-01-01");
  sqlite.prepare("INSERT INTO organization_locations VALUES (1,1,'SITE','Trnava','Trnavský kraj',1,0)").run();

  const adoption = sqlite.prepare("INSERT INTO adoption_dogs (id,name,slug,status,main_image,thumbnail_display_json,organization_id,organization_name,city,region,short_description,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= 9; i++) {
    adoption.run(i, "Dog " + i, "dog-" + i, i === 9 ? "RESERVED" : "ACTIVE",
      null, null, i === 9 ? 1 : null, "Original shelter", "Nitra", "Nitriansky kraj", "Friendly dog",
      "2026-10-" + String(i).padStart(2, "0"), "2026-10-" + String(i).padStart(2, "0"));
  }
  adoption.run(51, "Draft dog", "draft-dog", "DRAFT", null, null, null, "Private", "Nitra", "Nitriansky kraj", "", "2099-01-01", "2099-01-01");
  adoption.run(52, "Adopted dog", "adopted-dog", "ADOPTED", null, null, null, "Private", "Nitra", "Nitriansky kraj", "", "2099-01-01", "2099-01-01");

  const reports = sqlite.prepare("INSERT INTO lost_found_dog_reports (id,type,status,slug,dog_name,breed,city,region,description,main_image,thumbnail_display_json,event_date,published_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const [type, base] of [["LOST", 100], ["FOUND", 200]]) {
    for (let i = 1; i <= 9; i++) reports.run(base + i, type, "ACTIVE", type.toLowerCase() + "-" + i, "Dog", "Mix", "Nitra", "Nitriansky kraj", "Public", null, null, "2026-10-" + String(i).padStart(2, "0"), "2026-10-" + String(i).padStart(2, "0"), null);
    reports.run(base + 51, type, "PENDING", "pending", "Secret", "Mix", "Nitra", "Nitriansky kraj", "Secret", null, null, "2099-01-01", null, null);
    reports.run(base + 52, type, "ACTIVE", "unpublished", "Secret", "Mix", "Nitra", "Nitriansky kraj", "Secret", null, null, "2099-01-01", null, null);
    reports.run(base + 53, type, "ACTIVE", "expired", "Secret", "Mix", "Nitra", "Nitriansky kraj", "Expired", null, null, "2099-01-01", "2026-01-01", "2026-01-02");
  }
}

test("public landing reads four bounded datasets, real SQLite ranking and exact counts", async () => {
  const { sqlite, adapter, sql } = setup();
  try {
    fillFixture(sqlite);
    const result = await getHelpLandingSnapshot(adapter, new Date("2026-10-13T10:00:00.000Z"));
    assert.equal(sql.length, 4, "exactly one SQL read per public source");
    assert.ok(sql.every((statement) => !/\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bOFFSET\b/i.test(statement)));
    assert.equal(result.generic.counts["docasna-opatera"], 10);
    assert.equal(result.generic.counts.zbierky, 1);
    assert.equal(result.generic.counts.dobrovolnictvo, 0);
    assert.deepEqual(result.generic.items.filter((x) => x.category === "docasna-opatera").map((x) => x.id), [2, 1, 10, 9, 8, 7]);
    assert.equal(result.generic.items.length, 7);
    assert.equal(result.organizations.count, 9);
    assert.deepEqual(result.organizations.items.map((x) => x.id), [1, 9, 8, 7, 6, 5]);
    assert.equal(result.organizations.items[0].city, "Trnava", "SITE location is preferred");
    assert.equal(result.adoptions.count, 9);
    assert.deepEqual(result.adoptions.items.map((x) => x.id), [9, 8, 7, 6, 5, 4]);
    assert.equal(result.adoptions.items[0].status, "RESERVED");
    assert.equal(result.adoptions.items[0].organizationName, "Shelter 1");
    assert.deepEqual(result.reports.counts, { LOST: 9, FOUND: 9 });
    assert.equal(result.reports.items.filter((x) => x.type === "LOST").length, 6);
    assert.equal(result.reports.items.filter((x) => x.type === "FOUND").length, 6);
    assert.equal(result.reports.items.length, 12);
    assert.ok(result.reports.items.every((x) => x.id < 250));
  } finally {
    sqlite.close();
  }
});

test("an empty database produces zero counts with no private or unpublished rows", async () => {
  const { sqlite, adapter, sql } = setup();
  try {
    const result = await getHelpLandingSnapshot(adapter, new Date("2026-10-13T10:00:00.000Z"));
    assert.equal(sql.length, 4);
    assert.deepEqual(result.generic.counts, { "docasna-opatera": 0, zbierky: 0, dobrovolnictvo: 0 });
    assert.equal(result.organizations.count, 0);
    assert.equal(result.adoptions.count, 0);
    assert.deepEqual(result.reports.counts, { LOST: 0, FOUND: 0 });
    assert.equal(result.generic.items.length + result.organizations.items.length + result.adoptions.items.length + result.reports.items.length, 0);
  } finally {
    sqlite.close();
  }
});

test("public SQL retains eligibility, order and fixed per-section limits without altering full listings", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const root = read("../app/pomoc-psom/page.tsx");
  const adoption = read("../lib/adoption-store.ts");
  const reports = read("../lib/lost-found-dog-store.ts");
  const category = read("../app/pomoc-psom/[category]/page.tsx");
  assert.match(HELP_LANDING_GENERIC_SQL, /h\.status = 'published' AND h\.resolved = 0/);
  assert.match(HELP_LANDING_GENERIC_SQL, /h\.urgent DESC, h\.verified DESC, h\.updated_at DESC, h\.id DESC/);
  assert.match(HELP_LANDING_ORGANIZATIONS_SQL, /o\.status = 'PUBLISHED' AND o\.published_at IS NOT NULL AND o\.archived_at IS NULL/);
  assert.match(HELP_LANDING_ADOPTIONS_SQL, /COALESCE\(d\.published_at, d\.updated_at\) DESC, d\.id DESC/);
  assert.match(HELP_LANDING_REPORTS_SQL, /r\.status = 'ACTIVE'/);
  assert.match(HELP_LANDING_REPORTS_SQL, /r\.expires_at > \?/);
  assert.doesNotMatch(HELP_LANDING_REPORTS_SQL, /private_details|encrypted|contact_name/);
  assert.match(root, /slice\(0, 6\)/);
  assert.match(adoption, /export const getPublicAdoptions = listPublicAdoptions/);
  assert.match(reports, /export async function listPublicDogReports/);
  assert.match(category, /getPublishedHelpCases\(category\)/);
  for (const sql of [HELP_LANDING_GENERIC_SQL, HELP_LANDING_ORGANIZATIONS_SQL, HELP_LANDING_ADOPTIONS_SQL, HELP_LANDING_REPORTS_SQL]) {
    assert.match(sql, /preview_rank <= \?/);
    assert.match(sql, /COUNT\(\*\) OVER/);
  }
});
