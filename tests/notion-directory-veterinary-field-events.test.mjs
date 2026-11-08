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

test("the new event pilot is limited to exactly the three requested categories", () => {
  for (const category of ["veterinari", "fyzioterapia", "dalsie-sluzby"]) {
    assert.equal(isDirectoryEventPilotCategory(category), true, category);
    assert.equal(isDirectoryFieldEventCategory(category), true, category);
  }
  for (const category of [
    "chovatelske-stanice", "treneri", "kynologicke-kluby",
    "chovatelske-kluby", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie",
  ]) assert.equal(isDirectoryEventPilotCategory(category), false, category);
  assert.equal(isDirectoryFieldEventCategory("chovatelske-stanice"), true);
  assert.equal(isDirectoryFieldEventCategory("treneri"), true);
});

test("Notion property events never import blank values or unrelated SEO/identity fields", () => {
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
  assert.deepEqual(breederApplyNotionChanges(original, incoming, ["description"]), original);
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
  assert.match(source, /isDirectoryEventPilotCategory\(profile\.category\)/);
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
  for (const category of ["veterinari", "fyzioterapia", "dalsie-sluzby"]) {
    const logs = [];
    const profile = { id: 123, category, status: "published", updatedAt: "2026-11-07T00:00:00Z" };
    const db = { prepare(sql) { return { bind(...args) {
      logs.push({ sql, args }); return { async first() { return { id: 123 }; } };
    } }; } };
    const exports = {};
    runInNewContext(js, {
      exports, SYSTEM_ACTOR: "sync", isDirectoryEventPilotCategory,
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

test("hours and provenance are independent text fields for the pilot only", async () => {
  const source = await get("../lib/notion-directory-sync.ts");
  const admin = await get("../app/api/admin/directory/[id]/route.ts");
  const editor = await get("../components/admin-directory-editor.tsx");
  for (const field of ["Ordinačné hodiny", "Zdroj dát", "Zdroj obrázka"])
    assert.ok(source.includes('"' + field + '"'));
  assert.match(source, /source_data_json = json_set/);
  assert.match(source, /pilotChangedNotionMetadataFields\(page, input\.changedPropertyIds\)/);
  assert.match(source, /if \(!trimmed\) throw new Error\("DIRECTORY_PILOT_METADATA_EMPTY_NOT_A_DELETE"\)/);
  assert.match(source, /WHERE id = \? AND category = \? AND status <> 'archived'/);
  assert.match(source, /DIRECTORY_PILOT_METADATA_TARGET_INVALID/);
  assert.match(admin, /changedPilotMetadata\[field\] = value/);
  assert.match(admin, /mirrorPilotDirectoryMetadataFieldsToNotion/);
  assert.match(editor, /pilotOpeningHours/);
  assert.match(editor, /pilotDataSources/);
  assert.match(editor, /pilotImageSource/);
  assert.match(editor, /pilotMetadataFields\[key\] = current\.trim\(\)/);
  // Sources and hours must not enter the canonical catalogue relation importer.
  const block = source.slice(source.indexOf("export const PILOT_DIRECTORY_METADATA_FIELDS"),
    source.indexOf("/*\*\n * Mapped breeder/trainer event mode:", source.indexOf("export const PILOT_DIRECTORY_METADATA_FIELDS")));
  assert.doesNotMatch(block, /importNotionServiceChoices|syncProfileCatalogRelation|prepareNotionMainImage/);
});
