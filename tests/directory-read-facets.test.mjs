import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  directoryLocationFacetStatement,
  directorySourceFacetStatement,
  parseDirectoryFacetValues,
} from "../lib/directory-read-facets.ts";

const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const districtSql = "COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$.\"Okres\"'), '')";
const source = {
  breeds: "COALESCE(NULLIF(json_extract(source_data_json, '$.\"Plemeno\"'), ''), NULLIF(json_extract(source_data_json, '$.\"Plemená\"'), ''), '')",
  fciGroups: "COALESCE(NULLIF(json_extract(source_data_json, '$.\"FCI skupina\"'), ''), NULLIF(json_extract(source_data_json, '$.\"FCI\"'), ''), '')",
  organizations: "COALESCE(NULLIF(json_extract(source_data_json, '$.\"Organizácia\"'), ''), NULLIF(json_extract(source_data_json, '$.\"Zastrešujúca organizácia\"'), ''), '')",
  profileTypes: "COALESCE(NULLIF(json_extract(source_data_json, '$.\"Typ služby\"'), ''), NULLIF(json_extract(source_data_json, '$.\"Typ poskytovateľa\"'), ''), NULLIF(json_extract(source_data_json, '$.\"Typ klubu\"'), ''), '')",
};
const categories = [
  "veterinari", "treneri", "salony-a-sluzby", "chovatelske-stanice",
  "hotely-a-opatrovanie", "utulky-a-zachrana", "kluby-a-organizacie",
  "fyzioterapia", "eshopy", "ostatne",
];
const regions = ["Nitriansky kraj", "Trnavský kraj", "Bratislavský kraj", "Žilinský kraj"];
const districts = ["Nitra", "Trnava", "Bratislava I", "Žilina"];
const cities = ["Nitra", "Trnava", "Bratislava", "Žilina"];
const serviceNames = ["Vyšetrenie", "Výcvik", "Kúpanie", "Opatrovanie"];
const breeds = ["Labrador", "Border kólia", "Špic", "  ", "Akita"];

function fixture(size = 1100) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT, status TEXT, category TEXT, region TEXT, district TEXT, city TEXT, services_json TEXT, source_data_json TEXT, search_text TEXT, featured INTEGER, published_at TEXT)");
  const insert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let id = 1; id <= size; id++) {
    const r = id % 4, alternate = id % 9 === 0;
    const data = {
      Okres: districts[r], Plemeno: id % 7 === 0 ? "" : breeds[id % 5],
      "Plemená": breeds[(id + 1) % 5], "FCI skupina": id % 3 === 0 ? "" : String(id % 10),
      FCI: String(id % 10), Organizácia: alternate ? "" : "Klub " + (id % 11),
      "Zastrešujúca organizácia": "Zväz " + (id % 7),
      "Typ služby": id % 5 === 0 ? "" : "Typ " + (id % 5),
      "Typ poskytovateľa": "Poskytovateľ", "Typ klubu": "Klub",
    };
    insert.run(
      id, "Profil " + id, id % 13 === 0 ? "draft" : "published",
      categories[id % categories.length], regions[r], id % 8 === 0 ? "" : districts[r],
      cities[r], JSON.stringify(id % 17 === 0 ? [] : [serviceNames[id % 4], serviceNames[(id + 1) % 4]]),
      JSON.stringify(data), id % 6 === 0 ? "nitra" : "sluzby",
      id % 9 === 0 ? 1 : 0, "2026-10-" + String(1 + id % 12).padStart(2, "0"),
    );
  }
  // Non-published and NULL-rich cases must not pollute source or location facets.
  insert.run(size + 1, "Výnimka", "draft", categories[0], "Nitriansky kraj", "Nitra", "Nitra", "[]", "{}", "", 0, "2026-10-01");
  let calls = 0;
  const database = {
    prepare(sql) {
      calls++;
      let bindings = [];
      return {
        bind(...args) { bindings = args; return this; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) }; },
        async first() { return sqlite.prepare(sql).get(...bindings); },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.all())); },
  };
  return { sqlite, database, getCalls: () => calls, close: () => sqlite.close() };
}

const values = (rows) => rows.map((row) => (row.value ?? "").trim()).filter(Boolean);
function buildBase(filters) {
  const clauses = ["status = 'published'"], bindings = [];
  if (filters.category) { clauses.push("category = ?"); bindings.push(filters.category); }
  if (filters.query) { clauses.push("search_text LIKE ?"); bindings.push("%" + filters.query + "%"); }
  if (filters.service) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(directory_profiles.services_json) service_item WHERE trim(CAST(service_item.value AS TEXT)) = ?)");
    bindings.push(filters.service);
  }
  if (filters.breed) { clauses.push(source.breeds + " = ?"); bindings.push(filters.breed); }
  if (filters.fciGroup) { clauses.push(source.fciGroups + " = ?"); bindings.push(filters.fciGroup); }
  if (filters.organization) { clauses.push(source.organizations + " = ?"); bindings.push(filters.organization); }
  if (filters.profileType) { clauses.push(source.profileTypes + " = ?"); bindings.push(filters.profileType); }
  return { sql: clauses.join(" AND "), bindings };
}

function locationWhere(base, filters, level) {
  const clauses = [base.sql], bindings = [...base.bindings];
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
  const facetWhere = filters.category ? "status = 'published' AND category = ?" : "status = 'published'";
  const facetBindings = filters.category ? [filters.category] : [];
  const prepare = (sql, bindings = []) => database.prepare(sql).bind(...bindings);
  const location = ["region", "district", "city"].map((level) => {
    const where = locationWhere(base, filters, level);
    const expression = level === "district" ? districtSql : level;
    return prepare("SELECT DISTINCT " + expression + " AS value FROM directory_profiles WHERE " +
      where.sql + " AND " + expression + " <> '' ORDER BY value", where.bindings);
  });
  const service = prepare(
    "SELECT DISTINCT trim(CAST(service_item.value AS TEXT)) AS value FROM directory_profiles, json_each(directory_profiles.services_json) service_item WHERE " +
      facetWhere + " AND trim(CAST(service_item.value AS TEXT)) <> '' ORDER BY value", facetBindings);
  const metadata = Object.values(source).map((expression) => prepare(
    "SELECT DISTINCT trim(CAST(" + expression + " AS TEXT)) AS value FROM directory_profiles WHERE " +
      facetWhere + " AND trim(CAST(" + expression + " AS TEXT)) <> '' ORDER BY value", facetBindings));
  const results = await database.batch([...location, service, ...metadata]);
  return {
    regions: [...new Set(values(results[0].results))], districts: values(results[1].results),
    cities: values(results[2].results), services: values(results[3].results),
    breeds: values(results[4].results), fciGroups: values(results[5].results),
    organizations: values(results[6].results), profileTypes: values(results[7].results),
  };
}

async function newOptions(database, filters) {
  const base = buildBase(filters);
  const facetWhere = filters.category ? "status = 'published' AND category = ?" : "status = 'published'";
  const facetBindings = filters.category ? [filters.category] : [];
  const service = database.prepare(
    "SELECT DISTINCT trim(CAST(service_item.value AS TEXT)) AS value FROM directory_profiles, json_each(directory_profiles.services_json) service_item WHERE " +
      facetWhere + " AND trim(CAST(service_item.value AS TEXT)) <> '' ORDER BY value").bind(...facetBindings);
  const results = await database.batch([
    directoryLocationFacetStatement(database, base.sql, base.bindings, filters.region ?? "", filters.district ?? ""),
    service,
    directorySourceFacetStatement(database, facetWhere, facetBindings, source),
  ]);
  const location = results[0].results[0], metadata = results[2].results[0];
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
  const clauses = [base.sql], bindings = [...base.bindings];
  const region = opts.regions.includes(filters.region) ? filters.region : "";
  const district = (!filters.region || region) && opts.districts.includes(filters.district) ? filters.district : "";
  const city = (!filters.district || district) && opts.cities.includes(filters.city) ? filters.city : "";
  if (region) { clauses.push("(region = ? OR region = ?)"); bindings.push(region, region.replace(/ kraj$/, "")); }
  if (district) { clauses.push(districtSql + " = ?"); bindings.push(district); }
  if (city) { clauses.push("city = ?"); bindings.push(city); }
  const where = clauses.join(" AND ");
  const sort = {
    recommended: "featured DESC, name ASC, id ASC",
    "name-asc": "name ASC, id ASC",
    "name-desc": "name DESC, id DESC",
    newest: "published_at DESC, id DESC",
  }[filters.sort ?? "recommended"];
  const count = await database.prepare("SELECT COUNT(*) AS total FROM directory_profiles WHERE " + where).bind(...bindings).first();
  const total = Number(count?.total ?? 0), pageSize = filters.pageSize ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const result = await database.prepare("SELECT id FROM directory_profiles WHERE " + where +
    " ORDER BY " + sort + " LIMIT ? OFFSET ?").bind(...bindings, pageSize, (page - 1) * pageSize).all();
  return { total, page, totalPages, ids: result.results.map((row) => row.id), options: opts };
}

const cases = [
  {}, { category: "veterinari" }, { category: "treneri" },
  { category: "salony-a-sluzby" }, { category: "nema-taku-kategoriu" },
  { region: "Nitriansky kraj" }, { region: "Nitriansky kraj", district: "Nitra" },
  { region: "Nitriansky kraj", district: "Nitra", city: "Nitra" },
  { region: "Neexistuje", district: "Nitra", city: "Nitra" },
  { region: "Trnavský kraj", district: "Žilina", city: "Žilina" },
  { district: "Žilina", city: "Žilina" },
  { category: "veterinari", region: "Žilinský kraj", district: "Žilina" },
  { category: "treneri", query: "nitra", region: "Nitriansky kraj" },
  { service: "Kúpanie" }, { service: "Neexistuje" },
  { category: "fyzioterapia", breed: "Labrador" },
  { fciGroup: "3" }, { organization: "Klub 4" }, { profileType: "Typ 2" },
  { category: "veterinari", page: 999, pageSize: 7 },
  { category: "treneri", page: 2, pageSize: 5 },
  { category: "treneri", sort: "newest" },
  { category: "salony-a-sluzby", sort: "name-asc", page: 3 },
  { category: "hotely-a-opatrovanie", sort: "name-desc" },
];

test("public facet rollups preserve eight legacy options, count, sort, page and IDs", async () => {
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
  } finally { close(); }
});

test("empty dataset, duplicate values, fallback district, NULL and category scopes retain semantics", async () => {
  const { database, close } = fixture(0);
  try {
    for (const filters of [{}, { category: "veterinari" }, { region: "Nitriansky kraj", district: "Nitra" }]) {
      const before = await readPage(database, filters, await oldOptions(database, filters));
      const after = await readPage(database, filters, await newOptions(database, filters));
      assert.deepEqual(after, before);
      assert.equal(after.total, 0);
    }
  } finally { close(); }
});

test("option scans shrink from eight to three without touching publication or pagination contracts", () => {
  const fn = store.slice(store.indexOf("export async function listPublishedDirectoryProfiles("),
    store.indexOf("export async function getDirectoryCategoryCounts("));
  assert.match(fn, /database\.batch\(\[locationStatement, serviceStatement, sourceStatement\]\)/);
  assert.match(fn, /SELECT COUNT\(\*\) AS total/);
  assert.match(fn, /ORDER BY \$\{orderBy\} LIMIT \? OFFSET \?/);
  assert.match(fn, /Math\.min\(48/);
  assert.match(fn, /locationFacets\?\.districts/);
});

test("reproducible SQLite benchmark: report elapsed times, never assert machine-dependent speed", async () => {
  const { database, close } = fixture(1800);
  const filters = { category: "veterinari", region: "Nitriansky kraj", service: "Vyšetrenie" };
  try {
    for (let i = 0; i < 3; i++) { await oldOptions(database, filters); await newOptions(database, filters); }
    const loop = async (f) => {
      const start = process.hrtime.bigint();
      for (let i = 0; i < 15; i++) await f(database, filters);
      return Number(process.hrtime.bigint() - start) / 1e6 / 15;
    };
    const baselineMs = await loop(oldOptions);
    const optimizedMs = await loop(newOptions);
    console.log("# directory fixture: rows=1800, per-request option SQL=8 -> 3; local sqlite mean ms: " +
      baselineMs.toFixed(2) + " -> " + optimizedMs.toFixed(2) +
      "; NOT production D1 Insights or a Lighthouse/LCP measurement");
  } finally { close(); }
});
