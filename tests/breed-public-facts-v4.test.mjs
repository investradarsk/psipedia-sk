import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicBreedFacts, resolvePublicBreedFactsWithSources } from "../lib/breed-public-facts.mjs";
import { readFileSync } from "node:fs";

const legacy={
  origin:"Belgicko",size:"starší opis veľkosti",height:"55–65 cm",
  weight:"22–36 kg",lifespan:"10–12 rokov",fciGroup:1,
  fciSection:"Dobytkárske psy",
};

test("new Admin fields take precedence over old textual descriptions, without changing data",()=>{
  const values={
    originCountries:["Belgicko","Francúzsko"],sizeSelect:"Stredné",
    coatTypes:["Drsná","Dvojitá s podsadou"],
    heightMinCm:52,heightMaxCm:62,
    weightMinKg:22,weightMaxKg:36,
    lifespanMinYears:10,lifespanMaxYears:13,
    useTypes:["Pastiersky","Pracovný"],
    fciGroupSelect:"1",fciSectionSelect:"2",
  };
  const before=JSON.stringify({legacy,values});
  const facts=resolvePublicBreedFacts(legacy,values);
  assert.equal(facts.origin,"Belgicko, Francúzsko");
  assert.equal(facts.size,"Stredné");
  assert.equal(facts.coatTypes,"Drsná, Dvojitá s podsadou");
  assert.equal(facts.height,"52–62 cm");
  assert.equal(facts.weight,"22–36 kg");
  assert.equal(facts.lifespan,"10–13 rokov");
  assert.equal(facts.useTypes,"Pastiersky, Pracovný");
  assert.equal(facts.fciGroup,"1");
  assert.equal(facts.fciSection,"2");
  assert.equal(JSON.stringify({legacy,values}),before,"public read must not mutate persistent values");
});

test("partial controlled values never make a known historic public fact disappear",()=>{
  const result=resolvePublicBreedFacts(legacy,{
    heightMinCm:52,heightMaxCm:null,weightMinKg:22,
    weightMaxKg:200,lifespanMinYears:null,lifespanMaxYears:null,
    originCountries:[],coatTypes:[],useTypes:[],sizeSelect:null,
    fciGroupSelect:null,fciSectionSelect:null,
  });
  assert.equal(result.origin,legacy.origin);
  assert.equal(result.size,legacy.size);
  assert.equal(result.height,legacy.height);
  assert.equal(result.weight,legacy.weight);
  assert.equal(result.lifespan,legacy.lifespan);
  assert.equal(result.coatTypes,"");
  assert.equal(result.useTypes,"");
});

test("no Notion fetch, auto-seed, writes or schema mutation in public rendering",()=>{
  const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
  const helper=read("lib/breed-public-controlled.ts");
  const publicProfile=read("app/plemena/[slug]/page.tsx");
  const reference=read("app/plemena/[slug]/fci-standard/page.tsx");
  assert.match(helper,/SELECT values_json FROM breed_notion_controlled_values/);
  assert.doesNotMatch(helper,/INSERT|UPDATE|DELETE|notionRequest|getBreedControlledState/);
  assert.match(publicProfile,/readPublicBreedControlledValues\(managedBreed\.id\)/);
  assert.match(reference,/readPublicBreedControlledValues\(managed\.id\)/);
  assert.match(publicProfile,/data-testid="breed-quick-facts"/);
  assert.match(publicProfile,/id="hodnotenia"/);
  assert.match(reference,/textItem\("Oči", fci\.oci\)/);
});


test("Admin and public use identical fact values with visible source provenance",()=>{
  const original=JSON.stringify(legacy);
  const fallback=resolvePublicBreedFactsWithSources(legacy,{heightMinCm:55,heightMaxCm:null,originCountries:[]});
  assert.deepEqual(fallback.facts,resolvePublicBreedFacts(legacy,{heightMinCm:55,heightMaxCm:null,originCountries:[]}));
  assert.equal(fallback.facts.height,"55–65 cm");
  assert.equal(fallback.sources.height,"legacy");
  assert.equal(fallback.sources.origin,"legacy");
  assert.equal(fallback.sources.coatTypes,"none");
  const controlled=resolvePublicBreedFactsWithSources(legacy,
    {heightMinCm:55,heightMaxCm:65,originCountries:["Belgicko"]});
  assert.equal(controlled.sources.height,"controlled");
  assert.equal(controlled.sources.origin,"controlled");
  assert.equal(JSON.stringify(legacy),original,"the provenance resolver must never write history");
});

test("FCI fallback is identified distinctly from legacy prose and cannot override valid Admin choices",()=>{
  const base={...legacy,height:"60–65 cm",weight:"28–36 kg"};
  const fci=resolvePublicBreedFactsWithSources(base,{}, {height:"fci",weight:"fci"});
  assert.equal(fci.sources.height,"fci");
  assert.equal(fci.sources.weight,"fci");
  const selected=resolvePublicBreedFactsWithSources(base,
    {heightMinCm:57,heightMaxCm:64},{height:"fci",weight:"fci"});
  assert.equal(selected.facts.height,"57–64 cm");
  assert.equal(selected.sources.height,"controlled");
  assert.equal(selected.sources.weight,"fci");
});

test("public FCI fallback and Admin provenance use one measured-value resolver",()=>{
  const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
  const breedFci=read("lib/breed-fci.ts");
  const web=read("app/plemena/[slug]/page.tsx");
  const editor=read("components/admin-breed-editor.tsx");
  assert.match(breedFci,/export function publicBreedMeasurementWithSource/);
  assert.match(web,/publicBreedMeasurementWithSource\(breed\.height/);
  assert.match(web,/publicBreedMeasurementWithSource\(breed\.weight/);
  assert.match(editor,/publicBreedMeasurementWithSource\(form\.height/);
  assert.match(editor,/publicBreedMeasurementWithSource\(form\.weight/);
  assert.match(editor,/resolvePublicBreedFactsWithSources\(/);
  assert.match(editor,/data-breed-public-provenance/);
  assert.match(editor,/Nové číselné polia nie sú úplné/);
  assert.match(web,/publicFciSectionName\(displayFciGroup, sectionNumber, breed\.fciSection\)/);
  assert.doesNotMatch(editor,/UPDATE managed_breeds|UPDATE breed_notion_controlled_values/);
});
