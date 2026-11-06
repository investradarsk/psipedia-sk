import test from "node:test";
import assert from "node:assert/strict";
import { materializeBreedWorkCopyForRead } from "../lib/notion-breed-workcopy-compatible-page.mjs";
import { BREED_COMPACT_MERGE } from "../lib/breed-notion-compact-consolidation.mjs";

const rich = text => ({
  type: "rich_text",
  rich_text: [{ plain_text: text, type: "text", text: { content: text } }],
});
const get = prop => (prop?.rich_text ?? []).map(x => x.plain_text).join("");
const canonical = { id: 42, slug: "labradorsky-retriever", fciNumber: 122 };
function fixture() {
  const props = Object.fromEntries(
    [...new Set(Object.values(BREED_COMPACT_MERGE))].map(target => [target, rich("")]),
  );
  props["Psipedia ID"] = rich("42");
  props["FCI číslo"] = { type: "number", number: 122 };
  props["Zdrojový profil Notion"] = {
    type: "url", url: "https://app.notion.com/p/00000000000000000000000000000001",
  };
  props["Názov"] = { type: "title", title: [{ plain_text: "Labradorský retriever" }] };
  props["FCI lebka"] = rich(
    "Hlava pôvodná. — Oči podľa FCI: Oči tmavé. — Uši podľa FCI: Uši stredné.",
  );
  return { id: "00000000-0000-0000-0000-000000000001", properties: props };
}

test("read-only work-copy projection restores FCI sources with canonical D1 slug", () => {
  const page = fixture(), before = JSON.stringify(page);
  const result = materializeBreedWorkCopyForRead(page, canonical);
  assert.equal(result.valid, true);
  assert.equal(result.writebackAllowed, false);
  assert.equal(get(result.page.properties.Slug), "labradorsky-retriever");
  assert.equal(get(result.page.properties["FCI lebka"]), "Hlava pôvodná.");
  assert.equal(get(result.page.properties["FCI oči"]), "Oči tmavé.");
  assert.equal(get(result.page.properties["FCI uši"]), "Uši stredné.");
  assert.equal(result.page.properties.Stav, undefined);
  assert.equal(result.page.properties["Sync stav"], undefined);
  assert.equal(result.page.properties["URL Psipedia"], undefined);
  assert.equal(result.sourcePropertyNames.includes("Slug"), false);
  assert.equal(result.derivedPropertyNames.includes("Slug"), true);
  assert.equal(JSON.stringify(page), before);
});

test("mismatched Psipedia ID or FCI cannot inherit a canonical slug", () => {
  const other = fixture();
  other.properties["Psipedia ID"] = rich("43");
  assert.throws(() => materializeBreedWorkCopyForRead(other, canonical),
    /BREED_WORKCOPY_CANONICAL_IDENTITY_CHANGED/);
  const fci = fixture();
  fci.properties["FCI číslo"].number = 123;
  assert.throws(() => materializeBreedWorkCopyForRead(fci, canonical),
    /BREED_WORKCOPY_CANONICAL_IDENTITY_CHANGED/);
});

test("invalid merged FCI subsection blocks only parsing, with no manufactured system fields", () => {
  const page = fixture();
  page.properties["FCI lebka"] = rich(
    "Hlavička. — Oči podľa FCI: Oči tmavé. — Oči podľa FCI: Oči iné.",
  );
  const result = materializeBreedWorkCopyForRead(page, canonical);
  assert.equal(result.valid, false);
  assert.equal(result.page, null);
  assert(result.errors.some(x => x.code === "DUPLICATE_LABELED_PART"));
});
