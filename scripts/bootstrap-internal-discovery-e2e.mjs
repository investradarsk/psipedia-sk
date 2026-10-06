#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { existsSync,readdirSync } from "node:fs";
import { resolve } from "node:path";
const DIR=resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const fail=(m)=>{throw new Error(`[internal-discovery-e2e] ${m}`)};
const url=new URL(process.env.E2E_BASE_URL||"http://127.0.0.1:5173");
if(process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP!=="1"||process.env.NODE_ENV==="production"||url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname))fail("Refusing non-local seed.");
if(!existsSync(DIR))fail("Local D1 missing.");
const fs=readdirSync(DIR).filter(n=>n.endsWith(".sqlite")&&n!=="metadata.sqlite"); if(fs.length!==1)fail(`Expected one DB, got ${fs.length}`);
const db=new DatabaseSync(resolve(DIR,fs[0]));
try{
 db.exec("PRAGMA foreign_keys = ON");
 const breed=db.prepare("SELECT id,name,slug FROM managed_breeds WHERE slug='biely-svajciarsky-ovciak' AND status='published' LIMIT 1").get(); if(!breed)fail("Breed missing.");
 const now="2026-10-06T20:30:00.000Z";
 db.exec("DELETE FROM breed_directory_relations WHERE profile_id IN (SELECT id FROM directory_profiles WHERE slug LIKE 'e2e-discovery-station-%'); DELETE FROM directory_profiles WHERE slug LIKE 'e2e-discovery-station-%';");
 const ins=db.prepare("INSERT INTO directory_profiles (slug,name,category,status,excerpt,description,services_json,qualifications_json,city,district,region,address,online,price_note,source_data_json,verified,featured,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
 for(const [slug,name] of [["e2e-discovery-station-a","E2E Discovery Station A"],["e2e-discovery-station-b","E2E Discovery Station B"]])ins.run(slug,name,"chovatelske-stanice","published","E2E breeder fixture.","Local CI fixture.","[]","[]","Nitra","Nitra","Nitriansky kraj","",0,"","{}",0,0,now,now,now,"e2e@psipedia.local","e2e@psipedia.local");
 const ps=db.prepare("SELECT id FROM directory_profiles WHERE slug LIKE 'e2e-discovery-station-%' ORDER BY slug").all(); if(ps.length!==2)fail("Breeder fixtures missing.");
 const rel=db.prepare("INSERT OR REPLACE INTO breed_directory_relations (breed_id,profile_id,relation_type,source,created_at,created_by) VALUES (?,?,?,?,?,?)"); for(const p of ps)rel.run(breed.id,p.id,"BREED","e2e",now,"e2e@psipedia.local");
 db.prepare("DELETE FROM breed_article_relations WHERE article_id IN (SELECT id FROM managed_articles WHERE slug='e2e-discovery-article')").run(); db.prepare("DELETE FROM managed_articles WHERE slug='e2e-discovery-article'").run();
 db.prepare("INSERT INTO managed_articles (slug,title,excerpt,category,portal_section,status,accent,author,intro,takeaway,sections_json,sources_json,blocks_json,reading_minutes,created_at,updated_at,published_at,seo_title,meta_description,canonical_url,noindex,focus_keyword,og_title,og_description,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("e2e-discovery-article","E2E článok s canonical plemenom","Deterministický článok pre E2E.","Výcvik","clanky","published","forest","Redakcia Psipedia","Explicitná relation.","SSR canonical link.","[]","[]","[]",2,now,now,now,"","","",0,"","","","e2e@psipedia.local","e2e@psipedia.local");
 const a=db.prepare("SELECT id FROM managed_articles WHERE slug='e2e-discovery-article'").get(); db.prepare("INSERT OR REPLACE INTO breed_article_relations (breed_id,article_id,created_at,created_by) VALUES (?,?,?,?)").run(breed.id,a.id,now,"e2e@psipedia.local");
 const org=db.prepare("SELECT id,name,slug FROM help_organizations WHERE id=920001 AND status='PUBLISHED'").get(),ad=db.prepare("SELECT id FROM adoption_dogs WHERE slug='e2e-adoption-rex-active'").get(); if(!org||!ad)fail("Org/adoption missing.");
 db.prepare("UPDATE adoption_dogs SET breed_id=?,breed_name=?,organization_id=?,organization_name=?,organization_slug=?,updated_at=? WHERE id=?").run(breed.id,breed.name,org.id,org.name,org.slug,now,ad.id);
 const t=db.prepare("SELECT COUNT(*) count FROM directory_profiles WHERE status='published' AND archived_at IS NULL AND category='treneri' AND city='Nitra' AND district='Nitra' AND region='Nitriansky kraj'").get(); if(Number(t?.count??0)<2)fail("Need >=2 Nitra trainers.");
 console.log("[internal-discovery-e2e] PASS");
}finally{db.close()}
