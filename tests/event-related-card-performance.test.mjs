import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { selectRelatedEvents } from "../lib/events.ts";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("related event route reads only public card columns, preserving complete detail reads", () => {
  const store = read("../lib/event-store.ts");
  const route = read("../app/[section]/[slug]/page.tsx");
  const detail = read("../components/event-detail.tsx");
  const start = store.indexOf("export async function getUpcomingEventCards(");
  const end = store.indexOf("export async function getUpcomingEvents(", start);
  assert.ok(start >= 0 && end > start);
  const cards = store.slice(start, end);
  assert.match(cards, /SELECT id,slug,title,event_type,start_date,start_time,end_date,end_time/);
  assert.match(cards, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT \?/);
  assert.match(cards, /rowToPublicEventCard/);
  assert.doesNotMatch(cards, /SELECT \*|description|practical_info|seo_json|contact|image_key|created_by|updated_by/);
  assert.match(route, /getUpcomingEventCards\(8\)\.then\(\(events\) => selectRelatedEvents\(event, events\)\)/);
  assert.match(detail, /related\?: PublicEventCard\[\]/);
  assert.match(store, /SELECT \* FROM managed_events WHERE slug = \?/);
});

test("related cards keep published/active/cancellation filters, source order and a hard limit", () => {
  const store = read("../lib/event-store.ts");
  const body = store.slice(store.indexOf("export async function getUpcomingEventCards("),
    store.indexOf("export async function getUpcomingEvents("));
  const sql = body.match(/prepare\(`([\s\S]*?)`\)/)?.[1];
  assert.ok(sql);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY,slug TEXT,title TEXT,event_type TEXT,start_date TEXT,start_time TEXT,end_date TEXT,end_time TEXT,venue TEXT,city TEXT,region TEXT,cancelled INTEGER,image_url TEXT,image_display TEXT,thumbnail_display_json TEXT,status TEXT,description TEXT)");
    const insert = sqlite.prepare("INSERT INTO managed_events (id,slug,title,event_type,start_date,start_time,end_date,end_time,venue,city,region,cancelled,image_url,image_display,thumbnail_display_json,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    for (let id = 1; id <= 14; id++) insert.run(id,"e-"+id,"Event "+id,"Výstava","2026-10-24","09:00",null,null,"Club","Nitra","Nitriansky kraj",0,null,null,null,"published","Very long description".repeat(100));
    insert.run(20,"draft","Draft","Výstava","2026-10-24","09:00",null,null,"Club","Nitra","Nitriansky kraj",0,null,null,null,"draft","");
    insert.run(21,"cancelled","Cancelled","Výstava","2026-10-24","09:00",null,null,"Club","Nitra","Nitriansky kraj",1,null,null,null,"published","");
    insert.run(22,"past","Past","Výstava","2026-10-01","09:00",null,null,"Club","Nitra","Nitriansky kraj",0,null,null,null,"published","");
    const rows = sqlite.prepare(sql).all("2026-10-23", 8);
    assert.deepEqual(rows.map(row=>row.id),[1,2,3,4,5,6,7,8]);
    assert.equal(rows[0].description,undefined);
    assert.equal(rows[0].event_type,"Výstava");
    const current={id:1,slug:"e-1",eventType:"Výstava",startDate:"2026-10-24",endDate:null};
    const previews=rows.map(row=>({id:row.id,slug:row.slug,eventType:row.event_type,startDate:row.start_date,endDate:row.end_date,startTime:row.start_time,cancelled:Boolean(row.cancelled)}));
    assert.deepEqual(selectRelatedEvents(current,previews,3,"2026-10-23").map(x=>x.id),[2,3,4]);
  } finally {sqlite.close();}
});
