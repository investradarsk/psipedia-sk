import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { breedAtlasHref, listFciSectionOptions, validFciSectionForGroup } from "../lib/breed-atlas.ts";
import { combinedFciMeasurement, fciMeasurement, inspectBreedMeasurement, publicBreedMeasurement, publicFciDate, publicFciSectionName } from "../lib/breed-fci.ts";

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
  applyMigration(sqlite,"../drizzle/0023_big_shinko_yamashiro.sql");
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
    [161,"Bígl","BEAGLE",6,"bigl","1.3","Malé duriče"],
    [57,"Maďarský krátkosrstý stavač (vyžla)","HUNGARIAN SHORT-HAIRED POINTER (VIZSLA)",7,"madarsky-kratkosrsty-stavac-vyzla","1.1","Kontinentálne stavače"],
    [37,"Portugalský vodný pes","PORTUGUESE WATER DOG",8,"portugalsky-vodny-pes","3","Vodné psy"],
    [312,"Nova Scotia Duck Tolling Retriever","NOVA SCOTIA DUCK TOLLING RETRIEVER",8,"nova-scotia-duck-tolling-retriever","1","Retrievers"],
    [166,"Nemecký ovčiak","GERMAN SHEPHERD DOG",1,"nemecky-ovciak","1","Sheepdogs"],
    [297,"Border kólia","BORDER COLLIE",1,"border-kolia","1","Ovčiarske psy"],
    [147,"Rotvajler","ROTTWEILER",2,"rotvajler","2.1","Molosoidné plemená – mastifový typ"],
    [101,"Francúzsky buldoček","FRENCH BULLDOG",9,"francuzsky-buldocek","11","Malé molosoidné psy"],
    [279,"Čiernohorský horský durič","MONTENEGRIN MOUNTAIN HOUND",6,"ciernohorsky-horsky-duric","1.2","Stredne veľké duriče"],
    [171,"Ardenský bouvier","BOUVIER DES ARDENNES",1,"ardensky-bouvier","2","Pastierske psy"],
    [998,"Plemeno bez názvu sekcie","SECTION NAMELESS BREED",2,"plemeno-bez-nazvu-sekcie","2.1",""],
  ];
  const used=new Set(named.map((item)=>item[0]));
  const rows=named.map(([number,name,official,group,slug,sectionNumber,sectionName])=>fciRecord({number,name,official,group,slug,sectionNumber,sectionName}));
  const toller=rows.find((breed)=>breed.fci_cislo===312);
  Object.assign(toller,{fci_skupina_nazov:"Retrievers, Flushing Dogs, Water Dogs",datum_platneho_standardu:"1987-06-24",vyuzitie:"Retriever na lákanie a prinášanie vodného vtáctva",vyska_pes_cm:"48–51",vyska_suka_cm:"45–48",hmotnost_pes_kg:"20–23",hmotnost_suka_kg:"17–20",telo:LONG_FCI_TEXT,poznamka_chov:"Psy musia mať dva zjavne normálne semenníky úplne zostúpené v miešku.",zdroj_poznamka:"Iba FCI nomenklatúra a oficiálny FCI štandard; interná poznámka."});
  let candidate=1000;let syntheticIndex=11;
  while(rows.length<344){
    while(used.has(candidate))candidate+=1;
    const index=syntheticIndex;const group=((index-1)%10)+1;const groupEightSection=group===8?String(((index-1)%3)+1):"1";const groupEightName=groupEightSection==="1"?"Retrievery":groupEightSection==="2"?"Sliediče":"Vodné psy";
    rows.push(fciRecord({number:candidate,name:`Testovacie plemeno ${index}`,official:`TEST BREED ${index}`,group,slug:`testovacie-plemeno-${index}`,sectionNumber:groupEightSection,sectionName:group===8?groupEightName:"Testovacia sekcia"}));
    used.add(candidate);candidate+=1;syntheticIndex+=1;
  }
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

function duplicateBreedAsLegacy(sqlite, sourceFciNumber, legacySlug) {
  const row=sqlite.prepare("SELECT * FROM managed_breeds WHERE fci_number=?").get(sourceFciNumber);assert.ok(row,`Missing canonical FCI ${sourceFciNumber}`);delete row.id;row.slug=legacySlug;row.fci_number=null;row.import_key=null;
  const columns=Object.keys(row);sqlite.prepare(`INSERT INTO managed_breeds (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).run(...columns.map((column)=>row[column]));
}

function breedInputFromRow(row,overrides={}) {
  return {name:row.name,slug:row.slug,status:row.status,image:row.image_url,imageKey:row.image_key,gallery:JSON.parse(row.gallery_json),fciNumber:row.fci_number,fciGroup:row.fci_group,fciSection:row.fci_section,fciSectionNumber:row.fci_section_number,officialFciName:row.official_fci_name,validStandardDate:row.valid_standard_date,workingTrial:row.working_trial,importKey:row.import_key,fciStandard:JSON.parse(row.fci_standard_json),editorialComplete:Boolean(row.editorial_complete),origin:row.origin,group:row.group_name,size:row.size,weight:row.weight,height:row.height,lifespan:row.lifespan,coat:row.coat,energy:row.energy,trainability:row.trainability,children:row.children,otherDogs:row.other_dogs,apartment:row.apartment,grooming:row.grooming,shedding:row.shedding,preyDrive:row.prey_drive,intro:row.intro,character:row.character,needs:row.needs,history:row.history,exercise:row.exercise,training:row.training,health:row.health,healthRisks:JSON.parse(row.health_risks_json),goodFor:JSON.parse(row.good_for_json),consider:JSON.parse(row.consider_json),sources:JSON.parse(row.sources_json),accent:row.accent,seo:JSON.parse(row.seo_json),...overrides};
}

async function api(worker,d1,path,body,method="POST") {
  const headers={"content-type":"application/json","oai-authenticated-user-email":"admin@psipedia.sk"};
  return worker.fetch(new Request(`http://localhost${path}`,{method,headers,body:JSON.stringify(body)}),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

async function get(worker,d1,path) {
  try{return await worker.fetch(new Request(`http://localhost${path}`),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});}catch(error){throw new Error(`${path}: ${error instanceof Error?error.message:String(error)}`,{cause:error});}
}

test("FCI section helpers preserve exact subsection values and dependent state",()=>{
  const breeds=[
    {fciGroup:8,fciSectionNumber:"1",fciSection:"Retrievery"},{fciGroup:8,fciSectionNumber:"2",fciSection:"Sliediče"},{fciGroup:8,fciSectionNumber:"3",fciSection:"Vodné psy"},{fciGroup:2,fciSectionNumber:"2.1",fciSection:"Molosoidné plemená – mastifový typ"},{fciGroup:2,fciSectionNumber:"2.1",fciSection:""},
  ];
  assert.deepEqual(listFciSectionOptions(breeds,"8").map((section)=>section.number),["1","2","3"]);
  assert.deepEqual(listFciSectionOptions(breeds,"2"),[{number:"2.1",name:"Molosoidné plemená – mastifový typ",count:2}]);
  assert.equal(validFciSectionForGroup(breeds,"2","2.1"),"2.1");assert.equal(validFciSectionForGroup(breeds,"2","3"),"");assert.equal(validFciSectionForGroup(breeds,"8","2.1"),"");
  assert.equal(breedAtlasHref({query:"labrador",fciGroup:"8",fciSection:"1",origin:"Veľká Británia",energy:"active"}),"/plemena?q=labrador&fciGroup=8&fciSection=1&origin=Ve%C4%BEk%C3%A1+Brit%C3%A1nia&energy=active");
  assert.equal(publicFciSectionName(8,"1","Retrievers"),"Retrievery");assert.equal(publicFciSectionName(2,"9.9","Bezpečný pôvodný názov"),"Sekcia sa overuje");
  assert.equal(fciMeasurement("48–51","cm"),"48–51 cm");assert.equal(fciMeasurement("20–23 kg","kg"),"20–23 kg");assert.equal(combinedFciMeasurement(["48–51","45–48"],"cm"),"45–51 cm");assert.equal(combinedFciMeasurement(["20–23","17–20"],"kg"),"17–23 kg");assert.equal(publicFciDate("1987-06-24"),"24. 6. 1987");
  assert.deepEqual(inspectBreedMeasurement("52–62 cm","height"),[]);assert.ok(inspectBreedMeasurement("454","height").some((issue)=>issue.severity==="error"));assert.ok(inspectBreedMeasurement("4544545","weight").some((issue)=>issue.code==="glued-number"));assert.equal(publicBreedMeasurement("454","height","52–62 cm"),"52–62 cm");assert.equal(publicBreedMeasurement("22–35","weight"),"22–35 kg");
});

test("344-record FCI import remains idempotent and production routes preserve editorial and FCI data",async()=>{
  const {sqlite,d1}=database();seedEditorialLabrador(sqlite);const breeds=readyBreeds();
  const runtimeEnv=(globalThis.__CLOUDFLARE_WORKERS_ENV__??={});Object.assign(runtimeEnv,{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk"});
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("fci-import",String(Date.now()));const {default:worker}=await import(workerUrl.href);

  const previewResponse=await api(worker,d1,"/api/admin/import",{breeds,preview:true});assert.equal(previewResponse.status,200);const preview=(await previewResponse.json()).preview;assert.deepEqual({total:preview.total,created:preview.created,updated:preview.updated,errors:preview.errors.length},{total:344,created:343,updated:1,errors:0});
  const importResponse=await api(worker,d1,"/api/admin/import",{breeds});assert.equal(importResponse.status,200);const result=(await importResponse.json()).imported.breeds;assert.deepEqual({created:result.created,updated:result.updated,skipped:result.skipped,published:result.published},{created:343,updated:1,skipped:0,published:344});
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,344);assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT fci_number) count FROM managed_breeds").get().count,344);assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT import_key) count FROM managed_breeds").get().count,344);assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT slug) count FROM managed_breeds").get().count,344);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds WHERE status='published'").get().count,344);
  for(let group=1;group<=10;group+=1)assert.ok(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds WHERE fci_group=?").get(group).count>0,`FCI group ${group}`);

  sqlite.prepare("UPDATE managed_breeds SET height='454',weight='4544545' WHERE fci_number=171").run();applyMigration(sqlite,"../drizzle/0024_breed_data_audit_repairs.sql");assert.deepEqual({...sqlite.prepare("SELECT height,weight,fci_section FROM managed_breeds WHERE fci_number=171").get()},{height:"52–62 cm",weight:"22–35 kg",fci_section:"Pastierske psy okrem švajčiarskych salašníckych psov"});

  const homepage=await get(worker,d1,"/");assert.equal(homepage.status,200);assert.match(await homepage.text(),/Plemeno dňa/);
  sqlite.exec("SAVEPOINT no_breeds; UPDATE managed_breeds SET status='draft'");const emptyHomepage=await get(worker,d1,"/");assert.equal(emptyHomepage.status,200);assert.doesNotMatch(await emptyHomepage.text(),/Plemeno dňa|class="home-breed-day"/);sqlite.exec("ROLLBACK TO no_breeds; RELEASE no_breeds");

  const labrador=sqlite.prepare("SELECT * FROM managed_breeds WHERE fci_number=122").get();assert.equal(labrador.slug,"labradorsky-retriever");assert.equal(labrador.image_url,"/images/hero-labrador.webp");assert.equal(labrador.intro,"Pôvodný redakčný úvod.");assert.equal(labrador.character,"Pôvodná redakčná povaha.");assert.equal(labrador.seo_json,'{"title":"Ručné SEO"}');assert.equal(JSON.parse(labrador.fci_standard_json).historicky_suhrn,"História plemena Labradorský retriever.");

  const changed=breeds.map((breed)=>breed.fci_cislo===122?{...breed,slug:"slug-sa-nesmie-zmenit",nazov_sk:"Labradorský retriever FCI"}:breed);const repeatResponse=await api(worker,d1,"/api/admin/import",{breeds:changed});assert.equal(repeatResponse.status,200);const repeat=(await repeatResponse.json()).imported.breeds;assert.equal(repeat.created,0);assert.equal(repeat.updated,344);assert.equal(sqlite.prepare("SELECT slug FROM managed_breeds WHERE fci_number=122").get().slug,"labradorsky-retriever");

  const enriched={...breeds.find((breed)=>breed.fci_cislo===122),redakcny_profil:{prehlad_plemena:"Praktický prehľad importovaný cez admin.",odporucanie_pohyb:"Denne 90 minút aktivity.",hlavne_vlastnosti:[{nazov:"Pracovitosť",hodnotenie:5},{nazov:"Oddanosť",hodnotenie:5}],sporty:[{kluc:"canicross",nazov:"Canicross",hodnotenie:4,poznamka:"Vhodný pri dobrej kondícii."}]}};const enrichedResponse=await api(worker,d1,"/api/admin/import",{breeds:[enriched]});assert.equal(enrichedResponse.status,200);let importedEditorial=JSON.parse(sqlite.prepare("SELECT editorial_json FROM managed_breeds WHERE fci_number=122").get().editorial_json);assert.equal(importedEditorial.overview,"Praktický prehľad importovaný cez admin.");assert.equal(importedEditorial.exerciseTip,"Denne 90 minút aktivity.");assert.equal(JSON.parse(sqlite.prepare("SELECT sports_json FROM managed_breeds WHERE fci_number=122").get().sports_json)[0].key,"canicross");

  const now="2026-08-30T12:00:00.000Z";const labradorId=sqlite.prepare("SELECT id FROM managed_breeds WHERE fci_number=122").get().id;const rottweilerId=sqlite.prepare("SELECT id FROM managed_breeds WHERE fci_number=147").get().id;
  const articleId=Number(sqlite.prepare(`INSERT INTO managed_articles (slug,title,excerpt,category,portal_section,status,accent,author,intro,takeaway,sections_json,sources_json,reading_minutes,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("suvisiaci-clanok","Súvisiaci článok o labradorovi","Praktický článok pre majiteľov.","Život so psom","clanky","published","forest","Redakcia Psipedia","Úvod","Zhrnutie","[]","[]",5,now,now,now,"editor@psipedia.sk","editor@psipedia.sk").lastInsertRowid);
  const stationId=Number(sqlite.prepare(`INSERT INTO directory_profiles (slug,name,category,status,excerpt,description,services_json,qualifications_json,city,region,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("labrador-domov","Labrador domov","chovatelske-stanice","published","Chovateľská stanica labradorov.","Profil stanice","[]","[]","Bratislava","Bratislavský kraj",now,now,now,"editor@psipedia.sk","editor@psipedia.sk").lastInsertRowid);
  const clubId=Number(sqlite.prepare(`INSERT INTO directory_profiles (slug,name,category,status,excerpt,description,services_json,qualifications_json,city,region,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("retriever-klub","Retriever klub","chovatelske-kluby","published","Klub pre retrievery.","Profil klubu","[]","[]","Bratislava","Bratislavský kraj",now,now,now,"editor@psipedia.sk","editor@psipedia.sk").lastInsertRowid);
  const editedLabrador=breedInputFromRow(sqlite.prepare("SELECT * FROM managed_breeds WHERE id=?").get(labradorId),{editorial:{coatCare:"Redakčná starostlivosť o srsť.",familyLife:"Rodinný život plemena.",otherDogsLife:"Vzťah k iným psom.",curiosities:"Zaujímavosť o plemene.",commonOwnerMistakes:"Častá chyba majiteľov."},sports:[{key:"agility",label:"Agility",rating:4,note:"Vhodné pri správnom vedení."}],relatedBreedIds:[rottweilerId],relatedArticleIds:[articleId],directoryProfileIds:[stationId,clubId]});
  const editResponse=await api(worker,d1,`/api/admin/breeds/${labradorId}`,editedLabrador,"PUT");assert.equal(editResponse.status,200);

  const detail=await get(worker,d1,"/plemena/labradorsky-retriever");assert.equal(detail.status,200);const detailHtml=await detail.text();
  assert.match(detailHtml,/Plemeno v skratke/);assert.match(detailHtml,/O plemene/);assert.match(detailHtml,/Hodí sa pre/);assert.match(detailHtml,/Treba zvážiť/);assert.match(detailHtml,/Redakčná starostlivosť o srsť/);assert.match(detailHtml,/Častá chyba majiteľov/);assert.match(detailHtml,/Agility/);assert.match(detailHtml,/Oficiálne zaradenie FCI/);assert.match(detailHtml,/href="\/plemena\/labradorsky-retriever\/fci-standard"/);assert.doesNotMatch(detailHtml,/História plemena Labradorský retriever\./);
  assert.match(detailHtml,/href="\/plemena\?fciGroup=8"/);assert.match(detailHtml,/href="\/plemena\?fciGroup=8&amp;fciSection=1"/);assert.match(detailHtml,/Súvisiaci článok o labradorovi/);assert.match(detailHtml,/Labrador domov/);assert.match(detailHtml,/Retriever klub/);assert.match(detailHtml,/Podobné plemená/);assert.match(detailHtml,/Rotvajler/);assert.match(detailHtml,/\/adresar\/treneri\?breed=Labradorsk%C3%BD%20retriever/);

  const fciDetail=await get(worker,d1,"/plemena/labradorsky-retriever/fci-standard");assert.equal(fciDetail.status,200);const fciDetailHtml=await fciDetail.text();assert.match(fciDetailHtml,/História plemena Labradorský retriever\./);assert.match(fciDetailHtml,/Lebečná časť podľa štandardu/);assert.match(fciDetailHtml,/Tvárová časť podľa štandardu/);assert.match(fciDetailHtml,/50–60 cm/);assert.match(fciDetailHtml,/48–58 cm/);assert.match(fciDetailHtml,/20–30 kg/);assert.match(fciDetailHtml,/18–28 kg/);assert.match(fciDetailHtml,/FCI nomenklatúra/);assert.match(fciDetailHtml,/Oficiálny FCI štandard \(PDF\)/);assert.match(fciDetailHtml,/data-fci-group="celkovy-vzhlad-a-povaha"/);assert.match(fciDetailHtml,/aria-expanded="true"/);assert.equal((fciDetailHtml.match(/data-fci-group=/g)??[]).length,7);

  const tollerMain=await get(worker,d1,"/plemena/nova-scotia-duck-tolling-retriever");assert.equal(tollerMain.status,200);const tollerMainHtml=await tollerMain.text();assert.match(tollerMainHtml,/Nova Scotia Duck Tolling Retriever/);assert.match(tollerMainHtml,/NOVA SCOTIA DUCK TOLLING RETRIEVER/);assert.match(tollerMainHtml,/45–51 cm/);assert.match(tollerMainHtml,/17–23 kg/);assert.match(tollerMainHtml,/Fotografia sa pripravuje/);
  const tollerFciResponse=await get(worker,d1,"/plemena/nova-scotia-duck-tolling-retriever/fci-standard");assert.equal(tollerFciResponse.status,200);const tollerFci=await tollerFciResponse.text();assert.match(tollerFci,/48–51 cm/);assert.match(tollerFci,/45–48 cm/);assert.match(tollerFci,/20–23 kg/);assert.match(tollerFci,/17–20 kg/);assert.match(tollerFci,/Úplný koniec odborného textu\./);assert.match(tollerFci,/24\. 6\. 1987/);assert.doesNotMatch(tollerFci,/1987-06-24/);assert.match(tollerFci,/Chovateľská poznámka/);

  const fciOnly=await get(worker,d1,"/plemena/ciernohorsky-horsky-duric");assert.equal(fciOnly.status,200);const fciOnlyHtml=await fciOnly.text();assert.match(fciOnlyHtml,/Čiernohorský horský durič/);assert.match(fciOnlyHtml,/Fotografia sa pripravuje/);assert.match(fciOnlyHtml,/href="\/plemena\/ciernohorsky-horsky-duric\/fci-standard"/);assert.doesNotMatch(fciOnlyHtml,/FCI nomenklatúra/);
  const fciOnlyStandard=await get(worker,d1,"/plemena/ciernohorsky-horsky-duric/fci-standard");assert.equal(fciOnlyStandard.status,200);const fciOnlyStandardHtml=await fciOnlyStandard.text();assert.match(fciOnlyStandardHtml,/História plemena Čiernohorský horský durič/);assert.doesNotMatch(fciOnlyStandardHtml,/FCI nomenklatúra/);assert.doesNotMatch(fciOnlyStandardHtml,/Oficiálny FCI štandard \(PDF\)/);

  for(const slug of ["nemecky-ovciak","border-kolia","rotvajler","testovacie-plemeno-11"]){const response=await get(worker,d1,`/plemena/${slug}`);assert.equal(response.status,200,slug);assert.match(await response.text(),/fci-standard/,slug);const fciResponse=await get(worker,d1,`/plemena/${slug}/fci-standard`);assert.equal(fciResponse.status,200,`${slug} FCI`);}

  duplicateBreedAsLegacy(sqlite,5,"anglicky-koker-spaniel");duplicateBreedAsLegacy(sqlite,161,"beagle");duplicateBreedAsLegacy(sqlite,57,"madarska-vyzla");
  const canonicalAtlas=await get(worker,d1,"/plemena");const canonicalAtlasHtml=await canonicalAtlas.text();assert.doesNotMatch(canonicalAtlasHtml,/href="\/plemena\/beagle"/);assert.doesNotMatch(canonicalAtlasHtml,/href="\/plemena\/madarska-vyzla"/);assert.doesNotMatch(canonicalAtlasHtml,/href="\/plemena\/anglicky-koker-spaniel"/);
  const sitemap=await get(worker,d1,"/sitemap.xml");assert.equal(sitemap.status,200);const sitemapText=await sitemap.text();const sitemapUrls=[...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match)=>match[1]);const breedUrls=sitemapUrls.filter((url)=>/^https:\/\/psipedia\.sk\/plemena\/[^/]+$/.test(url)&&url!=="https://psipedia.sk/plemena/vyber-plemena");assert.equal(breedUrls.length,344);assert.ok(!sitemapUrls.some((url)=>url.includes("/fci-standard")));assert.equal(new Set(sitemapUrls).size,sitemapUrls.length);
  for(const [legacySlug,canonicalSlug] of [["anglicky-koker-spaniel","anglicky-kokerspaniel"],["beagle","bigl"],["madarska-vyzla","madarsky-kratkosrsty-stavac-vyzla"]]){const legacy=await get(worker,d1,`/plemena/${legacySlug}`);assert.equal(legacy.status,301);assert.equal(legacy.headers.get("location"),`http://localhost/plemena/${canonicalSlug}`);const canonical=await get(worker,d1,`/plemena/${canonicalSlug}`);assert.equal(canonical.status,200);}

  const detailSource=readFileSync(new URL("../app/plemena/[slug]/page.tsx",import.meta.url),"utf8");const fciSource=readFileSync(new URL("../app/plemena/[slug]/fci-standard/page.tsx",import.meta.url),"utf8");assert.doesNotMatch(detailSource,/preview|breed-profile-next/i);assert.doesNotMatch(fciSource,/preview|breed-profile-next/i);assert.match(fciSource,/index:\s*false/);
});

test("FCI preview rejects missing numbers, invalid groups and duplicate identities without writing",async()=>{
  const {sqlite,d1}=database();const runtimeEnv=(globalThis.__CLOUDFLARE_WORKERS_ENV__??={});Object.assign(runtimeEnv,{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk"});
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("fci-invalid",String(Date.now()));const {default:worker}=await import(workerUrl.href);
  const good=fciRecord({number:122,name:"Labradorský retriever",official:"LABRADOR RETRIEVER",group:8,slug:"labradorsky-retriever"});
  const unauthorized=await worker.fetch(new Request("http://localhost/api/admin/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({breeds:[good],preview:true})}),{DB:d1,ADMIN_EMAILS:"admin@psipedia.sk",ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});assert.equal(unauthorized.status,401);
  for(const breeds of [[{...good,fci_cislo:""}],[{...good,fci_skupina:11}],[{...good,hmotnost_pes_kg:"4544545"}],[{...good,redakcny_profil:{dlzka_zivota:"15–12 rokov"}}],[good,{...good,nazov_sk:"Duplikát"}]]){const response=await api(worker,d1,"/api/admin/import",{breeds,preview:true});assert.equal(response.status,200);const preview=(await response.json()).preview;assert.ok(preview.errors.length>0);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,0);}
});

test("breed encyclopedia relations stay explicit, bounded and editable",()=>{
  const migration=readFileSync(new URL("../drizzle/0023_big_shinko_yamashiro.sql",import.meta.url),"utf8");assert.match(migration,/ADD `editorial_json`/);assert.match(migration,/ADD `sports_json`/);assert.match(migration,/ADD `related_breeds_json`/);assert.match(migration,/CREATE TABLE `breed_article_relations`/);assert.match(migration,/CREATE TABLE `breed_directory_relations`/);assert.match(migration,/source-data-exact/);assert.doesNotMatch(migration,/LIKE|fuzzy/i);
  const store=readFileSync(new URL("../lib/breed-store.ts",import.meta.url),"utf8");const relationQuery=store.slice(store.indexOf("export async function getBreedDetailRelations"),store.indexOf("function clean("));assert.match(relationQuery,/LIMIT 5/);assert.match(relationQuery,/LIMIT 4/);assert.match(relationQuery,/LIMIT 3/);assert.doesNotMatch(relationQuery,/SELECT \*/);assert.match(store,/LIMIT 500/);
  const breedEditor=readFileSync(new URL("../components/admin-breed-editor.tsx",import.meta.url),"utf8");for(const label of ["Srsť a údržba","Život s rodinou a deťmi","Vzťah k iným psom","Zaujímavosti","Časté chyby majiteľov","Športy a aktivity","Súvisiace články","Podobné plemená","Chovateľské stanice a kluby"])assert.match(breedEditor,new RegExp(label));
  const articleEditor=readFileSync(new URL("../components/admin-article-editor.tsx",import.meta.url),"utf8");assert.match(articleEditor,/Prepojenie na plemená/);assert.match(articleEditor,/relatedBreedIds/);
});
