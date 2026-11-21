import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  directoryFilterRegistry,
  serviceFilterCategories,
  serviceFiltersForCategory,
} from "../lib/directory-filter-contract.ts";
import {
  parsePublicDirectoryFacets,
  directoryPublicFacetSql,
  directoryPublicFacetQueryFields,
  publicDirectoryFacetOptions,
} from "../lib/directory-public-filters.ts";
import {
  directoryPageHref,
  directoryQueryFields,
  directoryEmptyQueryRedirect,
} from "../lib/directory-query.ts";
import {
  EMPTY_MAP_FILTERS,
  MAP_DEFAULT_BBOX,
  buildMapApiUrl,
  mapFiltersFromSearchParams,
  serializeMapUiFilters,
} from "../lib/map-public-ui.ts";
import { MapQueryValidationError, parseMapQuery } from "../lib/map-contract.ts";
import { legacyFacetMappings } from "../lib/service-catalog-contract.ts";

const read = (path) => readFileSync(path, "utf8");
const selectedValue = (definition) => (definition.valueType === "tri_state" ? "yes" : "clinic");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, source_data_json TEXT)",
);
sqlite.exec("CREATE TABLE service_profile_option_choices (profile_id INTEGER, option_id TEXT, choice TEXT)");
sqlite.exec("CREATE TABLE directory_profile_filter_values (profile_id INTEGER, category TEXT, filter_id TEXT, value_text TEXT)");
const canonicalMapping = new Map(legacyFacetMappings
  .filter((mapping) => mapping.targetKind !== "provider")
  .map((mapping) => [mapping.legacyId, mapping.targetId]));
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
      assert.deepEqual(
        parsePublicDirectoryFacets(
          { [key]: val },
          "dalsie-sluzby" === category ? "veterinari" : "dalsie-sluzby",
        ),
        {},
      );
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: [val, val] }, category), {});
      assert.deepEqual(parsePublicDirectoryFacets({ [key]: "unknown" }, category), {});
      assert.ok(!publicDirectoryFacetOptions(entry).includes("unknown"));
      assert.deepEqual(directoryPublicFacetQueryFields({ [entry.id]: val }), [
        { name: key, value: val },
      ]);
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
    insert.run(
      ++nextId,
      definition.category,
      JSON.stringify({ [rawKey]: "verejné " + value, "Typ služby": value }),
    );
    insert.run(++nextId, definition.category, JSON.stringify({ "Typ služby": value }));
    const where = directoryPublicFacetSql(definition.category, { [definition.id]: value });
    assert.equal(where.clauses.length, 1);
    const catalogId = canonicalMapping.get(definition.id);
    if (catalogId) {
      sqlite.prepare("INSERT INTO service_profile_option_choices VALUES (?, ?, ?)")
        .run(matching, catalogId, value);
      assert.match(where.clauses[0], /EXISTS \(SELECT 1 FROM service_profile_option_choices/);
      assert.deepEqual(where.bindings, [catalogId, value]);
    } else {
      assert.deepEqual(where.bindings, [definition.category, definition.id, value]);
      assert.ok(where.clauses[0].includes("directory_profile_filter_values"));
      assert.doesNotMatch(where.clauses[0],/source_data_json|json_extract/);
      sqlite.prepare("INSERT INTO directory_profile_filter_values VALUES(?,?,?,?)")
        .run(matching,definition.category,definition.id,value);
    }
    const ids = sqlite
      .prepare(
        "SELECT id FROM directory_profiles WHERE category = ? AND " +
          where.clauses.join(" AND ") +
          " ORDER BY id",
      )
      .all(definition.category, ...where.bindings);
    assert.ok(
      ids.some((row) => row.id === matching),
      definition.id,
    );
    assert.ok(
      !ids.some(
        (row) => row.id === matching + 1 || row.id === matching + 2 || row.id === matching + 3,
      ),
      definition.id,
    );
  }
});

test("explicit no differs from absent and unknown; select and tri-state facets can be AND-combined", () => {
  const defs = serviceFiltersForCategory("veterinari");
  const row = ++nextId;
  insert.run(
    row,
    "veterinari",
    JSON.stringify({ [defs[0].d1.key]: "clinic", [defs[1].d1.key]: "no", [defs[2].d1.key]: "yes" }),
  );
  sqlite.prepare("INSERT INTO service_profile_option_choices VALUES (?, ?, ?)")
    .run(row, "attr.vet.emergency", "no");
  sqlite.prepare("INSERT INTO directory_profile_filter_values VALUES(?,?,?,?)")
    .run(row,"veterinari",defs[0].id,"clinic");
  for (const value of ["no", "yes"]) {
    const condition = directoryPublicFacetSql("veterinari", {
      [defs[0].id]: "clinic",
      [defs[1].id]: value,
    });
    const ids = sqlite
      .prepare(
        "SELECT id FROM directory_profiles WHERE category = 'veterinari' AND " +
          condition.clauses.join(" AND "),
      )
      .all(...condition.bindings);
    assert.equal(
      ids.some((r) => r.id === row),
      value === "no",
    );
  }
  assert.deepEqual(directoryPublicFacetSql("veterinari", { [defs[1].id]: "unknown" }), {
    clauses: [],
    bindings: [],
  });
  assert.deepEqual(directoryPublicFacetSql("veterinari", { "vencenie.group_walks": "yes" }), {
    clauses: [],
    bindings: [],
  });
});

test("0170 provider facet uses SQL only and agrees across list/map aliases", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT);" +
      "CREATE TABLE directory_profile_filter_values (" +
        "profile_id INTEGER, category TEXT, filter_id TEXT, value_text TEXT);",
    );
    const def = serviceFiltersForCategory("veterinari")
      .find((item) => item.id === "veterinari.facility_type");
    assert.ok(def);
    const insert = db.prepare("INSERT INTO directory_profiles (id,category) VALUES (?,'veterinari')");
    for (let id = 1; id <= 8; id++) insert.run(id);
    const sql = db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?)");
    sql.run(1, "veterinari", def.id, "hospital");
    sql.run(2, "veterinari", def.id, "unknown");
    sql.run(4, "veterinari", def.id, "clinic");
    sql.run(5, "veterinari", def.id, "clinic");
    sql.run(6, "veterinari", def.id, "clinic");
    // Wrong-category rows must not gain authority over a primary vet profile.
    sql.run(7, "treneri", def.id, "hospital");
    for (const idExpr of ["directory_profiles.id", "d.id"]) {
      const alias = idExpr === "d.id" ? " d" : "";
      const query = (selected) => {
        const where = directoryPublicFacetSql("veterinari", { [def.id]: selected }, idExpr);
        return db.prepare(
          "SELECT id FROM directory_profiles" + alias + " WHERE category = 'veterinari' AND " +
          where.clauses.join(" AND ") + " ORDER BY id",
        ).all(...where.bindings).map((row) => row.id);
      };
      assert.deepEqual(query("clinic"), [4, 5, 6]);
      assert.deepEqual(query("hospital"), [1]);
    }
    assert.throws(
      () => directoryPublicFacetSql("veterinari", { [def.id]: "clinic" }, "unsafe"),
      /INVALID_COLUMN/,
    );
  } finally {
    db.close();
  }
});

test("existing search/page and filter serialization preserve canonical public GET round trip", () => {
  const facets = { "veterinari.emergency": "yes", "veterinari.facility_type": "clinic" };
  const filters = {
    query: "Nitra",
    category: "",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "",
    service: "Vyšetrenie",
    breed: "",
    fciGroup: "",
    organization: "",
    profileType: "",
    sort: "name-asc",
    page: 2,
    facets,
  };
  const url = new URL(directoryPageHref("/adresar/veterinari", filters, 3), "https://psipedia.sk");
  assert.equal(url.searchParams.get("q"), "Nitra");
  assert.equal(url.searchParams.get("f.veterinari.emergency"), "yes");
  assert.equal(url.searchParams.get("f.veterinari.facility_type"), "clinic");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(
    directoryQueryFields(filters, ["page"]).some((f) => f.name === "page"),
    false,
  );
  assert.equal(
    directoryQueryFields(filters, ["facets"]).some((f) => f.name.startsWith("f.")),
    false,
  );
  assert.ok(
    directoryEmptyQueryRedirect(
      "/adresar/veterinari",
      { q: "" },
      { ...filters, query: "" },
    ).includes("f.veterinari.emergency=yes"),
  );
});

test("existing map share/deep-link/API state narrows category facets without exposing new controls", () => {
  const filters = {
    ...EMPTY_MAP_FILTERS,
    category: "services",
    subcategory: "veterinari",
    region: "Nitriansky kraj",
    facets: { "veterinari.emergency": "yes" },
  };
  const serialized = serializeMapUiFilters(filters);
  assert.equal(serialized.get("f.veterinari.emergency"), "yes");
  assert.deepEqual(mapFiltersFromSearchParams(serialized).facets, filters.facets);
  const url = new URL(
    buildMapApiUrl({ bbox: MAP_DEFAULT_BBOX, zoom: 12 }, filters),
    "https://psipedia.sk",
  );
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
  assert.match(
    map,
    /directoryPublicFacetSql\(\s*query\.subcategory \?\? "",\s*query\.facets,\s*"d\.id",?\s*\)/,
  );
  assert.match(page, /facets: filters\.facets/);
  assert.match(category, /parseDirectoryFilters\(rawSearchParams, category\.slug\)/);
  assert.doesNotMatch(filter, /DirectoryCategoryFilterFields/);
});

test("approved desktop A and mobile B render a single canonical set of category controls", () => {
  const component = read("components/directory-filter-form.tsx");
  const css = read("components/directory-filter-form.module.css");
  const directory = read("components/directory-page.tsx");
  assert.match(component, /serviceFiltersForCategory\(activeCategory\)/);
  assert.match(component, /publicDirectoryFacetKey\(facet\.id\)/);
  assert.match(component, /publicDirectoryFacetOptions\(facet\)/);
  assert.match(component, /data-directory-public-facets/);
  assert.match(component, /facets.map\(\(facet\) => publicDirectoryFacetKey\(facet.id\)\)/);
  assert.match(component, /<dialog\s+id="directory-filter-dialog"/);
  assert.match(component, /\.showModal\(\)/);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /data-directory-active-filters/);
  assert.match(component, /directoryQueryFields\(filters, \["page"\]\)/);
  // Chip removal needs reliable, no-JS-friendly full GET navigation.
  assert.match(component, /<PublicFilterTag\s+key=\{key\}\s+href=\{clearOneHref\(key\)\}/);
  assert.match(
    read("components/public-visual-system/public-result-states.tsx"),
    /return\s*\(?\s*<a\s+className=[\s\S]*?href=\{href\}/,
  );
  assert.match(
    component,
    /<a className=\{styles\.clearAll\} href=\{basePath\} data-public-filter-reset>\s*Vymazať všetko\s*<\/a>/,
  );
  assert.doesNotMatch(component, /<Link className=\{styles\.chip\}/);
  assert.match(directory, /mapHref=\{mapHref\(filters, active\?\.slug\)\}/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /\.dialog::backdrop/);
  assert.match(css, /@media \(max-width: 340px\)/);
  // No new map or category registry or DB writes.
  assert.doesNotMatch(component, /GoogleMap|GoogleMaps|fetch\(|\.prepare\(/);
});

test("facet predicates use SQL relations without any legacy source JSON column", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT);" +
      "CREATE TABLE directory_profile_filter_values (profile_id INTEGER,category TEXT,filter_id TEXT,value_text TEXT)",
    );
    const insert = db.prepare("INSERT INTO directory_profiles (category) VALUES (?)");
    for (let i = 0; i < 5; i++) insert.run("veterinari");
    db.prepare("INSERT INTO directory_profile_filter_values VALUES(?,?,?,?)")
      .run(2,"veterinari","veterinari.facility_type","clinic");
    for (const idExpr of ["directory_profiles.id", "d.id"]) {
      const where = directoryPublicFacetSql(
        "veterinari",
        { "veterinari.facility_type": "clinic" },
        idExpr,
      );
      const from = idExpr === "d.id" ? "directory_profiles d" : "directory_profiles";
      const sql =
        "SELECT id FROM " + from + " WHERE category = 'veterinari' AND " +
        where.clauses.join(" AND ");
      assert.deepEqual(
        db.prepare(sql).all(...where.bindings).map((row) => Number(row.id)),
        [2],
      );
    }
  } finally {
    db.close();
  }
});
