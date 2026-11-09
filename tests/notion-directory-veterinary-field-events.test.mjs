import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  isDirectoryEventPilotCategory,
  isDirectoryFieldEventCategory,
} from "../lib/notion-directory-field-event-scope.ts";
import {
  breederNotionChangedFields,
  breederAdminChangedFields,
  breederApplyNotionChanges,
} from "../lib/notion-breeder-field-events.ts";

const get = path => readFile(new URL(path, import.meta.url), "utf8");

test("the field-event pilot includes kynologické kluby but not unrelated directory categories", () => {
  for (const category of ["veterinari", "kynologicke-kluby", "fyzioterapia", "dalsie-sluzby"]) {
    assert.equal(isDirectoryEventPilotCategory(category), true, category);
    assert.equal(isDirectoryFieldEventCategory(category), true, category);
  }
  for (const category of [
    "chovatelske-stanice", "treneri",
    "chovatelske-kluby", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie",
  ]) assert.equal(isDirectoryEventPilotCategory(category), false, category);
  assert.equal(isDirectoryFieldEventCategory("chovatelske-stanice"), true);
  assert.equal(isDirectoryFieldEventCategory("treneri"), true);
});

test("signed Notion field clears propagate without touching unrelated values", () => {
  const props = {
    Popis: { id: "desc-opaque" }, "SEO title": { id: "seo-opaque" },
    "Sync chyba": { id: "sync-opaque" },
  };
  assert.deepEqual(breederNotionChangedFields(props, ["desc-opaque"]), ["description"]);
  assert.deepEqual(breederNotionChangedFields(props, ["sync-opaque"]), []);
  const original = {
    name: "Existing veterinary clinic", slug: "existing-clinic", category: "veterinari",
    status: "published", description: "Preserved", seo: { title: "Saved" },
  };
  const incoming = { ...original, description: "", seo: { title: "Unverified" } };
  assert.deepEqual(breederApplyNotionChanges(original, incoming, ["description"]),
    { ...original, description: "" });
  assert.deepEqual(breederAdminChangedFields(original, { ...original, seo: { title: "New" } }), ["seo.title"]);
});

test("a pilot editor save exports only changed fields and never creates Notion profiles", async () => {
  const source = await get("../lib/notion-directory-sync.ts");
  const webhook = await get("../app/api/integrations/notion/webhook/route.ts");
  const admin = await get("../app/api/admin/directory/[id]/route.ts");
  const editor = await get("../components/admin-directory-editor.tsx");
  assert.match(webhook, /'veterinari','fyzioterapia','dalsie-sluzby'/);
  assert.match(source, /isDirectoryFieldEventCategory\(profile\.category\)/);
  assert.match(source, /isDirectoryEventPilotCategory\(propertyText\(page, "Kategória"\)\)\) continue/);
  assert.match(source, /isDirectoryEventPilotCategory\(input\.profile\.category\)/);
  assert.match(source, /saveBreederEditorialValue\(database, current, desired, path\)/);
  assert.match(admin, /isDirectoryEventPilotCategory\(before\.category\)/);
  assert.match(editor, /isDirectoryEventPilotCategory\(profile\.category\)/);
  assert.match(source, /adminChangedFields: input\.breederAdminFields/);
  assert.match(source, /breederWebhookPropertyIds: input\.changedPropertyIds/);
  // Services V3 is the only editable service selector for pilot categories.
  // Neither Notion editorial events nor the Admin form may overwrite legacy
  // services_json; the canonical relation API remains independent.
  assert.match(source, /path !== "services" \|\| \["chovatelske-stanice", "salony-a-sluzby", "treneri"\]\.includes\(input\.profile\.category\)/);
  assert.match(source, /DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/);
  assert.match(admin, /isDirectoryEventPilotCategory\(before\.category\)[\s\S]*?services: before\.services/);
  assert.match(editor, /!isDirectoryEventPilotCategory\(category\)\s*\?\s*\([\s\S]*?id="directory-services"/);
  assert.match(editor, /\.filter\(path => path !== "services" \|\| !isDirectoryEventPilotCategory\(category\)\)/);
  const eventBody = source.slice(source.indexOf("async function syncBreederEvent("),
    source.indexOf("export async function mirrorBreederCategoryFiltersToNotion("));
  assert.doesNotMatch(eventBody, /importNotionServiceChoices|syncProfileCatalogRelation/);
});

test("pilot field writes are CAS guarded and preserve unrelated stored data", async () => {
  const ts = await import("typescript");
  const source = await get("../lib/notion-directory-sync.ts");
  const start = source.indexOf("const breederScalarColumns:");
  const end = source.indexOf("/**\n * Mapped breeder/trainer event mode:", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end) +
    "\nexports.saveBreederEditorialValue = saveBreederEditorialValue;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const category of ["veterinari", "kynologicke-kluby", "fyzioterapia", "dalsie-sluzby"]) {
    const logs = [];
    const profile = { id: 123, category, status: "published", updatedAt: "2026-11-07T00:00:00Z" };
    const db = { prepare(sql) { return { bind(...args) {
      logs.push({ sql, args }); return { async first() { return { id: 123 }; } };
    } }; } };
    const exports = {};
    runInNewContext(js, {
      exports, SYSTEM_ACTOR: "sync", isDirectoryEventPilotCategory, isDirectoryFieldEventCategory,
      breederReadPath: (data, path) => path.split(".").reduce((v, k) => v?.[k], data),
      normalizeDirectorySearchText: str => str,
      getManagedDirectoryProfileById: async () => profile,
    });
    const desired = {
      name: "Veterinár", excerpt: "", description: "New description", services: [],
      qualifications: [], region: "", district: "", city: "", address: "",
      postalCode: "", street: "", houseNumber: "",
    };
    await exports.saveBreederEditorialValue(db, profile, desired, "description");
    assert.match(logs[0].sql, /description = \?/);
    assert.match(logs[0].sql, /category = \?/);
    assert.match(logs[0].sql, /updated_at = \?/);
    assert.ok(logs[0].args.includes(category));
    assert.doesNotMatch(logs[0].sql, /services_json =|seo_json =|source_data_json =/);
    await assert.rejects(
      () => exports.saveBreederEditorialValue(db, profile, desired, "services"),
      /DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/,
    );
    assert.equal(logs.length, 1, "Services V3/legacy list was not modified by a pilot editorial event");
  }
});


test("veterinary select facets have an exact Notion contract and event writeback", async () => {
  const ts = await import("typescript");
  const contract = await get("../lib/directory-filter-contract.ts");
  const source = await get("../lib/notion-directory-sync.ts");
  const route = await get("../app/api/admin/directory/[id]/route.ts");
  for (const [id, name] of [
    ["veterinari.facility_type", "Typ pracoviska"],
    ["veterinari.emergency", "Pohotovosť"],
    ["veterinari.home_visits", "Návštevy doma"],
  ]) {
    assert.ok(contract.includes(name), id);
    assert.ok(source.includes('"' + id + '": "' + name + '"'), id);
  }
  assert.match(contract, /category === "veterinari" &&[\s\S]*?name === "facility_type"/);
  assert.match(route, /\["chovatelske-stanice", "treneri", "veterinari"\]\.includes\(row\.category\)/);
  assert.match(source, /const facetFields = \["chovatelske-stanice", "treneri", "veterinari"\]/);
  assert.match(source, /normalizeDirectoryFilterValue\(def, notionFacetSourceValue\(selected\)\)/);
  assert.match(source, /if \(profile\.category === "veterinari"\) \{[\s\S]*?for \(const \[key, value\] of Object\.entries\(patch\)\)/);
  assert.match(source, /VETERINARY_FACET_WRITEBACK_UNVERIFIED/);
  const start = source.indexOf("const breederFacetNotionProperties = {");
  const end = source.indexOf("const breederSearchFields =", start);
  assert.ok(start >= 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end) +
    "\nexports.toNotion = notionFacetLabel;" +
    "\nexports.fromNotion = notionFacetSourceValue;" +
    "\nexports.propertyNames = breederFacetNotionProperties;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(js, { exports });
  for (const [canonical, label] of [
    ["ambulance", "Ambulancia"], ["clinic", "Klinika"],
    ["hospital", "Nemocnica"], ["unknown", "Neznáme"],
    ["yes", "Áno"], ["no", "Nie"],
  ]) {
    assert.equal(exports.toNotion(canonical), label);
    assert.equal(exports.fromNotion(label), canonical === "yes" || canonical === "no" ? label : canonical);
  }
  assert.equal(exports.propertyNames["veterinari.facility_type"], "Typ pracoviska");
  assert.equal(exports.propertyNames["veterinari.emergency"], "Pohotovosť");
  assert.equal(exports.propertyNames["veterinari.home_visits"], "Návštevy doma");
});

test("hours, sources and alt text are independently synced for pilot categories", async () => {
  const source = await get("../lib/notion-directory-sync.ts");
  const admin = await get("../app/api/admin/directory/[id]/route.ts");
  const editor = await get("../components/admin-directory-editor.tsx");
  for (const field of ["Ordinačné hodiny", "Zdroj dát", "Zdroj obrázka", "Alt text obrázka"])
    assert.ok(source.includes('"' + field + '"'));
  assert.match(source, /source_data_json = json_set/);
  assert.match(source, /pilotChangedNotionMetadataFields\(page, input\.changedPropertyIds\)/);
  assert.doesNotMatch(source, /DIRECTORY_PILOT_METADATA_EMPTY_NOT_A_DELETE/);
  assert.match(source, /Object\.hasOwn\(input\.changed, field\)/);
  assert.match(source, /if \(!value\) continue;/); // Inbound blank Notion values still do not delete D1.
  assert.match(source, /WHERE id = \? AND category = \? AND status <> 'archived'/);
  assert.match(source, /DIRECTORY_PILOT_METADATA_TARGET_INVALID/);
  assert.match(admin, /changedPilotMetadata\[field\] = value/);
  assert.match(admin, /mirrorPilotDirectoryMetadataFieldsToNotion/);
  assert.match(editor, /pilotOpeningHours/);
  assert.match(editor, /pilotDataSources/);
  assert.match(editor, /pilotImageSource/);
  assert.match(editor, /pilotImageAlt/);
  assert.match(editor, /id="directory-pilot-image-alt"/);
  assert.match(editor, /pilotMetadataFields\[key\] = current\.trim\(\)/);
  assert.match(editor, /if \(current\.trim\(\) !== baseline\.trim\(\)\)/);
  assert.doesNotMatch(editor, /if \(current\.trim\(\) && current\.trim\(\) !== baseline\.trim\(\)\)/);
  assert.match(admin, /const value = \(submitted\[field\] as string\)\.trim\(\);\s*try \{/);
  // Sources and hours must not enter the canonical catalogue relation importer.
  const block = source.slice(source.indexOf("export const PILOT_DIRECTORY_METADATA_FIELDS"),
    source.indexOf("/*\*\n * Mapped breeder/trainer event mode:", source.indexOf("export const PILOT_DIRECTORY_METADATA_FIELDS")));
  assert.doesNotMatch(block, /importNotionServiceChoices|syncProfileCatalogRelation|prepareNotionMainImage/);
});

test("an explicit empty Admin edit clears only one pilot JSON field while Notion blanks are not inbound deletions", async () => {
  const ts = await import("typescript");
  const source = await get("../lib/notion-directory-sync.ts");
  const start = source.indexOf("export const PILOT_DIRECTORY_METADATA_FIELDS =");
  const end = source.indexOf("/** Admin -> Notion: changed operational fields only", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end) +
    "\nexports.savePilotDirectoryMetadataField = savePilotDirectoryMetadataField;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const logs = [];
  const profile = {
    id: 1653, category: "fyzioterapia", status: "published",
    updatedAt: "2026-11-08T00:00:00Z",
    importData: { "Ordinačné hodiny": "x", "Zdroj dát": "https://example.sk/#x", "Alt text obrázka": "Logo x" },
  };
  const database = {
    prepare(sql) {
      return {
        bind(...args) {
          logs.push({ sql, args });
          return { async first() { return { id: profile.id }; } };
        },
      };
    },
  };
  const exports = {};
  runInNewContext(js, {
    exports, SYSTEM_ACTOR: "sync", isDirectoryEventPilotCategory,
    serviceFilterCategories: ["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby", "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie", "fyzioterapia", "dalsie-sluzby"],
    getManagedDirectoryProfileById: async () => profile,
    Date,
  });
  await exports.savePilotDirectoryMetadataField({
    database, profileId: 1653, category: "fyzioterapia",
    field: "Ordinačné hodiny", value: "",
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0].sql, /source_data_json = json_set/);
  assert.ok(logs[0].args.includes('$."Ordinačné hodiny"'));
  assert.ok(logs[0].args.includes(""), "empty edit is persisted as empty, not silently skipped");
  assert.equal(logs[0].args.includes('$."Zdroj dát"'), false, "unrelated sources are untouched");
  assert.ok(source.includes('if (!value) continue;'), "blank Notion webhook values remain non-destructive");
});

test("municipality search does not clear a committed city before a dropdown selection", async () => {
  const source = await get("../components/slovakia-location-selector.tsx");
  const typing = source.slice(source.indexOf('onChange={(event) => {', source.indexOf('id={`${baseId}-municipality`}')));
  const untilCommit = typing.slice(0, typing.indexOf('onKeyDown={onMunicipalityKeyDown}'));
  assert.doesNotMatch(untilCommit, /onChange\(\{ region: selectedRegion, district: selectedDistrict, city: "" \}\)/);
  assert.match(untilCommit, /setEditingQuery\(true\)/);
  assert.match(source, /resetMunicipalityQuery\(\);/);
  assert.match(source, /onChange\(\{ region: selectedRegion, district: selectedDistrict, city \}\);/);
});
