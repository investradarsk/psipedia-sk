import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  PINNED_SHA256_0138, OBJECTS_0138,
  assertArticleOutbox0138Prerequisites,
  assertArticleOutbox0138Schema as verifyExact0138Schema,
} from "../scripts/production-d1-0138-schema.mjs";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  APPROVED_0138_SHA256, assertApproved0138Target, assert0138NotAlreadyApplied,
  assertArticleOutbox0138Schema, assertPendingTargetSchemaClean,
  targetSchemaObjects, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0138_article_editorial_outbox.sql";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const sql = read("drizzle/" + target);
const workflow = read(".github/workflows/production-d1-migrate.yml");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY, title TEXT);");
  db.exec(`CREATE TABLE article_notion_sync (
    notion_page_id TEXT PRIMARY KEY, article_id INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE
  )`);
  const state = () => ({
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    managedArticleColumns: db.prepare("PRAGMA table_info('managed_articles')").all(),
    articleNotionSyncColumns: db.prepare("PRAGMA table_info('article_notion_sync')").all(),
    articleNotionEditorialOutboxColumns: db.prepare("PRAGMA table_info('article_notion_editorial_outbox')").all(),
    articleNotionEditorialOutboxForeignKeys: db.prepare("PRAGMA foreign_key_list('article_notion_editorial_outbox')").all(),
  });
  return {db,state};
}

test("0138 pinned SQL requires canonical D1, exact owner dispatch and no repeated apply", () => {
  assert.equal(createHash("sha256").update(sql).digest("hex"), PINNED_SHA256_0138);
  assert.equal(APPROVED_0138_SHA256, PINNED_SHA256_0138);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.find(name => name.startsWith("0137_")), "0137_media_source_review_decisions.sql");
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.find(name => name.startsWith("0138_")), target);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.doesNotThrow(() => assertApproved0138Target("psipedia-sk-db", PINNED_SHA256_0138));
  assert.throws(() => assertApproved0138Target("other-db", PINNED_SHA256_0138), /canonical/);
  assert.throws(() => assertApproved0138Target("psipedia-sk-db", "invalid"), /SHA256/);
  assert.throws(() => assert0138NotAlreadyApplied(target, true), /already applied/);
  assert.doesNotThrow(() => assert0138NotAlreadyApplied(target, false));
  assert.match(workflow, /- 0138_article_editorial_outbox\.sql/);
  assert.match(workflow, /0138_article_editorial_outbox\.sql\) expected_confirmation="APPLY-0138-psipedia-sk-db"/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED:\s*true/);
});

test("0138 refuses missing 0137, wrong order and repeated migration ledger", () => {
  const chain = [...Array.from({length:62}, (_, i) => String(i).padStart(4, "0") + "_prior.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(name=>Number(name.slice(0,4))<=138)];
  assert.deepEqual(validateProductionTargetHistory(chain.slice(0,-1),chain,target),
    {latestIndex:137,targetApplied:false});
  assert.throws(() => validateProductionTargetHistory(chain.slice(0,-2),chain,target),
    /expected exactly 0137/);
  assert.throws(() => validateProductionTargetHistory(
    [...chain.slice(0,-2),"0137_fake.sql"],chain,target), /exactly match/);
  assert.deepEqual(validateProductionTargetHistory(chain,chain,target),
    {latestIndex:138,targetApplied:true});
});

test("0138 is additive; rejects partial/manual schema and verifies full DDL", () => {
  const {db,state} = fixture();
  try {
    assert.equal(assertArticleOutbox0138Prerequisites(state()), true);
    assert.deepEqual(targetSchemaObjects(state(), target), {partial:false});
    db.exec(sql);
    assert.deepEqual(targetSchemaObjects(state(), target), {partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(state(),target)),
      /partial\/manual drift/);
    assert.equal(assertArticleOutbox0138Schema(state()), true);
    assert.equal(Object.keys(OBJECTS_0138).length, 3);
    const missing = state();
    missing.objects = missing.objects.filter(row => row.name !== "article_notion_editorial_outbox_lease_idx");
    assert.throws(() => assertArticleOutbox0138Schema(missing), /missing or duplicated/);
    const alteredFk = state();
    alteredFk.articleNotionEditorialOutboxForeignKeys =
      alteredFk.articleNotionEditorialOutboxForeignKeys.filter(row => row.table !== "managed_articles");
    assert.throws(() => assertArticleOutbox0138Schema(alteredFk), /foreign keys/);
    const alteredColumn = state();
    alteredColumn.articleNotionEditorialOutboxColumns =
      alteredColumn.articleNotionEditorialOutboxColumns.filter(row => row.name !== "lease_until");
    assert.throws(() => assertArticleOutbox0138Schema(alteredColumn), /column count/);
    assert.throws(() => verifyExact0138Schema(state(),sql+"\n-- unauthorized edit"),
      /digest mismatch/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM article_notion_editorial_outbox").get().n, 0);
  } finally { db.close(); }
});

test("0138 fail-closed prerequisites, exclusive journal owner and CAS lease", () => {
  const {db,state} = fixture();
  try {
    const missing = state();missing.articleNotionSyncColumns = [];
    assert.throws(() => assertArticleOutbox0138Prerequisites(missing),
      /mapping column/);
    db.exec(sql);
    db.exec("INSERT INTO managed_articles(id,title) VALUES (11,'a'),(12,'b')");
    db.exec("INSERT INTO article_notion_sync(notion_page_id,article_id) VALUES ('p11',11),('p12',12)");
    const insert=db.prepare(`INSERT INTO article_notion_editorial_outbox
      (notion_page_id,article_id,article_updated_at,base_content_hash,operations_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`);
    insert.run("p11",11,"rev-1","hash","{}","2026-10-21","2026-10-21");
    assert.throws(() => insert.run("p12",11,"rev-2","hash","{}","now","now"),/UNIQUE/);
    assert.throws(() => insert.run("p999",999,"rev-2","hash","{}","now","now"),/FOREIGN KEY/);
    assert.throws(() => db.prepare(`UPDATE article_notion_editorial_outbox
      SET lease_owner='claimed' WHERE notion_page_id='p11'`).run(), /CHECK/);
    const claim=db.prepare(`UPDATE article_notion_editorial_outbox SET lease_owner=?,lease_until=?
      WHERE notion_page_id=? AND (lease_owner IS NULL OR lease_until<=?)`);
    assert.equal(claim.run("worker-a","2026-10-23","p11","2026-10-21").changes,1);
    assert.equal(claim.run("worker-b","2026-10-24","p11","2026-10-21").changes,0);
    assert.equal(claim.run("worker-b","2026-10-24","p11","2026-10-24").changes,1);
    db.exec("DELETE FROM article_notion_sync WHERE notion_page_id='p11'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM article_notion_editorial_outbox").get().n,0);
  } finally {db.close();}
});
