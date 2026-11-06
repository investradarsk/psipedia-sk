import test from "node:test";
import assert from "node:assert/strict";
import {
  splitBreedWorkCopyField,
  expandBreed60WorkPage,
} from "../lib/notion-breed-workcopy-adapter.mjs";
import { BREED_COMPACT_MERGE } from "../lib/breed-notion-compact-consolidation.mjs";

const rich = s => ({
  type: "rich_text",
  rich_text: s ? [{ type: "text", plain_text: s, text: { content: s } }] : [],
});
const plain = prop => (prop?.rich_text ?? []).map(p => p.plain_text).join("");

function workPage() {
  const props = Object.fromEntries(
    [...new Set(Object.values(BREED_COMPACT_MERGE))].map(target => [target, rich("")]),
  );
  props["Psipedia ID"] = rich("3183");
  props["Zdrojový profil Notion"] = { type: "url", url: "https://app.notion.com/p/123456781234123412341234567890ab" };
  props["FCI lebka"] = rich(
    "Pôvodný opis hlavy. — Oči podľa FCI: Oči tmavé. — Tvárová časť podľa FCI: Nos čierny. — Uši podľa FCI: Uši veľké.",
  );
  props["FCI sekcia"] = rich("Sekcia 1 — Názov sekcie FCI: Ovčiaky — Číslo sekcie FCI: 1");
  props["FCI zdroj poznámka"] = rich(
    "FCI zdroj. — FCI nomenklatúra – zdroj: [https://fci.be/1](https://fci.be/1) — Dátum platnosti štandardu FCI: 2026-10-31",
  );
  props["Redakcia prehľad"] = rich(
    "Pôvodný prehľad. — Každodenné potreby: Veľa pohybu. — Kategória plemena: Pastiersky",
  );
  return { id: "abcdefab-cdef-abcd-efab-cdefabcdefab", properties: props };
}

test("split merged FCI text into original base and individually named source fields", () => {
  const v = "Hlava. — Tvárová časť podľa FCI: Nos. — Oči podľa FCI: Oči. — Uši podľa FCI: Uši.";
  const result = splitBreedWorkCopyField("FCI lebka", v);
  assert.equal(result.base, "Hlava.");
  assert.equal(result.sources["FCI tvár"], "Nos.");
  assert.equal(result.sources["FCI oči"], "Oči.");
  assert.equal(result.sources["FCI uši"], "Uši.");
  assert.deepEqual(result.issues, []);
});

test("virtual read adapter recovers FCI, editorial and typed URL/date without changing work page", () => {
  const source = workPage();
  const originalJson = JSON.stringify(source);
  const result = expandBreed60WorkPage(source);
  assert.deepEqual(result.errors, []);
  assert.equal(plain(result.page.properties["FCI lebka"]), "Pôvodný opis hlavy.");
  assert.equal(plain(result.page.properties["FCI oči"]), "Oči tmavé.");
  assert.equal(plain(result.page.properties["FCI tvár"]), "Nos čierny.");
  assert.equal(plain(result.page.properties["FCI uši"]), "Uši veľké.");
  assert.equal(plain(result.page.properties["FCI sekcia"]), "Sekcia 1");
  assert.equal(plain(result.page.properties["FCI sekcia názov"]), "Ovčiaky");
  assert.equal(plain(result.page.properties["FCI sekcia číslo"]), "1");
  assert.equal(plain(result.page.properties["Potreby"]), "Veľa pohybu.");
  assert.equal(plain(result.page.properties["Skupina"]), "Pastiersky");
  assert.equal(result.page.properties["Platnosť FCI štandardu"].date.start, "2026-10-31");
  assert.equal(result.page.properties["FCI nomenklatúra URL"].url, "https://fci.be/1");
  assert.equal(result.page.properties["Slug"], undefined);
  assert.equal(result.page.properties["Stav"], undefined);
  assert.equal(result.page.properties["Sync stav"], undefined);
  assert.equal(JSON.stringify(source), originalJson);
});

test("duplicate or empty labeled FCI parts are exposed as isolated errors", () => {
  const copy = workPage();
  copy.properties["FCI lebka"] = rich(
    "Pôvodný opis. — Oči podľa FCI: Zhodné. — Oči podľa FCI: Nezhodné.",
  );
  const result = expandBreed60WorkPage(copy);
  assert(result.errors.some(e => e.target === "FCI lebka"
    && e.code === "DUPLICATE_LABELED_PART"));
  assert(!result.errors.some(e => e.target !== "FCI lebka"));
});

test("the new 60-field adapter refuses an old production page with 109-field metadata", () => {
  const copy = workPage();
  copy.properties["Slug"] = rich("labradorsky-retriever");
  assert.throws(() => expandBreed60WorkPage(copy),
    /BREED_WORK_COPY_SCHEMA_OR_IDENTITY_INVALID/);
});

test("invalid FCI source URL does not corrupt other reconstructed fields", () => {
  const copy = workPage();
  copy.properties["FCI zdroj poznámka"] = rich(
    "Pôvodný text. — FCI nomenklatúra – zdroj: [zly odkaz](https://fci.be/1) — Dátum platnosti štandardu FCI: 2026-10-31",
  );
  const expanded = expandBreed60WorkPage(copy);
  assert(expanded.errors.some(e => e.source === "FCI nomenklatúra URL"
    && e.code === "LEGACY_VALUE_INVALID"));
  assert.equal(expanded.page.properties["Platnosť FCI štandardu"].date.start, "2026-10-31");
  assert.equal(plain(expanded.page.properties["FCI oči"]), "Oči tmavé.");
});
