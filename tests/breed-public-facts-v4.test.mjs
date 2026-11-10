import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicBreedFacts } from "../lib/breed-public-facts.mjs";
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
