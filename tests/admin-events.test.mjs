import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { adminEventCounts, defaultEventFilters, filterAdminEvents, validateBulkEvents, bulkEventUpdateSql } from '../lib/admin-events.ts';
import { EventMarkdown } from '../components/event-markdown.tsx';
import { safeEventLink } from '../lib/event-markdown.ts';
const today = '2026-09-12';
const event = (id, overrides = {}) => ({ id, slug: `test-${id}`, title: `Podujatie ${id}`, city: 'Nitra', venue: 'Výstavný areál', organizer: 'Športový klub', region: 'Nitriansky kraj', eventType: 'Výstava', status: id <= 4 ? 'published' : 'draft', startDate: '2026-10-01', endDate: null, startTime: '', endTime: null, cancelled: false, imageUrl: null, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-12T12:00:00.000Z', ...overrides });
const events = Array.from({ length: 175 }, (_, i) => event(i + 1));
const filter = (data, overrides) => filterAdminEvents(data, { ...defaultEventFilters, ...overrides }, today);

test('all summaries SQL returns 650 records; global counts on 175 are independent of page/search', () => {
  const source = readFileSync(new URL('../lib/event-store.ts', import.meta.url), 'utf8');
  const section = source.split('export async function listManagedEventSummaries()')[1].split('export async function getManagedEventById')[0];
  const sql = section.match(/prepare\(`([\s\S]*?)`\)/)[1];
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE managed_events(id INTEGER, slug TEXT, title TEXT, event_type TEXT, status TEXT, start_date TEXT, start_time TEXT, end_date TEXT, end_time TEXT, city TEXT, venue TEXT, region TEXT, organizer TEXT, cancelled INTEGER, image_url TEXT, created_at TEXT, updated_at TEXT)');
  const insert = db.prepare('INSERT INTO managed_events(id) VALUES (?)');
  for (let i = 1; i <= 650; i++) insert.run(i);
  assert.equal(db.prepare(sql).all().length, 650);
  assert.deepEqual(adminEventCounts(events, today), { all:175, published:4, draft:171, upcoming:175, current:0, past:0, cancelled:0 });
  assert.equal(filter(events, { query:'test-175' })[0].id, 175);
  assert.equal(adminEventCounts(events, today).all,175);
  db.close();
});
test('accent-insensitive partial search covers all seven fields', () => {
  const e = event(175, { title:'Čierny retriever', city:'Žilina', venue:'Šťastný areál', organizer:'Únia psov', eventType:'Tréning', region:'Žilinský kraj', slug:'specialny-175' });
  for (const query of ['cierny', 'zilina', 'stastny', 'unia', 'trening', 'zilinsky', 'specialny-17', 'cierny zilina']) assert.equal(filter([e], { query }).length,1,query);
});
test('central dates: multi-day current, upcoming, past, draft+past, cancelled independently of publishing', () => {
  const data = [event(1,{ startDate:'2026-09-11',endDate:'2026-09-13' }),event(5,{startDate:'2026-09-10'}),event(6),event(7,{cancelled:true})];
  assert.deepEqual(filter(data,{ time:'current' }).map(e=>e.id),[1]);
  assert.deepEqual(filter(data,{ time:'past',status:'draft' }).map(e=>e.id),[5]);
  assert.deepEqual(filter(data,{ time:'upcoming' }).map(e=>e.id),[6]);
  assert.deepEqual(filter(data,{ time:'cancelled',status:'draft' }).map(e=>e.id),[7]);
  assert.equal(data[1].status,'draft');
  assert.deepEqual(adminEventCounts(data,today),{all:4,published:1,draft:3,current:1,past:1,upcoming:1,cancelled:1});
});
test('combined region/type/month/year and stable practical sorting',()=>{
  assert.equal(filter(events,{region:'Nitriansky kraj',type:'Výstava',month:'10',year:'2026'}).length,175);
  for(const overrides of [{region:'Žilinský kraj'},{type:'Preteky'},{month:'09'},{year:'2027'}]) assert.equal(filter(events,overrides).length,0);
  const data=[event(1,{startDate:'2026-08-01'}),event(2,{startDate:'2026-09-10'}),event(3,{startDate:today}),event(4,{startDate:'2026-09-15'}),event(5,{startDate:'2026-09-14'})];
  assert.deepEqual(filter(data,{}).map(e=>e.id),[3,5,4,2,1]);
  assert.deepEqual(filter([event(1,{title:'Žaba'}),event(2,{title:'Agility'})],{sort:'title'}).map(e=>e.id),[2,1]);
  assert.deepEqual(filter([event(1),event(2,{updatedAt:'2026-09-13'})],{sort:'updated'}).map(e=>e.id),[2,1]);
  assert.deepEqual(filter([event(1),event(2,{createdAt:'2026-09-13'})],{sort:'created'}).map(e=>e.id),[2,1]);
});
const render = value => renderToStaticMarkup(createElement(EventMarkdown,{value}));
test('supported rich text and old plain text retain paragraphs and line breaks',()=>{
  const html=render('## Program\n\n**Tučné** a *kurzíva*\n\n- Vstup\n- Doklady\n\n1. Príchod\n2. Štart\n\n[Web](https://example.org)');
  for(const tag of ['h3','strong','em','ul','ol','li','a']) assert.match(html,new RegExp('<'+tag+'[ >]'));
  assert.equal(render('Prvý riadok\nDruhý riadok\n\nNový odsek.'),'<div class="event-markdown"><p>Prvý riadok\nDruhý riadok</p><p>Nový odsek.</p></div>');
});
test('raw HTML, encoded HTML and hostile URLs are inert text',()=>{
  const html=render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) [x](data:text/html,payload) [x](//evil.test) &lt;script&gt;');
  assert.doesNotMatch(html,/<script|<img|href=/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/&amp;lt;script/);
  for(const url of ['javascript:foo','data:text/html,x','//evil.test','/\\evil.test','java\nscript:foo','https://x.test\u0000','javascript&#58;foo']) assert.equal(safeEventLink(url),null);
  for(const url of ['https://example.org','http://example.org','mailto:info@example.org','/podujatia','#program']) assert.equal(safeEventLink(url),url);
});
function bulkDb(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY, status TEXT, event_type TEXT, cancelled INTEGER, updated_at TEXT, updated_by TEXT, published_at TEXT, title TEXT, slug TEXT, description TEXT, image_url TEXT, seo_json TEXT, created_at TEXT, created_by TEXT)");
 for(let i=1;i<=3;i++) db.prepare('INSERT INTO managed_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(i,'draft','Výstava',0,'old','editor',null,'Title','slug-'+i,'Untouched','/media/a.webp','{}','created','creator');
 return db;
}
const selectionRow=(id,overrides={})=>({id,status:'draft',eventType:'Výstava',cancelled:false,updatedAt:'old',...overrides});
test('bulk validates count, duplicates, supported fields and same-target state',()=>{
 const selected={events:[selectionRow(1)],field:'status',value:'published',confirmedCount:1};
 assert.equal(validateBulkEvents(selected).events.length,1);
 assert.equal(validateBulkEvents({...selected,field:'eventType',value:'Preteky'}).value,'Preteky');
 assert.equal(validateBulkEvents({...selected,field:'cancelled',value:true}).value,true);
 for(const bad of [
   {...selected,confirmedCount:2},
   {...selected,value:'draft'},
   {...selected,events:[selectionRow(1),selectionRow(1)],confirmedCount:2},
   {...selected,events:[selectionRow(-1)]},
   {...selected,value:'cancelled'},
   {...selected,field:'eventType',value:'Neexistuje'},
   {...selected,field:'cancelled',value:'yes'},
 ]) assert.throws(()=>validateBulkEvents(bad));
});
test('bulk SQL atomically updates only the requested shared field and protects content',()=>{
 const db=bulkDb();const before=db.prepare('select * from managed_events order by id').all();
 const run=(rows,field,value,now='now')=>{
   const statusValue=field==='status'?String(value):'';
   const typeValue=field==='eventType'?String(value):'';
   const cancelledValue=field==='cancelled'&&value===true?1:0;
   return db.prepare(bulkEventUpdateSql).all(JSON.stringify(rows),field,statusValue,field,typeValue,field,cancelledValue,now,'admin',field,statusValue,now,rows.length);
 };
 const selection=[selectionRow(1),selectionRow(2)];
 assert.equal(run([...selection,selectionRow(99)],'status','published').length,0);
 assert.equal(run([{...selection[0],updatedAt:'stale'},selection[1]],'status','published').length,0);
 assert.deepEqual(db.prepare('select * from managed_events order by id').all(),before);
 assert.equal(run(selection,'status','published').length,2);
 let after=db.prepare('select * from managed_events order by id').all();
 for(let i=0;i<2;i++) {
   assert.equal(after[i].status,'published');
   assert.equal(after[i].event_type,before[i].event_type);
   assert.equal(after[i].cancelled,before[i].cancelled);
   assert.equal(after[i].description,before[i].description);
   assert.equal(after[i].image_url,before[i].image_url);
   assert.equal(after[i].seo_json,before[i].seo_json);
 }
 assert.equal(after[0].published_at,'now');
 assert.deepEqual(after[2],before[2]);

 const typeRows=[selectionRow(1,{status:'published',updatedAt:'now'}),selectionRow(2,{status:'published',updatedAt:'now'})];
 assert.equal(run(typeRows,'eventType','Preteky','later').length,2);
 after=db.prepare('select * from managed_events order by id').all();
 assert.equal(after[0].event_type,'Preteky');
 assert.equal(after[0].status,'published');
 assert.equal(after[0].cancelled,0);

 const cancelRows=[selectionRow(1,{status:'published',eventType:'Preteky',updatedAt:'later'}),selectionRow(2,{status:'published',eventType:'Preteky',updatedAt:'later'})];
 assert.equal(run(cancelRows,'cancelled',true,'latest').length,2);
 after=db.prepare('select * from managed_events order by id').all();
 assert.equal(after[0].cancelled,1);
 assert.equal(after[0].event_type,'Preteky');
 assert.equal(after[0].status,'published');
 assert.equal(after[0].published_at,'now');
 db.close();
});
