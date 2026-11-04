import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { homepageRotationOffset, homepageRotatingWindow } from "../lib/homepage-rotation.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage recommendations change daily and stay stable during the same Bratislava day", () => {
  const first = homepageRotationOffset("2026-11-04", 8);
  const second = homepageRotationOffset("2026-11-05", 8);
  const items = Array.from({ length: 27 }, (_, id) => id + 1);

  assert.equal(second - first, 8);
  assert.deepEqual(homepageRotatingWindow(items, first, 8), homepageRotatingWindow(items, first, 8));
  assert.equal(homepageRotatingWindow(items, first, 8).length, 8);
  assert.equal(
    homepageRotatingWindow(items, first, 8).filter((id) =>
      homepageRotatingWindow(items, second, 8).includes(id),
    ).length,
    0,
  );
  assert.deepEqual(homepageRotatingWindow([1, 2], first, 8).sort(), [1, 2]);
  assert.deepEqual(homepageRotatingWindow([], first, 8), []);
});

test("daily SQLite rotation keeps featured profiles first and wraps without duplicates", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("CREATE TABLE profiles (id INTEGER PRIMARY KEY, featured INTEGER NOT NULL)");
    const insert = database.prepare("INSERT INTO profiles (id, featured) VALUES (?, ?)");
    for (let id = 1; id <= 24; id += 1) insert.run(id, id <= 2 ? 1 : 0);

    const sql = `
      WITH candidates AS (
        SELECT id, featured,
          ROW_NUMBER() OVER (PARTITION BY featured ORDER BY id ASC) - 1 AS rotation_index,
          COUNT(*) OVER (PARTITION BY featured) AS rotation_count
        FROM profiles
      )
      SELECT id FROM candidates
      ORDER BY featured DESC,
        ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
      LIMIT ?`;
    const select = database.prepare(sql);
    const today = select.all(homepageRotationOffset("2026-11-04", 8), 8).map((row) => row.id);
    const tomorrow = select.all(homepageRotationOffset("2026-11-05", 8), 8).map((row) => row.id);

    assert.deepEqual(today.slice(0, 2).sort(), [1, 2]);
    assert.deepEqual(tomorrow.slice(0, 2).sort(), [1, 2]);
    assert.equal(new Set(today).size, 8);
    assert.equal(new Set(tomorrow).size, 8);
    assert.notDeepEqual(today, tomorrow);
    assert.equal(today.slice(2).filter((id) => tomorrow.slice(2).includes(id)).length, 0);
  } finally {
    database.close();
  }
});

test("homepage keeps events chronological and limits mobile breeds with sufficient CSS specificity", async () => {
  const [page, styles, directory, breeds, events] = await Promise.all([
    source("app/page.tsx"),
    source("app/home-v2.module.css"),
    source("lib/directory-store.ts"),
    source("lib/breed-store.ts"),
    source("lib/event-store.ts"),
  ]);

  assert.match(page, /listHomepageFeaturedBreeds\(8\)/);
  assert.match(page, /getHomepageDirectoryProfilesWithImages\("veterinari", 8\)/);
  assert.match(page, /getHomepageDirectoryProfilesWithImages\("treneri", 8\)/);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*\.home-magazine-side \.home-side-breed-list > \.home-side-unified-row\.home-side-unified-row:nth-child\(n \+ 4\)\) \{\s*display: none;/,
  );
  assert.match(directory, /PARTITION BY featured ORDER BY name ASC, id ASC/);
  assert.match(directory, /homepageRotationOffset\(bratislavaDateKey\(\), safeLimit\)/);
  assert.match(breeds, /homepageRotationOffset\(bratislavaDateKey\(\), safeLimit\)/);
  assert.match(events, /ORDER BY start_date ASC, start_time ASC, id ASC LIMIT \?/);
});
