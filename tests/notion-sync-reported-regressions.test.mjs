import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { inspectBreedMeasurement } from "../lib/breed-fci.ts";
import { breedFieldSnapshot, planBreedNotionFieldDelta, parseBreedFieldSnapshot, advanceBreedAdminReceipt } from "../lib/notion-breed-field-delta.ts";
import { planSafeBreedFields, partialBreedNotionReceipt, breedPartialError } from "../lib/notion-breed-safe-patch.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kazachský tazy: ignore FCI 372 when validating actual height", () => {
  const issues=inspectBreedMeasurement("Psy 63–70 cm, sučky 58–65 cm v kohútiku podľa štandardu FCI č. 372.", "height");
  assert.equal(issues.filter(i=>i.severity==="error").length,0);
  assert.ok(inspectBreedMeasurement("Psy 172 cm, sučky 58–65 cm", "height").some(i=>i.code==="out-of-range"));
});

test("Kaukazský ovčiak: year and research counts do not become dog lifespan", () => {
  const value="AKC uvádza orientačne 10–12 rokov. Britská štúdia z roku 2024 však v malej vzorke (52 psov, z toho 22 úmrtí) odhadla medián 5,4 roka.";
  assert.equal(inspectBreedMeasurement(value,"lifespan").filter(i=>i.severity==="error").length,0);
  assert.ok(inspectBreedMeasurement("40 rokov", "lifespan").some(i=>i.code==="out-of-range"));
  assert.ok(inspectBreedMeasurement("12–10 rokov", "lifespan").some(i=>i.code==="reversed-range"));
});

test("literal measurements without unit still report missing unit warning", () => {
  assert.ok(inspectBreedMeasurement("63–70","height").some(i=>i.code==="missing-unit"));
});

test("Wetterhoun: duplicate sports retain historical data and conflicting edits are rejected", async () => {
  const source=await read("../lib/breed-store.ts");
  assert.match(source,/preserved && JSON\.stringify\(input\.sports\)===JSON\.stringify\(preserved\.sports\)/);
  assert.match(source,/rozdielne duplicitné údaje/);
});

test("Lionel: birth date takes precedence over default age zero; positive conflicts remain blocked", async () => {
  const source=await read("../lib/notion-events-help-adapters.ts");
  assert.match(source,/birthDate&&enteredAge===0\?null:enteredAge/);
  const adoption=await read("../lib/adoption.ts");
  assert.match(adoption,/birthDate && approximateAgeMonths !== null/);
});

test("article Notion writeback uses bounded retry shared with other modules", async () => {
  const source=await read("../lib/notion-article-sync.ts");
  assert.match(source,/notionRequest as notionSharedRequest/);
  assert.match(source,/return notionSharedRequest<T>\(bindings, path, init\)/);
  const shared=await read("../lib/notion-sync-shared.ts");
  assert.match(shared,/error\.headers\.get\("retry-after"\)/);
});

test("existing breed receipts remain compatible after structured columns are added",()=>{
  const baseline={name:"Wetterhoun",seo:{title:"A",description:"B"},energy:3};
  const legacy=breedFieldSnapshot(baseline);
  for(const key of Object.keys(legacy)){
    if(key.startsWith("fciStandard.")||key.startsWith("editorial."))delete legacy[key];
  }
  legacy.fciStandard={oci:"Hnedé"};
  legacy.editorial={overview:"Pôvodné"};
  delete legacy.sports;
  const parsed=parseBreedFieldSnapshot(JSON.stringify(legacy));
  assert.ok(parsed);
  assert.equal(parsed.sports,null);
  assert.equal(parsed["fciStandard.oci"],"Hnedé");
  assert.equal(parsed["editorial.overview"],"Pôvodné");
});

test("new Notion fields preserve unrelated canonical structured content",()=>{
  const base={name:"Wetterhoun",sports:[{key:"swim",label:"Plávanie",rating:4,note:"Voda"}],
    fciStandard:{oci:"Hnedé",usi:"Klasické"},editorial:{overview:"Starý",healthTip:"Kontrola"},seo:{title:"A",description:"B"}};
  const before={...base,sports:undefined,fciStandard:undefined,editorial:undefined};
  const incoming={...before,
    sports:[{key:"swim",label:"Plávanie",rating:4,note:"Voda"}],
    fciStandard:{oci:"Tmavohnedé"},editorial:{overview:"Nový"}};
  const plan=planBreedNotionFieldDelta(base,incoming,breedFieldSnapshot(before),breedFieldSnapshot(base));
  assert.deepEqual(plan.conflicts,[]);
  assert.equal(plan.patch.fciStandard.usi,undefined);
  assert.equal(plan.patch.fciStandard.oci,"Tmavohnedé");
  assert.equal(plan.patch.editorial.healthTip,undefined);
  assert.equal(plan.patch.editorial.overview,"Nový");
  assert.equal(plan.patch.image,undefined);
  // Sparse field patch is merged into the existing canonical object, preserving
  // every untouched sibling despite the independent per-field priorities.
  const applied=planSafeBreedFields(base,plan,new Set(),()=>{});
  assert.equal(applied.candidate.fciStandard.usi,"Klasické");
  assert.equal(applied.candidate.editorial.healthTip,"Kontrola");
});

test("individual FCI and editorial Notion columns are included in signed webhook field mapping",async()=>{
  const source=await read("../lib/notion-breed-sync.ts");
  assert.match(source,/FCI_NOTION_DETAIL_COLUMNS\.some/);
  assert.match(source,/BREED_NOTION_EDITORIAL_COLUMNS\.some/);
  assert.match(source,/matches\("Redakcia hlavné vlastnosti JSON"\)/);
  assert.match(source,/fciStandard: "FCI štandard JSON"/);
  assert.match(source,/sports: "Športy JSON"/);
});

test("Wetterhoun: invalid sport list does not block healthy intro/health and is retried", () => {
  const oldSport={key:"swim",label:"Plávanie",rating:4,note:""};
  const existing={
    name:"Wetterhoun",slug:"wetterhoun",status:"published",
    intro:"Starý úvod",health:"Staré zdravie",height:"55–59 cm",
    sports:[oldSport,oldSport],seo:{title:"Wetterhoun",description:"Opis"},
  };
  const incoming={
    ...existing,intro:"Novší odborný úvod",health:"Informácie o SCID",
    sports:[{...oldSport,rating:5},{...oldSport,rating:2}],
  };
  const old=breedFieldSnapshot(existing);
  const plan=planBreedNotionFieldDelta(existing,incoming,old,old);
  const validate=(candidate,baseline)=>{
    if(JSON.stringify(candidate.sports)!==JSON.stringify(baseline.sports))
      throw new Error("Šport Plávanie má konfliktné hodnotenia");
  };
  const safe=planSafeBreedFields(existing,plan,new Set(),validate);
  assert.deepEqual(safe.accepted,["intro","health"]);
  assert.deepEqual(safe.skipped.map(item=>item.field),["sports"]);
  assert.equal(safe.candidate.intro,"Novší odborný úvod");
  assert.equal(safe.candidate.health,"Informácie o SCID");
  assert.deepEqual(safe.candidate.sports,existing.sports);
  assert.match(breedPartialError(safe.skipped),/sports/);

  const receipt=partialBreedNotionReceipt(old,plan.latest,safe.accepted);
  assert.equal(receipt.intro,incoming.intro);
  assert.deepEqual(receipt.sports,old.sports);
  const admin=advanceBreedAdminReceipt(old,safe.candidate,safe.accepted);
  const retry=planBreedNotionFieldDelta(safe.candidate,incoming,receipt,admin);
  assert.deepEqual(retry.conflicts,[]);
  assert.deepEqual(retry.changed,["sports"]);
});

test("invalid lifespan skips just that field and leaves successful fields acknowledged",()=>{
  const existing={name:"Kaukazský ovčiak",intro:"Pôvodný",lifespan:"10–12 rokov",seo:{title:"",description:""}};
  const incoming={...existing,intro:"Overený nový úvod",lifespan:"2024 rokov"};
  const old=breedFieldSnapshot(existing);
  const plan=planBreedNotionFieldDelta(existing,incoming,old,old);
  const safe=planSafeBreedFields(existing,plan,new Set(),candidate=>{
    if(candidate.lifespan==="2024 rokov")throw new Error("Vek mimo rozsahu 3–30 rokov");
  });
  assert.deepEqual(safe.accepted,["intro"]);
  assert.deepEqual(safe.skipped.map(item=>item.field),["lifespan"]);
  assert.equal(safe.candidate.intro,incoming.intro);
  assert.equal(safe.candidate.lifespan,existing.lifespan);
});

test("malformed structured JSON field is reported but does not prevent good text",()=>{
  const existing={name:"Wetterhoun",intro:"Old",sports:[],seo:{title:"",description:""}};
  const incoming={...existing,intro:"New"};
  const old=breedFieldSnapshot(existing);
  const plan=planBreedNotionFieldDelta(existing,incoming,old,old);
  const safe=planSafeBreedFields(existing,plan,new Set(["fciStandard"]),()=>{});
  assert.deepEqual(safe.accepted,["intro"]);
  assert.deepEqual(safe.skipped.map(item=>item.field),["fciStandard"]);
  assert.equal(safe.candidate.intro,"New");
});
