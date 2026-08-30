import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { breedAtlasHref, listFciSectionOptions, validFciSectionForGroup } from "../lib/breed-atlas.ts";
import { combinedFciMeasurement, fciMeasurement, publicFciDate, publicFciSectionName } from "../lib/breed-fci.ts";

const LONG_FCI_TEXT=Array.from({length:45},(_,index)=>`Odborná veta ${index+1} opisuje stavbu tela plemena bez skrátenia.`).join(" ")+" Úplný koniec odborného textu.";

function createD1Adapter(sqlite) {
  function statement(sql, bindings = []) {
    function execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { success: true, results: prepared.all(...bindings), meta: { changes: 0 } };
      const result = prepared.run(...bindings);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) } };
    }
    return { bind(...values) { return statement(sql, values); }, async all() { return execute(); }, async first() { return execute().results[0] ?? null; }, async run() { return execute(); }, execute };
  }
  return { prepare(sql) { return statement(sql); }, async batch(statements) { sqlite.exec("BEGIN"); try { const results = statements.map((item)=>item.execute()); sqlite.exec("COMMIT"); return results; } catch(error) { sqlite.exec("ROLLBACK"); throw error; } } };
}

function applyMigration(sqlite, relativePath) {
  const source=readFileSync(new URL(relativePath,import.meta.url),"utf8");
  for(const sql of source.split("--> statement-breakpoint").map((item)=>item.trim()).filter(Boolean)) sqlite.exec(sql);
}

function database() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE navigation_items (id TEXT PRIMARY KEY NOT NULL,label TEXT NOT NULL,href TEXT NOT NULL,parent_id TEXT,position INTEGER NOT NULL DEFAULT 0,visible INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)");
  for(const migration of ["../drizzle/0000_curved_tony_stark.sql","../drizzle/0002_spicy_ultragirl.sql","../drizzle/0003_talented_cammi.sql","../drizzle/0005_nappy_kitty_pryde.sql"]) applyMigration(sqlite,migration);
  sqlite.exec(`
    ALTER TABLE managed_articles ADD blocks_json TEXT DEFAULT '[]' NOT NULL;
    ALTER TABLE managed_articles ADD portal_subpage TEXT;
    ALTER TABLE managed_articles ADD content_updated_at TEXT;
    ALTER TABLE managed_articles ADD show_updated_label INTEGER DEFAULT 0 NOT NULL;
    ALTER TABLE managed_articles ADD seo_title TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD meta_description TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD canonical_url TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD noindex INTEGER DEFAULT 0 NOT NULL;
    ALTER TABLE managed_articles ADD focus_keyword TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD og_title TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD og_description TEXT DEFAULT '' NOT NULL;
    ALTER TABLE managed_articles ADD og_image_url TEXT;
    ALTER TABLE managed_articles ADD og_image_key TEXT;
    ALTER TABLE directory_profiles ADD import_key TEXT;
    ALTER TABLE directory_profiles ADD source_data_json TEXT DEFAULT '{}' NOT NULL;
    ALTER TABLE directory_profiles ADD seo_json TEXT DEFAULT '{}' NOT NULL;
    ALTER TABLE directory_profiles ADD district TEXT DEFAULT '' NOT NULL;
    ALTER TABLE directory_profiles ADD search_text TEXT DEFAULT '' NOT NULL;
    ALTER TABLE help_cases ADD seo_json TEXT DEFAULT '{}' NOT NULL;
    ALTER TABLE managed_events ADD seo_json TEXT DEFAULT '{}' NOT NULL;
  `);
  for(const migration of ["../drizzle/0009_oval_skullbuster.sql","../drizzle/0013_condemned_chamber.sql"]) applyMigration(sqlite,migration);
  sqlite.exec("ALTER TABLE managed_breeds ADD seo_json TEXT DEFAULT '{}' NOT NULL");
  applyMigration(sqlite,"../drizzle/0022_fresh_hulk.sql");
  return {sqlite,d1:createD1Adapter(sqlite)};
}

function fciRecord({number,name,official,group,slug,sectionNumber="1",sectionName="Testovacia sekcia"}) {
  return {
    status_fci:"detailne overene",nazov_sk:name,nazov_fci:official,fci_cislo:number,krajina_povodu:"Testovacia krajina",
    datum_platneho_standardu:"2026-01-01",vyuzitie:"Pracovný a spoločenský pes",fci_skupina:group,
    fci_skupina_nazov:`Skupina ${group}`,fci_sekcia:sectionNumber,fci_sekcia_nazov:sectionName,pracovna_skuska:"Podľa štandardu",
    historicky_suhrn:`História plemena ${name}.`,celkovy_vzhlad:`Celkový vzhľad plemena ${name}.`,dolezite_proporcie:"Vyvážené proporcie podľa štandardu.",povaha_temperament:`Vyrovnaná povaha plemena ${name}.`,
    hlava_lebecna_cast:"Lebečná časť podľa štandardu.",hlava_tvarova_cast:"Tvárová časť podľa štandardu.",oci:"Oči podľa platného štandardu.",usi:"Uši podľa platného štandardu.",
    krk:"Krk podľa platného štandardu.",telo:"Telo podľa platného štandardu.",chvost:"Chvost podľa platného štandardu.",predne_koncatiny:"Predné končatiny podľa štandardu.",zadne_koncatiny:"Zadné končatiny podľa štandardu.",pohyb:"Pohyb podľa platného štandardu.",
    koza:"Koža podľa platného štandardu.",srst:"Srsť podľa platného štandardu.",farba:"Farba podľa platného štandardu.",
    vyska_pes_cm:"50–60 cm",vyska_suka_cm:"48–58 cm",hmotnost_pes_kg:"20–30 kg",hmotnost_suka_kg:"18–28 kg",velkost_hmotnost_poznamka:"Rozmery sa posudzujú v celkových proporciách.",
    chyby:"Odchýlky od štandardu.",zavazne_chyby:"Výrazné odchýlky od štandardu.",diskvalifikacne_chyby:"Diskvalifikačné odchýlky podľa štandardu.",
    fci_nomenklatura_url:`https://www.fci.be/breed/${number}`,fci_standard_pdf:`https://www.fci.be/standard/${number}.pdf`,
    zdroj_poznamka:"Oficiálne údaje FCI.",slug,import_key:`plemena:fci-${String(number).padStart(4,"0")}`,status:"published",
  };
}

function readyBreeds() {
  const named=[
    [122,"Labradorský retriever","LABRADOR RETRIEVER",8,"labradorsky-retriever","1","Retrievery"],
    [5,"Anglický kokeršpaniel","ENGLISH COCKER SPANIEL",8,"anglicky-kokerspaniel","2","Sliediče"],
    [37,"Portugalský vodný pes","PORTUGUESE WATER DOG",8,"portugalsky-vodny-pes","3","Vodné psy"],
    [312,"Nova Scotia Duck Tolling Retriever","NOVA SCOTIA DUCK TOLLING RETRIEVER",8,"nova-scotia-duck-tolling-retriever","1","Retrievers"],
    [166,"Nemecký ovčiak","GERMAN SHEPHERD DOG",1,"nemecky-ovciak","1","Ovčiarske psy"],
    [297,"Border kólia","BORDER COLLIE",1,"border-kolia","1","Ovčiarske psy"],
    [147,"Rotvajler","ROTTWEILER",2,"rotvajler","2.1","Molosoidné plemená – mastifový typ"],
    [101,"Francúzsky buldoček","FRENCH BULLDOG",9,"francuzsky-buldocek","11","Malé molosoidné psy"],
    [279,"Čiernohorský horský durič","MONTENEGRIN MOUNTAIN HOUND",6,"ciernohorsky-horsky-duric","1.2","Stredne veľké duriče"],
    [171,"Ardenský bouvier","BOUVIER DES ARDENNES",1,"ardensky-bouvier","2","Pastierske psy"],
    [998,"Plemeno bez názvu sekcie","SECTION NAMELESS BREED",2,"plemeno-bez-nazvu-sekcie","2.1",""],
  ];
  const used=new Set(named.map((item)=>item[0]));const rows=named.map(([number,name,official,group,slug,sectionNumber,sectionName])=>fciRecord({number,name,official,group,slug,sectionNumber,sectionName}));
  const toller=rows.find((breed)=>breed.fci_cislo===312);Object.assign(toller,{fci_skupina_nazov:"Retrievers, Flushing Dogs, Water Dogs",datum_platneho_standardu:"1987-06-24",vyuzitie:"Retriever na lákanie a prinášanie vodného vtáctva",vyska_pes_cm:"48–51",vyska_suka_cm:"45–48",hmotnost_pes_kg:"20–23",hmotnost_suka_kg:"17–20",telo:LONG_FCI_TEXT,poznamka_chov:"Psy musia mať dva zjavne normálne semenníky úplne zostúpené v miešku.",zdroj_poznamka:"Iba FCI nomenklatúra a oficiálny FCI štandard; interná poznámka."});
  let candidate=1000;let syntheticIndex=11;
  while(rows.length<344){while(used.has(candidate))candidate+=1;const index=syntheticIndex;const group=((index-1)%10)+1;const groupEightSection=group===8?String(((index-1)%3)+1):"1";const groupEightName=groupEightSection==="1"?"Retrievery":groupEightSection==="2"?"Sliediče":"Vodné psy";rows.push(fciRecord({number:candidate,name:`Testovacie plemeno ${index}`,official:`TEST BREED ${index}`,group,slug:`testovacie-plemeno-${index}`,sectionNumber:groupEightSection,sectionName:group===8?groupEightName:"Testovacia sekcia"}));used.add(candidate);candidate+=1;syntheticIndex+=1;}
  const noSource=rows.find((breed)=>breed.fci_cislo===279);delete noSource.fci_nomenklatura_url;delete noSource.fci_standard_pdf;delete noSource.zdroj_poznamka;for(const key of ["hlava_lebecna_cast","hlava_tvarova_cast","oci","usi"])delete noSource[key];
  return rows;
}

function seedEditorialLabrador(sqlite) {
  const now="2026-08-20T10:00:00.000Z";
  sqlite.prepare(`INSERT INTO managed_breeds (
    slug,name,status,image_url,image_key,gallery_json,fci_group,fci_section,origin,group_name,size,weight,height,lifespan,coat,
    energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,intro,character,needs,history,exercise,
    training,health,health_risks_json,good_for_json,consider_json,sources_json,accent,seo_json,created_at,updated_at,published_at,created_by,updated_by
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "labradorsky-retriever","Labradorský retriever","published","/images/hero-labrador.webp",null,"[]",8,"Retrievery","Veľká Británia","Retrievery",
    "stredne veľký až veľký","25–36 kg","54–57 cm","10–13 rokov","krátka",5,5,5,5,5,3,2,5,4,
    "Pôvodný redakčný úvod.","Pôvodná redakčná povaha.","Pôvodné potreby.","Pôvodná história.","Pôvodný pohyb.","Pôvodný výcvik.","Pôvodné zdravie.",
    '["DBK"]','["aktívne rodiny"]','["sklon k priberaniu"]','[]',"forest",'{"title":"Ručné SEO"}',now,now,now,"editor@psipedia.sk","editor@psipedia.sk",
  );
}

async function api(worker,d1,path,body) {
  const headers={"content-type":"application/json","oai-authenticated-user-email":"admin@psipedia.sk"};
  return worker.fetch(new Request(`http://localhost${path}`,{method:"POST",headers,body:JSON.stringify(body)}),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

async function get(worker,d1,path) {
  try{return await worker.fetch(new Request(`http://localhost${path}`),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});}catch(error){throw new Error(`${path}: ${error instanceof Error?error.message:String(error)}`,{cause:error});}
}

test("FCI section helpers preserve exact subsection values and dependent state",()=>{
  const breeds=[
    {fciGroup:8,fciSectionNumber:"1",fciSection:"Retrievery"},
    {fciGroup:8,fciSectionNumber:"2",fciSection:"Sliediče"},
    {fciGroup:8,fciSectionNumber:"3",fciSection:"Vodné psy"},
    {fciGroup:2,fciSectionNumber:"2.1",fciSection:"Molosoidné plemená – mastifový typ"},
    {fciGroup:2,fciSectionNumber:"2.1",fciSection:""},
  ];
  assert.deepEqual(listFciSectionOptions(breeds,"8").map((section)=>section.number),["1","2","3"]);
  assert.deepEqual(listFciSectionOptions(breeds,"2"),[{number:"2.1",name:"Molosoidné plemená – mastifový typ",count:2}]);
  assert.equal(validFciSectionForGroup(breeds,"2","2.1"),"2.1");
  assert.equal(validFciSectionForGroup(breeds,"2","3"),"");
  assert.equal(validFciSectionForGroup(breeds,"8","2.1"),"");
  assert.equal(breedAtlasHref({query:"labrador",fciGroup:"8",fciSection:"1",origin:"Veľká Británia",energy:"active"}),"/plemena?q=labrador&fciGroup=8&fciSection=1&origin=Ve%C4%BEk%C3%A1+Brit%C3%A1nia&energy=active");
  assert.equal(breedAtlasHref({query:"",fciGroup:"2",fciSection:"2.1",origin:"",energy:"all"}),"/plemena?fciGroup=2&fciSection=2.1");
  assert.equal(breedAtlasHref({query:"",fciGroup:"",fciSection:"2.1",origin:"",energy:"all"}),"/plemena");
  assert.equal(publicFciSectionName(8,"1","Retrievers"),"Retrievery");
  assert.equal(publicFciSectionName(2,"9.9","Bezpečný pôvodný názov"),"Bezpečný pôvodný názov");
  assert.equal(fciMeasurement("48–51","cm"),"48–51 cm");
  assert.equal(fciMeasurement("20–23 kg","kg"),"20–23 kg");
  assert.equal(combinedFciMeasurement(["48–51","45–48"],"cm"),"45–51 cm");
  assert.equal(combinedFciMeasurement(["20–23","17–20"],"kg"),"17–23 kg");
  assert.equal(publicFciDate("1987-06-24"),"24. 6. 1987");
});

test("344-record FCI import previews, imports and remains idempotent without erasing editorial data",async()=>{
  const {sqlite,d1}=database();seedEditorialLabrador(sqlite);const breeds=readyBreeds();
  const runtimeEnv=(globalThis.__CLOUDFLARE_WORKERS_ENV__??={});Object.assign(runtimeEnv,{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk"});
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("fci-import",String(Date.now()));const {default:worker}=await import(workerUrl.href);

  const previewResponse=await api(worker,d1,"/api/admin/import",{breeds,preview:true});assert.equal(previewResponse.status,200);const preview=(await previewResponse.json()).preview;
  assert.deepEqual({total:preview.total,created:preview.created,updated:preview.updated,errors:preview.errors.length},{total:344,created:343,updated:1,errors:0});

  const importResponse=await api(worker,d1,"/api/admin/import",{breeds});assert.equal(importResponse.status,200);const result=(await importResponse.json()).imported.breeds;
  assert.deepEqual({created:result.created,updated:result.updated,skipped:result.skipped,published:result.published},{created:343,updated:1,skipped:0,published:344});
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT fci_number) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT import_key) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT slug) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds WHERE status='published'").get().count,344);
  for(let group=1;group<=10;group+=1)assert.ok(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds WHERE fci_group=?").get(group).count>0,`FCI group ${group}`);

  const homepage=await get(worker,d1,"/");assert.equal(homepage.status,200);assert.match(await homepage.text(),/Plemeno dňa/);

  const labrador=sqlite.prepare("SELECT * FROM managed_breeds WHERE fci_number=122").get();
  assert.equal(labrador.slug,"labradorsky-retriever");assert.equal(labrador.image_url,"/images/hero-labrador.webp");assert.equal(labrador.intro,"Pôvodný redakčný úvod.");
  assert.equal(labrador.character,"Pôvodná redakčná povaha.");assert.equal(labrador.energy,5);assert.equal(labrador.seo_json,'{"title":"Ručné SEO"}');assert.equal(labrador.editorial_complete,1);
  assert.equal(JSON.parse(labrador.fci_standard_json).historicky_suhrn,"História plemena Labradorský retriever.");assert.equal(JSON.parse(labrador.fci_standard_json).status_fci,"detailne overene");

  const changed=breeds.map((breed)=>breed.fci_cislo===122?{...breed,slug:"slug-sa-nesmie-zmenit",nazov_sk:"Labradorský retriever FCI"}:breed);
  const repeatResponse=await api(worker,d1,"/api/admin/import",{breeds:changed});assert.equal(repeatResponse.status,200);const repeat=(await repeatResponse.json()).imported.breeds;
  assert.equal(repeat.created,0);assert.equal(repeat.updated,344);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT slug FROM managed_breeds WHERE fci_number=122").get().slug,"labradorsky-retriever");

  const detail=await get(worker,d1,"/plemena/labradorsky-retriever");assert.equal(detail.status,200);const detailHtml=await detail.text();
  const fciDetailHtml=detailHtml.slice(detailHtml.indexOf('<section class="breed-fci-standard'),detailHtml.indexOf('<div class="breed-detail-footer'));
  assert.match(detailHtml,/FCI štandard/);assert.match(detailHtml,/História plemena Labradorský retriever/);assert.match(detailHtml,/Oficiálny PDF štandard/);assert.doesNotMatch(detailHtml,/Poznámka k chovu/);
  assert.doesNotMatch(fciDetailHtml,/breed-fci-accordion/);assert.doesNotMatch(fciDetailHtml,/aria-expanded=/);assert.doesNotMatch(fciDetailHtml,/aria-controls=/);assert.doesNotMatch(fciDetailHtml,/<button/);
  assert.match(detailHtml,/href="#povaha"/);assert.match(detailHtml,/href="#zdravie"/);assert.match(detailHtml,/href="#fci-standard"/);
  assert.match(detailHtml,/id="fci-historia"/);assert.match(detailHtml,/id="fci-povaha"/);assert.match(detailHtml,/id="fci-hlava"/);assert.match(detailHtml,/Lebečná časť podľa štandardu/);assert.match(detailHtml,/Tvárová časť podľa štandardu/);
  assert.match(detailHtml,/href="#fci-historia"/);assert.match(detailHtml,/href="#fci-vzhlad"/);assert.match(detailHtml,/href="#fci-hlava"/);assert.match(detailHtml,/href="#fci-rozmery"/);assert.match(detailHtml,/href="#fci-chyby"/);
  assert.match(detailHtml,/<table class="breed-fci-dimensions">/);assert.match(detailHtml,/<th scope="col">Pes<\/th>/);assert.match(detailHtml,/<th scope="col">Suka<\/th>/);assert.match(detailHtml,/50–60 cm/);assert.match(detailHtml,/48–58 cm/);assert.match(detailHtml,/20–30 kg/);assert.match(detailHtml,/18–28 kg/);
  assert.ok(detailHtml.indexOf('id="povaha"') < detailHtml.indexOf('id="fci-standard"'));assert.ok(detailHtml.indexOf('id="fci-srst"') < detailHtml.indexOf('id="fci-chyby"'));assert.ok(detailHtml.indexOf("Závažné chyby") < detailHtml.indexOf("Diskvalifikačné chyby"));
  assert.match(detailHtml,/href="\/plemena\?fciGroup=8"/);assert.match(detailHtml,/href="\/plemena\?fciGroup=8&amp;fciSection=1"/);
  const tollerDetail=await get(worker,d1,"/plemena/nova-scotia-duck-tolling-retriever");assert.equal(tollerDetail.status,200);const tollerHtml=await tollerDetail.text();const tollerFci=tollerHtml.slice(tollerHtml.indexOf('<section class="breed-fci-standard'),tollerHtml.indexOf('<div class="breed-detail-footer'));
  assert.match(tollerHtml,/Nova Scotia Duck Tolling Retriever/);assert.match(tollerHtml,/NOVA SCOTIA DUCK TOLLING RETRIEVER/);assert.match(tollerHtml,/Retrievery, sliediče a vodné psy/);assert.doesNotMatch(tollerHtml,/Retrievers, Flushing Dogs, Water Dogs/);assert.match(tollerHtml,/Sekcia[\s\S]{0,120}Retrievery/);
  assert.match(tollerHtml,/class="breed-detail-card breed-detail-card--placeholder"/);assert.match(tollerHtml,/class="breed-fci-header"/);assert.match(tollerHtml,/class="breed-fci-path-current"/);assert.match(tollerHtml,/role="img" aria-label="Fotografia plemena Nova Scotia Duck Tolling Retriever sa pripravuje"/);
  assert.match(tollerHtml,/45–51 cm/);assert.match(tollerHtml,/17–23 kg/);assert.match(tollerFci,/<th scope="col">Parameter<\/th><th scope="col">Pes<\/th><th scope="col">Suka<\/th>/);assert.match(tollerFci,/48–51 cm/);assert.match(tollerFci,/45–48 cm/);assert.match(tollerFci,/20–23 kg/);assert.match(tollerFci,/17–20 kg/);
  assert.ok(LONG_FCI_TEXT.length>500);assert.match(tollerFci,/Úplný koniec odborného textu\./);assert.doesNotMatch(tollerFci,/line-clamp|text-overflow|breed-fci-accordion/);
  assert.equal((tollerFci.match(/<h3>Chyby<\/h3>/g)??[]).length,1);assert.doesNotMatch(tollerFci,/<h4>Chyby<\/h4>/);assert.match(tollerFci,/<h4>Závažné chyby<\/h4>/);assert.match(tollerFci,/<h4>Diskvalifikačné chyby<\/h4>/);
  assert.match(tollerFci,/Chovná poznámka/);assert.doesNotMatch(tollerFci,/Iba FCI nomenklatúra/);assert.match(tollerFci,/Údaje vychádzajú z nomenklatúry a oficiálneho štandardu Fédération Cynologique Internationale \(FCI\)\./);assert.match(tollerFci,/24\. 6\. 1987/);assert.doesNotMatch(tollerFci,/1987-06-24/);assert.match(tollerFci,/FCI nomenklatúra/);assert.match(tollerFci,/Oficiálny PDF štandard/);
  assert.match(tollerHtml,/href="\/plemena\?fciGroup=8"/);assert.match(tollerHtml,/href="\/plemena\?fciGroup=8&amp;fciSection=1"/);
  const fciOnly=await get(worker,d1,"/plemena/ciernohorsky-horsky-duric");assert.equal(fciOnly.status,200);const fciOnlyHtml=await fciOnly.text();
  assert.match(fciOnlyHtml,/Čiernohorský horský durič/);assert.match(fciOnlyHtml,/Fotografia sa pripravuje/);assert.match(fciOnlyHtml,/href="#fci-standard"/);
  assert.match(fciOnlyHtml,/História plemena Čiernohorský horský durič/);assert.doesNotMatch(fciOnlyHtml,/href="#povaha"/);assert.doesNotMatch(fciOnlyHtml,/Rýchly profil/);assert.doesNotMatch(fciOnlyHtml,/href="#fci-hlava"/);assert.doesNotMatch(fciOnlyHtml,/id="fci-hlava"/);assert.doesNotMatch(fciOnlyHtml,/FCI nomenklatúra/);assert.doesNotMatch(fciOnlyHtml,/FCI PDF štandard/);
  const ardennes=await get(worker,d1,"/plemena/ardensky-bouvier");assert.equal(ardennes.status,200);const ardennesHtml=await ardennes.text();assert.match(ardennesHtml,/Ardenský bouvier/);assert.match(ardennesHtml,/breed-detail-card--placeholder/);assert.match(ardennesHtml,/Fotografia sa pripravuje/);assert.match(ardennesHtml,/breed-fci-open-content/);
  for(const slug of ["nemecky-ovciak","border-kolia","rotvajler","testovacie-plemeno-11"]){const response=await get(worker,d1,`/plemena/${slug}`);assert.equal(response.status,200,slug);assert.match(await response.text(),/FCI štandard/,slug);}
  const rottweiler=await get(worker,d1,"/plemena/rotvajler");const rottweilerHtml=await rottweiler.text();assert.match(rottweilerHtml,/Sekcia[\s\S]{0,20}2\.1/);assert.match(rottweilerHtml,/Molosoidné plemená – mastifový typ/);assert.match(rottweilerHtml,/href="\/plemena\?fciGroup=2"/);assert.match(rottweilerHtml,/href="\/plemena\?fciGroup=2&amp;fciSection=2\.1"/);
  const namelessSection=await get(worker,d1,"/plemena/plemeno-bez-nazvu-sekcie");assert.equal(namelessSection.status,200);assert.match(await namelessSection.text(),/Sekcia[\s\S]{0,20}2\.1/);
  const search=await get(worker,d1,"/hladat?q=german%20shepherd%20dog");assert.equal(search.status,200);assert.match(await search.text(),/Nemecký ovčiak/);
  const accentSearch=await get(worker,d1,"/hladat?q=labradorsky%20retriever");assert.match(await accentSearch.text(),/Labradorský retriever/);
  const atlas=await get(worker,d1,"/plemena");const atlasHtml=await atlas.text();assert.match(atlasHtml,/Všetky krajiny pôvodu/);assert.match(atlasHtml,/<strong>10<\/strong>[^<]*<!-- -->Chrty/);assert.match(atlasHtml,/Zobraziť ďalšie plemená/);assert.match(atlasHtml,/Fotografia sa pripravuje/);
  assert.match(atlasHtml,/Najprv vyberte FCI skupinu/);assert.match(atlasHtml,/disabled=""/);
  const groupEight=await get(worker,d1,"/plemena?fciGroup=8&fciSection=1&q=labrador");const groupEightHtml=await groupEight.text();const groupEightSelect=groupEightHtml.match(/<label class="fci-section-filter">[\s\S]*?<\/label>/)?.[0]??"";const groupEightList=groupEightHtml.match(/<div class="fci-group-list">[\s\S]*?<div class="breed-atlas-footer">/)?.[0]??"";assert.match(groupEightSelect,/Sekcia[\s\S]{0,80}Retrievery/);assert.match(groupEightSelect,/Sekcia[\s\S]{0,80}Sliediče/);assert.match(groupEightSelect,/Sekcia[\s\S]{0,80}Vodné psy/);assert.doesNotMatch(groupEightSelect,/2\.1/);assert.match(groupEightList,/Labradorský retriever/);assert.doesNotMatch(groupEightList,/Anglický kokeršpaniel/);
  const subsection=await get(worker,d1,"/plemena?fciGroup=2&fciSection=2.1");const subsectionHtml=await subsection.text();const subsectionSelect=subsectionHtml.match(/<label class="fci-section-filter">[\s\S]*?<\/label>/)?.[0]??"";const subsectionList=subsectionHtml.match(/<div class="fci-group-list">[\s\S]*?<div class="breed-atlas-footer">/)?.[0]??"";assert.match(subsectionSelect,/value="2\.1" selected=""/);assert.match(subsectionList,/Rotvajler/);assert.doesNotMatch(subsectionList,/Labradorský retriever/);
  const fciOnlyCard=atlasHtml.match(/<article class="breed-card[^>]*>[\s\S]*?testovacie-plemeno-11[\s\S]*?<\/article>/)?.[0]??"";assert.ok(fciOnlyCard);assert.doesNotMatch(fciOnlyCard,/breed-ratings/);
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");assert.match(css,/\.fci-section-filter select\s*\{[\s\S]*?width:\s*100%/);assert.match(css,/@media \(max-width: 620px\)[\s\S]*?\.breed-fci-path,[\s\S]*?flex-direction:\s*column/);assert.match(css,/\.breed-fci-dimensions\s*\{[\s\S]*?table-layout:\s*fixed/);assert.match(css,/@media \(max-width: 620px\)[\s\S]*?\.breed-fci-anchor-nav > div\s*\{[\s\S]*?overflow-x:\s*auto/);assert.match(css,/Editorial breed profile/);assert.match(css,/\.breed-detail-card\s*\{[\s\S]*?grid-template-columns:[\s\S]*?minmax\(300px,/);assert.match(css,/\.breed-detail-card h1\s*\{[\s\S]*?text-wrap:\s*balance/);assert.match(css,/\.breed-detail-card--placeholder \.breed-detail-image\s*\{[\s\S]*?max-height:\s*390px/);assert.match(css,/\.breed-fci-open-section\s*\{[\s\S]*?grid-template-columns:\s*minmax\(190px, 245px\) minmax\(0, 1fr\)/);assert.match(css,/@media \(max-width: 620px\)[\s\S]*?\.breed-fci-standard\s*\{[\s\S]*?width:\s*calc\(100% - 24px\)/);const fciReadingCss=css.slice(css.lastIndexOf(".breed-fci-open-content"));assert.doesNotMatch(fciReadingCss,/-webkit-line-clamp|text-overflow/);
  const detailSource=readFileSync(new URL("../app/plemena/[slug]/page.tsx",import.meta.url),"utf8");assert.doesNotMatch(detailSource,/BreedFciAccordion|aria-expanded|aria-controls/);
  const sitemap=await get(worker,d1,"/sitemap.xml");assert.equal(sitemap.status,200);const sitemapText=await sitemap.text();assert.match(sitemapText,/\/plemena\/labradorsky-retriever/);assert.equal((sitemapText.match(/<loc>https:\/\/psipedia\.sk\/plemena\/[^<]+/g)??[]).length,344);
});

test("FCI preview rejects missing numbers, invalid groups and duplicate identities without writing",async()=>{
  const {sqlite,d1}=database();const runtimeEnv=(globalThis.__CLOUDFLARE_WORKERS_ENV__??={});Object.assign(runtimeEnv,{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk"});
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("fci-invalid",String(Date.now()));const {default:worker}=await import(workerUrl.href);
  const good=fciRecord({number:122,name:"Labradorský retriever",official:"LABRADOR RETRIEVER",group:8,slug:"labradorsky-retriever"});
  const unauthorized=await worker.fetch(new Request("http://localhost/api/admin/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({breeds:[good],preview:true})}),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});assert.equal(unauthorized.status,401);
  for(const breeds of [[{...good,fci_cislo:""}],[{...good,fci_skupina:11}],[good,{...good,nazov_sk:"Duplikát"}]]){
    const response=await api(worker,d1,"/api/admin/import",{breeds,preview:true});assert.equal(response.status,200);const preview=(await response.json()).preview;assert.ok(preview.errors.length>0);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,0);
  }
});
