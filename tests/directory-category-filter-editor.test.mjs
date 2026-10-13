import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_FILTER_CONTRACT_VERSION, directoryFilterRegistry,
  mergeDirectoryFilterValues, serviceFilterCategories, serviceFiltersForCategory,
} from "../lib/directory-filter-contract.ts";
import {
  buildDirectoryCategoryFilterPatch, getDirectoryCategoryFilterFields,
  readDirectoryCategoryFilterOriginals, scopeDirectoryCategoryFilterChanges,
} from "../lib/directory-category-filter-editor.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const empty = {};

test("all ten categories and 21 registered facets use valid labeled options", () => {
  assert.equal(serviceFilterCategories.length, 10);
  assert.equal(directoryFilterRegistry.length, 21);
  for (const category of serviceFilterCategories) {
    const fields = getDirectoryCategoryFilterFields(category, empty);
    const definitions = serviceFiltersForCategory(category);
    assert.equal(fields.length, definitions.length);
    assert.ok(fields.length >= 2);
    for (const field of fields) {
      const definition = definitions.find((def) => def.id === field.id);
      assert.ok(definition, field.id);
      assert.equal(field.label, definition.label);
      assert.equal(field.initialValue, "");
      assert.equal(field.status, "missing");
      assert.deepEqual(field.options.map(({ value }) => value), definition.allowedValues);
      assert.ok(field.options.some(({ value, label }) => value === "unknown" && label === "Neznáme"));
      if (field.valueType === "tri_state") {
        assert.deepEqual(field.options.map(({ label }) => label), ["Áno", "Nie", "Neznáme"]);
      }
    }
  }
  const clinic = getDirectoryCategoryFilterFields("veterinari", empty).find((field) => field.id === "veterinari.facility_type");
  assert.deepEqual(clinic.options.map(({ label }) => label), ["Ambulancia", "Klinika", "Nemocnica", "Neznáme"]);
});

test("missing, explicit unknown, explicit no, original no and unchanged are distinct", () => {
  const cat = "veterinari", id = "veterinari.emergency";
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, empty, {}).updates, {});
  assert.equal(getDirectoryCategoryFilterFields(cat, empty).find((field) => field.id === id).initialValue, "");
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, empty, { [id]: "unknown" }).updates, { [id]: "unknown" });
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, empty, { [id]: "no" }).updates, { [id]: "no" });
  assert.equal(getDirectoryCategoryFilterFields(cat, { [id]: "unknown" }).find((field) => field.id === id).initialValue, "unknown");
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: "unknown" }, { [id]: "unknown" }).updates, {});
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: "nie" }, { [id]: "no" }).updates, {});
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: "no" }, { [id]: "yes" }).updates, { [id]: "yes" });
});

test("invalid/conflicting baseline only resolves after explicit valid selection", () => {
  const cat = "veterinari", id = "veterinari.emergency";
  assert.equal(getDirectoryCategoryFilterFields(cat, { [id]: false }).find((field) => field.id === id).status, "invalid");
  const conflicts = { [id]: "conflict" };
  const field = getDirectoryCategoryFilterFields(cat, { [id]: "yes" }, conflicts).find((row) => row.id === id);
  assert.equal(field.status, "conflict");
  assert.equal(field.initialValue, "");
  assert.match(field.hint, /Konflikt/);
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: "yes" }, {}, conflicts).updates, {});
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: "yes" }, { [id]: "yes" }, conflicts).updates, { [id]: "yes" });
  assert.deepEqual(buildDirectoryCategoryFilterPatch(cat, { [id]: false }, { [id]: "unknown" }).updates, { [id]: "unknown" });
  assert.throws(() => buildDirectoryCategoryFilterPatch(cat, empty, { [id]: "invalid" }), /Nepovolená hodnota/);
});

test("changing category cannot serialize stale hidden fields", () => {
  const draft = { "veterinari.emergency": "no", "treneri.group_training": "yes" };
  const scoped = scopeDirectoryCategoryFilterChanges("treneri", draft);
  assert.deepEqual(scoped, { "treneri.group_training": "yes" });
  assert.deepEqual(buildDirectoryCategoryFilterPatch("treneri", empty, scoped).updates, scoped);
  assert.throws(() => buildDirectoryCategoryFilterPatch("treneri", empty, draft), /inej kategórie/);
  assert.throws(() => buildDirectoryCategoryFilterPatch("treneri", empty, { "fake.field": "no" }), /Neznámy filter/);
  assert.throws(() => buildDirectoryCategoryFilterPatch("bogus", empty, {}), /Neplatná kategória/);
});

test("safe patch preserves unrelated data and blocks malformed source data", () => {
  const category = "veterinari", id = "veterinari.emergency";
  const def = directoryFilterRegistry.find((item) => item.id === id);
  const raw = JSON.stringify({ "Organizácia": "Klub", "_audit": { reviewed: true }, [def.d1.key]: "no",
    "_psipedia_filter_v1_treneri_group_training": "yes" });
  const originals = readDirectoryCategoryFilterOriginals(category, raw);
  const patch = buildDirectoryCategoryFilterPatch(category, originals, { [id]: "yes" });
  assert.deepEqual(patch, { category, contractVersion: DIRECTORY_FILTER_CONTRACT_VERSION, updates: { [id]: "yes" } });
  const merged = JSON.parse(mergeDirectoryFilterValues(raw, patch.category, patch.updates));
  assert.equal(merged[def.d1.key], "yes");
  assert.equal(merged["Organizácia"], "Klub");
  assert.deepEqual(merged._audit, { reviewed: true });
  assert.equal(merged._psipedia_filter_v1_treneri_group_training, "yes");
  assert.throws(() => readDirectoryCategoryFilterOriginals(category, "not json"), /Neplatný zdrojový JSON/);
  assert.throws(() => readDirectoryCategoryFilterOriginals(category, "[]"), /musí byť objekt/);
});

test("standalone UI is accessible, callback-only, responsive, not mounted in live editors", () => {
  const ui = source("components/directory-category-filter-fields.tsx");
  const css = source("components/directory-category-filter-fields.module.css");
  assert.match(ui, /"use client"/);
  assert.match(ui, /htmlFor=\{id\}/);
  assert.match(ui, /aria-describedby=\{hintId\}/);
  assert.match(ui, /aria-invalid=/);
  assert.match(ui, /disabled=\{disabled\}/);
  assert.match(ui, /useId\(\)/);
  assert.match(ui, /onChange\(next, buildDirectoryCategoryFilterPatch/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width:\s*660px/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|\bXMLHttpRequest\b|\/api\//);
  assert.doesNotMatch(source("components/admin-directory-editor.tsx"), /DirectoryCategoryFilterFields/);
  assert.doesNotMatch(source("components/partner-profile-edit-form.tsx"), /DirectoryCategoryFilterFields/);
});
