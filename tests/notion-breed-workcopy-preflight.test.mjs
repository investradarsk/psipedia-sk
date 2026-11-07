import test from "node:test";
import { classifyBreedWorkCopyValue } from "../lib/notion-breed-workcopy-parity.mjs";
import assert from "node:assert/strict";
import {
  BREED_COMPACT_VISIBLE,
  BREED_COMPACT_HIDDEN,
} from "../lib/breed-notion-compact-consolidation.mjs";
import {
  inspectBreedWorkCopy, normalizeBreedWorkText, projectBreed60,
  breedNotionScalar,
} from "../scripts/notion-breed-workcopy-preflight.mjs";

function notionProperty(name, value) {
  if (name === "Názov")
    return { type: "title", title: [{ type: "text", plain_text: String(value ?? "") }] };
  if (name === "Editorial complete" || name === "Profil skvalitnený" ||
    name === "Odborný reaudit 2026" || name === "SEO noindex")
    return { type: "checkbox", checkbox: value === "__YES__" || value === true };
  if (name === "FCI číslo" || name === "FCI skupina" || name === "Energia" ||
    name === "Trénovateľnosť" || name === "Rodina" || name === "Deti" ||
    name === "Iné psy" || name === "Byt" || name === "Starostlivosť o srsť" ||
    name === "Pĺznutie" || name === "Lovecký pud")
    return { type: "number", number: value === "" || value == null ? null : Number(value) };
  if (name === "Platnosť FCI štandardu" || name === "Posledný sync")
    return { type: "date", date: value ? { start: String(value) } : null };
  if (name === "FCI štandard PDF" || name === "Hlavný obrázok URL" ||
    name === "FCI nomenklatúra URL" || name === "Zdrojový profil Notion" ||
    name === "SEO canonical URL" || name === "URL Psipedia" ||
    name === "Zdroj obrázka")
    return { type: "url", url: value || null };
  if (name === "Stav" || name === "Sync stav" || name === "Farba akcentu")
    return { type: "select", select: value ? { name: String(value) } : null };
  return {
    type: "rich_text",
    rich_text: value ? [{ type: "text", plain_text: String(value) }] : [],
  };
}

function id(value) {
  return "00000000-0000-0000-0000-" + value.toString(16).padStart(12, "0");
}

function fixture(index) {
  const originalProps = {};
  for (const field of [...BREED_COMPACT_VISIBLE, ...BREED_COMPACT_HIDDEN])
    originalProps[field] = notionProperty(field, "");
  const name = "Plemeno " + index;
  originalProps["Názov"] = notionProperty("Názov", name);
  originalProps["FCI číslo"] = notionProperty("FCI číslo", index + 1);
  originalProps["FCI skupina"] = notionProperty("FCI skupina", 1);
  originalProps["Psipedia ID"] = notionProperty("Psipedia ID", String(index + 100));
  originalProps["Editorial complete"] = notionProperty("Editorial complete",
    index < 56 ? "__YES__" : "__NO__");
  originalProps["FCI lebka"] = notionProperty("FCI lebka", "Základná lebka");
  originalProps["FCI oči"] = notionProperty("FCI oči", "Oči normálne");
  originalProps["FCI uši"] = notionProperty("FCI uši", "Uši vzpriamené");
  originalProps["FCI zdroj poznámka"] = notionProperty("FCI zdroj poznámka", "Záznam FCI");
  originalProps["Platnosť FCI štandardu"] = notionProperty("Platnosť FCI štandardu", "2026-10-31");
  originalProps["FCI nomenklatúra URL"] = notionProperty("FCI nomenklatúra URL",
    "https://www.fci.be/en/nomenclature");
  originalProps["Potreby"] = notionProperty("Potreby", "Každodenný pohyb");
  originalProps["Redakcia prehľad"] = notionProperty("Redakcia prehľad", "Povaha a starostlivosť");
  const originalId = id(index + 1);
  const original = {
    id: originalId,
    url: "https://app.notion.com/p/" + originalId.replaceAll("-", ""),
    properties: originalProps,
  };
  const projected = projectBreed60(original);
  const workProps = Object.fromEntries(
    BREED_COMPACT_VISIBLE.map(field =>
      [field, notionProperty(field, projected[field])]),
  );
  workProps["Psipedia ID"] = notionProperty("Psipedia ID", String(index + 100));
  workProps["Zdrojový profil Notion"] = notionProperty("Zdrojový profil Notion",
    original.url);
  const work = { id: id(index + 501), properties: workProps };
  return [original, work];
}

function inventory() {
  const pair = Array.from({ length: 344 }, (_, index) => fixture(index));
  return {
    originals: pair.map(entry => entry[0]),
    copies: pair.map(entry => entry[1]),
  };
}

test("344 pages, 60 editorial fields, two technical IDs and 23 merged source fields round-trip", () => {
  const { originals, copies } = inventory();
  const result = inspectBreedWorkCopy(originals, copies);
  assert.equal(result.dataParity, true, JSON.stringify(result.issues.slice(0, 5)));
  assert.equal(result.productionCutoverReady, false);
  assert.equal(result.stats.matchedIds, 344);
  assert.equal(result.stats.comparedCells, 344 * 60);
  assert.equal(result.stats.completedOriginal, 56);
  assert.equal(result.stats.completedWorkCopy, 56);
  assert.equal(result.issues.length, 0);
  const notes = breedNotionScalar(copies[0].properties["FCI zdroj poznámka"]);
  assert.match(notes, /Dátum platnosti štandardu FCI: 2026-10-31/);
  assert.match(notes, /FCI nomenklatúra – zdroj: https:\/\/www\.fci\.be/);
  const head = breedNotionScalar(copies[0].properties["FCI lebka"]);
  assert.match(head, /Oči podľa FCI: Oči normálne/);
  assert.match(head, /Uši podľa FCI: Uši vzpriamené/);
});

test("one changed merged FCI piece fails only its field, without erasing any record", () => {
  const { originals, copies } = inventory();
  copies[8].properties["FCI lebka"] = notionProperty("FCI lebka", "Zmenené bez podkladov");
  const result = inspectBreedWorkCopy(originals, copies);
  assert.equal(result.dataParity, false);
  assert(result.issues.some(x => x.code === "CONTENT_MISMATCH"
    && x.id === "108" && x.field === "FCI lebka"));
  assert.equal(result.stats.mismatchedCells, 1);
});

test("wrong origin link or Psipedia ID is a strict blocker even with matching text", () => {
  const { originals, copies } = inventory();
  copies[0].properties["Zdrojový profil Notion"] = notionProperty(
    "Zdrojový profil Notion", "https://app.notion.com/p/" + id(99).replaceAll("-", ""));
  copies[1].properties["Psipedia ID"] = notionProperty("Psipedia ID", "100");
  const result = inspectBreedWorkCopy(originals, copies);
  assert.equal(result.dataParity, false);
  assert(result.issues.some(x => x.code === "SOURCE_PAGE_LINK_MISMATCH"));
  assert(result.issues.some(x => x.code === "WORK_ID_NOT_UNIQUE"));
});

test("Notion line-break render and identical Markdown autolinks are equivalent", () => {
  assert.equal(normalizeBreedWorkText("A<br />B"),
    normalizeBreedWorkText("A\nB"));
  assert.equal(normalizeBreedWorkText("[https://fci.be/x](https://fci.be/x)"),
    normalizeBreedWorkText("https://fci.be/x"));
  assert.notEqual(normalizeBreedWorkText("[https://fci.be/x](https://fci.be/y)"),
    normalizeBreedWorkText("https://fci.be/x"));
});

test("read-only preflight detects truncated Notion rich text instead of silently passing", () => {
  const { originals, copies } = inventory();
  originals[0].properties["FCI oči"] = {
    type: "rich_text",
    rich_text: Array.from({ length: 25 }, () => ({ type: "text", plain_text: "X" })),
  };
  const report = inspectBreedWorkCopy(originals, copies);
  assert.equal(report.dataParity, false);
  assert(report.issues.some(x => x.code === "SOURCE_RICH_TEXT_PAGINATION_REQUIRED"));
});

test("safe additive references and labelled expert alternatives retain content parity", () => {
  const { originals, copies } = inventory();
  originals[0].properties["Zdroje"] = notionProperty("Zdroje", "Overený pôvodný zdroj.");
  copies[0].properties["Zdroje"] = notionProperty("Zdroje",
    "Overený pôvodný zdroj.\nDoplnkový odborný zdroj.");

  const originalFCINotes = projectBreed60(originals[1])["FCI zdroj poznámka"];
  copies[1].properties["FCI zdroj poznámka"] = notionProperty("FCI zdroj poznámka",
    originalFCINotes + " \\[Alternatívne znenie zachované z pracovnej kópie: detailne overené\\]");

  originals[2].properties["FCI srsť"] = notionProperty("FCI srsť", "Koža pigmentovaná.");
  copies[2].properties["FCI srsť"] = notionProperty("FCI srsť",
    "Koža pigmentovaná. \\[Alternatívne znenie zachované z pracovnej kópie: tesná.\\]");

  const result = inspectBreedWorkCopy(originals, copies);
  assert.equal(result.dataParity, true, JSON.stringify(result.issues.slice(0, 4)));
  assert.equal(result.stats.approvedAdditions, 3);
  assert.equal(result.stats.approvedAdditionTypes.APPENDED_SOURCES, 1);
  assert.equal(result.stats.approvedAdditionTypes.ANNOTATED_ALTERNATIVE, 2);
});

test("only the old structured FCI date may be treated as a retained addendum", () => {
  const [original] = fixture(0);
  assert.equal(classifyBreedWorkCopyValue(
    "FCI zdroj poznámka", "", "Dátum platnosti štandardu FCI: 2026-10-31", original,
  ), "RETAINED_SOURCE_DATE");
  assert.equal(classifyBreedWorkCopyValue(
    "FCI zdroj poznámka", "", "Dátum platnosti štandardu FCI: 2026-10-30", original,
  ), null);
});

test("a rewritten source, unlabelled field change and duplicate alternative remain blockers", () => {
  const { originals, copies } = inventory();
  originals[0].properties["Zdroje"] = notionProperty("Zdroje", "Oficiálny zdroj A");
  copies[0].properties["Zdroje"] = notionProperty("Zdroje", "Podvrhnutý zdroj A\nExtra");
  copies[1].properties["Intro"] = notionProperty("Intro", "Nový neschválený text");
  copies[2].properties["FCI srsť"] = notionProperty("FCI srsť",
    " \\[Alternatívne znenie zachované z pracovnej kópie: A\\] \\[Alternatívne znenie zachované z pracovnej kópie: B\\]");
  const r = inspectBreedWorkCopy(originals, copies);
  assert.equal(r.dataParity, false);
  assert.equal(r.stats.mismatchedCells, 3);
  assert(r.issues.some(x => x.code === "CONTENT_MISMATCH" && x.field === "Zdroje"));
});
