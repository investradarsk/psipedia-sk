import test from "node:test";
import assert from "node:assert/strict";
import {BREED_NOTION_SCHEMA} from "../lib/notion-breed-property-registry.ts";
import {planBreedWorkCopyFieldWrite as plan} from "../lib/notion-breed-workcopy-patch-bridge.mjs";

const rich=value=>({type:"rich_text",rich_text:value?[{plain_text:value}]:[]});
const page=()=>({
  last_edited_time:"2026-11-11T20:00:00.000Z",
  properties:{
    "Názov plemena":{type:"title",title:[{plain_text:"Zlatý retriever"}]},
    "Krátky úvod v hero (2–4 vety)":rich("Úvod."),
    "Prehľad plemena":rich("Prehľad."),
    "Každodenné potreby plemena":rich("Pohyb."),
    "FCI lebka":rich("Lebka."),
    "FCI oči":rich("Hnedé oči."),
    "FCI uši":rich("Uši."),
    "Vzťah k deťom":{type:"number",number:3},
    "Editorial complete – redakčne overený profil":{type:"checkbox",checkbox:true},
    "Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)":rich("https://psipedia.sk/media/a.jpg"),
    "Ďalšie fotografie":rich("[]"),
    "Športy a aktivity":rich("[]"),
    "Typické zdravotné riziká — jedna položka na riadok":rich("Alergie; Oči"),
    "Pre koho sa hodí — jedna položka na riadok":rich("Rodiny; Aktívni"),
    "Na čo si dať pozor — jedna položka na riadok":rich("Pohyb"),
    "Zdroje":rich("FCI|https://fci.be/"),
    "FCI číslo":{type:"number",number:111},
    "Psipedia ID":rich("2"),
  },
});
const patch=(fieldId,value,baseline,p=page(),revision=p.last_edited_time)=>
  plan({schema:BREED_NOTION_SCHEMA,page:p,fieldId,value,baseline,expectedPageRevision:revision});

test("Prehľad and Každodenné potreby stay separate on Admin -> Notion",()=>{
  const overview=patch("editorial.overview","Nový prehľad.","Prehľad.");
  const needs=patch("needs","Viac pohybu.","Pohyb.");
  assert.deepEqual(Object.keys(overview.properties),["Prehľad plemena"]);
  assert.deepEqual(Object.keys(needs.properties),["Každodenné potreby plemena"]);
  assert.equal(overview.properties["Prehľad plemena"].rich_text[0].text.content,"Nový prehľad.");
  assert.equal(needs.properties["Každodenné potreby plemena"].rich_text[0].text.content,"Viac pohybu.");
  assert.equal(patch("editorial.overview","","Prehľad.").properties["Prehľad plemena"].rich_text.length,0);
});

test("FCI eyes edits never touch skull, ears or other physical columns",()=>{
  const eyes=patch("fciStandard.oci","Modré oči.","Hnedé oči.");
  assert.equal(eyes.property,"FCI oči");
  assert.deepEqual(Object.keys(eyes.properties),["FCI oči"]);
  assert.equal(eyes.properties["FCI oči"].rich_text[0].text.content,"Modré oči.");
  const skull=patch("fciStandard.hlava_lebecna_cast","Nová lebka.","Lebka.");
  assert.deepEqual(Object.keys(skull.properties),["FCI lebka"]);
});

test("text, numerical score, title and checkbox update their distinct Notion cells",()=>{
  assert.deepEqual(Object.keys(patch("intro","Nový úvod","Úvod.").properties),["Krátky úvod v hero (2–4 vety)"]);
  assert.deepEqual(patch("children",4,3).properties,{"Vzťah k deťom":{number:4}});
  assert.deepEqual(patch("editorialComplete",false,true).properties,
    {"Editorial complete – redakčne overený profil":{checkbox:false}});
  assert.deepEqual(Object.keys(patch("name","Zlatý retríver","Zlatý retriever").properties),["Názov plemena"]);
});

test("only the edited cell wins, but a stale revision or actual same-cell conflict refuses write",()=>{
  const p=page();p.properties["Prehľad plemena"]=rich("Zmenené inde");
  assert.throws(()=>patch("editorial.overview","Nový","Prehľad.",p),/BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION/);
  assert.throws(()=>patch("needs","Nové","Pohyb.",page(),"old-revision"),/BREED_WORKCOPY_PAGE_REVISION_CHANGED/);
  const force=plan({schema:BREED_NOTION_SCHEMA,page:p,fieldId:"editorial.overview",
    value:"Potvrdená úprava",baseline:"Pôvodný receipt",allowCurrentRemote:true,
    expectedPageRevision:p.last_edited_time});
  assert.equal(force.properties["Prehľad plemena"].rich_text[0].text.content,"Potvrdená úprava");
});

test("media, gallery, sports, sources and lists serialize to their exact columns",()=>{
  const image=patch("image","/media/b.jpg","https://psipedia.sk/media/a.jpg");
  assert.deepEqual(image.properties,{
    "Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)":{rich_text:[{type:"text",text:{content:"https://psipedia.sk/media/b.jpg"}}]},
  });
  const gallery=patch("gallery",[{imageUrl:"/media/b.jpg"}],[]);
  assert.deepEqual(JSON.parse(gallery.properties["Ďalšie fotografie"].rich_text[0].text.content),
    [{imageUrl:"/media/b.jpg"}]);
  const sports=patch("sports",[{key:"agility",rating:2}],[]);
  assert.equal(JSON.parse(sports.properties["Športy a aktivity"].rich_text[0].text.content)[0].key,"agility");
  assert.equal(patch("sources",[{label:"FCI",url:"https://fci.be/"}],
    [{label:"FCI",url:"https://fci.be/"}]).changed,false);
  assert.equal(patch("healthRisks",["Alergie","Oči","Kĺby"],["Alergie","Oči"])
    .properties["Typické zdravotné riziká — jedna položka na riadok"].rich_text[0].text.content,
    "Alergie; Oči; Kĺby");
  assert.equal(patch("goodFor",["Rodiny","Aktívni","Športovci"],["Rodiny","Aktívni"])
    .property,"Pre koho sa hodí — jedna položka na riadok");
});

test("legacy URL labels are free-text Notion columns and sources allow no URL",()=>{
  const p=page();
  p.properties["FCI štandard PDF"]=rich("Pôvodný text");
  const pdf=patch("fciStandard.fci_standard_pdf","Nie je URL, je to text","Pôvodný text",p);
  assert.deepEqual(Object.keys(pdf.properties),["FCI štandard PDF"]);
  assert.equal(pdf.properties["FCI štandard PDF"].rich_text[0].text.content,
    "Nie je URL, je to text");
  p.properties["Zdroje"]=rich("Pôvodný text");
  const sources=patch("sources",[{label:"Kynologický klub",url:""}],[],p);
  assert.equal(sources.properties["Zdroje"].rich_text[0].text.content,
    "Kynologický klub");
  assert.deepEqual(Object.keys(sources.properties),["Zdroje"]);
});

test("technical ID and historical/controlled aliases are not live editable prose",()=>{
  for(const fieldId of ["fciGroup","fciSection","height","weight","size","origin"]){
    assert.throws(()=>patch(fieldId,"x",""),/BREED_WORKCOPY_FIELD_NOT_EDITABLE/);
  }
  assert.throws(()=>patch("system.Psipedia ID","3","2"),/BREED_WORKCOPY_FIELD_OR_BASELINE_UNKNOWN/);
  assert.throws(()=>patch("children","4",3),/BREED_WORKCOPY_NUMBER_INVALID/);
  const invalid=page();invalid.properties["Vzťah k deťom"]=rich("text");
  assert.throws(()=>patch("children",4,3,invalid),/BREED_WORKCOPY_PROPERTY_TYPE_MISMATCH/);
  assert.throws(()=>patch("consider",["Neplatné; pole"],["Pohyb"]),/BREED_WORKCOPY_LIST_INVALID/);
});
