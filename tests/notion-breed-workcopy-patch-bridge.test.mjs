import test from "node:test";
import assert from "node:assert/strict";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";
import { planBreedWorkCopyFieldWrite as plan } from "../lib/notion-breed-workcopy-patch-bridge.mjs";

const text = value => ({ type: "rich_text", rich_text: [{ plain_text: value }] });
const page = () => ({
  last_edited_time: "2026-11-06T12:00:00.000Z",
  properties: {
    "FCI lebka": text("Pôvodná hlava. — Oči podľa FCI: Hnedé. — Uši podľa FCI: Vzpriamené."),
    "Redakcia prehľad": text("Krátky text. — Každodenné potreby: Denný pohyb."),
    "Intro": text("Starý intro."),
    "Deti": { type: "number", number: 3 },
    "Editorial complete": { type: "checkbox", checkbox: true },
    "FCI číslo": { type: "number", number: 122 },
    "Hlavný obrázok URL": { type: "url", url: "https://psipedia.sk/test" },
  },
});
const patch = (fieldId, value, baseline, p = page(), rev = p.last_edited_time) =>
  plan({ schema: BREED_NOTION_SCHEMA, page: p, fieldId, value, baseline, expectedPageRevision: rev });

test("Admin FCI eyes -> new Notion FCI lebka single property with other sections untouched", () => {
  const p = patch("fciStandard.oci", "Modré oči.", "Hnedé.");
  assert.equal(p.property, "FCI lebka");
  assert.deepEqual(Object.keys(p.properties), ["FCI lebka"]);
  assert.equal(p.nextText,
    "Pôvodná hlava. — Oči podľa FCI: Modré oči. — Uši podľa FCI: Vzpriamené.");
});
test("base FCI head can be edited independently of eye and ear sections", () => {
  const p = patch("fciStandard.hlava_lebecna_cast", "Opravená hlava.", "Pôvodná hlava.");
  assert.equal(p.nextText,
    "Opravená hlava. — Oči podľa FCI: Hnedé. — Uši podľa FCI: Vzpriamené.");
});
test("merged redakčné potreby go to one visible target preserving overview", () => {
  const p = patch("needs", "Viac pohybu.", "Denný pohyb.");
  assert.equal(p.property, "Redakcia prehľad");
  assert.equal(p.nextText, "Krátky text. — Každodenné potreby: Viac pohybu.");
});
test("direct 60-field text, score and checkbox use only their own Notion property", () => {
  const intro = patch("intro", "Nový úvod", "Starý intro.");
  assert.deepEqual(Object.keys(intro.properties), ["Intro"]);
  const score = patch("children", 4, 3);
  assert.deepEqual(score.properties, { "Deti": { number: 4 } });
  const checked = patch("editorialComplete", false, true);
  assert.deepEqual(checked.properties, { "Editorial complete": { checkbox: false } });
});
test("old revision or independently changed Notion field prevents overwrite", () => {
  const p = page();
  p.properties.Intro = text("Zmenené v Notione.");
  assert.throws(() => patch("intro", "Nový text", "Starý intro.", p),
    /BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION/);
  assert.throws(() => patch("children", 5, 3, page(), "2026-11-05T00:00:00.000Z"),
    /BREED_WORKCOPY_PAGE_REVISION_CHANGED/);
});
test("identity and media never pass through ordinary editorial patch", () => {
  assert.throws(() => patch("system.FCI číslo", 123, 122),
    /BREED_WORKCOPY_FIELD_OR_BASELINE_UNKNOWN/);
  assert.throws(() => patch("image", "https://example.org/b.jpg", "https://psipedia.sk/test"),
    /BREED_WORKCOPY_FIELD_NOT_EDITABLE/);
});
test("invalid number and missing visible property fail closed", () => {
  assert.throws(() => patch("children", NaN, 3), /BREED_WORKCOPY_NUMBER_INVALID/);
  assert.throws(() => patch("children", "4", 3), /BREED_WORKCOPY_NUMBER_INVALID/);
  assert.throws(() => patch("health", "Zdravie", ""), /BREED_WORKCOPY_TARGET_MISSING/);
});


test("visible health-risks and good-for arrays serialize as independent Notion text cells", () => {
  const p = page();
  p.properties["Zdravotné riziká"] = text("Alergie; Dysplázia");
  p.properties["Vhodné pre"] = text("Rodiny; Aktívni ľudia");
  const risks = patch("healthRisks", ["Alergie","Dysplázia","Oči"],
    ["Alergie","Dysplázia"],p);
  assert.equal(risks.properties["Zdravotné riziká"].rich_text[0].text.content,
    "Alergie; Dysplázia; Oči");
  const good = patch("goodFor", ["Rodiny","Aktívni ľudia","Športovci"],
    ["Rodiny","Aktívni ľudia"],p);
  assert.equal(good.property,"Vhodné pre");
  assert.deepEqual(Object.keys(good.properties),["Vhodné pre"]);
});

test("structured sources preserve each existing label and URL", () => {
  const p = page();
  p.properties["Zdroje"] = text("FCI|https://fci.be/; Klub|https://example.org/");
  const sources=patch("sources", [
    {label:"FCI",url:"https://fci.be/"},
    {label:"Klub",url:"https://example.org/"},
    {label:"Štandard",url:"https://example.com/standard"},
  ],[
    {label:"FCI",url:"https://fci.be/"},
    {label:"Klub",url:"https://example.org/"},
  ],p);
  assert.equal(sources.properties.Zdroje.rich_text[0].text.content,
    "FCI|https://fci.be/; Klub|https://example.org/; Štandard|https://example.com/standard");
});

test("invalid structured data and stale list baselines block without a PATCH", () => {
  const p=page();
  p.properties["Zvážiť"]=text("Výcvik; Pohyb");
  assert.throws(()=>patch("consider",["Zneužitie; neplatné"],["Výcvik","Pohyb"],p),
    /BREED_WORKCOPY_LIST_INVALID/);
  assert.throws(()=>patch("consider",["Bývanie"],["Staré hodnoty"],p),
    /BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION/);
});
