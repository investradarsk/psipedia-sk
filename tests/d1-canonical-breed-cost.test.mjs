import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { canonicalBreedIdsSql, canonicalBreedWinnerSql } from "../lib/breed-canonical.ts";

test("canonical breed IDs preserve eligibility and all three duplicate identities without correlated scans", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE managed_breeds (
      id INTEGER PRIMARY KEY, status TEXT, fci_number INTEGER, import_key TEXT,
      slug TEXT, name TEXT, fci_group INTEGER, seo_json TEXT
    )`);
    const insert = db.prepare(`INSERT INTO managed_breeds
      (id,status,fci_number,import_key,slug,name,fci_group,seo_json)
      VALUES (?,?,?,?,?,?,?,?)`);
    const rows = [
      [1, "published", 101, "x", "alpha", "Alpha", 1, "{}"],
      [2, "published", 101, "y", "beta", "Beta", 1, "{}"], // FCI duplicate
      [3, "published", 102, "z", "alpha", "Second", 1, "{}"], // slug duplicate
      [4, "published", 103, " x ", "delta", "Fourth", 1, "{}"], // trimmed key duplicate
      [5, "published", 104, "E", "echo", "Malformed", 1, "{"],
      [6, "published", 104, "E", "echo", "Valid", 1, "{}"], // invalid earlier row cannot block
      [7, "published", 105, "J", "foxtrot", "Noindex", 1, '{"noindex":1}'],
      [8, "published", 105, "J", "foxtrot", "Indexed", 1, "{}"],
      [9, "published", 106, "I", "Bad-Slug", "Bad Slug", 1, "{}"],
      [10, "published", 0, "K", "zero", "Bad FCI", 1, "{}"],
      [11, "published", 111, "L", "external", "External canonical", 1, '{"canonicalUrl":"/plemena/other"}'],
      [12, "published", 110, "M", "self", "Self canonical", 1, '{"canonicalUrl":"/plemena/self"}'],
      [20, "published", 500, "P", "foo", "Foo", 1, "{}"],
      [21, "published", 500, "Q", "bar", "Bar", 1, "{}"], // duplicate non-winner
      [22, "published", 600, "R", "bar", "Bar Two", 1, "{}"], // also duplicate non-winner
      [23, "published", 601, "R", "zz", "Zed", 1, "{}"], // transitive chain
    ];
    for (const row of rows) insert.run(...row);

    const oldIds = db.prepare(`SELECT b.id FROM managed_breeds b
      WHERE ${canonicalBreedWinnerSql("b")} ORDER BY b.id`).all().map((row) => row.id);
    const newIds = db.prepare(`${canonicalBreedIdsSql} ORDER BY id`).all().map((row) => row.id);
    assert.deepEqual(oldIds, [1, 6, 8, 12, 20]);
    assert.deepEqual(newIds, oldIds);

    const nested = db.prepare(`SELECT id FROM managed_breeds
      WHERE id IN (${canonicalBreedIdsSql}) ORDER BY id`).all().map((row) => row.id);
    assert.deepEqual(nested, oldIds);

    const plan = db.prepare(`EXPLAIN QUERY PLAN ${canonicalBreedIdsSql}`).all();
    assert.ok(!plan.some((row) => /CORRELATED SCALAR SUBQUERY/i.test(String(row.detail))),
      "public listing must not use a correlated anti-join per breed");
  } finally {
    db.close();
  }
});
