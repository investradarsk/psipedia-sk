// Isolated local E2E schema and fixtures only; never connects to remote D1.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== '1' || process.env.NODE_ENV === 'production') throw new Error('Explicit local test bootstrap required.');
const directory = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = readdirSync(directory).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (files.length !== 1) throw new Error('Expected one isolated local D1 file.');
const database = new DatabaseSync(resolve(directory, files[0]));
try {
  const statements = readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort().flatMap(name => readFileSync('drizzle/'+name,'utf8').split(';').map(sql=>sql.replace(/^\s*(?:(?:--[^\r\n]*)(?:\r?\n|$)\s*)+/,'').trim()).filter(Boolean));
  // Reuse existing schema declarations, excluding all migration data writes.
  for (const sql of statements) if (/^CREATE TABLE\b/i.test(sql)) database.exec(sql.replace(/^CREATE TABLE(?! IF NOT EXISTS)/i,'CREATE TABLE IF NOT EXISTS'));
  for (const sql of statements) if (/^ALTER TABLE\b[\s\S]*\bADD\b/i.test(sql)) {
    try { database.exec(sql); } catch (error) { if (!String(error).includes('duplicate column name')) throw error; }
  }
  database.exec("INSERT OR IGNORE INTO portal_section_settings(slug,label,eyebrow,description,intro,visible,updated_at,updated_by) VALUES ('podujatia','Podujatia','Kalendár','Kalendár','Kalendár',1,'2026-10-11','final-audit-local-ci')");
  for (const name of ['events-calendar-redesign','events-listing-redesign']) {
    const marker = name === 'events-calendar-redesign' ? 'calendar-phase2-local-ci' : 'listing-phase3-local-ci';
    database.prepare('DELETE FROM managed_events WHERE created_by = ?').run(marker);
    database.exec(readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  }
  database.exec("DELETE FROM managed_events WHERE created_by='final-audit-local-ci' AND slug LIKE 'final-audit-%'");
  const insert=database.prepare(`INSERT INTO managed_events(slug,title,excerpt,event_type,status,start_date,end_date,city,region,venue,organizer,description,practical_info,cancelled,image_url,image_display,created_at,updated_at,published_at,created_by,updated_by) VALUES (?,?,?,?, 'published',?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)`);
  const types=['Výstava','Preteky','Seminár','Tréning','Stretnutie','Iné'];
  for(let i=0;i<20;i++) insert.run('final-audit-'+i,'Finalaudit '+(i===5?'Mimoriadne dlhý názov kynologického stretnutia pre majiteľov psov a celé rodiny počas jesenného víkendu na Slovensku':types[i%6]+' '+i),'Lokálna kontrola verejného podujatia.',types[i%6],i===18?'2026-10-01':'2026-10-11',i===0?'2026-10-16':null,i===7?'':'Žilina',i===7?'Online':'Žilinský kraj',i===8?'':'Klubové cvičisko','Psí klub','Spoločné aktivity pre psy a ich majiteľov.','Prineste si očkovací preukaz a vodu.',i===19?1:0,i<4?(i===1?'/__e2e/portrait.svg':i===2?'/__e2e/light.svg':'/images/hero-labrador.webp'):null,i===0?'cover':i===3?'contain':'auto','2026-10-01','2026-10-01','2026-10-01','final-audit-local-ci','final-audit-local-ci');
  console.log('LOCAL FIXTURES ONLY: 601 listing, 8 calendar and 20 final acceptance events.');
} finally { database.close(); }
