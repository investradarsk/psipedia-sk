import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { popularArticlesBothWindowsSql } from "../lib/article-popularity-query.ts";

test("one popularity scan preserves independent ranking, limits, date bounds and visibility", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE managed_articles(id INTEGER PRIMARY KEY, slug TEXT, title TEXT, category TEXT,
        portal_section TEXT, portal_subpage TEXT, news_category TEXT, image_url TEXT,
        published_at TEXT, updated_at TEXT, status TEXT);
      CREATE TABLE article_read_hourly(article_id INTEGER,bucket_hour INTEGER,qualified_reads INTEGER);
      CREATE INDEX bucket ON article_read_hourly(bucket_hour);
    `);
    const article = db.prepare("INSERT INTO managed_articles VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    const hourly = db.prepare("INSERT INTO article_read_hourly VALUES(?,?,?)");
    for (let id = 1; id <= 40; id++) {
      const status = ["published", "scheduled", "draft"][id % 3];
      article.run(id, "slug-" + id, "Title", "Zdravie", "starostlivost", null, null, null,
        id % 4 === 0 ? null : id % 5 === 0 ? "2026-11-26" : "2026-11-24", "2026-11-23", status);
      for (let h = 0; h < 200; h++) {
        if ((id * 7 + h * 3) % 11 < 4) hourly.run(id,h,(id * h) % 13);
      }
    }
    const old = db.prepare(`
      SELECT a.id, SUM(h.qualified_reads) AS qualified_reads,
        COALESCE(a.published_at,a.updated_at) AS published_at
      FROM article_read_hourly h JOIN managed_articles a ON a.id=h.article_id
      WHERE h.bucket_hour>=? AND h.bucket_hour<=?
        AND (a.status='published' OR (a.status='scheduled' AND a.published_at<=?))
        AND (? IS NULL OR a.slug<>?)
      GROUP BY a.id
      ORDER BY qualified_reads DESC,published_at DESC,a.id DESC LIMIT ?
    `);
    const both = db.prepare(popularArticlesBothWindowsSql);
    for (const end of [5,23,100,199]) {
      for (const exclude of [null,"slug-12","slug-21"]) {
        for (const limit of [1,5,20]) {
          const rows = both.all({"?1":end-167,"?2":end-23,"?3":end,"?4":"2026-11-25","?5":exclude,"?6":limit});
          for (const [hours,key] of [[24,"24h"],[168,"7d"]]) {
            const result = rows.filter(row=>row["reads"+key]!==null && row["rank"+key]<=limit)
              .sort((a,b)=>a["rank"+key]-b["rank"+key])
              .map(row=>[row.id,row["reads"+key]]);
            const expected = old.all(end-hours+1,end,"2026-11-25",exclude,exclude,limit)
              .map(row=>[row.id,row.qualified_reads]);
            assert.deepEqual(result, expected);
          }
        }
      }
    }
    assert.equal(both.all({"?1":1000,"?2":1144,"?3":1167,"?4":"2026-11-25","?5":null,"?6":5}).length,0);
  } finally { db.close(); }
});
