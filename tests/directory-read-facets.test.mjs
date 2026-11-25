import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { readNonemptyD1Page } from "../lib/perf-d1-page-read.ts";
import { DIRECTORY_PUBLIC_SOURCE_FACETS, directoryEffectiveDistrictSql } from "../lib/directory-public-source-contract.ts";
import test from "node:test";
import { canonicalBreedIdsSql, readCanonicalBreedIds } from "../lib/breed-canonical.ts";
import { directoryCategoryMembershipSql } from "../lib/directory-multi-category.ts";
import {
  directoryLocationFacetStatement,
  directorySourceFacetStatement,
  directoryCanonicalBreedFacetSql,
  parseDirectoryFacetValues,
} from "../lib/directory-read-facets.ts";

const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const districtSql = directoryEffectiveDistrictSql();
// Old DISTINCT and optimized grouped SELECTs are performance variants;
// they MUST use the same centralized public source precedence contract.
const source = {
  breeds: DIRECTORY_PUBLIC_SOURCE_FACETS.breed,
  fciGroups: DIRECTORY_PUBLIC_SOURCE_FACETS.fciGroup,
  organizations: DIRECTORY_PUBLIC_SOURCE_FACETS.organization,
  profileTypes: DIRECTORY_PUBLIC_SOURCE_FACETS.profileType,
};
const categories = [
  "veterinari",
  "treneri",
  "salony-a-sluzby",
  "chovatelske-stanice",
  "hotely-a-opatrovanie",
  "utulky-a-zachrana",
  "kluby-a-organizacie",
  "fyzioterapia",
  "eshopy",
  "ostatne",
];
const regions = ["Nitriansky kraj", "Trnavský kraj", "Bratislavský kraj", "Žilinský kraj"];
const districts = ["Nitra", "Trnava", "Bratislava I", "Žilina"];
const cities = ["Nitra", "Trnava", "Bratislava", "Žilina"];
const serviceNames = ["Vyšetrenie", "Výcvik", "Kúpanie", "Opatrovanie"];
const breeds = ["Labrador", "Border kólia", "\uE000", "😀", "Akita"];

function fixture(size = 1100) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT, status TEXT, category TEXT, region TEXT, district TEXT, city TEXT, services_json TEXT, source_data_json TEXT, search_text TEXT, featured INTEGER, published_at TEXT)",
  );
  sqlite.exec(`
    CREATE TABLE directory_profile_public_facts (
      profile_id INTEGER,field_key TEXT,value_text TEXT,
      PRIMARY KEY(profile_id,field_key)
    );
    CREATE TABLE directory_profile_extra_fields (
      profile_id INTEGER,field_key TEXT,text_value TEXT,
      PRIMARY KEY(profile_id,field_key)
    );
  `);
  const addFact=sqlite.prepare(
    "INSERT INTO directory_profile_public_facts(profile_id,field_key,value_text) VALUES(?,?,?)",
  );
  const insert = sqlite.prepare(
    "INSERT INTO directory_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (let id = 1; id <= size; id++) {
    const r = id % 4,
      alternate = id % 9 === 0;
    const data = {
      Okres: districts[r],
      Plemeno: id % 7 === 0 ? "" : breeds[id % 5],
      Plemená: breeds[(id + 1) % 5],
      "FCI skupina": id % 3 === 0 ? "" : String(id % 10),
      FCI: String(id % 10),
      Organizácia: alternate ? "" : "Klub " + (id % 11),
      "Zastrešujúca organizácia": "Zväz " + (id % 7),
      "Typ služby": id % 5 === 0 ? "" : "Typ " + (id % 5),
      "Typ poskytovateľa": "Poskytovateľ",
      "Typ klubu": "Klub",
    };
    insert.run(
      id,
      "Profil " + id,
      id % 13 === 0 ? "draft" : "published",
      categories[id % categories.length],
      regions[r],
      id % 8 === 0 ? "" : districts[r],
      id % 23 === 0 ? " " + cities[r] : cities[r],
      JSON.stringify(id % 17 === 0 ? [] : [serviceNames[id % 4], serviceNames[(id + 1) % 4]]),
      JSON.stringify(data),
      id % 6 === 0 ? "nitra" : "sluzby",
      id % 9 === 0 ? 1 : 0,
      "2026-10-" + String(1 + (id % 12)).padStart(2, "0"),
    );
    // Relational fields are now the only source. Preserve the fixture's
    // canonical editorial values without inserting legacy JSON aliases.
    for (const [key,value] of [
      ["Plemeno",data.Plemeno],["FCI skupina",data["FCI skupina"]],
      ["Organizácia",data["Organizácia"]],["Typ služby",data["Typ služby"]],
    ]) {
      if(typeof value==="string" && value) addFact.run(id,key,value);
    }
  }
  // Non-published and NULL-rich cases must not pollute source or location facets.
  insert.run(
    size + 1,
    "Výnimka",
    "draft",
    categories[0],
    "Nitriansky kraj",
    "Nitra",
    "Nitra",
    "[]",
    "{}",
    "",
    0,
    "2026-10-01",
  );
  let calls = 0;
  const database = {
    prepare(sql) {
      calls++;
      let bindings = [];
      return {
        bind(...args) {
          bindings = args;
          return this;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...bindings) };
        },
        async first() {
          return sqlite.prepare(sql).get(...bindings);
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.all()));
    },
  };
  return { sqlite, database, getCalls: () => calls, close: () => sqlite.close() };
}

const values = (rows) => rows.map((row) => (row.value ?? "").trim()).filter(Boolean);
function buildBase(filters) {
  const clauses = ["status = 'published'"],
    bindings = [];
  if (filters.category) {
    clauses.push("category = ?");
    bindings.push(filters.category);
  }
  if (filters.query) {
    clauses.push("search_text LIKE ?");
    bindings.push("%" + filters.query + "%");
  }
  if (filters.service) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(directory_profiles.services_json) service_item WHERE trim(CAST(service_item.value AS TEXT)) = ?)",
    );
    bindings.push(filters.service);
  }
  if (filters.breed) {
    clauses.push(source.breeds + " = ?");
    bindings.push(filters.breed);
  }
  if (filters.fciGroup) {
    clauses.push(source.fciGroups + " = ?");
    bindings.push(filters.fciGroup);
  }
  if (filters.organization) {
    clauses.push(source.organizations + " = ?");
    bindings.push(filters.organization);
  }
  if (filters.profileType) {
    clauses.push(source.profileTypes + " = ?");
    bindings.push(filters.profileType);
  }
  return { sql: clauses.join(" AND "), bindings };
}

function locationWhere(base, filters, level) {
  const clauses = [base.sql],
    bindings = [...base.bindings];
  if ((level === "district" || level === "city") && filters.region) {
    clauses.push("(region = ? OR region = ?)");
    bindings.push(filters.region, filters.region.replace(/ kraj$/, ""));
  }
  if (level === "city" && filters.district) {
    clauses.push(districtSql + " = ?");
    bindings.push(filters.district);
  }
  return { sql: clauses.join(" AND "), bindings };
}

async function oldOptions(database, filters) {
  const base = buildBase(filters);
  const facetWhere = filters.category
    ? "status = 'published' AND category = ?"
    : "status = 'published'";
  const facetBindings = filters.category ? [filters.category] : [];
  const prepare = (sql, bindings = []) => database.prepare(sql).bind(...bindings);
  const location = ["region", "district", "city"].map((level) => {
    const where = locationWhere(base, filters, level);
    const expression = level === "district" ? districtSql : level;
    return prepare(
      "SELECT DISTINCT " +
        expression +
        " AS value FROM directory_profiles WHERE " +
        where.sql +
        " AND " +
        expression +
        " <> '' ORDER BY value",
      where.bindings,
    );
  });
  const service = prepare(
    "SELECT DISTINCT trim(CAST(service_item.value AS TEXT)) AS value FROM directory_profiles, json_each(directory_profiles.services_json) service_item WHERE " +
      facetWhere +
      " AND trim(CAST(service_item.value AS TEXT)) <> '' ORDER BY value",
    facetBindings,
  );
  const metadata = Object.values(source).map((expression) =>
    prepare(
      "SELECT DISTINCT trim(CAST(" +
        expression +
        " AS TEXT)) AS value FROM directory_profiles WHERE " +
        facetWhere +
        " AND trim(CAST(" +
        expression +
        " AS TEXT)) <> '' ORDER BY value",
      facetBindings,
    ),
  );
  const results = await database.batch([...location, service, ...metadata]);
  return {
    regions: [...new Set(values(results[0].results))],
    districts: values(results[1].results),
    cities: values(results[2].results),
    services: values(results[3].results),
    breeds: values(results[4].results),
    fciGroups: values(results[5].results),
    organizations: values(results[6].results),
    profileTypes: values(results[7].results),
  };
}

async function newOptions(database, filters) {
  const base = buildBase(filters);
  const facetWhere = filters.category
    ? "status = 'published' AND category = ?"
    : "status = 'published'";
  const facetBindings = filters.category ? [filters.category] : [];
  const service = database
    .prepare(
      "SELECT DISTINCT trim(CAST(service_item.value AS TEXT)) AS value FROM directory_profiles, json_each(directory_profiles.services_json) service_item WHERE " +
        facetWhere +
        " AND trim(CAST(service_item.value AS TEXT)) <> '' ORDER BY value",
    )
    .bind(...facetBindings);
  const results = await database.batch([
    directoryLocationFacetStatement(
      database,
      base.sql,
      base.bindings,
      filters.region ?? "",
      filters.district ?? "",
    ),
    service,
    directorySourceFacetStatement(database, facetWhere, facetBindings, source),
  ]);
  const location = results[0].results[0],
    metadata = results[2].results[0];
  return {
    regions: [...new Set(parseDirectoryFacetValues(location?.regions))],
    districts: parseDirectoryFacetValues(location?.districts),
    cities: parseDirectoryFacetValues(location?.cities),
    services: values(results[1].results),
    breeds: parseDirectoryFacetValues(metadata?.breeds),
    fciGroups: parseDirectoryFacetValues(metadata?.fciGroups),
    organizations: parseDirectoryFacetValues(metadata?.organizations),
    profileTypes: parseDirectoryFacetValues(metadata?.profileTypes),
  };
}

async function readPage(database, filters, opts) {
  const base = buildBase(filters);
  const clauses = [base.sql],
    bindings = [...base.bindings];
  const region = opts.regions.includes(filters.region) ? filters.region : "";
  const district =
    (!filters.region || region) && opts.districts.includes(filters.district)
      ? filters.district
      : "";
  const city =
    (!filters.district || district) && opts.cities.includes(filters.city) ? filters.city : "";
  if (region) {
    clauses.push("(region = ? OR region = ?)");
    bindings.push(region, region.replace(/ kraj$/, ""));
  }
  if (district) {
    clauses.push(districtSql + " = ?");
    bindings.push(district);
  }
  if (city) {
    clauses.push("city = ?");
    bindings.push(city);
  }
  const where = clauses.join(" AND ");
  const sort = {
    recommended: "featured DESC, name ASC, id ASC",
    "name-asc": "name ASC, id ASC",
    "name-desc": "name DESC, id DESC",
    newest: "published_at DESC, id DESC",
  }[filters.sort ?? "recommended"];
  const count = await database
    .prepare("SELECT COUNT(*) AS total FROM directory_profiles WHERE " + where)
    .bind(...bindings)
    .first();
  const total = Number(count?.total ?? 0),
    pageSize = filters.pageSize ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const result = await database
    .prepare(
      "SELECT id FROM directory_profiles WHERE " +
        where +
        " ORDER BY " +
        sort +
        " LIMIT ? OFFSET ?",
    )
    .bind(...bindings, pageSize, (page - 1) * pageSize)
    .all();
  return { total, page, totalPages, ids: result.results.map((row) => row.id), options: opts };
}

const cases = [
  {},
  { category: "veterinari" },
  { category: "treneri" },
  { category: "salony-a-sluzby" },
  { category: "nema-taku-kategoriu" },
  { region: "Nitriansky kraj" },
  { region: "Nitriansky kraj", district: "Nitra" },
  { region: "Nitriansky kraj", district: "Nitra", city: "Nitra" },
  { region: "Neexistuje", district: "Nitra", city: "Nitra" },
  { region: "Trnavský kraj", district: "Žilina", city: "Žilina" },
  { district: "Žilina", city: "Žilina" },
  { category: "veterinari", region: "Žilinský kraj", district: "Žilina" },
  { category: "treneri", query: "nitra", region: "Nitriansky kraj" },
  { service: "Kúpanie" },
  { service: "Neexistuje" },
  { category: "fyzioterapia", breed: "Labrador" },
  { fciGroup: "3" },
  { organization: "Klub 4" },
  { profileType: "Typ 2" },
  { category: "veterinari", page: 999, pageSize: 7 },
  { category: "treneri", page: 2, pageSize: 5 },
  { category: "treneri", sort: "newest" },
  { category: "salony-a-sluzby", sort: "name-asc", page: 3 },
  { category: "hotely-a-opatrovanie", sort: "name-desc" },
];

test("public facet rollups preserve eight canonical-first options, count, sort, page and IDs", async () => {
  const { database, getCalls, close } = fixture();
  try {
    for (const [index, filters] of cases.entries()) {
      const oldStart = getCalls();
      const old = await readPage(database, filters, await oldOptions(database, filters));
      const legacySqlCount = getCalls() - oldStart;
      const newStart = getCalls();
      const now = await readPage(database, filters, await newOptions(database, filters));
      assert.deepEqual(now, old, "case " + index + ": " + JSON.stringify(filters));
      assert.equal(legacySqlCount, 10, "legacy listing statements");
      assert.equal(getCalls() - newStart, 5, "optimized listing statements");
    }
  } finally {
    close();
  }
});

test("empty dataset, duplicate values, fallback district, NULL and category scopes retain semantics", async () => {
  const { database, close } = fixture(0);
  try {
    for (const filters of [
      {},
      { category: "veterinari" },
      { region: "Nitriansky kraj", district: "Nitra" },
    ]) {
      const before = await readPage(database, filters, await oldOptions(database, filters));
      const after = await readPage(database, filters, await newOptions(database, filters));
      assert.deepEqual(after, before);
      assert.equal(after.total, 0);
    }
  } finally {
    close();
  }
});

test("facet decoding keeps SQLite BINARY order and raw location whitespace duplicates", () => {
  assert.deepEqual(
    parseDirectoryFacetValues(JSON.stringify(["😀", "Nitra", " Nitra", null, " ", "\uE000"])),
    ["Nitra", "Nitra", "\uE000", "😀"],
  );
});

test("canonical service options share the facet request's latency budget; disabled never queries new tables", () => {
  const fn = store.slice(
    store.indexOf("export async function listPublishedDirectoryProfiles("),
    store.indexOf("export async function getDirectoryCategoryCounts("),
  );
  assert.match(fn, /const canonicalServicesEnabled =\s*canonicalPublicEnabled/);
  assert.match(fn, /if \(!canonicalServicesEnabled \|\| !category\) return \[\]/);
  assert.match(
    fn,
    /Promise\.all\(\[\s*database\.batch\(\[locationStatement, sourceStatement\]\),\s*loadCanonicalServices\(\),\s*loadCanonicalBreedOptions\(\),\s*earlyCount,\s*\]\)/,
  );
  assert.match(
    fn,
    /const canCountWithFacets =\s*!options\.filters\.region && !options\.filters\.district && !options\.filters\.city/,
  );
  assert.match(fn, /const count = preloadedCount \?\? \(await countStatement\.first/);
  assert.match(
    fn,
    /readNonemptyD1Page\(total, \(\) =>\s*listStatement\.all<DirectoryProfileRow>\(\),?\s*\)/,
  );
  assert.doesNotMatch(fn, /await listStatement\.all<DirectoryProfileRow>\(\)/);
});

test("actual SQLite reads: no page SQL for verified empty count, full rows otherwise", async () => {
  const { database, getCalls, close } = fixture(40);
  try {
    const load = () =>
      database
        .prepare(
          "SELECT id, name FROM directory_profiles WHERE status = 'published' ORDER BY name ASC LIMIT 5",
        )
        .all();
    const callsBeforeEmpty = getCalls();
    assert.deepEqual(await readNonemptyD1Page(0, load), { results: [] });
    assert.equal(getCalls(), callsBeforeEmpty, "empty page must not prepare or execute SQL");
    const populated = await readNonemptyD1Page(12, load);
    assert.equal(populated.results.length, 5);
    assert.deepEqual(
      populated.results.map((row) => row.name),
      ["Profil 1", "Profil 10", "Profil 11", "Profil 12", "Profil 14"],
    );
    assert.equal(getCalls(), callsBeforeEmpty + 1, "nonempty page runs exactly one query");
    const failure = new Error("D1 unavailable");
    await assert.rejects(
      readNonemptyD1Page(1, async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  } finally {
    close();
  }
});

test("option scans omit legacy services and use two rollups without touching publication or pagination contracts", () => {
  const fn = store.slice(
    store.indexOf("export async function listPublishedDirectoryProfiles("),
    store.indexOf("export async function getDirectoryCategoryCounts("),
  );
  assert.match(fn, /database\.batch\(\[locationStatement, sourceStatement\]\)/);
  assert.match(fn, /SELECT COUNT\(\*\) AS total/);
  assert.match(fn, /ORDER BY \$\{orderBy\} LIMIT \? OFFSET \?/);
  assert.match(fn, /Math\.min\(48/);
  assert.match(fn, /locationFacets\?\.districts/);
});

test("reproducible SQLite benchmark: report elapsed times, never assert machine-dependent speed", async () => {
  const { database, close } = fixture(1800);
  const filters = { category: "veterinari", region: "Nitriansky kraj", service: "Vyšetrenie" };
  try {
    for (let i = 0; i < 3; i++) {
      await oldOptions(database, filters);
      await newOptions(database, filters);
    }
    const loop = async (f) => {
      const start = process.hrtime.bigint();
      for (let i = 0; i < 15; i++) await f(database, filters);
      return Number(process.hrtime.bigint() - start) / 1e6 / 15;
    };
    const baselineMs = await loop(oldOptions);
    const optimizedMs = await loop(newOptions);
    console.log(
      "# directory fixture: rows=1800, per-request option SQL=8 -> 3; local sqlite mean ms: " +
        baselineMs.toFixed(2) +
        " -> " +
        optimizedMs.toFixed(2) +
        "; NOT production D1 Insights or a Lighthouse/LCP measurement",
    );
  } finally {
    close();
  }
});


test("production-hot canonical breeder options and source facets preserve SQL results without repeating winner windows", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, status TEXT, fci_number INTEGER, import_key TEXT, slug TEXT, name TEXT, fci_group INTEGER, seo_json TEXT)");
    sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, status TEXT, category TEXT, source_data_json TEXT)");
    sqlite.exec("CREATE TABLE directory_profile_additional_categories (profile_id INTEGER, category TEXT, updated_at TEXT, updated_by TEXT, PRIMARY KEY(profile_id,category))");
    sqlite.exec("CREATE TABLE breed_directory_relations (profile_id INTEGER, breed_id INTEGER)");
    sqlite.exec("CREATE TABLE directory_profile_public_facts (profile_id INTEGER, field_key TEXT, value_text TEXT, PRIMARY KEY(profile_id,field_key))");
    sqlite.exec("CREATE TABLE directory_profile_extra_fields (profile_id INTEGER, field_key TEXT, text_value TEXT, PRIMARY KEY(profile_id,field_key))");
    const breedInsert = sqlite.prepare("INSERT INTO managed_breeds VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const row of [
      [1,"published",101,"A","alpha","Alfa",1,"{}"],
      [2,"published",101,"B","beta","Beta",1,"{}"], // FCI loser
      [3,"published",102,"C","gamma","Gamma",1,"{}"],
      [4,"published",103,"D","delta","Noindex",1,'{"noindex":1}'],
      [5,"published",104,"E","epsilon","Epsilon",1,"{}"],
      [6,"published",106," C ","zeta","Trimmed key loser",1,"{}"],
      [7,"published",107,"G","eta","External",1,'{"canonicalUrl":"/plemena/other"}'],
      [8,"draft",108,"H","theta","Draft",1,"{}"],
      [9,"published",109,"I","epsilon","Second slug loser",1,"{}"],
    ]) breedInsert.run(...row);
    const profileInsert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?, ?)");
    const extras = (items) => JSON.stringify({"_psipedia_additional_categories": JSON.stringify(items), Plemeno:"Legacy"});
    for (const row of [
      [10,"published","chovatelske-stanice",extras([])],
      [11,"published","chovatelske-stanice",extras([])],
      [12,"published","chovatelske-stanice",extras(["treneri"])],
      [13,"draft","chovatelske-stanice",extras([])],
      [14,"published","veterinari",extras(["chovatelske-stanice"])],
      [15,"published","chovatelske-stanice",extras([])],
    ]) profileInsert.run(...row);
    for(const id of [10,11,12,13,14,15])
      sqlite.prepare("INSERT INTO directory_profile_public_facts VALUES(?,?,?)").run(id,"Plemeno","Legacy");
    const link = sqlite.prepare("INSERT INTO breed_directory_relations VALUES (?, ?)");
    for (const pair of [[10,1],[10,4],[11,2],[11,6],[12,3],[12,5],[13,5],[14,3],[15,7]]) link.run(...pair);
    const database = {
      prepare(sql) {
        return {
          async all() { return {results: sqlite.prepare(sql).all()}; },
        };
      },
    };
    sqlite.exec(`ALTER TABLE managed_breeds ADD COLUMN seo_noindex INTEGER; ALTER TABLE managed_breeds ADD COLUMN seo_canonical_url TEXT; UPDATE managed_breeds SET seo_noindex=COALESCE(json_extract(seo_json,'$.noindex'),0), seo_canonical_url=json_extract(seo_json,'$.canonicalUrl');`);
    const canonicalIds = await readCanonicalBreedIds(database);
    assert.deepEqual(canonicalIds, sqlite.prepare(canonicalBreedIdsSql).all().map((row) => row.id).sort((a,b) => a-b));
    assert.deepEqual(canonicalIds,[1,3,5]);

    const oldBreedExpr = "CASE WHEN directory_profiles.category='chovatelske-stanice' AND EXISTS (" +
      "SELECT 1 FROM breed_directory_relations linked JOIN managed_breeds linked_breed ON linked_breed.id=linked.breed_id " +
      "WHERE linked.profile_id=directory_profiles.id AND linked_breed.id IN ("+canonicalBreedIdsSql+")) THEN '' ELSE "+
      DIRECTORY_PUBLIC_SOURCE_FACETS.breed+" END";
    const newBreedExpr = directoryCanonicalBreedFacetSql(DIRECTORY_PUBLIC_SOURCE_FACETS.breed);
    const oldRowSql = "SELECT id, " + oldBreedExpr + " AS breed FROM directory_profiles WHERE status='published' ORDER BY id";
    const newRowSql = "SELECT id, " + newBreedExpr + " AS breed FROM directory_profiles WHERE status='published' ORDER BY id";
    assert.deepEqual(sqlite.prepare(newRowSql).all(JSON.stringify(canonicalIds)), sqlite.prepare(oldRowSql).all());

    const oldFacetSql = "SELECT json_group_array(DISTINCT trim(CAST(" + oldBreedExpr +
      " AS TEXT))) AS breeds FROM directory_profiles WHERE status='published'";
    const optimizedFacet = directorySourceFacetStatement({
      prepare(sql) {
        return { bind(...args) { return {
          async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        }; } };
      },
    }, "status='published' AND category = ?", ["chovatelske-stanice"], {
      breeds: newBreedExpr,
      fciGroups: DIRECTORY_PUBLIC_SOURCE_FACETS.fciGroup,
      organizations: DIRECTORY_PUBLIC_SOURCE_FACETS.organization,
    }, [JSON.stringify(canonicalIds)]);
    const optimizedResult = (await optimizedFacet.all()).results[0];
    const oldCategoryFacet = sqlite.prepare(oldFacetSql + " AND category = ?").get("chovatelske-stanice");
    assert.deepEqual(
      parseDirectoryFacetValues(optimizedResult.breeds),
      parseDirectoryFacetValues(oldCategoryFacet.breeds),
    );

    const baseOptions = "SELECT DISTINCT linked_breed.name AS name FROM breed_directory_relations linked " +
      "JOIN managed_breeds linked_breed ON linked_breed.id=linked.breed_id " +
      "JOIN directory_profiles linked_profile ON linked_profile.id=linked.profile_id " +
      "WHERE linked_profile.status='published' AND linked_profile.category='chovatelske-stanice' " +
      "AND linked_breed.id IN (";
    const afterOptions = ") AND " + directoryCategoryMembershipSql("linked_profile") +
      " ORDER BY linked_breed.name COLLATE NOCASE LIMIT 500";
    const oldOptions = sqlite.prepare(baseOptions+canonicalBreedIdsSql+afterOptions)
      .all("treneri","treneri");
    const newOptions = sqlite.prepare(baseOptions+"SELECT CAST(value AS INTEGER) FROM json_each(?)"+afterOptions)
      .all(JSON.stringify(canonicalIds),"treneri","treneri");
    assert.deepEqual(newOptions,oldOptions,"secondary category must retain canonical breed options");
    const plan = sqlite.prepare("EXPLAIN QUERY PLAN " + baseOptions +
      "SELECT CAST(value AS INTEGER) FROM json_each(?)" + afterOptions)
      .all(JSON.stringify(canonicalIds),"treneri","treneri");
    assert.ok(!plan.some((row) => /CO-ROUTINE winners|managed_breeds b\b/i.test(String(row.detail))),
      "optimized linked options must not execute breed-identity windows");

    // No hidden persistent cache when publication or SEO is modified.
    sqlite.prepare("UPDATE managed_breeds SET seo_json=?,seo_noindex=1 WHERE id=1").run('{"noindex":true}');
    assert.deepEqual(await readCanonicalBreedIds(database),
      sqlite.prepare(canonicalBreedIdsSql).all().map((row) => row.id).sort((a,b) => a-b));
  } finally {
    sqlite.close();
  }
});
