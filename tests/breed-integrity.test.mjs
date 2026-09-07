import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canonicalBreedIdsSql, assertCanonicalIdentities, canonicalBreedRedirect, dayOfYearInBratislava, rotateBreeds } from '../lib/breed-canonical.ts';
import { availableBreedImage, withAvailableBreedImages } from '../lib/breed-image.ts';
import { publicFciSectionName, publicBreedMeasurement, publicBreedSize } from '../lib/breed-fci.ts';
import { getBreedOfTheDay } from '../lib/breed-store.ts';
const runtime=globalThis.__CLOUDFLARE_WORKERS_ENV__;
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,slug TEXT,name TEXT,status TEXT DEFAULT 'published',fci_number INTEGER,import_key TEXT,seo_json TEXT DEFAULT '{}',fci_group INTEGER DEFAULT 8,fci_section TEXT DEFAULT 'Water Dogs',fci_section_number TEXT DEFAULT '3',size TEXT DEFAULT '',energy INTEGER DEFAULT 3,trainability INTEGER DEFAULT 3,intro TEXT DEFAULT 'Profil',image_url TEXT DEFAULT '',editorial_complete INTEGER DEFAULT 0)`);
 const add=(id,slug,fci,image='')=>sqlite.prepare('INSERT INTO managed_breeds(id,slug,name,fci_number,import_key,image_url) VALUES(?,?,?,?,?,?)').run(id,slug,slug,fci,'fci-'+fci,image);
 const prepare=(sql,values=[])=>({bind(...v){return prepare(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)??null;}});
 return {sqlite,add,prepare};
}
test('canonical SQL deduplicates all identities and audit fails on raw conflicts',()=>{
 const db=database();db.add(1,'one',1);db.add(2,'two',2);
 assertCanonicalIdentities(db.sqlite.prepare('SELECT * FROM managed_breeds').all());
 for(const [column,value] of [['fci_number',1],['slug','one'],['import_key','fci-1']]){
   db.sqlite.exec('SAVEPOINT scenario');db.sqlite.prepare(`UPDATE managed_breeds SET ${column}=? WHERE id=2`).run(value);
   assert.throws(()=>assertCanonicalIdentities(db.sqlite.prepare('SELECT * FROM managed_breeds').all()),/duplicate/);
   assert.deepEqual(db.sqlite.prepare(canonicalBreedIdsSql).all().map(row=>row.id),[1]);db.sqlite.exec('ROLLBACK TO scenario; RELEASE scenario');
 }
 db.sqlite.exec(`UPDATE managed_breeds SET seo_json='{"canonicalUrl":"https://psipedia.sk/plemena/missing"}' WHERE id=2`);
 assert.throws(()=>assertCanonicalIdentities(db.sqlite.prepare('SELECT * FROM managed_breeds').all()),/broken-canonical-relation/);
 assert.deepEqual(db.sqlite.prepare(canonicalBreedIdsSql).all().map(row=>row.id),[1]);
 db.sqlite.close();
});
test('legacy canonical relation redirects only to a live valid canonical profile',async()=>{
 const db=database();db.add(1,'one',1);db.add(2,'old-one',1);
 assert.equal(await canonicalBreedRedirect(db,'old-one'),'/plemena/one');
 db.sqlite.exec("UPDATE managed_breeds SET status='draft' WHERE id=1");
 assert.equal(await canonicalBreedRedirect(db,'old-one'),null);db.sqlite.close();
});
test('daily breed survives unchecked editorial flags, missing images, empty DB and DB errors',async()=>{
 const before={...runtime};const db=database();
 try{
   Object.assign(runtime,{DB:db,BUCKET:{async head(key){return key==='valid.webp'?{key}:null;}}});
   db.add(1,'broken',1,'/media/missing.webp');db.add(2,'valid',2,'/media/valid.webp');db.add(3,'empty',3);
   assert.equal((await getBreedOfTheDay(1)).slug,'valid');
   db.sqlite.exec("UPDATE managed_breeds SET status='draft' WHERE id=2");
   const fallback=await getBreedOfTheDay(1);assert.equal(fallback.slug,'broken');assert.equal(fallback.image,'');
   db.sqlite.exec('DELETE FROM managed_breeds');assert.equal(await getBreedOfTheDay(1),null);
   runtime.DB={prepare(){throw new Error('test outage');}};assert.equal(await getBreedOfTheDay(1),null);
 }finally{for(const key of Object.keys(runtime))delete runtime[key];Object.assign(runtime,before);db.sqlite.close();}
});
test('Bratislava midnight, DST and year boundaries preserve daily rotation',()=>{
 assert.equal(dayOfYearInBratislava(new Date('2026-09-06T21:59:59Z')),249);
 assert.equal(dayOfYearInBratislava(new Date('2026-09-06T22:00:00Z')),250);
 assert.equal(dayOfYearInBratislava(new Date('2026-12-31T23:00:00Z')),1);
 assert.equal(dayOfYearInBratislava(new Date('2026-03-29T00:30:00Z')),88);
 assert.equal(dayOfYearInBratislava(new Date('2026-03-29T01:30:00Z')),88);
 assert.deepEqual(rotateBreeds([1,2,3],4),[1,2,3]);assert.deepEqual(rotateBreeds([],250),[]);
});
test('owned images reject missing/non-image files and unsafe remote addresses',async()=>{
 const binding={ASSETS:{async fetch(request){return new Response(null,{status:200,headers:{'content-type':request.url.endsWith('valid.webp')?'image/webp':'text/html'}});}}};
 assert.equal(await availableBreedImage('/images/valid.webp',binding),'/images/valid.webp');
 assert.equal(await availableBreedImage('/images/missing.webp',binding),'');
 assert.equal(await availableBreedImage('http://127.0.0.1/private',binding),'');
 assert.equal(await availableBreedImage('/media/missing.webp',{BUCKET:{async head(){return null;}}}),'');
});
test('section translations and corrupt fallback measurements never leak raw values',()=>{
 for(const [group,section,raw,expected] of [[1,'1','Sheepdogs','Ovčiarske psy'],[1,'2','Cattledogs','Pastierske psy okrem švajčiarskych salašníckych psov'],[8,'1','Retrievers','Retrievery'],[8,'2','Flushing Dogs','Sliediče'],[8,'3','Water Dogs','Vodné psy'],[4,'','','Jazvečíky']])assert.equal(publicFciSectionName(group,section,raw),expected);
 assert.equal(publicFciSectionName(8,'99','Water Dogs'),'Sekcia sa overuje');
 assert.equal(publicBreedMeasurement('454','height','454 cm'),'');assert.equal(publicBreedMeasurement('454','height','52–62 cm'),'52–62 cm');
 assert.equal(publicBreedSize('454545'),'');assert.equal(publicBreedSize('stredne veľký'),'stredne veľký');
});

test('an ineligible older duplicate cannot suppress the valid profile',()=>{
 const db=database();db.add(1,'invalid',1);db.add(2,'valid',1);
 db.sqlite.exec("UPDATE managed_breeds SET fci_group=99 WHERE id=1");
 assert.deepEqual(db.sqlite.prepare(canonicalBreedIdsSql).all().map(row=>row.id),[2]);
 db.sqlite.exec("UPDATE managed_breeds SET seo_json='corrupt' WHERE id=1");
 assert.deepEqual(db.sqlite.prepare(canonicalBreedIdsSql).all().map(row=>row.id),[2]);db.sqlite.close();
});
test('a cross-FCI canonical URL never redirects to an unrelated breed',async()=>{
 const db=database();db.add(1,'one',1);db.add(2,'two',2);
 db.sqlite.exec(`UPDATE managed_breeds SET seo_json='{"canonicalUrl":"/plemena/one"}' WHERE id=2`);
 assert.throws(()=>assertCanonicalIdentities(db.sqlite.prepare('SELECT * FROM managed_breeds').all()),/broken-canonical-relation/);
 assert.equal(await canonicalBreedRedirect(db,'two'),null);db.sqlite.close();
});
test('bulk image verification follows inventory pagination without per-image HEAD calls',async()=>{
 let lists=0;let heads=0;
 const binding={BUCKET:{async head(){heads++;return null;},async list({cursor}){lists++;return cursor?{objects:[{key:'breeds/9.webp'}],truncated:false}:{objects:Array.from({length:8},(_,i)=>({key:`breeds/${i}.webp`})),truncated:true,cursor:'next'};}}};
 const items=Array.from({length:10},(_,i)=>({image:`/media/breeds/${i}.webp`}));
 const result=await withAvailableBreedImages(items,binding);
 assert.equal(lists,2);assert.equal(heads,0);assert.equal(result.filter(row=>row.image).length,9);assert.equal(result[8].image,'');
 await withAvailableBreedImages(items,binding);assert.equal(lists,2);
});

test('deployment audit exits nonzero on duplicate canonical identities and broken links',()=>{
 const folder=mkdtempSync(join(tmpdir(),'breed-audit-'));const file=join(folder,'rows.json');
 const row=(id,slug)=>({id,slug,name:slug,status:'published',fci_number:id,import_key:'fci-'+id,seo_json:'{}',image_url:'',fci_group:8,fci_section_number:'1',fci_section:'Retrievery',height:'',weight:'',lifespan:'',fci_measurements_json:'{}'});
 const check=rows=>{writeFileSync(file,JSON.stringify(rows));return spawnSync(process.execPath,['scripts/audit-breeds.mjs',file,'--strict'],{encoding:'utf8'});};
 try{
   assert.equal(check([row(1,'one'),row(2,'two')]).status,0);
   for(const overrides of [{fci_number:1},{slug:'one'},{import_key:'fci-1'},{seo_json:'{"canonicalUrl":"/plemena/missing"}'}]){
     const result=check([row(1,'one'),{...row(2,'two'),...overrides}]);assert.equal(result.status,1,result.stderr);
   }
 }finally{rmSync(folder,{recursive:true,force:true});}
});
