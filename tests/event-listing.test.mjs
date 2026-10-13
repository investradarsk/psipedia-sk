import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parseEventListing, eventListingSql, eventTypeSelectionRedirect, eventListingParams, eventSearchSql, normalizeEventSearch } from '../lib/event-listing.ts';
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE managed_events(id INTEGER PRIMARY KEY,title TEXT,excerpt TEXT,event_type TEXT,venue TEXT,address TEXT,city TEXT,region TEXT,organizer TEXT,status TEXT,start_date TEXT,end_date TEXT,start_time TEXT,cancelled INTEGER)`);
const insert = database.prepare(`INSERT INTO managed_events VALUES (?,?,'','Výstava','Výstavisko','','Žilina','Žilinský kraj','Klub','published','2026-10-10','2026-10-12','09:00',0)`);
for (let id = 1; id <= 301; id++)
    insert.run(id, `ŽILINSKÁ výstava ${id}`);
function read(raw, type = 'Všetky') { const f = parseEventListing(raw, type); const q = eventListingSql(f, '2026-10-11'); return { f, q, total: database.prepare(`SELECT COUNT(*) AS total FROM managed_events WHERE ${q.where}`).get(...q.values).total, ids: database.prepare(`SELECT id FROM managed_events WHERE ${q.where} ORDER BY ${q.order} LIMIT 12 OFFSET ?`).all(...q.values, (f.page - 1) * 12).map(row => row.id) }; }
test('complete count exceeds 250, stable pages retain all rows and accent-insensitive matching', () => { const first = read({ q: 'zilinska', mesto: 'zilina', termin: 'vsetky' }); assert.equal(first.total, 301); assert.deepEqual(first.ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); const last = read({ q: 'zilinska', strana: '26', termin: 'vsetky' }); assert.equal(last.total, 301); assert.deepEqual(last.ids, [301]); assert.deepEqual(read({ zoradenie: 'najnovsie', termin: 'vsetky' }).ids, [301, 300, 299, 298, 297, 296, 295, 294, 293, 292, 291, 290]); });
test('inclusive overlapping ranges, month intersections, location and type combine', () => { for (const raw of [{ od: '2026-10-11' }, { do: '2026-10-11' }, { od: '2026-10-11', do: '2026-10-11' }])
    assert.equal(read({ ...raw, termin: 'vsetky' }).total, 301); assert.equal(read({ od: '2026-10-13', termin: 'vsetky' }).total, 0); assert.equal(read({ mesiac: '2026-11', od: '2026-10-10', do: '2026-10-12', termin: 'vsetky' }).total, 0); assert.equal(read({ region: 'Nitriansky kraj', termin: 'vsetky' }).total, 0); assert.equal(read({ termin: 'vsetky' }, 'Preteky').total, 0); });
test('invalid dates and pages are safe; conflicting range gives feedback and no results', () => { for (const value of ['bad', '2026-02-31', '2026-13-01', '2026-00-00'])
    assert.equal(parseEventListing({ od: value }).from, ''); assert.equal(parseEventListing({ strana: '-2', region: 'bad', mesiac: 'bad' }).page, 1); const conflict = read({ od: '2026-10-12', do: '2026-10-10', termin: 'vsetky' }); assert.ok(conflict.f.error); assert.equal(conflict.total, 0); assert.equal(read({ q: "' OR 1=1 --", termin: 'vsetky' }).total, 0); });
test('canonical type submission preserves filters and resets pagination', () => { const url = new URL(eventTypeSelectionRedirect({ typ: 'Preteky', q: 'pes', od: '2026-10-11', mesto: 'Žilina', strana: '3' }), 'https://psipedia.sk'); assert.equal(url.pathname, '/podujatia/preteky'); assert.equal(url.searchParams.get('q'), 'pes'); assert.equal(url.searchParams.get('mesto'), 'Žilina'); assert.equal(url.searchParams.has('typ'), false); assert.equal(url.searchParams.has('strana'), false); assert.equal(eventListingParams(parseEventListing({ q: 'pes', strana: '2', od: '2026-10-11' })).has('strana'), false); });
test('D1 search normalization preserves foreign accents, combining marks, case and empty-field boundaries', () => {
    for (const value of ['ŽILINSKÁ', 'Crème brûlée ÖÜ Ñ Ā Ǎ', 'Z\u030cilina', 'ΕΛΛΆΔΑ Москва', '한글']) {
        const row = database.prepare(`SELECT ${eventSearchSql('?')} AS normalized`).get(value, value, value);
        assert.equal(row.normalized, normalizeEventSearch(value));
    }
    assert.equal(read({ q: 'Výstavisko Žilina', termin: 'vsetky' }).total, 301);
});
test('default order respects current/upcoming/cancelled ranks and newest completed dates', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(database.prepare("SELECT sql FROM sqlite_master WHERE name='managed_events'").get().sql);
  const insert = db.prepare("INSERT INTO managed_events(id,status,start_date,end_date,start_time,cancelled) VALUES (?,'published',?,?, '09:00',?)");
  for (const row of [[1,'2026-10-10','2026-10-12',0],[2,'2026-10-13',null,0],[3,'2026-10-10','2026-10-12',1],[4,'2026-10-13',null,1],[5,'2026-10-01','2026-10-02',0],[6,'2026-09-01',null,0],[7,'2026-10-05',null,1]]) insert.run(...row);
  const query = raw => {const sql = eventListingSql(parseEventListing(raw),'2026-10-11');return db.prepare(`SELECT id FROM managed_events WHERE ${sql.where} ORDER BY ${sql.order}`).all(...sql.values).map(row=>row.id);};
  assert.deepEqual(query({termin:'vsetky'}),[1,2,3,4,5,6,7]);
  assert.deepEqual(query({termin:'ukoncene'}),[5,6,7]);
  assert.deepEqual(query({termin:'prebiehajuce'}),[1,3]);
  db.close();
});
test('actual public D1 reads clamp pages and count all 601 events independently for the calendar', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-11T12:00:00Z') });
  const {env} = await import('cloudflare:workers');
  const db = new DatabaseSync(':memory:');
  db.exec(database.prepare("SELECT sql FROM sqlite_master WHERE name='managed_events'").get().sql);
  const insert = db.prepare("INSERT INTO managed_events VALUES (?,?,'','Výstava','Výstavisko','','Žilina','Žilinský kraj','Klub','published','2026-10-10','2026-10-12','09:00',0)");
  for (let id=1;id<=601;id++) insert.run(id,`ŽILINSKÁ výstava ${id}`);
  const previous = env.DB;
  env.DB = {prepare(sql) {const statement=db.prepare(sql);return {bind(...params){return {first:async()=>statement.get(...params),all:async()=>({results:statement.all(...params)})};}};}};
  try {
    const {getPublishedEventListing,getPublicEventCalendar} = await import('../lib/event-store.ts');
    // Pagination must not depend on whether the wall clock is before or after the fixture end date.
    // Default current/past ordering is covered separately with an explicit date above.
    const filters = parseEventListing({q:'zilinska',termin:'vsetky',zoradenie:'najblizsie',strana:'9999999'});
    for (const now of ['2026-10-11T12:00:00Z', '2026-10-13T12:00:00Z', '2027-01-01T12:00:00Z']) {
    t.mock.timers.setTime(Date.parse(now));
    const listing = await getPublishedEventListing(filters);
    assert.equal(listing.total,601);assert.equal(listing.page,51);assert.equal(listing.pages,51);assert.deepEqual(listing.events.map(event=>event.id),[601]);
    const calendar = await getPublicEventCalendar(filters,'2026-10','2026-10-11');
    assert.deepEqual(calendar.summaries.map(summary=>summary.count),[601,601,601]);assert.equal(calendar.events.length,12);assert.deepEqual(calendar.summaries[0].types,['Výstava']);
    }
  } finally {env.DB=previous;db.close();}
});
test('combined search stays below the D1 SQL statement size limit', () => {
  const filters = parseEventListing({q:'pes',mesto:'zilina',region:'Žilinský kraj',mesiac:'2026-10',od:'2026-10-01',do:'2026-10-31'},'Výstava');
  const sql = eventListingSql(filters,'2026-10-11');
  assert.ok(Buffer.byteLength(sql.where + sql.order) < 99000);
});
