import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BREED_COMPACT_VISIBLE } from "../lib/breed-notion-compact-consolidation.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const aliases = {
  "Názov": "Názov plemena",
  "Energia": "Úroveň energie",
  "Trénovateľnosť": "Cvičiteľnosť",
  "Deti": "Vzťah k deťom",
  "Iné psy": "Vzťah k iným psom",
  "Byt": "Vhodnosť do bytu",
  "Starostlivosť o srsť": "Náročnosť starostlivosti",
  "Lovecký pud": "Lovecký inštinkt",
  "Intro": "Krátky úvod v hero",
  "Redakcia prehľad": "Prehľad plemena",
  "Charakter": "Povaha",
  "Pohyb": "Potreba pohybu",
  "Zdravotné riziká": "Typické zdravotné riziká",
  "Vhodné pre": "Pre koho sa hodí",
  "Zvážiť": "Na čo si dať pozor",
  "Redakcia chyby majiteľov": "Časté chyby majiteľov",
  "Redakcia zaujímavosti": "Zaujímavosti",
  "Hlavný obrázok URL": "Titulná fotografia",
  "Galéria JSON": "Ďalšie fotografie",
  "Športy JSON": "Športy a aktivity",
  "Editorial complete": "form.editorialComplete",
};

test("breed editor exposes all 60 editorial fields from the approved Notion model", () => {
  const editor = read("components/admin-breed-editor.tsx");
  assert.equal(BREED_COMPACT_VISIBLE.length, 60);
  for (const field of BREED_COMPACT_VISIBLE) {
    const label = aliases[field] ?? field;
    assert.ok(editor.includes(label), `Missing Notion field: ${field} (shown as ${label})`);
  }
  assert.equal((editor.match(/<AdminEditorSection id="breed-/g) ?? []).length, 8);
  for (const section of [
    "breed-basic", "breed-overview", "breed-character", "breed-practical",
    "breed-health", "breed-fci", "breed-media", "breed-settings",
  ]) assert.ok(editor.includes(`<AdminEditorSection id="${section}"`),section);
  for (const obsolete of [
    "<AdminBreedRelationGroup",
    "Tri hlavné vlastnosti v hero",
    "<span>Každodenné potreby</span>",
    "<span>Pracovná skúška</span>",
    "<span>FCI uznanie / status</span>",
    "<span>Číslo FCI sekcie</span>",
    "<span>Import key</span>",
    "<span>Farebný motív</span>",
    "<AdminSeoFields",
    "<AdminBreedNotionExtras",
  ]) assert.ok(!editor.includes(obsolete), obsolete);
  assert.ok(editor.includes('value={form.seo.title??""}'));
  assert.ok(editor.includes('value={form.seo.description??""}'));
  assert.ok(editor.includes('change("seo",{...form.seo,title:e.target.value})'));
  assert.ok(editor.includes('change("seo",{...form.seo,description:e.target.value})'));
});

test("public pages render only new standalone content fields, not historical duplicates", () => {
  const publicBreed = read("app/plemena/[slug]/page.tsx");
  const publicFci = read("app/plemena/[slug]/fci-standard/page.tsx");
  for (const field of [
    "breed.size", "breed.coat", "breed.origin", "breed.height", "breed.weight",
    "breed.character", "breed.exercise", "breed.training", "breed.health",
    "breed.history", "editorial.overview", "editorial.coatCare",
    "editorial.familyLife", "editorial.otherDogsLife",
    "editorial.commonOwnerMistakes", "editorial.curiosities",
  ]) assert.ok(publicBreed.includes(field), field);
  for (const legacy of [
    "editorial.heroTraits", "editorial.exerciseTip",
    "editorial.trainingTip", "editorial.coatTip", "editorial.healthTip",
    "managedBreed?.workingTrial", "managedBreed?.validStandardDate",
  ]) assert.ok(!publicBreed.includes(legacy), legacy);
  assert.ok(publicBreed.includes("textParagraphs(breed.needs)"),"Existing everyday-needs prose remains visible");
  for (const field of [
    "fci.celkovy_vzhlad", "fci.dolezite_proporcie", "fci.povaha_temperament",
    "fci.hlava_lebecna_cast", "fci.telo", "fci.predne_koncatiny",
    "fci.zadne_koncatiny", "fci.pohyb", "fci.srst", "fci.farba",
    "fci.vyska_pes_cm", "fci.vyska_suka_cm", "fci.hmotnost_pes_kg",
    "fci.hmotnost_suka_kg", "fci.chyby", "fci.zavazne_chyby",
    "fci.diskvalifikacne_chyby", "fci.zdroj_poznamka",
    "fci.fci_standard_pdf",
  ]) assert.ok(publicFci.includes(field), field);
  assert.ok(!publicFci.includes("fci.fci_nomenklatura_url"));
  assert.ok(publicFci.includes("fci.oci"));
  assert.ok(publicFci.includes("fci.usi"));
});

test("the 60-field breed editor runs alongside only the new sync engine and a closed activation gate", () => {
  const vars = JSON.parse(read("wrangler.jsonc")).vars;
  const activation = read("app/api/admin/notion-breeds-workcopy-activate/route.ts");
  assert.equal(vars.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "true");
  assert.equal(vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED, "false");
  assert.match(activation, /"ACTIVATE_344_BREEDS"/);
  assert.match(activation, /requireAdminMutation/);
  assert.match(activation, /result\.meta\.changes !== 344/);
});
