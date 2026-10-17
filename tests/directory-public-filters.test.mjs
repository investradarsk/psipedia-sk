import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  directoryFilterRegistry, serviceFilterCategories, serviceFiltersForCategory,
} from "../lib/directory-filter-contract.ts";
import {
  parsePublicDirectoryFacets, directoryPublicFacetSql,
  directoryPublicFacetQueryFields, publicDirectoryFacetOptions,
} from "../lib/directory-public-filters.ts";
import { directoryPageHref, directoryQueryFields, directoryEmptyQueryRedirect } from "../lib/directory-query.ts";
import {
  EMPTY_MAP_FILTERS, MAP_DEFAULT_BBOX, buildMapApiUrl,
  mapFiltersFromSearchParams, serializeMapUiFilters,
} from "../lib/map-public-ui.ts";
import { MapQueryValidationError, parseMapQuery } from "../lib/map-contract.ts";

const read = (path) => readFileSync(path, "utf8");
const selectedValue = (definition) => definition.valueType === "tri_state" ? "yes" : "clinic";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, source_data_json TEXT)");
const insert = sqlite.prepare("INSERT INTO directory_profiles VALUES (?, ?, ?)");
let nextId = 0;

test("21 existing category definitions across 10 categories are used without a shadow registry", () => {
  assert.equal(directoryFilterRegistry.length, 21);
  assert.equal(serviceFilterCategories.length, 10);
  for (const category of serviceFilterCategories) {
    const entries = serviceFiltersForCategory(category);
    assert.ok(entries.length >= 2);
    for (const entry of entries) {
      const key = "f." + entry.id;
      const val = selectedValue(entry);
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: val }, category), { [entry.id]: val });
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: val }, "dalsie-sluzby" === category ? "veterinari" : "dalsie-sluzby"), {});
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: [val, val] }, category), {});
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: "unknown" }, category), {});
      assert.ok(!publicDirectoryFacetOptions(entry).includes("unknown"));
      assert.deepEqual(directoryPublicFacetQueryFields({ [entry.id]: val }), [{ name: key, value: val }]);
    }
  }
});

test("parameterized SQLite queries match explicit values only; missing, unknown and legacy text never count", () => {
  for (const definition of directoryFilterRegistry) {
    const value = selectedValue(definition);
    const rawKey = definition.d1.key;
    const matching = ++nextId;
    insert.run(matching, definition.category, JSON.stringify({ [rawKey]: value }));
    insert.run(++nextId, definition.category, JSON.stringify({ [rawKey]: "unknown" }));
    insert.run(++nextId, definition.category, JSON.stringify({ [rawKey]: "verejné " + value, "Typ služby": value }));
    insert.run(++nextId, definition.category, JSON.stringify({ "Typ služby": value }));
    const where = directoryPublicFacetSql(definition.category, { [definition.id]: value });
    assert.equal(where.clauses.length, 1);
    assert.equal(where.bindings.length, 1);
    assert.ok(where.clauses[0].includes("json_extract("));
    assert.ok(where.clauses[0].endsWith("= ?"));
    assert.equal(where.bindings[0], value);
    const ids = sqlite.prepare("SELECT id FROM directory_profiles WHERE category = ? AND " + where.clauses.join(" AND ") + " ORDER BY id").all(definition.category, ...where.bindings);
    assert.ok(ids.some((row) => row.id === matching), definition.id);
    assert.ok(!ids.some((row) => row.id === matching + 1 || row.id === matching + 2 || row.id === matching + 3), definition.id);
  }
});

test("explicit no differs from absent and unknown; select and tri-state facets can be AND-combined", () => {
  const defs = serviceFiltersForCategory("veterinari");
  const row = ++nextId;
  insert.run(row, "veterinari", JSON.stringify({ [defs[0].d1.key]: "clinic", [defs[1].d1.key]: "no", [defs[2].d1.key]: "yes" }));
  for (const value of ["no", "yes"]) {
    const condition = directoryPublicFacetSql("veterinari", { [defs[0].id]: "clinic", [defs[1].id]: value });
    const ids = sqlite.prepare("SELECT id FROM directory_profiles WHERE category = 'veterinari' AND " + condition.clauses.join(" AND ")).all(...condition.bindings);
    assert.equal(ids.some((r) => r.id === row), value === "no");
  }
  assert.deepEqual(directoryPublicFacetSql("veterinari", { [defs[1].id]: "unknown" }), { clauses: [], bindings: [] });
  assert.deepEqual(directoryPublicFacetSql("veterinari", { "vencenie.group_walks": "yes" }), { clauses: [], bindings: [] });
});

test("existing search/page and filter serialization preserve canonical public GET round trip", () => {
  const facets = { "veterinari.emergency": "yes", "veterinari.facility_type": "clinic" };
  const filters = {
    query: "Nitra", category: "", region: "Nitriansky kraj", district: "Nitra", city: "",
    service: "Vyšetrenie", breed: "", fciGroup: "", organization: "", profileType: "",
    sort: "name-asc", page: 2, facets,
  };
  const url = new URL(directoryPageHref("/adresar/veterinari", filters, 3), "https://psipedia.sk");
  assert.equal(url.searchParams.get("q"), "Nitra");
  assert.equal(url.searchParams.get("f.veterinari.emergency"), "yes");
  assert.equal(url.searchParams.get("f.veterinari.facility_type"), "clinic");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(directoryQueryFields(filters, ["page"]).some((f) => f.name === "page"), false);
  assert.equal(directoryQueryFields(filters, ["facets"]).some((f) => f.name.startsWith("f.")), false);
  assert.ok(directoryEmptyQueryRedirect("/adresar/veterinari", { q: "" }, { ...filters, query: "" }).includes("f.veterinari.emergency=yes"));
});

test("existing map share/deep-link/API state narrows category facets without exposing new controls", () => {
  const filters = { ...EMPTY_MAP_FILTERS, category: "services", subcategory: "veterinari", region: "Nitriansky kraj", facets: { "veterinari.emergency": "yes" } };
  const serialized = serializeMapUiFilters(filters);
  assert.equal(serialized.get("f.veterinari.emergency"), "yes");
  assert.deepEqual(mapFiltersFromSearchParams(serialized).facets, filters.facets);
  const url = new URL(buildMapApiUrl({ bbox: MAP_DEFAULT_BBOX, zoom: 12 }, filters), "https://psipedia.sk");
  assert.equal(url.searchParams.get("f.veterinari.emergency"), "yes");
  const input = parseMapQuery(url.searchParams);
  assert.deepEqual(input.facets, filters.facets);
  assert.equal(input.category, "services");
  assert.equal(input.subcategory, "veterinari");
  for (const bad of ["unknown", "invalid", "no;DROP TABLE directory_profiles;"]) {
    url.searchParams.set("f.veterinari.emergency", bad);
    assert.throws(() => parseMapQuery(url.searchParams), MapQueryValidationError);
  }
  url.searchParams.set("f.veterinari.emergency", "yes");
  url.searchParams.append("f.veterinari.emergency", "no");
  assert.throws(() => parseMapQuery(url.searchParams), MapQueryValidationError);
});

test("public source mounts wire map/sql facets, while admin, Notion and editor paths remain untouched", () => {
  const store = read("lib/directory-store.ts");
  const map = read("lib/map-query.ts");
  const page = read("components/directory-page.tsx");
  const category = read("app/adresar/[category]/page.tsx");
  const filter = read("components/directory-filter-form.tsx");
  assert.match(store, /directoryPublicFacetSql\(category \?\? "", options\.filters\.facets\)/);
  assert.match(store, /baseClauses\.push\(\.\.\.publicFacets\.clauses\)/);
  assert.match(map, /directoryPublicFacetSql\(query\.subcategory \?\? "", query\.facets, "d\.source_data_json"\)/);
  assert.match(page, /facets: filters\.facets/);
  assert.match(category, /parseDirectoryFilters\(rawSearchParams, category\.slug\)/);
  assert.doesNotMatch(filter, /DirectoryCategoryFilterFields/);
});
