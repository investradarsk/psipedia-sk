import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { publicEventCalendarSummarySql } from "../lib/event-calendar-summary-sql.ts";
import { eventListingSql, parseEventListing } from "../lib/event-listing.ts";

const oldCalendarSql = (where) => `WITH RECURSIVE days(day) AS (
  SELECT ? UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < ?
)
SELECT days.day AS date, event_type AS type, COUNT(*) AS count
FROM days JOIN managed_events
  ON start_date <= days.day AND COALESCE(NULLIF(end_date,''),start_date) >= days.day
WHERE ${where}
GROUP BY days.day,event_type`;

function calendarBounds(month) {
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`];
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE managed_events (
    id INTEGER PRIMARY KEY, slug TEXT, title TEXT, excerpt TEXT,
    status TEXT, event_type TEXT, start_date TEXT, end_date TEXT,
    city TEXT, venue TEXT, address TEXT, region TEXT, organizer TEXT,
    start_time TEXT, cancelled INTEGER DEFAULT 0
  );
  CREATE INDEX managed_events_public_date_idx ON managed_events(status,start_date);`);
  const add = db.prepare(`INSERT INTO managed_events (
    id,slug,title,excerpt,status,event_type,start_date,end_date,
    city,venue,address,region,organizer,start_time,cancelled
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rows = [
    [1,"early","Žilinská výstava","", "published","Výstava","2026-09-28","2026-10-03","Žilina","Výstavisko","","Žilinský kraj","Klub","09:00",0],
    [2,"single","Žilinská výstava","", "published","Výstava","2026-10-08",null,"Žilina","Hala","","Žilinský kraj","Klub","09:00",0],
    [3,"empty","Preteky","","published","Preteky","2026-10-10","","Nitra","Štadión","","Nitriansky kraj","Klub","10:00",0],
    [4,"overlap","Športové podujatie","","published","Preteky","2026-10-25","2026-11-04","Nitra","","","Nitriansky kraj","Klub","12:00",1],
    [5,"draft","Interné podujatie","","draft","Výstava","2026-10-09","2026-10-10","Žilina","","","Žilinský kraj","Klub","09:00",0],
    [6,"allmonth","Žilinská výstava","","published","Výstava","2026-01-01","2026-12-31","Žilina","","","Žilinský kraj","Klub","09:00",0],
    [7,"outside","Vianočná výstava","","published","Výstava","2026-12-11",null,"Bratislava","","","Bratislavský kraj","Klub","09:00",0],
    [8,"feb","Februárová výstava","","published","Výstava","2028-02-28","2028-03-01","Žilina","","","Žilinský kraj","Klub","09:00",0],
    [9,"nullend","Zimné preteky","","published","Preteky","2028-02-29",null,"Nitra","","","Nitriansky kraj","Klub","09:00",0],
  ];
  for(const row of rows) add.run(...row);
  return db;
}

const scenarios = [
  ["2026-10", {termin:"vsetky"}],
  ["2026-10", {termin:"vsetky",region:"Žilinský kraj"}],
  ["2026-10", {termin:"vsetky"}, "Výstava"],
  ["2026-10", {termin:"vsetky",od:"2026-10-09",do:"2026-10-27"}],
  ["2026-10", {termin:"vsetky",mesiac:"2026-10"}],
  ["2026-10", {termin:"vsetky",mesiac:"2026-11"}],
  ["2026-10", {termin:"vsetky",mesto:"zilina"}],
  ["2026-10", {termin:"vsetky",q:"zilinska"}],
  ["2026-10", {termin:"vsetky",od:"2026-11-10",do:"2026-10-01"}],
  ["2026-10", {termin:"ukoncene"}],
  ["2026-10", {termin:"prebiehajuce"}],
  ["2028-02", {termin:"vsetky"}],
  ["2026-09", {termin:"vsetky"}],
  ["2026-11", {termin:"vsetky"}],
];

test("materialized month rollup agrees with original per-day join across filters, leap years and event ranges", () => {
  const db = fixture();
  try {
    for (const [month, raw, type = "Všetky"] of scenarios) {
      const filters = parseEventListing(raw, type);
      const listing = eventListingSql(filters, "2026-10-15");
      const [start, end] = calendarBounds(month);
      const oldRows = db.prepare(oldCalendarSql(listing.where)).all(start,end,...listing.values);
      const newRows = db.prepare(publicEventCalendarSummarySql(listing.where))
        .all(start,end,...listing.values,end,start);
      assert.deepEqual(newRows,oldRows,`month=${month}, filters=${JSON.stringify(raw)}`);
    }
  } finally {db.close();}
});

test("month-scoped query reads managed_events only once using an index and materialized CTE", () => {
  const db = fixture();
  try {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${publicEventCalendarSummarySql("status = 'published'")}`)
      .all("2026-10-01","2026-10-31","2026-10-31","2026-10-01")
      .map(row => String(row.detail));
    assert.ok(plan.some(text => text.includes("MATERIALIZE matching_events")),plan.join("\n"));
    assert.equal(plan.filter(text => /\b(?:SCAN|SEARCH) managed_events\b/.test(text)).length,1,plan.join("\n"));
    assert.ok(plan.some(text => /SEARCH managed_events USING INDEX managed_events_public_date_idx/.test(text)),plan.join("\n"));
    assert.ok(!plan.some(text => /CORRELATED SCALAR SUBQUERY/.test(text)),plan.join("\n"));
  } finally {db.close();}
});

test("calendar query keeps placeholders for all date bounds and no write operations", () => {
  const sql = publicEventCalendarSummarySql("status = 'published' AND region = ?");
  assert.equal((sql.match(/\?/g) ?? []).length,5);
  assert.match(sql,/COALESCE\(NULLIF\(end_date, ''\), start_date\)/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
});
