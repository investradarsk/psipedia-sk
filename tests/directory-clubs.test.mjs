import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function createD1Adapter(sqlite) {
  const queries = [];

  function statement(sql, bindings = []) {
    function execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql)) {
        return { success: true, results: prepared.all(...bindings), meta: { changes: 0 } };
      }
      const result = prepared.run(...bindings);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) } };
    }

    return {
      bind(...values) { return statement(sql, values); },
      async all() { queries.push({ sql, bindings }); return execute(); },
      async first() { queries.push({ sql, bindings }); return execute().results[0] ?? null; },
      async run() { queries.push({ sql, bindings }); return execute(); },
      execute,
    };
  }

  return {
    queries,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((item) => item.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function createClubDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE navigation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      parent_id INTEGER,
      position INTEGER NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      description TEXT NOT NULL,
      services_json TEXT NOT NULL DEFAULT '[]',
      qualifications_json TEXT NOT NULL DEFAULT '[]',
      city TEXT NOT NULL,
      region TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 0,
      price_note TEXT NOT NULL DEFAULT '',
      website_url TEXT,
      internal_email TEXT,
      image_url TEXT,
      image_key TEXT,
      import_key TEXT,
      source_data_json TEXT NOT NULL DEFAULT '{}',
      verified INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      seo_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE INDEX directory_profiles_public_idx ON directory_profiles (status, category, region, featured);
  `);
  const migrationSql = readFileSync(new URL("../drizzle/0018_cold_nico_minoru.sql", import.meta.url), "utf8");
  for (const statement of migrationSql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) sqlite.exec(statement);
  const regions = ["Bratislavský", "Trnavský", "Trenčiansky", "Nitriansky", "Žilinský", "Banskobystrický", "Prešovský", "Košický"];
  const insert = sqlite.prepare(`
    INSERT INTO directory_profiles (
      slug, name, category, status, excerpt, description, city, district, region,
      website_url, source_data_json, created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, 'kynologicke-kluby', 'published', ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 'test@psipedia.sk', 'test@psipedia.sk')
  `);
  const now = "2026-08-27T10:30:00.000Z";
  for (let index = 0; index < 248; index += 1) {
    const region = regions[index % regions.length];
    const isNitra = region === "Nitriansky";
    const district = isNitra ? (index % 16 === 3 ? "Nitra" : "Nové Zámky") : `Okres ${region} ${index % 9}`;
    const city = district === "Nitra" ? (index % 32 === 3 ? "Nitra" : "Lužianky") : `Obec ${String(index % 111).padStart(3, "0")}`;
    const name = `${isNitra ? "Nitriansky" : "Slovenský"} klub ${String(index + 1).padStart(3, "0")}`;
    insert.run(
      `klub-${String(index + 1).padStart(3, "0")}`,
      name,
      `Informácie o klube ${name} a jeho činnosti.`,
      `Podrobné informácie o kynologickom klube ${name}, výcviku a aktivitách.`,
      city,
      region,
      index % 5 === 0 ? `https://klub-${index + 1}.example` : null,
      JSON.stringify({ Okres: district, Web: index % 5 === 0 ? `https://klub-${index + 1}.example` : "", Telefón: `0900 ${String(index).padStart(3, "0")}` }),
      now,
      now,
      now,
    );
  }
  return { sqlite, d1: createD1Adapter(sqlite) };
}

async function fetchHtml(worker, d1, path) {
  let response;
  try {
    response = await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: d1 },
      { waitUntil() {}, passThroughOnException() {} },
    );
  } catch (error) {
    const latest = d1.queries.at(-1);
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}${latest ? `\nLast SQL: ${latest.sql}` : ""}`, { cause: error });
  }
  assert.equal(response.status, 200, path);
  return (await response.text()).replace(/<!--.*?-->/g, "");
}

test("migrates club locations idempotently and serves server-filtered, paginated club results", async () => {
  const { sqlite, d1 } = createClubDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const previousRuntimeEnv = { ...runtimeEnv };
  const migrationToken = "test-directory-location-token";
  Object.assign(runtimeEnv, { DB: d1, DIRECTORY_LOCATION_MIGRATION_TOKEN: migrationToken });

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("directory-clubs-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const bindings = {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: d1,
      DIRECTORY_LOCATION_MIGRATION_TOKEN: migrationToken,
    };
    const context = { waitUntil() {}, passThroughOnException() {} };

    const unauthorized = await worker.fetch(new Request("http://localhost/api/internal/directory-club-location-migration", { method: "POST" }), bindings, context);
    assert.equal(unauthorized.status, 404);

    const migrate = () => worker.fetch(new Request("http://localhost/api/internal/directory-club-location-migration", {
      method: "POST",
      headers: { authorization: `Bearer ${migrationToken}` },
    }), bindings, context);
    const firstMigration = await migrate();
    assert.equal(firstMigration.status, 200);
    const firstReport = await firstMigration.json();
    assert.deepEqual(firstReport.before, {
      total: 248, published: 248, blankNames: 0, blankCities: 0,
      missingDistricts: 248, missingRegions: 0, uniqueRegions: 8, onlineRegions: 0,
    });
    assert.deepEqual(firstReport.after, {
      total: 248, published: 248, blankNames: 0, blankCities: 0,
      missingDistricts: 0, missingRegions: 0, uniqueRegions: 8, onlineRegions: 0,
    });
    assert.deepEqual(firstReport.changed, { districts: 248, regions: 248 });
    assert.equal(firstReport.slugsPreserved, true);

    const secondMigration = await migrate();
    assert.equal(secondMigration.status, 200);
    assert.deepEqual((await secondMigration.json()).changed, { districts: 0, regions: 0 });

    const stats = sqlite.prepare(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT region) AS regions,
        SUM(CASE WHEN district = '' THEN 1 ELSE 0 END) AS missing_districts,
        SUM(CASE WHEN region = 'Online' THEN 1 ELSE 0 END) AS online_regions
      FROM directory_profiles WHERE category = 'kynologicke-kluby'
    `).get();
    assert.deepEqual({ ...stats }, { total: 248, regions: 8, missing_districts: 0, online_regions: 0 });
    const indexNames = new Set(sqlite.prepare("PRAGMA index_list('directory_profiles')").all().map((row) => row.name));
    for (const name of ["directory_profiles_public_idx", "directory_profiles_public_district_idx", "directory_profiles_public_city_idx", "directory_profiles_public_name_idx"]) assert.ok(indexNames.has(name), name);

    d1.queries.length = 0;
    const defaultHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby");
    assert.match(defaultHtml, /248 klubov/);
    assert.match(defaultHtml, /Strana 1 z 11/);
    assert.equal((defaultHtml.match(/class="directory-card directory-club-card"/g) ?? []).length, 24);
    const listQueries = d1.queries.filter(({ sql }) => /FROM directory_profiles/i.test(sql) && /LIMIT \?/i.test(sql));
    assert.ok(listQueries.length >= 1);
    for (const query of listQueries) {
      assert.doesNotMatch(query.sql, /SELECT\s+\*/i);
      assert.match(query.sql, /SELECT id, slug, name, category, city, district, region/i);
    }

    const searchHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?q=Nitra");
    assert.match(searchHtml, /value="Nitra"/);
    assert.match(searchHtml, /Nitriansky klub/);

    const regionHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?region=Nitriansky+kraj");
    assert.match(regionHtml, /Nitriansky kraj/);
    assert.doesNotMatch(regionHtml, /Bratislavský kraj<\/dd>/);

    const districtHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?region=Nitriansky+kraj&district=Nitra");
    assert.match(districtHtml, /<dd>Nitra<\/dd>/);
    assert.doesNotMatch(districtHtml, /<dd>Nové Zámky<\/dd>/);

    const cityHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?region=Nitriansky+kraj&district=Nitra&city=Lužianky");
    assert.match(cityHtml, /<dd>Lužianky<\/dd>/);

    const descendingHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?sort=name-desc");
    assert.ok(descendingHtml.indexOf("klub-248") < descendingHtml.indexOf("klub-247"));
    const citySortHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?sort=city-asc");
    assert.match(citySortHtml, /Mesto A–Z/);

    const pageTwoHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby?q=klub&page=2");
    assert.match(pageTwoHtml, /Strana 2 z 11/);
    assert.match(pageTwoHtml, /q=klub&amp;page=3/);

    const detailHtml = await fetchHtml(worker, d1, "/adresar/kynologicke-kluby/klub-004");
    assert.match(detailHtml, /Nitriansky klub 004/);
    assert.match(detailHtml, /Okres/);
    assert.match(detailHtml, /rel="canonical" href="https:\/\/psipedia\.sk\/adresar\/kynologicke-kluby\/klub-004"/);
    assert.match(detailHtml, /application\/ld\+json/);
  } finally {
    sqlite.close();
    for (const key of Object.keys(runtimeEnv)) delete runtimeEnv[key];
    Object.assign(runtimeEnv, previousRuntimeEnv);
  }
});
