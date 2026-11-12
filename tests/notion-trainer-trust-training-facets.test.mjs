import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  TRAINER_TRUST_NOTION_PROPERTIES, changedTrainerTrustNotionFields,
  changedTrainerTrustAdminFields, preserveUneditedTrainerTrust,
} from "../lib/notion-trainer-trust-fields.ts";
import {
  getDirectoryFilterDefinition, normalizeDirectoryFilterValue,
  mergeDirectoryFilterValues, readDirectoryFilterValue, serviceFilterCategories,
} from "../lib/directory-filter-contract.ts";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("trainer trust fields recognize Notion opaque IDs, including explicit false", () => {
  const props = {
    Overené: { id: "verified-id", type: "checkbox", checkbox: false },
    Odporúčané: { id: "featured-id", type: "checkbox", checkbox: true },
    Popis: { id: "description-id" },
  };
  assert.deepEqual(TRAINER_TRUST_NOTION_PROPERTIES, { verified: "Overené", featured: "Odporúčané" });
  assert.deepEqual(changedTrainerTrustNotionFields(props, ["verified-id"]), ["verified"]);
  assert.deepEqual(changedTrainerTrustNotionFields(props, ["featured-id"]), ["featured"]);
  assert.deepEqual(changedTrainerTrustNotionFields(props, ["Overené", "featured-id"]), ["verified", "featured"]);
  assert.deepEqual(changedTrainerTrustNotionFields(props, ["description-id"]), []);
});

test("stale trainer Admin form cannot reset a newer Notion checkbox", () => {
  const oldForm = { verified: false, featured: false };
  const live = { verified: true, featured: true };
  assert.deepEqual(changedTrainerTrustAdminFields(oldForm, { verified: true, featured: false }), ["verified"]);
  assert.deepEqual(changedTrainerTrustAdminFields(oldForm, oldForm), []);
  assert.deepEqual(preserveUneditedTrainerTrust(live, oldForm, []), live);
  assert.deepEqual(preserveUneditedTrainerTrust(live, { verified: false, featured: false }, ["verified"]),
    { verified: false, featured: true });
  assert.deepEqual(preserveUneditedTrainerTrust(live, { verified: false, featured: false }, ["featured"]),
    { verified: true, featured: false });
  assert.throws(() => preserveUneditedTrainerTrust(live, { featured: "no" }, ["featured"]),
    /TRAINER_TRUST_VALUE_INVALID/);
});

test("training facets are provisioned, tri-state, and isolated from Services V3", () => {
  const original = JSON.stringify({ unrelated: "keep", _psipedia_trainer_services_text: "Canicross" });
  let current = original;
  for (const [id, label] of [
    ["treneri.individual_training", "Individuálny výcvik"],
    ["treneri.group_training", "Skupinový výcvik"],
  ]) {
    const def = getDirectoryFilterDefinition(id);
    assert.ok(def);
    assert.equal(def.category, "treneri");
    assert.deepEqual(def.notion, { property: label, type: "select", status: "provisioned" });
    assert.deepEqual(normalizeDirectoryFilterValue(def, ""), { status: "missing", value: "unknown" });
    assert.deepEqual(normalizeDirectoryFilterValue(def, "Áno"), { status: "known", value: "yes" });
    assert.deepEqual(normalizeDirectoryFilterValue(def, "Nie"), { status: "known", value: "no" });
    assert.deepEqual(normalizeDirectoryFilterValue(def, "Neznáme"), { status: "known", value: "unknown" });
    current = mergeDirectoryFilterValues(current, "treneri", { [id]: "yes" });
    assert.deepEqual(readDirectoryFilterValue(current, id), { status: "known", value: "yes" });
  }
  assert.equal(JSON.parse(current).unrelated, "keep");
  assert.equal(JSON.parse(current)._psipedia_trainer_services_text, "Canicross");
  assert.throws(() => mergeDirectoryFilterValues(original, "treneri", { "chovatelske-stanice.visits_by_appointment": "yes" }),
    /Out-of-category/);
});

test("trust inbound SQL updates one checkbox only with a category CAS guard", async () => {
  const ts = await import("typescript");
  const sync = await source("../lib/notion-directory-sync.ts");
  const start = sync.indexOf("async function saveTrainerTrustField(");
  const end = sync.indexOf("/**\n * Mapped breeder/trainer event mode:", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(sync.slice(start, end) +
    "\nexports.saveTrainerTrustField = saveTrainerTrustField;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [field, oldValue, nextValue] of [
    ["verified", false, true], ["featured", true, false],
  ]) {
    const current = { id: 1811, category: "treneri", status: "draft",
      verified: field === "verified" ? oldValue : true,
      featured: field === "featured" ? oldValue : false,
      updatedAt: "2026-11-08T15:00:00.000Z" };
    const queries = [];
    const db = { prepare(sql) { return { bind(...args) {
      queries.push({ sql, args });
      return { async first() { return { id: 1811 }; } };
    } }; } };
    const exports = {};
    runInNewContext(js, { exports, SYSTEM_ACTOR: "sync", serviceFilterCategories,
      getManagedDirectoryProfileById: async () => ({ ...current, [field]: nextValue, updatedAt: "later" }) });
    assert.equal((await exports.saveTrainerTrustField(db, current, field, nextValue))[field], nextValue);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, new RegExp("SET " + field + " = \\?"));
    assert.match(queries[0].sql, /category = \? AND status <> 'archived' AND updated_at = \?/);
    assert.equal(queries[0].args[4], "treneri");
    assert.equal(queries[0].args[0], nextValue ? 1 : 0);
    assert.doesNotMatch(queries[0].sql, /services_json|source_data_json|seo_json|status\s*=/);
    assert.equal(await exports.saveTrainerTrustField(db, current, field, oldValue), current);
    assert.equal(queries.length, 1);
    await assert.rejects(() => exports.saveTrainerTrustField(db, { ...current, category: "podujatia" }, field, nextValue),
      /DIRECTORY_TRUST_SCOPE_INVALID/);
  }
});

test("webhook, Admin edit and filter PATCH use explicit scoped field transport", async () => {
  const [sync, route, editor] = await Promise.all([
    source("../lib/notion-directory-sync.ts"),
    source("../app/api/admin/directory/[id]/route.ts"),
    source("../components/admin-directory-editor.tsx"),
  ]);
  assert.match(sync, /changedTrainerTrustNotionFields\(page\.properties, input\.changedPropertyIds\)/);
  assert.match(sync, /typeof raw !== "boolean"/);
  assert.match(sync, /saveTrainerTrustField\(database, current, field, raw\)/);
  assert.match(sync, /mirrorTrainerTrustFieldsToNotion/);
  assert.match(sync, /"treneri\.individual_training": "Individuálny výcvik"/);
  assert.match(sync, /"treneri\.group_training": "Skupinový výcvik"/);
  assert.match(sync, /row\.source_data_json, current\.category as ServiceFilterCategory/);
  assert.match(route, /trainerTrustEditedPaths: rawTrainerTrustEditedPaths/);
  assert.match(route, /preserveUneditedTrainerTrust\(before, submittedBody, trainerTrustEditedPaths\)/);
  assert.match(route, /changedTrainerTrustAdminFields\(before, profile\)/);
  assert.match(route, /mirrorTrainerTrustFieldsToNotion\(\{/);
  assert.match(route, /isDirectoryFieldEventCategory\(row\.category\)/);
  assert.match(editor, /changedTrainerTrustAdminFields\(breederBaseline, \{ verified, featured \}\)/);
  assert.match(editor, /trainerTrustEditedPaths \}/);
  // No accidental coupling of trainer filters or trust to catalog services.
  assert.doesNotMatch(sync.slice(sync.indexOf("async function syncBreederEvent("),
    sync.indexOf("export async function mirrorBreederCategoryFiltersToNotion(")),
    /syncProfileCatalogRelation|importNotionServiceChoices/);
});
