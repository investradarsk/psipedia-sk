import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BREEDER_NOTION_RELATION_FIELDS,
  breederRelationChangedFields,
  resolveBreederRelationText,
  formatBreederRelationText,
  sameBreederRelationIds,
} from "../lib/breeder-relation-text.ts";

const breeds = [
  { id: 17, name: "Kavalier king Charles španiel" },
  { id: 28, name: "Labradorský retriever" },
];
const clubs = [
  { id: 42, name: "Slovenský Cavalier a King Charles Spaniel Klub" },
];

test("only a changed Notion text property selects the linked dimension", () => {
  const properties = {
    "Prepojené plemená": { id: "opaque-breed", rich_text: [] },
    "Prepojené kluby": { id: "opaque-club", rich_text: [] },
    "SEO title": { id: "opaque-seo", rich_text: [] },
  };
  assert.deepEqual(breederRelationChangedFields(properties, ["opaque-breed"]), ["breedIds"]);
  assert.deepEqual(breederRelationChangedFields(properties, ["Prepojené kluby"]), ["clubIds"]);
  assert.deepEqual(breederRelationChangedFields(properties, ["opaque-seo"]), []);
  assert.deepEqual(breederRelationChangedFields(properties, []), []);
  assert.equal(BREEDER_NOTION_RELATION_FIELDS.breedIds, "Prepojené plemená");
});

test("Notion recognizes canonical names without diacritics or exact case", () => {
  assert.deepEqual(
    resolveBreederRelationText("kavalier king charles spaniel\nLABRADORSKÝ RETRIEVER", breeds),
    { status: "resolved", ids: [17, 28], unmatched: [] },
  );
  assert.deepEqual(
    resolveBreederRelationText("Slovenský Cavalier a King Charles Spaniel Klub", clubs),
    { status: "resolved", ids: [42], unmatched: [] },
  );
});

test("unknown and ambiguous names are never a partial replacement or delete", () => {
  assert.deepEqual(resolveBreederRelationText("", breeds), {
    status: "empty", ids: [], unmatched: [],
  });
  assert.deepEqual(resolveBreederRelationText("Labradorský retriever; Neznáme plemeno", breeds), {
    status: "unmatched", ids: [], unmatched: ["Neznáme plemeno"],
  });
  const duplicates = [{ id: 12, name: "Český klub" }, { id: 99, name: "Cesky klub" }];
  assert.deepEqual(resolveBreederRelationText("Český klub", duplicates), {
    status: "unmatched", ids: [], unmatched: ["Český klub"],
  });
});

test("Admin writes names, not IDs; unavailable names are never silently erased", () => {
  assert.equal(formatBreederRelationText([28, 17], breeds),
    "Kavalier king Charles španiel\nLabradorský retriever");
  assert.equal(formatBreederRelationText([17, 999], breeds), null);
  assert.equal(formatBreederRelationText([], breeds), "");
  assert.ok(sameBreederRelationIds([28, 17], [17, 28]));
  assert.ok(!sameBreederRelationIds([28, 17], [17]));
});

test("relationship synchronization stays independent from Notion editorial fields", async () => {
  const sync = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/directory/[id]/breeder-relations/route.ts", import.meta.url), "utf8");
  const detail = await readFile(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/directory-profile-detail.module.css", import.meta.url), "utf8");
  assert.match(sync, /breederRelationChangedFields\(page\.properties, input\.changedPropertyIds\)/);
  assert.match(sync, /if \(!paths\.length && !relationFields\.length && !facetFields\.length && (?:!trustFields\.length && )?!pilotMetaFields\.length\)\s*return "unchanged"/);
  assert.match(sync, /BREEDER_RELATION_NAME_UNMATCHED/);
  assert.match(sync, /mirrorBreederRelationNamesToNotion/);
  assert.match(sync, /splitQualificationLines\(propertyText\(page, "Kvalifikácie"\)\)/);
  assert.match(route, /mirrorBreederRelationNamesToNotion/);
  assert.match(route, /BREEDER_NOTION_RELATION_WRITEBACK_SKIPPED/);
  assert.match(detail, /Odbornosť a skúsenosti/);
  assert.match(detail, /visibleQualifications\.slice\(0, 4\)/);
  assert.match(css, /\.moreQualifications summary/);
});
