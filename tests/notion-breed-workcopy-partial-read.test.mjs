import test from "node:test";
import assert from "node:assert/strict";
import { materializeBreedWorkCopyForRead } from
  "../lib/notion-breed-workcopy-compatible-page.mjs";

const text = value => ({ type: "rich_text", rich_text: [
  { plain_text: value, type: "text", text: { content: value } },
] });
const page = () => ({
  id: "00000000-0000-0000-0000-000000000001",
  last_edited_time: "2026-11-07T20:00:00.000Z",
  properties: {
    "Psipedia ID": text("1000"),
    "FCI číslo": { type: "number", number: 1 },
    "Zdrojový profil Notion": { type: "url",
      url: "https://app.notion.com/p/00000000000000000000000000000002" },
    "História": text("Pôvodná história — Historický súhrn podľa FCI: prvá časť" +
      " — Historický súhrn podľa FCI: duplicitná časť"),
    "Intro": text("Upravený úvod"),
  },
});
const canonical = { id: 1000, slug: "test-plemeno", fciNumber: 1 };

test("normal complete verification remains strict for malformed merged sections", () => {
  const result = materializeBreedWorkCopyForRead(page(), canonical);
  assert.equal(result.valid, false);
  assert(result.errors.length > 0);
});

test("event read reports bad historical section but keeps unrelated intro available", () => {
  const result = materializeBreedWorkCopyForRead(page(), canonical, {
    onlyTargets: new Set(["História"]), allowPartial: true,
  });
  assert.equal(result.valid, true);
  assert(result.errors.some(issue => issue.source === "FCI historický súhrn"));
  assert.equal(result.page.properties["Intro"].rich_text[0].plain_text, "Upravený úvod");
  assert.equal(result.derivedPropertyNames.includes("Slug"), true);
});

test("unrelated malformed merged target is not examined by a single intro event", () => {
  const result = materializeBreedWorkCopyForRead(page(), canonical, {
    onlyTargets: new Set(["Intro"]), allowPartial: true,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
