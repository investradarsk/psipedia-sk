import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  breedFieldSnapshot, planBreedNotionFieldDelta,
  advanceBreedAdminReceipt, parseBreedFieldSnapshot,
  BREED_NOTION_EDITABLE_FIELDS,
} from "../lib/notion-breed-field-delta.ts";

function breed(overrides={}) {
  return {
    id:3183,slug:"beauceron",fciNumber:44,importKey:"fci-44",
    name:"Beauceron",status:"published",
    image:"/media/breeds/3183.jpg",imageKey:"media/3183",gallery:[{imageUrl:"1.jpg"}],
    family:5,children:2,energy:4,otherDogs:3,
    intro:"Pôvodný úvod",health:"Staršie zdravie",training:"Pôvodný výcvik",
    goodFor:["Aktívnych"],consider:["Náročný"],
    seo:{title:"SEO",description:"Meta",ogTitle:"OG chránené",canonicalUrl:"https://psipedia.sk/plemena/beauceron"},
    ...overrides,
  };
}
function source(overrides={}) {
  return {
    ...breed(),
    ...overrides,
    seo:{...breed().seo,...(overrides.seo??{})},
  };
}
function plan({admin={},before={},after={}}={}) {
  const existing=breed(admin);
  const previous=source(before);
  const changed=source({...before,...after});
  return planBreedNotionFieldDelta(existing,changed,
    breedFieldSnapshot(previous),breedFieldSnapshot(breed()));
}

test("Deti 2 to 4 transfers only children, unrelated Admin text and family stay",()=>{
  const p=plan({admin:{health:"Opravený Admin zdravotný text"},
    after:{children:4}});
  assert.deepEqual(p.conflicts,[]);
  assert.deepEqual(p.accepted,["children"]);
  assert.equal(p.patch.children,4);
  assert.equal(p.patch.health,undefined);
  assert.equal(p.patch.family,undefined);
  assert.equal(p.patch.image,undefined);
  assert.equal(p.patch.status,undefined);
  assert.equal(p.patch.fciNumber,undefined);
  assert.equal(p.patch.slug,undefined);
});
test("same-field Admin edit conflicts but unrelated edits don't",()=>{
  const p=plan({admin:{children:5},after:{children:4}});
  assert.deepEqual(p.conflicts,["children"]);
  assert.equal(p.patch.children,undefined);
  const same=plan({admin:{children:4},after:{children:4}});
  assert.deepEqual(same.conflicts,[]);
});
test("empty text and lists clear explicitly; 1-5 score clearing resets neutral 3",()=>{
  const p=plan({after:{intro:"",goodFor:[],children:null}});
  assert.deepEqual(p.conflicts,[]);
  assert.equal(p.patch.intro,"");
  assert.deepEqual(p.patch.goodFor,[]);
  assert.equal(p.patch.children,3);
});
test("notion source unchanged: never overwrites Admin field",()=>{
  const p=plan({admin:{intro:"Admin nové",children:5}});
  assert.deepEqual(p.changed,[]);
  assert.deepEqual(p.patch,{});
});
test("SEO only changes title, not OG / canonical / unrelated SEO",()=>{
  const p=plan({after:{seo:{title:"Nové SEO",description:"Meta"}}});
  assert.deepEqual(p.accepted,["seo.title"]);
  assert.deepEqual(p.patch.seo,{title:"Nové SEO"});
  assert.equal(p.patch.seo.ogTitle,undefined);
});
test("next Admin receipt tracks accepted fields but not unrelated Admin changes",()=>{
  const old=breedFieldSnapshot(breed());
  const next=advanceBreedAdminReceipt(old,breed({children:4,health:"Nový Admin text"}),["children"]);
  assert.equal(next.children,4);
  assert.equal(next.health,old.health);
  const decoded=parseBreedFieldSnapshot(JSON.stringify(next));
  assert.ok(decoded);
  assert.equal(decoded.children,4);
  assert.equal(parseBreedFieldSnapshot('{"children":2}'),null);
  assert.ok(BREED_NOTION_EDITABLE_FIELDS.length>=30);
});
test("no schema migration needed; legacy hashes establish baseline; immutable ID",async()=>{
  const sync=await readFile(new URL("../lib/notion-breed-sync.ts",import.meta.url),"utf8");
  const store=await readFile(new URL("../lib/breed-store.ts",import.meta.url),"utf8");
  const backfill=await readFile(new URL("../lib/notion-breed-identity-backfill.ts",import.meta.url),"utf8");
  assert.match(sync,/RECEIPT_PREFIX = "breed-field-v1:"/);
  assert.match(sync,/decodeBreedReceipt\(mapping\?\.content_hash\)/);
  assert.match(sync,/WHERE breed_notion_sync\.breed_id = excluded\.breed_id/);
  assert.match(sync,/BREED_PSID_CONFLICT/);
  assert.match(sync,/!mapping && \(existing\.slug !== basePayload\.slug/);
  assert.match(sync,/planBreedNotionFieldDelta\(/);
  assert.match(sync,/advanceBreedAdminReceipt\(/);
  assert.match(sync,/mapping\.content_hash\.startsWith\("identity-pending-editorial:"\)/);
  assert.match(store,/const family=score\(input\.family\)/);
  assert.match(store,/family,children,otherDogs/);
  assert.match(backfill,/const approved=true/);
  assert.doesNotMatch(sync,/SELECT .*notion_fields_json/);
});
