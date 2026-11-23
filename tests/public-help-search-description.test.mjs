import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env } from "cloudflare:workers";
import { searchPortal } from "../lib/portal-search.ts";

test("help search returns published cases matched only in their full description", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("drizzle/0005_nappy_kitty_pryde.sql", "utf8"));
  const insert = sqlite.prepare(`
    INSERT INTO help_cases (slug, title, category, status, excerpt, description,
      organization, city, region, action_label, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, 'zbierky', ?, 'Krátky prehľad', ?, '', 'Nitra', 'Nitriansky kraj',
      '', '', '', '', '')
  `);
  insert.run("pomoc-pre-psa", "Pomoc pre psa", "published", "Potrebujeme rehabilitačnú pomôcku.");
  insert.run(
    "rozpracovana-pomoc",
    "Rozpracovaná pomoc",
    "draft",
    "Potrebujeme rehabilitačnú pomôcku.",
  );
  insert.run("ina-zbierka", "Iná zbierka", "published", "Potrebujeme krmivo.");
  const previousDb = env.DB;
  env.DB = {
    prepare: (sql) => ({ bind: (...bindings) => ({ sql, bindings }) }),
    batch: async (statements) =>
      statements.map(({ sql, bindings }) => ({
        results: sql.includes("FROM help_cases h") ? sqlite.prepare(sql).all(...bindings) : [],
      })),
  };
  try {
    const result = await searchPortal("rehabilitacnu", { section: "pomoc-psom" });
    assert.equal(result.total, 1);
    assert.deepEqual(
      result.items.map(({ href }) => href),
      ["/pomoc-psom/zbierky/pomoc-pre-psa"],
    );
    assert.equal(result.items[0].description, "Krátky prehľad");
  } finally {
    if (previousDb === undefined) delete env.DB;
    else env.DB = previousDb;
    sqlite.close();
  }
});

test("article search keeps matches in the perex and introduction while ranking title matches first", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("drizzle/0000_curved_tony_stark.sql", "utf8"));
  sqlite.exec("ALTER TABLE managed_articles ADD COLUMN focus_keyword TEXT NOT NULL DEFAULT ''");
  const insert = sqlite.prepare(`
    INSERT INTO managed_articles (slug, title, status, excerpt, intro, category, portal_section,
      takeaway, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, 'Starostlivosť', 'starostlivost', '', '', '', '', '')
  `);
  insert.run("titul", "Kinezioterapia psa", "published", "Stručný prehľad", "");
  insert.run("perex", "Starostlivosť o psa", "published", "Kinezioterapia pri zotavovaní", "");
  insert.run(
    "uvod",
    "Pohyb po úraze",
    "published",
    "Stručný prehľad",
    "Kinezioterapia pri zotavovaní",
  );
  insert.run("koncept", "Rozpracovaný článok", "draft", "Kinezioterapia", "");
  const previousDb = env.DB;
  env.DB = {
    prepare: (sql) => ({ bind: (...bindings) => ({ sql, bindings }) }),
    batch: async (statements) =>
      statements.map(({ sql, bindings }) => ({
        results: sqlite.prepare(sql).all(...bindings),
      })),
  };
  try {
    const result = await searchPortal("kinezioterapia", { section: "starostlivost" });
    assert.equal(result.total, 3);
    assert.equal(result.items[0]?.href, "/starostlivost/titul");
    assert.deepEqual(
      new Set(result.items.map(({ href }) => href)),
      new Set(["/starostlivost/titul", "/starostlivost/perex", "/starostlivost/uvod"]),
    );
  } finally {
    if (previousDb === undefined) delete env.DB;
    else env.DB = previousDb;
    sqlite.close();
  }
});
