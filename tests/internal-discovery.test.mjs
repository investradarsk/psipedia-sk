import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INTERNAL_DISCOVERY_MAX_LINKS, boundInternalDiscoveryLinks, buildBreedingStationDiscoveryLinks, buildDirectoryDiscoveryCountQuery, buildDirectoryLocationParentCandidates, buildDirectoryProfileLocationCandidates, listIndexableDirectoryProfileLocationLinks } from "../lib/internal-discovery.ts";
import { getSlovakLandingLocationBySlug } from "../lib/slovak-location-landings.ts";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const profile=(overrides={})=>({category:"veterinari",city:"Nitra",district:"Nitra",region:"Nitriansky kraj",...overrides});

test("canonical, deduplicated, query-free and bounded links",()=>{
  const input=Array.from({length:20},(_,i)=>({href:i%2===0?`/adresar/veterinari/mesto/nitra-${i}`:`/adresar/veterinari/mesto/nitra-${i}?sort=x`,label:`Cieľ ${i}`}));
  input.push({href:"/adresar/veterinari/mesto/nitra-0",label:"Duplikát"});
  const links=boundInternalDiscoveryLinks(input,99);
  assert.equal(links.length,INTERNAL_DISCOVERY_MAX_LINKS); assert.equal(new Set(links.map(x=>x.href)).size,links.length); assert.ok(links.every(x=>!x.href.includes("?")));
});
test("profile candidates respect canonical alias and supported dimensions",()=>{
  assert.deepEqual(buildDirectoryProfileLocationCandidates(profile()).map(x=>x.href),["/adresar/veterinari/mesto/nitra","/adresar/veterinari/okres/nitra","/adresar/veterinari/kraj/nitriansky"]);
  assert.ok(buildDirectoryProfileLocationCandidates(profile({category:"psie-skoly"})).every(x=>x.href.startsWith("/adresar/treneri/")));
  assert.deepEqual(buildDirectoryProfileLocationCandidates(profile({category:"fyzioterapia"})).map(x=>x.dimension),["city","region"]);
});
test("target validation is one aggregate read without SELECT star",()=>{
  const q=buildDirectoryDiscoveryCountQuery("veterinari",buildDirectoryProfileLocationCandidates(profile())); assert.ok(q);
  assert.equal((q.sql.match(/\bSELECT\b/gi)??[]).length,1); assert.doesNotMatch(q.sql,/SELECT\s+\*/i); assert.match(q.sql,/SUM\(CASE WHEN/); assert.equal(q.candidates.length,3);
});
test("thin target is omitted with one DB call",async()=>{
  let calls=0; const db={prepare(sql){calls++; assert.match(sql,/target_0/); return{bind(...b){assert.equal(b.at(-1),"veterinari");return{async first(){return{target_0:2,target_1:1,target_2:5}}}}}}};
  const links=await listIndexableDirectoryProfileLocationLinks(profile(),db); assert.equal(calls,1);
  assert.deepEqual(links.map(x=>x.href),["/adresar/veterinari/mesto/nitra","/adresar/veterinari/kraj/nitriansky"]);
});
test("city parent hierarchy comes from canonical Slovakia source",()=>{
  const city=getSlovakLandingLocationBySlug("city","nitra"); assert.ok(city);
  const landing={category:"veterinari",categoryLabel:"Veterinári",dimension:"city",location:city,path:"/adresar/veterinari/mesto/nitra",profiles:[],total:3,indexThreshold:2,indexable:true,lastModified:null,h1:"",seoTitle:"",description:"",intro:""};
  assert.deepEqual(buildDirectoryLocationParentCandidates(landing).map(x=>x.href),["/adresar/veterinari/okres/nitra","/adresar/veterinari/kraj/nitriansky"]);
  assert.deepEqual(buildDirectoryLocationParentCandidates({...landing,category:"vencenie"}).map(x=>x.href),["/adresar/vencenie/kraj/nitriansky"]);
});
test("breed-region graph is canonical and bounded",()=>{
  const region={dimension:"region",slug:"nitriansky",name:"Nitriansky kraj",locative:"Nitrianskom kraji",phrase:"v Nitrianskom kraji",sql:{values:["Nitriansky kraj"]}};
  const base={kind:"breed-region",path:"/adresar/chovatelske-stanice/plemeno/labradorsky-retriver/kraj/nitriansky",breed:{id:1,slug:"labradorsky-retriver",name:"Labradorský retriever",updatedAt:null},region,profiles:[{},{}],total:2,indexable:true,lastModified:null,h1:"",seoTitle:"",description:"",intro:""};
  assert.deepEqual(buildBreedingStationDiscoveryLinks(base).map(x=>x.href),["/adresar/chovatelske-stanice/plemeno/labradorsky-retriver","/adresar/chovatelske-stanice/kraj/nitriansky","/plemena/labradorsky-retriver"]);
  assert.deepEqual(buildBreedingStationDiscoveryLinks({...base,profiles:[{}],total:1,indexable:false}).map(x=>x.href),["/plemena/labradorsky-retriver"]);
});
test("breed landing threshold reuses existing batch",()=>{const s=read("../lib/breed-store.ts"); assert.match(s,/COUNT\(\*\) OVER\(\) AS relation_total/); assert.match(s,/database\.batch\(\[articleQuery,stationsQuery,clubsQuery,similarQuery\]\)/);});
test("query-string discovery was removed",()=>{const b=read("../app/plemena/[slug]/page.tsx"),d=read("../components/directory-profile-detail.tsx");assert.doesNotMatch(b,/\/adresar\/treneri\?breed=/);assert.doesNotMatch(d,/\?region=/);assert.match(d,/RelatedEntityLinks/);});
test("existing explicit relations are reused for unchanged entity types",()=>{assert.match(read("../components/article-detail.tsx"),/data-explicit-content-relation="article-breed"/);assert.match(read("../components/organization-profile-detail.tsx"),/OrganizationAdoptionCard/);assert.match(read("../components/event-detail.tsx"),/eventTypePortalHref/);assert.match(read("../components/help-details/help-detail-shell.tsx"),/\/pomoc-psom\/\$\{item\.category\}/);assert.match(read("../components/lost-found-dog-detail.tsx"),/report\.breedSlug.*\/plemena\//s);});
test("adoption uses canonical organization and canonical breed",()=>{const c=read("../components/adoption-detail.tsx"),s=read("../lib/adoption-store.ts");assert.match(c,/\/organizacie\/\$\{organization\.slug\}/);assert.match(c,/dog\.breedSlug \? <Link href={`\/plemena\/\$\{dog\.breedSlug\}`}/);assert.match(s,/b\.id IN \(\$\{canonicalBreedIdsSql\}\)/);});
