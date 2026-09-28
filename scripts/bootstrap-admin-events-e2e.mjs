import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== '1' || process.env.NODE_ENV === 'production') throw new Error('Local test bootstrap only.');
const directory = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = readdirSync(directory).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (files.length !== 1) throw new Error('Expected one isolated local D1 file.');
const db = new DatabaseSync(resolve(directory, files[0]));
// Materialize existing empty schema only in the isolated test DB. No migration
// data repairs are executed; the shared layout also needs navigation/settings.
const migrations = readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort();
for (const name of migrations) for (const statement of readFileSync('drizzle/' + name, 'utf8').split('--> statement-breakpoint')) {
  const sql = statement.trim();
  if (/^CREATE TABLE/i.test(sql)) db.exec(sql.replace(/^CREATE TABLE(?! IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS'));
}
for (const name of migrations) for (const statement of readFileSync('drizzle/' + name, 'utf8').split('--> statement-breakpoint')) {
  const sql = statement.trim();
  if (/^ALTER TABLE.* ADD /i.test(sql)) {
    try { db.exec(sql); } catch (error) { if (!String(error).includes('duplicate column name')) throw error; }
  }
}
if (!db.prepare('PRAGMA table_info(managed_events)').all().some(column => column.name === 'seo_json')) db.exec("ALTER TABLE managed_events ADD COLUMN seo_json TEXT NOT NULL DEFAULT '{}'");
const existing = db.prepare('SELECT slug FROM managed_events').all();
if (existing.some(row => !row.slug.startsWith('e2e-admin-event-'))) throw new Error('Refusing to touch non-fixture events.');
db.exec('DELETE FROM managed_events');
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const shift = days => { const result = new Date(date+'T12:00:00Z'); result.setUTCDate(result.getUTCDate()+days); return result.toISOString().slice(0,10); };
const title = ['Klubová výstava retrieverov', 'Agility pohár', 'Seminár poslušnosti', 'Tréningový deň', 'Stretnutie majiteľov psov'];
const types = ['Výstava','Preteky','Seminár','Tréning','Stretnutie'];
const places = [['Nitra','Nitriansky kraj','Výstavný areál'],['Žilina','Žilinský kraj','Športový areál'],['Bratislava','Bratislavský kraj','Klubové cvičisko']];
for(let i=1;i<=175;i++){
 const [city,region,venue]=places[(i-1)%3];
 const row={id:i,slug:`e2e-admin-event-${i}`,title:`${title[(i-1)%5]} ${i}`,excerpt:'Lokálne testovacie podujatie pre kontrolu redakčného pracoviska.',event_type:types[(i-1)%5],status:i<=4?'published':'draft',start_date:shift(i===1?-1:i===5?-4:i%12===0?-i:i),end_date:i===1?shift(1):null,start_time:'',city,venue,region,organizer:'Kynologický klub '+city,description:'Stretnutie pre majiteľov psov.\n\nProgram zahŕňa spoločné aktivity a priestor na otázky.',practical_info:'Parkovanie pri areáli.\nPrineste si očkovací preukaz.',cancelled:i===7?1:0,created_at:'2026-09-12T12:00:00.000Z',updated_at:new Date(Date.UTC(2026,8,12,12,0,i)).toISOString(),created_by:'local-test',updated_by:'local-test',seo_json:'{}'};
 const keys=Object.keys(row);db.prepare(`INSERT INTO managed_events (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
}
console.log('LOCAL FIXTURES ONLY: 175 events, 4 published, 171 drafts');db.close();
