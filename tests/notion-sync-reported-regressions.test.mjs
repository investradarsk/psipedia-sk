import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { inspectBreedMeasurement } from "../lib/breed-fci.ts";
import { breedFieldSnapshot, planBreedNotionFieldDelta, parseBreedFieldSnapshot } from "../lib/notion-breed-field-delta.ts";

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

test("Wetterhoun: only byte-identical duplicate sports are skipped, conflicts are reported", async () => {
  const source=await read("../lib/breed-store.ts");
  assert.match(source,/previous\.label===next\.label&&previous\.rating===next\.rating&&previous\.note===next\.note/);
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
  delete legacy.fciStandard;
  delete legacy.editorial;
  delete legacy.sports;
  const parsed=parseBreedFieldSnapshot(JSON.stringify(legacy));
  assert.ok(parsed);
  assert.equal(parsed.sports,null);
  assert.equal(parsed.editorial,null);
  assert.equal(parsed.fciStandard,null);
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
  assert.equal(plan.patch.fciStandard.usi,"Klasické");
  assert.equal(plan.patch.fciStandard.oci,"Tmavohnedé");
  assert.equal(plan.patch.editorial.healthTip,"Kontrola");
  assert.equal(plan.patch.editorial.overview,"Nový");
  assert.equal(plan.patch.image,undefined);
});

test("individual FCI and editorial Notion columns are included in signed webhook field mapping",async()=>{
  const source=await read("../lib/notion-breed-sync.ts");
  assert.match(source,/FCI_NOTION_DETAIL_COLUMNS\.some/);
  assert.match(source,/BREED_NOTION_EDITORIAL_COLUMNS\.some/);
  assert.match(source,/matches\("Redakcia hlavné vlastnosti JSON"\)/);
  assert.match(source,/fciStandard: "FCI štandard JSON"/);
  assert.match(source,/sports: "Športy JSON"/);
});
