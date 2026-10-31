import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  ADMIN_EVENT_PAGE_SIZE,
  adminEventGlobalCountsSql,
  adminEventYearsSql,
  buildAdminEventPageSql,
  parseAdminEventListQuery,
} from "../lib/admin-event-pagination.ts";

const today = "2026-10-19";
function query(params = {}) {
  return parseAdminEventListQuery(new URLSearchParams(params));
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, event_type TEXT, status TEXT, start_date TEXT, start_time TEXT, end_date TEXT, end_time TEXT, city TEXT, venue TEXT, region TEXT, organizer TEXT, cancelled INTEGER, image_url TEXT, created_at TEXT, updated_at TEXT)");
  const insert = db.prepare("INSERT INTO managed_events (id, slug, title, event_type, status, start_date, start_time, end_date, city, venue, region, organizer, cancelled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let id = 1; id <= 650; id++) insert.run(
    id, "test-" + id, "Podujatie " + id, "Výstava",
    id % 5 ? "draft" : "published", id % 3 ? "2026-11-03" : "2026-09-02",
    "08:30", null, "Nitra", "Výstavný areál", "Nitriansky kraj", "Klub", 0,
    "2026-08-01", "2026-10-01",
  );
  insert.run(651, "specialne-651", "Čierny retriever 100%", "Tréning", "published",
    "2026-10-18", "09:00", "2026-10-20", "Žilina", "Šťastný areál",
    "Žilinský kraj", "Únia psov", 0, "2026-10-10", "2026-10-19");
  insert.run(652, "zrusene-652", "Zrušené podujatie", "Preteky", "draft",
    "2026-10-22", "09:00", null, "Košice", "Dvor", "Košický kraj", "Organizátor", 1,
    "2026-10-11", "2026-10-19");
  return db;
}
function list(db, input) {
  const sql = buildAdminEventPageSql(input, today);
  const total = db.prepare("SELECT COUNT(*) AS total FROM managed_events WHERE " + sql.where).get(...sql.values).total;
  const pages = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, pages);
  const rows = db.prepare("SELECT id FROM managed_events WHERE " + sql.where + " ORDER BY " + sql.order + " LIMIT ? OFFSET ?")
    .all(...sql.values, ...sql.orderValues, input.pageSize, (page - 1) * input.pageSize);
  return { rows: rows.map((row) => row.id), total, page, pages };
}

test("650+ records are genuinely paged in SQLite, not sliced in the browser", () => {
  const db = fixture();
  const first = list(db, query());
  assert.equal(first.rows.length, ADMIN_EVENT_PAGE_SIZE);
  assert.equal(first.total, 652);
  assert.equal(first.pages, 14);
  const last = list(db, query({ page: "14" }));
  assert.equal(last.rows.length, 2);
  assert.equal(last.total, 652);
  const beyond = list(db, query({ page: "1000000" }));
  assert.deepEqual(beyond, last);
  assert.equal(list(db, query({ page: "-1" })).page, 1);
  assert.equal(query({ pageSize: "999999" }).pageSize, 100);
  assert.equal(query({ pageSize: "0" }).pageSize, 1);
  db.close();
});

test("search scans all records with accent folding, multiple words and literal wildcards", () => {
  const db = fixture();
  for (const phrase of ["cierny", "retriever", "zilina", "stastny", "unia", "trening", "zilinsky", "specialne-651", "cierny zilina", "100%"]) {
    assert.deepEqual(list(db, query({ query: phrase })).rows, [651], phrase);
  }
  assert.deepEqual(list(db, query({ query: "neexistujuci vyraz" })).rows, []);
  assert.deepEqual(list(db, query({ query: "' OR 1=1 --" })).rows, []);
  db.close();
});

test("combined filters, statuses, year, month, sort and cancellation retain semantics", () => {
  const db = fixture();
  assert.deepEqual(list(db, query({ time: "current", status: "published", type: "Tréning", region: "Žilinský kraj", month: "10", year: "2026" })).rows, [651]);
  assert.deepEqual(list(db, query({ time: "cancelled", status: "draft", type: "Preteky" })).rows, [652]);
  assert.equal(list(db, query({ time: "past" })).total, 216);
  assert.equal(list(db, query({ time: "upcoming" })).total, 434);
  assert.equal(list(db, query({ time: "all", status: "draft" })).total, 521);
  for (const sort of ["date", "updated", "created", "title"]) {
    const result = list(db, query({ sort }));
    assert.equal(new Set(result.rows).size, result.rows.length, sort);
    assert.deepEqual(result, list(db, query({ sort })), sort);
  }
  const raw = parseAdminEventListQuery(new URLSearchParams({ status: "bad", sort: "random", time: "invalid", year: "2026' OR 1=1" }));
  assert.equal(raw.filters.status, "all");
  assert.equal(raw.filters.sort, "date");
  assert.equal(raw.filters.time, "all");
  assert.equal(raw.filters.year, "");
  db.close();
});

test("global counters and year facets are independent of the selected page/search", () => {
  const db = fixture();
  const counts = db.prepare(adminEventGlobalCountsSql).get(today, today, today, today);
  assert.deepEqual({ ...counts }, {
    all_count: 652, upcoming: 434, current: 1, past: 216,
    published: 131, draft: 521, cancelled: 1,
  });
  assert.deepEqual(db.prepare(adminEventYearsSql).all().map((row) => row.year), ["2026"]);
  assert.equal(list(db, query({ query: "cierny" })).total, 1);
  assert.equal(db.prepare(adminEventGlobalCountsSql).get(today, today, today, today).all_count, 652);
  db.close();
});

test("admin API and SSR page use the bounded loader; review and edits stay scoped", () => {
  const route = readFileSync(new URL("../app/api/admin/events/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/admin/podujatia/page.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../components/admin-event-dashboard.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/event-store.ts", import.meta.url), "utf8");
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /listManagedEventPage\(query\)/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /listReviewedAdminEntityIds\("EVENT", result.events.map/);
  assert.match(page, /listManagedEventPage/);
  assert.match(page, /initialPage=/);
  assert.match(store, /LIMIT \? OFFSET \?/);
  assert.doesNotMatch(dashboard, /filterAdminEvents\(/);
  assert.match(dashboard, /fetchAdminEventPage\(effectiveFilters, page, signal\)/);
  assert.match(dashboard, /selectionPayload\(targets\)/);
  assert.match(dashboard, /\/api\/admin\/events\/bulk/);
  assert.match(dashboard, /\/admin\/podujatia\/\$\{event.id\}/);
  assert.match(dashboard, /setReviewedIds\(eventQuery.data.reviewedIds\)/);
  assert.match(dashboard, /setReviewedIds\(fresh.data.reviewedIds\)/);
});


test("unfiltered event total reuses exact global all_count for any page and sort", () => {
  const db = fixture();
  try {
    const global = db.prepare(adminEventGlobalCountsSql).get(today,today,today,today);
    for (const params of [{},{page:"3"},{page:"14"},{sort:"title"},{sort:"created"},{sort:"updated"}]) {
      const input=query(params);
      const sql=buildAdminEventPageSql(input,today);
      assert.equal(sql.where,"1=1",JSON.stringify(params));
      const independent=db.prepare("SELECT COUNT(*) AS total FROM managed_events WHERE "+sql.where).get(...sql.values);
      assert.equal(independent.total,global.all_count,JSON.stringify(params));
      assert.equal(list(db,input).total,global.all_count);
    }
    assert.equal(global.all_count,652);
  } finally {db.close();}
});

test("event filters still use exact selected totals rather than the global count", () => {
  const db=fixture();
  try {
    for (const params of [{query:"cierny"},{time:"past"},{region:"Žilinský kraj"},
      {status:"published"},{year:"2026"},{month:"10"},{time:"cancelled"},
      {type:"Preteky"},{query:"neexistuje"}]) {
      const input=query(params);
      const sql=buildAdminEventPageSql(input,today);
      assert.notEqual(sql.where,"1=1",JSON.stringify(params));
      const independent=db.prepare("SELECT COUNT(*) AS total FROM managed_events WHERE "+sql.where).get(...sql.values).total;
      assert.equal(list(db,input).total,independent,JSON.stringify(params));
    }
    assert.equal(list(db,query({query:"cierny"})).total,1);
  } finally {db.close();}
});

test("events admin SQL avoids a duplicate unfiltered COUNT but preserves all other reads", () => {
  const source=readFileSync(new URL("../lib/event-store.ts",import.meta.url),"utf8");
  const method=source.slice(source.indexOf("export async function listManagedEventPage("),source.indexOf("export async function getManagedEventById("));
  assert.match(method,/const reuseGlobalCount = sql\.where === "1=1"/);
  assert.match(method,/reuseGlobalCount\s*\?\s*Promise\.resolve\(null\)\s*:\s*database\.prepare/);
  assert.match(method,/const total = reuseGlobalCount \? Number\(globals\?\.all_count \?\? 0\) : Number\(match\?\.total \?\? 0\)/);
  assert.match(method,/adminEventGlobalCountsSql/);
  assert.match(method,/adminEventYearsSql/);
  assert.match(method,/page === requestedPage/i);
  assert.doesNotMatch(method,/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/i);
});
