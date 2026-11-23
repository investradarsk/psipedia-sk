import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env } from "cloudflare:workers";
import { GET } from "../app/api/public/articles/favorites/route.ts";
import { getPublishedArticleSummaries } from "../lib/article-store.ts";

test("favorites look up older published articles without downloading newer unrelated summaries", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  const previous = env.DB;
  t.after(() => {
    if (previous === undefined) delete env.DB;
    else env.DB = previous;
    sqlite.close();
  });
  sqlite.exec(readFileSync("drizzle/0000_curved_tony_stark.sql", "utf8"));
  sqlite.exec("ALTER TABLE managed_articles ADD COLUMN portal_subpage TEXT");
  const insert = sqlite.prepare(`
    INSERT INTO managed_articles
      (slug,title,excerpt,category,intro,takeaway,created_at,updated_at,created_by,updated_by,status,published_at)
    VALUES (?, ?, '', '', '', '', '', '', '', '', ?, ?)
  `);
  for (let i = 0; i < 201; i++) {
    insert.run("new-" + i, "New " + i, "published", "2026-11-22T00:00:00Z");
  }
  insert.run("old", "Old article", "published", "2025-01-01T00:00:00Z");
  insert.run("hidden", "Draft", "draft", "2025-01-01T00:00:00Z");
  insert.run("future", "Future article", "scheduled", "2099-01-01T00:00:00Z");
  const reads = [];
  env.DB = {
    prepare(sql) {
      const all = async (...values) => {
        reads.push(sql);
        return { results: sqlite.prepare(sql).all(...values) };
      };
      return { all, bind: (...values) => ({ all: () => all(...values) }) };
    },
  };
  const before = await getPublishedArticleSummaries({ limit: 200 });
  assert.equal(
    before.some(({ slug }) => slug === "old"),
    false,
  );

  const call = (query) =>
    GET(new Request("https://psipedia.sk/api/public/articles/favorites?" + query));
  const response = await call("slug=old&slug=old&slug=hidden&slug=future");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(
    (await response.json()).articles.map(({ slug }) => slug),
    ["old"],
  );
  assert.match(reads.at(-1), /slug IN \(SELECT value FROM json_each\(\?\)\)/);

  const count = reads.length;
  assert.deepEqual(await (await call("")).json(), { articles: [] });
  assert.equal((await call(Array(41).fill("slug=old").join("&"))).status, 400);
  assert.equal(reads.length, count);
});
