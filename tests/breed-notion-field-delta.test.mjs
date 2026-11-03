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
test("different values use Notion for normal editorial fields; no review lock",()=>{
  const p=plan({admin:{children:5},after:{children:4}});
  assert.deepEqual(p.conflicts,[]);
  assert.deepEqual(p.accepted,["children"]);
  assert.equal(p.patch.children,4);
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
test("every SEO property uses independent field-level priority",()=>{
  const old=breedFieldSnapshot(breed());
  const next=source({seo:{...breed().seo,focusKeyword:"pes",ogTitle:"Nový OG",
    ogDescription:"Nový popis",canonicalUrl:"https://psipedia.sk/plemena/test",noindex:true}});
  const result=planBreedNotionFieldDelta(breed(),next,old,old);
  assert.deepEqual(result.conflicts,[]);
  assert.deepEqual(new Set(result.accepted),new Set(["seo.focusKeyword","seo.ogTitle","seo.ogDescription",
    "seo.canonicalUrl","seo.noindex"]));
  assert.equal(result.patch.seo.focusKeyword,"pes");
  assert.equal(result.patch.seo.noindex,true);
  assert.equal(result.patch.seo.title,undefined);
  const admin=planBreedNotionFieldDelta(breed(),next,old,old,{"seo.noindex":"admin"});
  assert.equal(admin.patch.seo.noindex,undefined);
  assert.equal(admin.patch.seo.ogTitle,"Nový OG");
});

test("old field receipts gain new SEO keys without invalidating every breed",()=>{
  const old=breedFieldSnapshot(breed());
  for(const key of ["seo.focusKeyword","seo.ogTitle","seo.ogDescription",
    "seo.canonicalUrl","seo.noindex"])delete old[key];
  const parsed=parseBreedFieldSnapshot(JSON.stringify(old));
  assert.ok(parsed);
  assert.equal(parsed["seo.noindex"],false);
  assert.equal(parsed["seo.focusKeyword"],"");
});

test("legacy hashes establish baseline and immutable IDs",async()=>{
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

test("signed Notion property IDs survive the webhook path to first-edit legacy breed patch", async () => {
  const dispatch = await readFile(new URL("../lib/notion-webhook-dispatch.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../lib/notion-breed-sync.ts", import.meta.url), "utf8");
  const inbox = await readFile(new URL("../lib/notion-webhook-inbox.ts", import.meta.url), "utf8");
  assert.match(dispatch, /changedPropertyIds: event\.data\?\.updated_properties \?\? \[\]/);
  assert.match(inbox, /changed_properties_json/);
  assert.match(sync, /function signedBreedChangedFields/);
  assert.match(sync, /previousNotion\[field\]=previousAdmin\[field\]/);
  assert.doesNotMatch(sync, /throw new Error\("BREED_LEGACY_CONCURRENT_ADMIN_EDIT"/);
  assert.doesNotMatch(sync, /throw new Error\("BREED_WEBHOOK_FIELDS_UNRESOLVED"/);
  assert.match(sync, /fields = touched.length/);
  assert.match(sync, /partialBreedNotionReceipt\(/);
});

test("93 independent content fields are listed; no identity is in the editable set",()=>{
  assert.equal(BREED_NOTION_EDITABLE_FIELDS.length,93);
  assert.ok(BREED_NOTION_EDITABLE_FIELDS.includes("fciStandard.oci"));
  assert.ok(BREED_NOTION_EDITABLE_FIELDS.includes("editorial.healthTip"));
  assert.ok(BREED_NOTION_EDITABLE_FIELDS.includes("gallery"));
  assert.ok(BREED_NOTION_EDITABLE_FIELDS.includes("relatedBreedIds"));
  assert.ok(!BREED_NOTION_EDITABLE_FIELDS.includes("slug"));
  assert.ok(!BREED_NOTION_EDITABLE_FIELDS.includes("fciNumber"));
  assert.ok(!BREED_NOTION_EDITABLE_FIELDS.includes("status"));
});

test("different FCI/editorial cells do not overwrite their siblings",()=>{
  const base=breed({fciStandard:{oci:"Hnedé",usi:"Vzpriamené"},
    editorial:{overview:"Pôvodné",healthTip:"Overené"}});
  const prev=breedFieldSnapshot(base);
  const incoming=source({fciStandard:{...base.fciStandard,oci:"Tmavé"},
    editorial:{...base.editorial,overview:"Nové"}});
  const delta=planBreedNotionFieldDelta(base,incoming,prev,prev);
  assert.deepEqual(new Set(delta.accepted),new Set(["fciStandard.oci","editorial.overview"]));
  assert.equal(delta.patch.fciStandard.usi,undefined);
  assert.equal(delta.patch.editorial.healthTip,undefined);
});

