import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";
import { BREED_COMPACT_VISIBLE, BREED_COMPACT_MERGE } from "../lib/breed-notion-compact-consolidation.mjs";
import { BREED_CONTROLLED_FIELDS } from "../lib/breed-workcopy-controlled.mjs";
import {
  BREED_WORKCOPY_PHYSICAL_PROPERTIES,
  BREED_WORKCOPY_TECHNICAL_PROPERTIES,
  BREED_WORKCOPY_NON_EDITORIAL_COLUMNS,
  breedWorkcopyPhysicalProperty,
  breedWorkcopyPropertyKind,
} from "../lib/breed-notion-workcopy-field-contract.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const fixture = JSON.parse(read("tests/fixtures/breed-notion-workcopy-74-schema.json"));
const notion = fixture.properties;
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, "sk"));

test("the physically mapped 74 fields match the inspected Notion data source one to one", () => {
  assert.equal(fixture.dataSourceId, "f460b1e5-4454-4a10-9200-3b35106f9e32");
  assert.equal(fixture.propertyCount, 74);
  assert.equal(BREED_COMPACT_VISIBLE.length, 60);
  assert.equal(BREED_CONTROLLED_FIELDS.length, 12);
  assert.equal(BREED_WORKCOPY_TECHNICAL_PROPERTIES.length, 2);
  assert.equal(BREED_WORKCOPY_PHYSICAL_PROPERTIES.length, 74);
  assert.equal(new Set(BREED_WORKCOPY_PHYSICAL_PROPERTIES).size, 74);
  assert.deepEqual(sorted(BREED_WORKCOPY_PHYSICAL_PROPERTIES), sorted(Object.keys(notion)));
  for (const name of BREED_WORKCOPY_PHYSICAL_PROPERTIES) {
    assert.ok(breedWorkcopyPropertyKind(name), "Unclassified Notion field: " + name);
  }
});

test("all 12 typed Admin controls use exactly the Notion types and allowed options", () => {
  const editor = read("components/admin-breed-editor.tsx");
  const handler = read("lib/notion-breed-workcopy-controlled.ts");
  for (const field of BREED_CONTROLLED_FIELDS) {
    const schema = notion[field.notion];
    assert.ok(schema, "Missing typed Notion column " + field.notion);
    assert.equal(schema.type, field.type, "Type mismatch for " + field.notion);
    if (field.options) assert.deepEqual(
      sorted(schema.options), sorted(field.options), "Invalid choices for " + field.notion,
    );
    assert.ok(editor.includes('renderControlled("' + field.key + '")'),
      "Missing actual Admin input for " + field.key);
  }
  assert.match(editor, /changes:submittedControlled/);
  assert.match(handler, /breedControlledNotionPayload\(key,values\[key\]\)/);
  assert.match(handler, /readBreedControlledNotionPage/);
});

test("59 editable visible content columns resolve through the exact legacy-field crosswalk", () => {
  const content = BREED_NOTION_SCHEMA.filter(field => field.mode === "content");
  const resolved = new Set(content.map(field => breedWorkcopyPhysicalProperty(field.notion))
    .filter(Boolean));
  assert.equal(resolved.size, 59);
  assert.deepEqual(sorted(resolved), sorted(BREED_COMPACT_VISIBLE.filter(n => n !== "FCI číslo")));
  assert.equal(notion["FCI číslo"].type, "number");
  assert.ok(BREED_NOTION_SCHEMA.some(field =>
    field.notion === "FCI číslo" && field.mode === "system"));
  assert.equal(breedWorkcopyPropertyKind("FCI číslo"), "content");
  for (const field of content) {
    const target = breedWorkcopyPhysicalProperty(field.notion);
    if (!target) continue; // Intentional historical Admin-only field.
    const type = notion[target].type;
    const expected = field.type === "title" ? "title" : field.type === "text" ? "text" : field.type;
    if (BREED_COMPACT_MERGE[field.notion]) {
      assert.equal(type, "text", "Merged logical field must reside in rich text: " + field.id);
    } else {
      assert.equal(type, expected, "Type mismatch for " + field.id + " → " + target);
    }
  }
});

test("23 legacy merged logical fields never become 23 extra Notion columns", () => {
  assert.equal(Object.keys(BREED_COMPACT_MERGE).length, 23);
  for (const [logical, physical] of Object.entries(BREED_COMPACT_MERGE)) {
    assert.equal(breedWorkcopyPhysicalProperty(logical), physical);
    assert.equal(notion[physical]?.type, "text");
    assert.ok(!Object.hasOwn(notion, logical),
      "A previously merged Notion field was unexpectedly recreated: " + logical);
  }
  assert.equal(breedWorkcopyPhysicalProperty("FCI oči"), "FCI lebka");
  assert.equal(breedWorkcopyPhysicalProperty("Potreby"), "Redakcia prehľad");
  assert.equal(breedWorkcopyPhysicalProperty("FCI nomenklatúra URL"), "FCI zdroj poznámka");
});

test("11 historical Admin-only fields cannot create arbitrary new Notion properties", () => {
  const adminOnly = BREED_NOTION_SCHEMA.filter(field =>
    field.mode === "content" && !breedWorkcopyPhysicalProperty(field.notion));
  const expected = [
    "accent", "editorial.heroTraits", "family",
    "seo.canonicalUrl", "seo.focusKeyword", "seo.noindex",
    "seo.ogDescription", "seo.ogTitle",
    "relatedArticleIds", "relatedBreedIds", "directoryProfileIds",
  ];
  assert.deepEqual(sorted(adminOnly.map(field => field.id)), sorted(expected));
  assert.equal(breedWorkcopyPhysicalProperty("SEO canonical URL"), null);
  assert.equal(breedWorkcopyPhysicalProperty("Súvisiace plemená ID"), null);
});

test("technical identity and media columns remain mapped without enabling unsafe writes", () => {
  assert.deepEqual(sorted(BREED_WORKCOPY_TECHNICAL_PROPERTIES),
    sorted(["Psipedia ID", "Zdrojový profil Notion"]));
  for (const name of BREED_WORKCOPY_TECHNICAL_PROPERTIES)
    assert.equal(breedWorkcopyPropertyKind(name), "technical");
  for (const name of ["Hlavný obrázok URL", "Galéria JSON", "Športy JSON"]) {
    assert.ok(BREED_WORKCOPY_NON_EDITORIAL_COLUMNS.includes(name));
    assert.ok(Object.hasOwn(notion, name));
  }
  const events = read("lib/notion-breed-workcopy-field-events.mjs");
  const bridge = read("lib/notion-breed-workcopy-patch-bridge.mjs");
  const sync = read("lib/notion-breed-workcopy-sync.ts");
  assert.match(events, /breedWorkcopyPhysicalProperty\(entry.notion\)/);
  assert.match(bridge, /breedWorkcopyPhysicalProperty\(entry.notion\)/);
  assert.match(sync, /"image", "gallery", "relatedBreedIds"/);
  assert.match(sync, /"sports"/);
});
