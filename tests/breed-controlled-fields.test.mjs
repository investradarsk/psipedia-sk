import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FCI_GROUP_OPTIONS, BREED_SIZE_OPTIONS, BREED_ORIGIN_COUNTRIES,
  BREED_COAT_TYPES, BREED_USE_TYPES,
  parseBreedNumericRange, formatBreedNumericRange,
  isBreedNumericDraft, breedNumericKindForField,
  isBreedStructuredMeasurement,
} from "../lib/breed-controlled-fields.mjs";

const read = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");

test("controlled taxonomies contain unique grounded options and complete FCI groups", () => {
  assert.deepEqual(FCI_GROUP_OPTIONS.map(([number])=>number),[1,2,3,4,5,6,7,8,9,10]);
  for (const options of [BREED_SIZE_OPTIONS,BREED_ORIGIN_COUNTRIES,BREED_COAT_TYPES,BREED_USE_TYPES]) {
    assert.equal(new Set(options).size,options.length);
    assert(options.every(x=>typeof x==="string"&&x.trim()));
  }
  assert(BREED_ORIGIN_COUNTRIES.includes("Veľká Británia"));
});

test("numeric ranges accept only explicit numbers, not AI editorial prose", () => {
  assert.deepEqual(parseBreedNumericRange("56–61 cm","height"),{min:56,max:61,unit:"cm"});
  assert.deepEqual(parseBreedNumericRange("23,5-29,5 kg","weight"),{min:23.5,max:29.5,unit:"kg"});
  assert.deepEqual(parseBreedNumericRange("12 rokov","lifespan"),{min:12,max:12,unit:"rokov"});
  assert.equal(formatBreedNumericRange(23.5,29.5,"weight"),"23,5–29,5 kg");
  for(const bad of [
    "Psy 56–61 cm a sučky 51–56 cm",
    "približne 12 až 16 rokov podľa zdrojov",
    "pohybuje sa v rozmedzí 25–35 kg",
    "do 25 kg", "60+ cm", "nad 50 cm",
    "53 cm (tolerancia ±2 cm)",
  ]) assert.equal(parseBreedNumericRange(bad, bad.includes("rokov")?"lifespan":bad.includes("kg")?"weight":"height"),null,bad);
  assert.equal(parseBreedNumericRange("200–210 cm","height"),null);
  assert.equal(parseBreedNumericRange("50–40 kg","weight"),null);
  assert.equal(parseBreedNumericRange("", "weight"),null);
});

test("Admin numeric drafts cannot add new prose or a wrong unit", () => {
  assert(isBreedNumericDraft("23,","weight"));
  assert(isBreedNumericDraft("23,5–28","weight"));
  assert(isBreedNumericDraft("23–28 kg","weight"));
  assert(isBreedNumericDraft("","weight"));
  assert(!isBreedNumericDraft("pes 23 sučka 28","weight"));
  assert(!isBreedNumericDraft("23–28 cm","weight"));
});

test("legacy numeric parser remains strict, but ID-matched Notion editorial changes are not range-blocked", () => {
  assert.equal(breedNumericKindForField("fciStandard.vyska_suka_cm"),"height");
  assert.equal(breedNumericKindForField("fciStandard.hmotnost_pes_kg"),"weight");
  assert.equal(breedNumericKindForField("height"),"height");
  assert.equal(breedNumericKindForField("character"),null);
  assert(!isBreedStructuredMeasurement("height","Psy 50 až 60 cm"));
  assert(isBreedStructuredMeasurement("height","50–60 cm"));
  assert(isBreedStructuredMeasurement("character","Povaha je energická."));
  const sync=read("lib/notion-breed-workcopy-sync.ts");
  const store=read("lib/breed-store.ts");
  // Signed edits of an already ID-mapped field are content changes, not a
  // reason to drop all other cells. The public Admin editor stays strict.
  assert.match(sync,/breedWorkcopyEventValues\(page,edited,BREED_NOTION_SCHEMA\)/);
  assert.doesNotMatch(sync,/isBreedStructuredMeasurement\(field, plan\.sourceSnapshot\[field\]\)/);
  assert.match(sync,/saveBreedNotionField\(/);
  assert.match(store,/clean\(input, existing, true\)/);
  assert.match(store,/input\.status === "published" && !allowNotionEditorialValues/);
});

test("Admin uses constrained categories without silently replacing old source text", () => {
  const editor=read("components/admin-breed-editor.tsx");
  assert.match(editor,/<CountryChoices value=\{form\.origin\}/);
  assert.match(editor,/FCI_GROUP_OPTIONS\.map/);
  assert.match(editor,/BREED_SIZE_OPTIONS\.map/);
  assert.match(editor,/Pôvodný údaj: \{form\.size\}/);
  assert.match(editor,/controlledNumericChange\(e\.target\.value,form\.weight,"weight"/);
  assert.match(editor,/previous\.startsWith\(next\)/);
});
