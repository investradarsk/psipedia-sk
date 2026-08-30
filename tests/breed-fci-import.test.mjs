import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

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

function fciRecord({number,name,official,group,slug}) {
  return {
    status_fci:"detailne overene",nazov_sk:name,nazov_fci:official,fci_cislo:number,krajina_povodu:"Testovacia krajina",
    datum_platneho_standardu:"2026-01-01",vyuzitie:"Pracovný a spoločenský pes",fci_skupina:group,
    fci_skupina_nazov:`Skupina ${group}`,fci_sekcia:"1",fci_sekcia_nazov:"Testovacia sekcia",pracovna_skuska:"Podľa štandardu",
    historicky_suhrn:`História plemena ${name}.`,celkovy_vzhlad:`Celkový vzhľad plemena ${name}.`,povaha_temperament:`Vyrovnaná povaha plemena ${name}.`,
    oci:"Oči podľa platného štandardu.",srst:"Srsť podľa platného štandardu.",farba:"Farba podľa platného štandardu.",
    vyska_pes_cm:"50–60 cm",hmotnost_pes_kg:"20–30 kg",chyby:"Odchýlky od štandardu.",
    fci_nomenklatura_url:`https://www.fci.be/breed/${number}`,fci_standard_pdf:`https://www.fci.be/standard/${number}.pdf`,
    zdroj_poznamka:"Oficiálne údaje FCI.",slug,import_key:`plemena:fci-${String(number).padStart(4,"0")}`,status:"published",
  };
}

function readyBreeds() {
  const named=[
    [122,"Labradorský retriever","LABRADOR RETRIEVER",8,"labradorsky-retriever"],
    [166,"Nemecký ovčiak","GERMAN SHEPHERD DOG",1,"nemecky-ovciak"],
    [297,"Border kólia","BORDER COLLIE",1,"border-kolia"],
    [101,"Francúzsky buldoček","FRENCH BULLDOG",9,"francuzsky-buldocek"],
    [279,"Čiernohorský horský durič","MONTENEGRIN MOUNTAIN HOUND",6,"ciernohorsky-horsky-duric"],
  ];
  const used=new Set(named.map((item)=>item[0]));const rows=named.map(([number,name,official,group,slug])=>fciRecord({number,name,official,group,slug}));
  let candidate=1000;
  while(rows.length<344){while(used.has(candidate))candidate+=1;const index=rows.length+1;rows.push(fciRecord({number:candidate,name:`Testovacie plemeno ${index}`,official:`TEST BREED ${index}`,group:((index-1)%10)+1,slug:`testovacie-plemeno-${index}`}));used.add(candidate);candidate+=1;}
  const noSource=rows.find((breed)=>breed.fci_cislo===279);delete noSource.fci_nomenklatura_url;delete noSource.fci_standard_pdf;delete noSource.zdroj_poznamka;
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

  const labrador=sqlite.prepare("SELECT * FROM managed_breeds WHERE fci_number=122").get();
  assert.equal(labrador.slug,"labradorsky-retriever");assert.equal(labrador.image_url,"/images/hero-labrador.webp");assert.equal(labrador.intro,"Pôvodný redakčný úvod.");
  assert.equal(labrador.character,"Pôvodná redakčná povaha.");assert.equal(labrador.energy,5);assert.equal(labrador.seo_json,'{"title":"Ručné SEO"}');assert.equal(labrador.editorial_complete,1);
  assert.equal(JSON.parse(labrador.fci_standard_json).historicky_suhrn,"História plemena Labradorský retriever.");assert.equal(JSON.parse(labrador.fci_standard_json).status_fci,"detailne overene");

  const changed=breeds.map((breed)=>breed.fci_cislo===122?{...breed,slug:"slug-sa-nesmie-zmenit",nazov_sk:"Labradorský retriever FCI"}:breed);
  const repeatResponse=await api(worker,d1,"/api/admin/import",{breeds:changed});assert.equal(repeatResponse.status,200);const repeat=(await repeatResponse.json()).imported.breeds;
  assert.equal(repeat.created,0);assert.equal(repeat.updated,344);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM managed_breeds").get().count,344);
  assert.equal(sqlite.prepare("SELECT slug FROM managed_breeds WHERE fci_number=122").get().slug,"labradorsky-retriever");

  const detail=await get(worker,d1,"/plemena/labradorsky-retriever");assert.equal(detail.status,200);const detailHtml=await detail.text();
  assert.match(detailHtml,/FCI štandard/);assert.match(detailHtml,/História plemena Labradorský retriever/);assert.match(detailHtml,/FCI PDF štandard/);assert.doesNotMatch(detailHtml,/Poznámka k chovu/);
  assert.match(detailHtml,/aria-expanded="false"/);assert.match(detailHtml,/href="#povaha"/);assert.match(detailHtml,/href="#zdravie"/);assert.match(detailHtml,/href="#fci-standard"/);
  const fciOnly=await get(worker,d1,"/plemena/ciernohorsky-horsky-duric");assert.equal(fciOnly.status,200);const fciOnlyHtml=await fciOnly.text();
  assert.match(fciOnlyHtml,/Čiernohorský horský durič/);assert.match(fciOnlyHtml,/Fotografia sa pripravuje/);assert.match(fciOnlyHtml,/href="#fci-standard"/);
  assert.doesNotMatch(fciOnlyHtml,/href="#povaha"/);assert.doesNotMatch(fciOnlyHtml,/Rýchly profil/);assert.doesNotMatch(fciOnlyHtml,/FCI nomenklatúra/);assert.doesNotMatch(fciOnlyHtml,/FCI PDF štandard/);
  for(const slug of ["nemecky-ovciak","border-kolia","testovacie-plemeno-11"]){const response=await get(worker,d1,`/plemena/${slug}`);assert.equal(response.status,200,slug);assert.match(await response.text(),/FCI štandard/,slug);}
  const search=await get(worker,d1,"/hladat?q=german%20shepherd%20dog");assert.equal(search.status,200);assert.match(await search.text(),/Nemecký ovčiak/);
  const accentSearch=await get(worker,d1,"/hladat?q=labradorsky%20retriever");assert.match(await accentSearch.text(),/Labradorský retriever/);
  const atlas=await get(worker,d1,"/plemena");const atlasHtml=await atlas.text();assert.match(atlasHtml,/Všetky krajiny pôvodu/);assert.match(atlasHtml,/<strong>10<\/strong>[^<]*<!-- -->Chrty/);assert.match(atlasHtml,/Zobraziť ďalšie plemená/);assert.match(atlasHtml,/Fotografia sa pripravuje/);
  const fciOnlyCard=atlasHtml.match(/<article class="breed-card[^>]*>[\s\S]*?testovacie-plemeno-11[\s\S]*?<\/article>/)?.[0]??"";assert.ok(fciOnlyCard);assert.doesNotMatch(fciOnlyCard,/breed-ratings/);
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
