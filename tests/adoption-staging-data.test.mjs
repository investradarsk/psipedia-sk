import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../data/imports/adoptions-ready-2026-09-13.json"));
const adoptionFoundation = read("../drizzle/0034_adoption_dogs_foundation.sql");
const organizationFoundation = read("../drizzle/0036_help_organizations_foundation.sql");
const organizationImport = read("../drizzle/0037_import_ready_help_organizations.sql");
const stagingImport = read("../drizzle/0038_adoption_staging_data.sql");
const activation = read("../drizzle/0039_activate_canonical_adoptions.sql");
const adoptionStore = read("../lib/adoption-store.ts");
const holdSlugs = [
  "charlie-hlada-novy-domov",
  "kira-hlada-novy-domov",
  "aisha-hlada-novy-domov",
  "max-hlada-novy-domov",
];

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY)");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    slug TEXT NOT NULL,
    UNIQUE(category, slug)
  )`);
  db.exec(`CREATE TABLE help_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    description TEXT NOT NULL,
    organization TEXT NOT NULL,
    dog_name TEXT NOT NULL DEFAULT '',
    breed TEXT NOT NULL DEFAULT '',
    age_note TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    location_note TEXT NOT NULL DEFAULT '',
    reported_date TEXT,
    deadline_date TEXT,
    action_label TEXT NOT NULL,
    action_url TEXT,
    contact_note TEXT NOT NULL DEFAULT '',
    goal_amount INTEGER,
    raised_amount INTEGER,
    image_url TEXT,
    image_key TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    urgent INTEGER NOT NULL DEFAULT 0,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    UNIQUE(category, slug)
  )`);
  db.exec(adoptionFoundation);
  db.exec(organizationFoundation);
  db.exec(organizationImport);
  const insert = db.prepare(`INSERT INTO help_cases (
    slug, title, category, status, excerpt, description, organization, dog_name, breed,
    city, region, action_label, action_url, contact_note, image_url, verified,
    created_at, updated_at, published_at, created_by, updated_by
  ) VALUES (?, ?, 'adopcia', 'published', ?, ?, ?, ?, ?, ?, ?, 'Chcem pomôcť', ?, ?, ?, 1, ?, ?, ?, 'legacy-import', 'legacy-import')`);
  manifest.ready.forEach((row, index) => {
    const createdAt = `2026-08-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`;
    const updatedAt = `2026-09-${String((index % 12) + 1).padStart(2, "0")}T09:00:00.000Z`;
    insert.run(
      row.slug, row.title, row.excerpt, row.description ?? `Legacy description: ${row.slug}`,
      row.organization, row.dogName, row.breed ?? `Legacy breed: ${row.slug}`, row.city, row.region,
      row.actionUrl, row.contactNote ?? "", index % 2 === 0 ? `/legacy/${row.slug}.webp` : null,
      createdAt, updatedAt, createdAt,
    );
  });
  for (let index = 1; index <= 104; index += 1) {
    const timestamp = "2026-09-01T00:00:00.000Z";
    insert.run(`utulok-${index}`, `Útulok ${index}`, "Profil útulku pre migračný test.", "Legacy shelter description.",
      `Útulok ${index}`, "", "", "Bratislava", "Bratislavský kraj", null, "", null, timestamp, timestamp, timestamp);
    db.prepare("UPDATE help_cases SET category = 'utulky' WHERE slug = ?").run(`utulok-${index}`);
  }
  return db;
}

function scalar(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params).value);
}

test("0038 inserts exactly the reviewed draft cohort and preserves source tables", () => {
  const db = database();
  const helpBefore = db.prepare("SELECT COUNT(*) AS count, group_concat(id || ':' || slug || ':' || updated_at, '|') AS content FROM help_cases").get();
  const organizationsBefore = db.prepare("SELECT COUNT(*) AS count, SUM(status = 'DRAFT') AS drafts, SUM(published_at IS NOT NULL) AS published FROM help_organizations").get();

  db.exec(stagingImport);

  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs"), 36);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE status = 'DRAFT'"), 36);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE published_at IS NOT NULL"), 0);
  assert.equal(scalar(db, "SELECT COUNT(DISTINCT slug) AS value FROM adoption_dogs"), 36);
  assert.equal(scalar(db, `SELECT COUNT(*) AS value FROM adoption_dogs WHERE slug IN (${holdSlugs.map(() => "?").join(",")})`, ...holdSlugs), 0);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE organization_id IS NOT NULL"), 36);
  assert.equal(scalar(db, "SELECT COUNT(DISTINCT organization_id) AS value FROM adoption_dogs"), 4);
  assert.equal(scalar(db, `SELECT COUNT(*) AS value FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.organization_name = organization.name AND dog.organization_slug = organization.slug`), 36);
  assert.deepEqual(
    db.prepare(`SELECT organization.import_key AS importKey, COUNT(*) AS count FROM adoption_dogs dog
      JOIN help_organizations organization ON organization.id = dog.organization_id
      GROUP BY organization.import_key ORDER BY count DESC`).all().map((row) => ({ ...row })),
    [
      { importKey: "help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p", count: 16 },
      { importKey: "help-org:pomoc-dog-azyl-o-z", count: 9 },
      { importKey: "help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava", count: 7 },
      { importKey: "help-org:pomoc-oz-pes-v-nudzi", count: 4 },
    ],
  );
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS count, group_concat(id || ':' || slug || ':' || updated_at, '|') AS content FROM help_cases").get(), helpBefore);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS count, SUM(status = 'DRAFT') AS drafts, SUM(published_at IS NOT NULL) AS published FROM help_organizations").get(), organizationsBefore);
  assert.deepEqual({ ...organizationsBefore }, { count: 106, drafts: 106, published: 0 });

  assert.match(adoptionStore, /d\.status IN \('ACTIVE','RESERVED'\)/);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED')"), 0);
});

test("a second staging attempt fails on preflight collision without changing the cohort", () => {
  const db = database();
  db.exec(stagingImport);
  assert.throws(() => db.exec(stagingImport), /CHECK constraint failed/);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs"), 36);
});

test("a target collision aborts before any candidate is inserted", () => {
  const db = database();
  db.prepare(`INSERT INTO adoption_dogs (
    name, slug, status, created_at, updated_at, created_by, updated_by
  ) VALUES ('Existing', ?, 'DRAFT', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'test', 'test')`).run(manifest.ready[0].slug);
  assert.throws(() => db.exec(stagingImport), /CHECK constraint failed/);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs"), 1);
});

test("migration is create-only, denylisted and resolves organizations without numeric IDs", () => {
  assert.equal(manifest.ready.length, 36);
  assert.equal(manifest.holdCount, 4);
  for (const slug of holdSlugs) assert.doesNotMatch(stagingImport.split("CREATE TABLE __psipedia_adoption_staging_guard_0038")[0], new RegExp(`'${slug}'`));
  assert.match(stagingImport, /organization\.id, organization\.name, organization\.slug/);
  assert.doesNotMatch(stagingImport, /organization_id\s*\)\s*VALUES/i);
  assert.doesNotMatch(stagingImport, /UPDATE\s+(?:help_cases|help_organizations)/i);
  assert.doesNotMatch(stagingImport, /DELETE\s+FROM\s+(?:help_cases|help_organizations)/i);
  assert.doesNotMatch(stagingImport, /'ACTIVE'|'RESERVED'/);
});

test("0039 activates exactly the reviewed cohort and preserves legacy and canonical organizations", () => {
  const db = database();
  db.exec(stagingImport);
  const legacyBefore = db.prepare("SELECT category, COUNT(*) AS count, group_concat(id || ':' || slug || ':' || updated_at, '|') AS content FROM help_cases GROUP BY category ORDER BY category").all().map((row) => ({ ...row }));
  const organizationsBefore = db.prepare("SELECT COUNT(*) AS count, SUM(status = 'DRAFT') AS drafts, SUM(published_at IS NOT NULL) AS published FROM help_organizations").get();
  const contentBefore = db.prepare("SELECT group_concat(id || ':' || slug || ':' || organization_id || ':' || organization_name || ':' || organization_slug || ':' || name, '|') AS content FROM adoption_dogs ORDER BY id").get();

  db.exec(activation);

  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1'"), 36);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status = 'ACTIVE'"), 36);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status IN ('DRAFT','RESERVED')"), 0);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND published_at IS NOT NULL"), 36);
  assert.equal(scalar(db, "SELECT COUNT(DISTINCT organization_id) AS value FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1'"), 4);
  assert.equal(scalar(db, `SELECT COUNT(*) AS value FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND dog.organization_name = organization.name AND dog.organization_slug = organization.slug`), 36);
  assert.equal(scalar(db, `SELECT COUNT(*) AS value FROM adoption_dogs WHERE slug IN (${holdSlugs.map(() => "?").join(",")})`, ...holdSlugs), 0);
  assert.deepEqual(db.prepare("SELECT category, COUNT(*) AS count, group_concat(id || ':' || slug || ':' || updated_at, '|') AS content FROM help_cases GROUP BY category ORDER BY category").all().map((row) => ({ ...row })), legacyBefore);
  assert.deepEqual(legacyBefore.map(({ category, count }) => ({ category, count })), [{ category: "adopcia", count: 36 }, { category: "utulky", count: 104 }]);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS count, SUM(status = 'DRAFT') AS drafts, SUM(published_at IS NOT NULL) AS published FROM help_organizations").get(), organizationsBefore);
  assert.deepEqual({ ...organizationsBefore }, { count: 106, drafts: 106, published: 0 });
  assert.deepEqual(db.prepare("SELECT group_concat(id || ':' || slug || ':' || organization_id || ':' || organization_name || ':' || organization_slug || ':' || name, '|') AS content FROM adoption_dogs ORDER BY id").get(), contentBefore);
});

test("0039 preflight fails before activation if the cohort snapshot is invalid", () => {
  const db = database();
  db.exec(stagingImport);
  db.prepare("UPDATE adoption_dogs SET organization_slug = 'invalid' WHERE id = (SELECT MIN(id) FROM adoption_dogs)").run();
  assert.throws(() => db.exec(activation), /CHECK constraint failed/);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE status = 'DRAFT'"), 36);
  assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM adoption_dogs WHERE status = 'ACTIVE'"), 0);
});

test("activation is cohort-scoped, deterministic and never mutates legacy tables", () => {
  assert.match(activation, /WHERE created_by = 'adoption-staging-import:v1' AND status = 'DRAFT'/);
  assert.match(activation, /published_at = '2026-09-15T16:00:00\.000Z'/);
  assert.match(activation, /updated_by = 'adoption-public-cutover:v1'/);
  assert.doesNotMatch(activation, /UPDATE\s+(?:help_cases|help_organizations)/i);
  assert.doesNotMatch(activation, /DELETE\s+FROM/i);
});
