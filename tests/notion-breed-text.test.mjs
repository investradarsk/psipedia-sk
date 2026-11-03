import assert from "node:assert/strict";
import test from "node:test";
import { notionBreedRichTextProperty, sameBreedSyncValue } from "../lib/notion-breed-text.ts";

test("breed Notion text preserves paragraphs across API rich_text parts", () => {
  const page = { properties: { "Zdravie": { rich_text: [
    { plain_text: "Prvý odsek.\n\n" },
    { plain_text: "Druhý odsek.\nTretí riadok." },
  ] } } };
  assert.equal(notionBreedRichTextProperty(page, "Zdravie"),
    "Prvý odsek.\n\nDruhý odsek.\nTretí riadok.");
});

test("breed Notion text reads mocked text.content and ignores absent data", () => {
  const page = { properties: { "FCI pohyb": { rich_text: [
    { type: "text", text: { content: "Plynulý,  \npružný pohyb." } },
  ] } } };
  assert.equal(notionBreedRichTextProperty(page, "FCI pohyb"), "Plynulý,  \npružný pohyb.");
  assert.equal(notionBreedRichTextProperty(page, "Nenájdené"), "");
});

test("breeds treat paragraph-only edits as real changes, avoiding lost Admin formatting", () => {
  assert.equal(sameBreedSyncValue("Odsek A\n\nOdsek B", "Odsek A Odsek B"), false);
  assert.equal(sameBreedSyncValue("Rovnaké\ntexty", "Rovnaké\ntexty"), true);
});
