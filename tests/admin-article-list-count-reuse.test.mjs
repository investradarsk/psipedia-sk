import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleAdminListQuery, parseArticleAdminListFilters } from "../lib/article-admin-query.ts";
import { articleEffectiveStatusSql } from "../lib/article-effective-status.ts";

const NOW = "2026-10-25T12:00:00.000Z";
const store = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, excerpt TEXT, category TEXT, status TEXT, published_at TEXT, portal_section TEXT)");
  db.exec("CREATE TABLE article_topic_assignments(article_id INTEGER,topic_id INTEGER)");
  const insert = db.prepare("INSERT INTO managed_articles VALUES(?,?,?,?,?,?,?,?)");
  insert.run(1,"Psí výcvik","vycvik","", "Výcvik", "published", "2026-10-01", "clanky");
  insert.run(2,"Novinka","novinka","", "Veda", "scheduled", "2026-10-20", "novinky");
  insert.run(3,"Budúca správa","buduca","", "Veda", "scheduled", "2026-11-05", "novinky");
  insert.run(4,"Koncept","koncept","", "Zdravie", "draft", null, "clanky");
  db.exec("INSERT INTO article_topic_assignments VALUES(1,9),(3,9)");
  return db;
}
function filters(raw = {}) {
  return parseArticleAdminListFilters({ get(name) {return raw[name] ?? null;} });
}
function filteredCount(db,f,section) {
  const q=buildArticleAdminListQuery(f,section,NOW);
  return db.prepare("SELECT COUNT(*) AS total FROM managed_articles "+q.where).get(...q.bindings).total;
}
function globalCounters(db,section) {
  const condition=section?"WHERE portal_section = ?":"";
  const sql="SELECT COUNT(*) AS total, "+
    "COALESCE(SUM(CASE WHEN effective_status = 'published' THEN 1 ELSE 0 END),0) AS published, "+
    "COALESCE(SUM(CASE WHEN effective_status = 'scheduled' THEN 1 ELSE 0 END),0) AS scheduled, "+
    "COALESCE(SUM(CASE WHEN effective_status = 'draft' THEN 1 ELSE 0 END),0) AS draft "+
    "FROM (SELECT portal_section, "+articleEffectiveStatusSql()+" AS effective_status FROM managed_articles) AS article_statuses "+condition;
  return db.prepare(sql).get(NOW,...(section?[section]:[]));
}

test("article unfiltered total equals existing global count for every fixed portal section", () => {
  const db=fixture();
  try {
    for (const section of [undefined,"clanky","novinky"]) {
      for (const raw of [{},{sort:"title"},{direction:"asc"},{page:"2"},{pageSize:"1"}]) {
        const f=filters(raw);
        assert.equal(filteredCount(db,f,section), globalCounters(db,section).total,
          JSON.stringify({section,raw}));
      }
    }
    assert.deepEqual({...globalCounters(db)}, {total:4,published:2,scheduled:1,draft:1});
    assert.equal(globalCounters(db,"clanky").total,2);
    assert.equal(globalCounters(db,"novinky").total,2);
  } finally {db.close();}
});

test("article query, status, topic filtering always retains exact filtered count", () => {
  const db=fixture();
  try {
    const inputs=[
      [{query:"vycvik"},undefined,1],
      [{status:"published"},undefined,2],
      [{status:"scheduled"},undefined,1],
      [{status:"draft"},"clanky",1],
      [{topic:"9"},undefined,2],
      [{status:"published",topic:"9"},undefined,1],
      [{status:"scheduled"},"novinky",1],
      [{query:"neexistuje"},undefined,0],
    ];
    for (const [raw,section,expected] of inputs) {
      const f=filters(raw);
      assert.equal(filteredCount(db,f,section),expected,JSON.stringify({raw,section}));
    }
  } finally {db.close();}
});

test("article loader reuses global count only when record-level filters are absent", () => {
  assert.match(store, /const reuseGlobalCount = !filters\.query && filters\.status === "all" && !filters\.topicId/);
  assert.match(store, /!\s*reuseGlobalCount\s*\?\s*\[database\.prepare/);
  assert.match(store, /const filteredCountResult = reuseGlobalCount \? countResult : countResults\[0\]/);
  assert.match(store, /database\.batch\(countStatements\)/);
  assert.match(store, /loadPage\(filteredQuery\)/);
  assert.match(store, /page === filteredQuery\.page/);
  assert.doesNotMatch(store.slice(store.indexOf("export async function listManagedArticleSummaries"),store.indexOf("export async function getManagedArticleById")),/\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/i);
});
