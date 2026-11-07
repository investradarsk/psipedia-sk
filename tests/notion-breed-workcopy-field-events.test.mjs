import test from "node:test";
import assert from "node:assert/strict";
import {
  workCopyChangedEditorialIds, workCopyNonblankChangedFields,
  workCopyAdminChangedFields,
} from "../lib/notion-breed-workcopy-field-events.mjs";
import { BREED_COMPACT_MERGE } from "../lib/breed-notion-compact-consolidation.mjs";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";

const touched = (names) => ({
  properties: Object.fromEntries(names.map((name, index) =>
    [name, { id: "prop_" + index, type: "rich_text", rich_text: [] }])),
});

test("signed Notion webhook selects only its explicitly changed content field", () => {
  const page = touched(["Intro", "História", "Názov", "FCI číslo"]);
  const fields = workCopyChangedEditorialIds(page, ["prop_0"], BREED_NOTION_SCHEMA);
  assert.deepEqual(fields, ["intro"]);
  assert.deepEqual(workCopyChangedEditorialIds(page, [], BREED_NOTION_SCHEMA), []);
  assert.deepEqual(workCopyChangedEditorialIds(page, ["unknown"], BREED_NOTION_SCHEMA), []);
});

test("changed field is recognized by Notion property NAME when id is not sent", () => {
  const page = touched(["Intro", "História"]);
  assert.deepEqual(workCopyChangedEditorialIds(page, ["História"], BREED_NOTION_SCHEMA), ["history"]);
});

test("merged FCI property includes its logical fields but unrelated properties are excluded", () => {
  const target = BREED_COMPACT_MERGE["FCI farba"];
  assert(target);
  const page = touched([target, "Intro"]);
  const fields = workCopyChangedEditorialIds(page, ["prop_0"], BREED_NOTION_SCHEMA);
  assert(fields.includes("fciStandard.farba"));
  assert(!fields.includes("intro"));
  assert(!fields.includes("system.FCI číslo"));
});

test("system IDs, publication and media cannot become editorial write targets", () => {
  const page = touched(["FCI číslo", "Psipedia ID", "Hlavný obrázok URL", "Galéria JSON"]);
  assert.deepEqual(workCopyChangedEditorialIds(page, ["FCI číslo", "Psipedia ID",
    "Hlavný obrázok URL", "Galéria JSON"], BREED_NOTION_SCHEMA), []);
});

test("one nonblank Notion edit survives while blank siblings do not erase Admin", () => {
  const fields = workCopyNonblankChangedFields({
    allowed: ["intro", "history", "editorialComplete", "energy"],
    changed: ["intro", "history", "editorialComplete", "energy"],
    accepted: ["intro", "history", "editorialComplete", "energy"],
    values: { intro: "Nový úvod", history: "   ", editorialComplete: false, energy: 0 },
  });
  assert.deepEqual(fields, ["intro", "editorialComplete", "energy"]);
});

test("Admin Save patches actual before/after edits, not unrelated historical receipt differences", () => {
  const before = { intro: "Old", history: "Kept", energy: 3 };
  const after = { intro: "New", history: "Kept", energy: 3 };
  assert.deepEqual(workCopyAdminChangedFields(before, after,
    ["intro", "history", "energy"]), ["intro"]);
  assert.deepEqual(workCopyAdminChangedFields(before, after,
    ["intro", "history", "energy"], ["history"]), []);
});
