import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyHelpItems, previewHelpItems } from "../lib/help-import-preview.ts";

const regions=["Bratislavský kraj","Trnavský kraj","Nitriansky kraj"];
const categories=["utulky","adopcia","docasna-opatera","zbierky","stratene-a-najdene","dobrovolnictvo","urgentne-pripady"];
function input(overrides={}){return{
  title:"Venčenie v OZ Priateľ",slug:"vencenie-oz-priatel",category:"dobrovolnictvo",status:"draft",
  excerpt:"Pomôžte pravidelným venčením psov v starostlivosti združenia.",
  description:"Hľadáme dobrovoľníkov na pravidelné prechádzky so psami v starostlivosti združenia.",
  organization:"OZ Priateľ",dogName:"",city:"Nitra",region:"Nitriansky kraj",locationNote:"Okres: Nitra",
  actionLabel:"Chcem pomôcť",contactNote:"E-mail: ahoj@priatel.sk\nTelefón: +421 900 123 456",
  actionUrl:"https://priatel.sk/pomoc",...overrides,
};}
function production(overrides={}){const source=input();return{id:1,slug:source.slug,title:source.title,category:source.category,status:source.status,excerpt:source.excerpt,description:source.description,organization:source.organization,dog_name:source.dogName,city:source.city,region:source.region,location_note:source.locationNote,contact_note:source.contactNote,action_url:source.actionUrl,...overrides};}
function classify(items,rows=[]){return classifyHelpItems(items,rows,categories,regions);}

test("valid generic Help record is NEW and safe, including text image/reference fields",()=>{
  const preview=classify([input({imageKey:"help/ready/photo.webp"})]);
  assert.equal(preview.NEW,1);assert.equal(preview.SAFE_FOR_IMPORT,1);assert.equal(preview.rows[0].safeForImport,true);
  assert.equal(classify([input({imageKey:42})]).BLOCKED,1);
});

test("same generic (category, slug) is read-only EXISTING_SAME",async()=>{
  const sql=[];const db={prepare(query){sql.push(query);return{async all(){return{success:true,results:[production()]};}};}};
  const preview=await previewHelpItems(db,[input()],categories,regions);
  assert.equal(preview.EXISTING_SAME,1);assert.equal(preview.rows[0].matchedProductionId,1);assert.equal(preview.SAFE_FOR_IMPORT,0);
  assert.equal(sql.length,1);assert.match(sql[0],/^SELECT\b/);assert.doesNotMatch(sql[0],/\b(INSERT|UPDATE|DELETE|UPSERT|LIMIT|WHERE\s+status)\b/i);
});

test("different slug with strong generic identity is POSSIBLE_DUPLICATE and same slug conflict is blocked from import",()=>{
  assert.equal(classify([input({slug:"oz-priatel"})],[production()]).POSSIBLE_DUPLICATE,1);
  assert.equal(classify([input({organization:"OZ Iný"})],[production()]).CONFLICT,1);
  assert.equal(classify([input({description:"Iný podrobný popis práce útulku a pomoci psom."})],[production()]).CONFLICT,1);
});

test("dedicated canonical categories and legacy urgent creation are BLOCKED by Help import",()=>{
  for(const category of ["adopcia","utulky","stratene-a-najdene"]){
    const preview=classify([input({category,slug:`dedicated-${category}`})]);
    assert.equal(preview.BLOCKED,1,category);assert.match(preview.rows[0].reason,/samostatného canonical admin modulu/);
  }
  const legacy=classify([input({category:"urgentne-pripady",slug:"legacy-urgent"})]);
  assert.equal(legacy.BLOCKED,1);assert.match(legacy.rows[0].reason,/legacy urgentná category/);
});

test("invalid region and duplicate input keys stay BLOCKED without silent reduction",()=>{
  for(const region of ["Bratislavský kraj; Trnavský kraj","Neexistujúci kraj"]){const preview=classify([input({region})]);assert.equal(preview.BLOCKED,1);assert.match(preview.rows[0].reason,/region/);}
  const duplicate=classify([input(),input()]);assert.equal(duplicate.BLOCKED,2);assert.equal(duplicate.SAFE_FOR_IMPORT,0);
});

test("drafts and over 100 production rows are checked without LIMIT",async()=>{
  const rows=Array.from({length:151},(_,index)=>production({id:index+1,slug:`historicky-${index}`,title:`Historická výzva ${index}`,organization:`Iné OZ ${index}`,city:"Košice",action_url:null,contact_note:""}));
  rows[150]=production({id:151,status:"draft"});
  const db={prepare(sql){assert.match(sql,/^SELECT\b/);assert.doesNotMatch(sql,/\bLIMIT\b/i);return{async all(){return{success:true,results:rows};}};}};
  const preview=await previewHelpItems(db,[input()],categories,regions);assert.equal(preview.EXISTING_SAME,1);assert.equal(preview.rows[0].matchedProductionId,151);
});

test("runtime preview reads only generic Help domain in one SELECT and never writes",async()=>{
  let query="";let selects=0;
  const db={prepare(sql){query=sql;selects+=1;return{async all(){return{success:true,results:[]};}};},batch(){throw new Error("batch must never run");}};
  const items=Array.from({length:106},(_,index)=>input({title:`Výzva ${index}`,slug:`vyzva-${index}`,organization:`OZ ${index}`,city:`Mesto ${index}`,actionUrl:`https://vyzva-${index}.sk`,contactNote:""}));
  const preview=await previewHelpItems(db,items,categories,regions);
  assert.equal(selects,1);assert.equal(preview.NEW,106);assert.equal(preview.SAFE_FOR_IMPORT,106);
  assert.match(query,/category NOT IN \('adopcia', 'utulky', 'stratene-a-najdene'\)/);
  assert.doesNotMatch(query,/\b(INSERT|UPDATE|DELETE|UPSERT|LIMIT)\b/i);
});

test("same organization across two generic Help categories does not create a false duplicate",()=>{
  const volunteer=production({category:"dobrovolnictvo",slug:"vencenie-trnava",title:"Venčenie v Trnave",organization:"OZ Priateľ",city:"Nitra"});
  const temporary=input({category:"docasna-opatera",slug:"docasna-max",title:"Dočasná opatera pre Maxa",dogName:"Max",organization:"OZ Priateľ"});
  const preview=classify([temporary],[volunteer]);assert.equal(preview.NEW,1);assert.equal(preview.SAFE_FOR_IMPORT,1);
});

test("same fundraiser title and organizer remains a possible duplicate",()=>{
  const existing=production({category:"zbierky",slug:"operacia-penny",title:"Pomôžme Penny postaviť sa",organization:"Zlatica Guzlejová",city:"Bratislava",region:"Bratislavský kraj",action_url:"https://donio.sk/pomozme-penny"});
  const candidate=input({category:"zbierky",slug:"pomoc-pre-penny",title:"Pomôžme Penny postaviť sa",organization:"Zlatica Guzlejová",city:"Bratislava",region:"Bratislavský kraj",actionLabel:"Otvoriť overenú zbierku",actionUrl:"https://donio.sk/pomozme-penny"});
  const preview=classify([candidate],[existing]);assert.equal(preview.POSSIBLE_DUPLICATE,1);assert.equal(preview.SAFE_FOR_IMPORT,0);
});

test("failed production SELECT aborts instead of marking records NEW",async()=>{
  await assert.rejects(previewHelpItems({prepare(){return{async all(){return{success:false,results:[]};}};}},[input()],categories,regions),/úplný zoznam/);
  await assert.rejects(previewHelpItems({prepare(){return{async all(){throw new Error("D1 unavailable");}};}},[input()],categories,regions),/D1 unavailable/);
});

test("preview endpoint stays read-only and separate from generic import writer",()=>{
  const route=readFileSync(new URL("../app/api/admin/help/preview/route.ts",import.meta.url),"utf8");
  assert.doesNotMatch(route,/importFciBreeds|runBatches|createManagedHelpCase|\/api\/admin\/import|\.batch\(/);assert.match(route,/previewHelpItems/);
});
