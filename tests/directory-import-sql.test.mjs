import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function directoryProfileImportSql() {
  const source = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const marker = "INSERT INTO directory_profiles (";
  const insertStart = source.indexOf(marker);
  assert.notEqual(insertStart, -1, "directory profile INSERT must exist");

  const templateStart = source.lastIndexOf("`", insertStart);
  const templateEnd = source.indexOf("`).bind(", insertStart);
  assert.notEqual(templateStart, -1, "INSERT must be inside a SQL template");
  assert.notEqual(templateEnd, -1, "INSERT template must be bound");

  return source.slice(templateStart + 1, templateEnd).replace("${conflictTarget}", "import_key");
}

test("directory profile importer keeps columns, placeholders and binds aligned", () => {
  const sql = directoryProfileImportSql();
  const insert = sql.match(/INSERT INTO directory_profiles\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  assert.ok(insert, "directory profile INSERT must be parseable");

  const columns = insert[1].split(",").map((value) => value.trim()).filter(Boolean);
  const values = insert[2].split(",").map((value) => value.trim()).filter(Boolean);
  const placeholders = sql.match(/\?/g) ?? [];

  assert.equal(columns.length, 28);
  assert.equal(values.length, 28);

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE directory_profiles (
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      description TEXT NOT NULL,
      services_json TEXT NOT NULL,
      qualifications_json TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      region TEXT NOT NULL,
      address TEXT NOT NULL,
      online INTEGER NOT NULL,
      price_note TEXT,
      website_url TEXT,
      internal_email TEXT,
      image_url TEXT,
      image_key TEXT,
      import_key TEXT UNIQUE,
      source_data_json TEXT NOT NULL,
      search_text TEXT NOT NULL DEFAULT '',
      verified INTEGER NOT NULL,
      featured INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      UNIQUE (category, slug)
    );
  `);

  const binds = [
    "reprezentativny-veterinar",
    "Reprezentatívny veterinár",
    "veterinari",
    "published",
    "Veterinárna ambulancia",
    "Testovací profil pre validáciu SQL.",
    JSON.stringify(["Preventívna starostlivosť", "Chirurgia"]),
    "[]",
    "Zlaté Moravce",
    "Zlaté Moravce",
    "Nitriansky kraj",
    "Testovacia 1",
    0,
    null,
    "https://example.test",
    null,
    null,
    "veterinari:vet-test",
    JSON.stringify({ PSČ: "953 01", Stav: "Overené" }),
    "reprezentativny veterinar zlate moravce",
    1,
    0,
    "2026-08-28T00:00:00.000Z",
    "2026-08-28T00:00:00.000Z",
    "2026-08-28T00:00:00.000Z",
    "test@psipedia.sk",
    "import:veterinari",
    1,
  ];

  assert.equal(placeholders.length, 28);
  assert.equal(binds.length, 28);
  database.prepare(sql).run(...binds);

  const row = database.prepare(`
    SELECT import_key, status, city, district, region, search_text, services_json
    FROM directory_profiles
    WHERE import_key = ?
  `).get("veterinari:vet-test");

  assert.deepEqual({ ...row }, {
    import_key: "veterinari:vet-test",
    status: "published",
    city: "Zlaté Moravce",
    district: "Zlaté Moravce",
    region: "Nitriansky kraj",
    search_text: "reprezentativny veterinar zlate moravce",
    services_json: JSON.stringify(["Preventívna starostlivosť", "Chirurgia"]),
  });
});


test("ADMIN-CORE generic import is preview-first and requires explicit confirmation", () => {
  const component = readFileSync(new URL("../components/admin-data-import.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const previewRoute = readFileSync(new URL("../app/api/admin/import/preview/route.ts", import.meta.url), "utf8");

  assert.match(component, /\/api\/admin\/import\/preview/);
  assert.match(component, /confirmed:\s*true/);
  assert.match(component, /1\. Skontrolovať a zobraziť Preview/);
  assert.match(component, /2\. Potvrdiť import/);
  assert.match(route, /payload\.confirmed !== true/);
  assert.match(route, /Pred importom je povinný Preview a explicitné potvrdenie/);
  assert.match(previewRoute, /buildGeneralImportPlan/);
});

test("ADMIN-CORE generic import protects publication state and reports deterministic actions", () => {
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const plan = readFileSync(new URL("../lib/admin-import-plan.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-data-import.tsx", import.meta.url), "utf8");

  assert.match(plan, /if \(existingStatus === "published"\) return \{ action: "skipped" \}/);
  assert.match(plan, /Import dopytov nie je podporovaný, kým nemá canonical idempotentný kľúč/);
  assert.match(plan, /nepodporované top-level polia/);
  assert.match(plan, /nepovolený spustiteľný alebo HTML obsah/);
  assert.match(route, /"draft", text\(row\.accent/);
  assert.match(route, /text\(row\.eventType\), "draft"/);
  assert.match(route, /required\(row\.category, "kategória pomoci"\),\s*"draft"/);
  assert.match(route, /plan\.actions\.profiles\[index\] === "skipped"/);
  assert.match(component, /INSERTED/);
  assert.match(component, /UPDATED/);
  assert.match(component, /SKIPPED/);
  assert.match(component, /REJECTED/);
  assert.match(component, /CSV ani XLSX tento import nepodporuje/);
});

test("ADMIN-CORE import preview rejects ambiguous profile identities before SQL mutation", () => {
  const plan = readFileSync(new URL("../lib/admin-import-plan.ts", import.meta.url), "utf8");
  assert.match(plan, /existingBySlug && existingByImportKey !== existingBySlug/);
  assert.match(plan, /importKey nesedí s existujúcim category\+slug/);
  assert.match(plan, /validateCanonicalSlug/);
});
