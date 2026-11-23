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
  insert.run("rozpracovana-pomoc", "Rozpracovaná pomoc", "draft", "Potrebujeme rehabilitačnú pomôcku.");
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
