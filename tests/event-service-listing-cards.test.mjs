import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const repoFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("events and services render the same shared listing-row component and styling", async () => {
  const [card, directory, results, css, eventCss] = await Promise.all([
    repoFile("components/event-card.tsx"),
    repoFile("components/directory-card.tsx"),
    repoFile("components/event-listing-results.tsx"),
    repoFile("components/directory-public.module.css"),
    repoFile("components/events-public.module.css"),
  ]);
  assert.match(card, /<PublicListingRowCard/);
  assert.match(card, /kind="event"/);
  assert.match(directory, /<PublicListingRowCard/);
  assert.match(directory, /kind="directory"/);
  assert.match(results, /directoryStyles\.listRows/);
  assert.match(css, /\.listRows:global\(\[data-event-list\]\)/);
  assert.match(css, /\.listRows \.cardWithImage/);
  assert.match(results, /groupedByType && \(index === 0/);
  assert.match(eventCss, /\.eventTypeGroupHeading/);
});

test("unfiltered upcoming events use five-per-type groups, but filtering and date sort opt out", async () => {
  const [listing, store] = await Promise.all([
    repoFile("lib/event-listing.ts"),
    repoFile("lib/event-store.ts"),
  ]);
  assert.match(listing, /f\.type === 'Všetky' && f\.time === 'upcoming' && !f\.sort/);
  assert.match(listing, /!f\.query && !f\.region && !f\.month && !f\.from && !f\.to && !f\.city/);
  assert.match(store, /ROW_NUMBER\(\) OVER \(PARTITION BY event_type ORDER BY \$\{sql\.order\}\)/);
  assert.match(store, /CAST\(\(type_position - 1\) \/ 5 AS INTEGER\)/);
  assert.match(store, /sql\.groupByType/);
  assert.match(store, /LIMIT \? OFFSET \?/);
});

test("SQL batches five of each event type across page boundaries without loss or duplicates", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY, event_type TEXT, start_date TEXT, start_time TEXT)");
    const insert = db.prepare("INSERT INTO events VALUES (?, ?, ?, ?)");
    const types = ["Preteky", "Seminár", "Tréning", "Výstava", "Stretnutie", "Iné"];
    for (let category = 0; category < types.length; category += 1) {
      for (let day = 0; day < 8; day += 1) {
        insert.run(category * 100 + day, types[category], `2026-11-${String(day + 5).padStart(2, "0")}`, "10:00");
      }
    }
    const statement = db.prepare(`
      WITH matching AS (
        SELECT id, event_type,
          ROW_NUMBER() OVER (PARTITION BY event_type ORDER BY start_date ASC, start_time ASC, id ASC)
            AS type_position
        FROM events
      )
      SELECT id, event_type FROM matching
      ORDER BY CAST((type_position - 1) / 5 AS INTEGER),
        CASE event_type
          WHEN 'Preteky' THEN 0 WHEN 'Seminár' THEN 1 WHEN 'Tréning' THEN 2
          WHEN 'Výstava' THEN 3 WHEN 'Stretnutie' THEN 4 ELSE 5
        END,
        type_position
      LIMIT ? OFFSET ?`);
    const pages = Array.from({ length: 4 }, (_, index) => statement.all(12, index * 12));
    const all = pages.flat();
    assert.equal(all.length, 48);
    assert.equal(new Set(all.map((event) => event.id)).size, 48);
    assert.deepEqual(pages[0].slice(0, 5).map((event) => event.event_type), Array(5).fill("Preteky"));
    assert.deepEqual(pages[0].slice(5, 10).map((event) => event.event_type), Array(5).fill("Seminár"));
    assert.deepEqual(pages[0].slice(10).map((event) => event.event_type), Array(2).fill("Tréning"));
    assert.deepEqual(pages[1].slice(0, 3).map((event) => event.event_type), Array(3).fill("Tréning"));
  } finally {
    db.close();
  }
});
