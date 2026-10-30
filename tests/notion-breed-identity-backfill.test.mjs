import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateBreedIdentity } from "../lib/notion-breed-identity-backfill.ts";
import { HISTORICAL_FCI_BY_SLUG } from "../lib/breed-fci-historical-reference.ts";

const breed={id:3183,slug:"beauceron",name:"Beauceron",
  fci_number:44,status:"published",updated_at:"2026-10-30T21:00:00.000Z"};
const page="3f4793fc-1d18-8123-b874-fdfbb31fe9c7";
const base={notionSlug:"beauceron",notionFci:44,notionId:"",
  canonical:breed,countBySlug:1,countByFci:1,
  expectedPageId:page,approved:true};

test("unique confirmed 1:1 identity can backfill empty Psipedia ID",()=>{
  assert.equal(evaluateBreedIdentity(base),"ok");
  assert.equal(evaluateBreedIdentity({...base,notionId:"3183"}),"ok");
  assert.equal(HISTORICAL_FCI_BY_SLUG["beauceron"],44);
});
test("cannot steal another page mapping, collide ID, duplicate slug or FCI",()=>{
  assert.equal(evaluateBreedIdentity({...base,mappedPageId:"aaaa0000-0000-0000-0000-000000000000"}),"conflict-mapping");
  assert.equal(evaluateBreedIdentity({...base,mappedBreedId:999}),"conflict-mapping");
  assert.equal(evaluateBreedIdentity({...base,notionId:"3182"}),"conflict-id");
  assert.equal(evaluateBreedIdentity({...base,countBySlug:2}),"duplicate-notion");
  assert.equal(evaluateBreedIdentity({...base,countByFci:2}),"duplicate-notion");
  assert.equal(evaluateBreedIdentity({...base,notionFci:271}),"conflict-fci");
});
test("blank historical FCI is filled only with independent matching evidence",()=>{
  assert.equal(evaluateBreedIdentity({...base,canonical:{...breed,fci_number:null}}),"ok");
  assert.equal(evaluateBreedIdentity({...base,canonical:{...breed,fci_number:null},notionFci:23}),"conflict-fci");
  assert.equal(evaluateBreedIdentity({...base,notionFci:null}),"ok");
  assert.equal(evaluateBreedIdentity({...base,notionFci:null,canonical:{...breed,fci_number:null}}),"missing-fci");
  assert.equal(evaluateBreedIdentity({...base,canonical:null}),"missing");
  assert.equal(evaluateBreedIdentity({...base,approved:false}),"not-approved");
  assert.equal(HISTORICAL_FCI_BY_SLUG["kazachsky-tazy"],undefined,
    "new 2026 breed cannot inherit an unverified historic identity");
});
test("historical FCI audit matches every originally recorded source row",async()=>{
  const csv=await readFile(new URL("../docs/audits/breeds-2026-09-07.csv",import.meta.url),"utf8");
  const lines=csv.trim().split(/\r?\n/).slice(1);
  assert.equal(lines.length,343);
  for(const line of lines){
    const m=/^(\d+),([^,]+),/.exec(line);
    assert.ok(m);
    assert.equal(HISTORICAL_FCI_BY_SLUG[m[2]],Number(m[1]),m[2]);
  }
});
test("run is admin-only, bounded, changes no editorial or publication columns",async()=>{
  const api=await readFile(new URL("../app/api/admin/notion-breeds-identity-backfill/route.ts",import.meta.url),"utf8");
  const sync=await readFile(new URL("../lib/notion-breed-identity-backfill.ts",import.meta.url),"utf8");
  const ui=await readFile(new URL("../components/admin-breed-identity-backfill.tsx",import.meta.url),"utf8");
  assert.match(api,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(api,/body\?\.mode==="apply"/);
  assert.match(api,/maxWrites:20/);
  assert.match(sync,/notionPageBelongsToDataSource\(page,sourceId\)/);
  assert.match(sync,/INSERT OR IGNORE INTO breed_notion_sync/);
  assert.match(sync,/NOT EXISTS/);
  assert.match(sync,/identity-pending-editorial:/);
  assert.match(sync,/if\(!input.apply \|\| applied>=cap\)continue/);
  assert.match(sync,/properties\["Psipedia ID"\]/);
  assert.match(sync,/properties\["FCI číslo"\]/);
  assert.match(sync,/properties\["Sync stav"\]=\{select:\{name:"Čaká na sync"\}\}/);
  assert.doesNotMatch(sync,/createManagedBreed\(/);
  assert.doesNotMatch(sync,/updateManagedBreed\(/);
  assert.doesNotMatch(sync,/UPDATE managed_breeds SET (?!fci_number)/);
  assert.match(ui,/Doplniť potvrdené ID a FCI/);
  assert.match(ui,/for\(let i=0;i<30;i\+\+\)/);
  const page=await readFile(new URL("../app/admin/plemena/page.tsx",import.meta.url),"utf8");
  assert.match(page,/<AdminBreedIdentityBackfill \/>/);
});
