import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  STAGED_BREED_MERGE_HEADINGS,
  stripStagedBreedMerge,
} from "../lib/breed-compact-public.ts";
import { BREED_COMPACT_HEADINGS } from "../lib/breed-notion-compact-consolidation.mjs";

test("public transitional headings match every supported field migration", () => {
  assert.deepEqual(
    [...STAGED_BREED_MERGE_HEADINGS].sort(),
    Object.values(BREED_COMPACT_HEADINGS).sort(),
  );
});

test("staged merged fields never repeat older visible FCI or practical content", () => {
  const samples = [
    ["FCI lebka", "Pôvodný opis lebky.",
      " — Oči podľa FCI: tmavé oči. — Uši podľa FCI: vzpriamené uši."],
    ["FCI telo", "Pôvodný opis tela.",
      " — Chvost podľa FCI: nízko nesený. — Krk podľa FCI: pevný."],
    ["Prehľad", "Pôvodný prehľad plemena.",
      " — Každodenné potreby: dlhé vychádzky."],
    ["Zdravie", "Pôvodný zdravotný text.",
      " — Praktický tip k zdraviu: vyšetrenie kĺbov."],
    ["História", "Pôvodná história.",
      " — Historický súhrn podľa FCI: plemeno pochádza z Európy."],
  ];
  for (const [field,base,staging] of samples) {
    assert.equal(stripStagedBreedMerge(base+staging),base,field);
  }
  assert.equal(stripStagedBreedMerge("Veta — to je iba pomlčka."),"Veta — to je iba pomlčka.");
  assert.equal(stripStagedBreedMerge(undefined),"");
  assert.equal(stripStagedBreedMerge(""),"");
});

test("public breed and FCI layouts use the same compatibility guard",async()=>{
  const breed=await readFile(new URL("../app/plemena/[slug]/page.tsx",import.meta.url),"utf8");
  const fci=await readFile(new URL("../app/plemena/[slug]/fci-standard/page.tsx",import.meta.url),"utf8");
  for(const snippet of [
    "stripStagedBreedMerge(editorial.overview)",
    "stripStagedBreedMerge(breed.exercise)",
    "stripStagedBreedMerge(breed.training)",
    "stripStagedBreedMerge(breed.health)",
    "stripStagedBreedMerge(breed.history)",
    "stripStagedBreedMerge(editorial.coatCare)",
  ])assert.ok(breed.includes(snippet),snippet);
  for(const snippet of [
    "stripStagedBreedMerge(fci.hlava_lebecna_cast)",
    "stripStagedBreedMerge(fci.telo)",
    "stripStagedBreedMerge(fci.srst)",
  ])assert.ok(fci.includes(snippet),snippet);
});
