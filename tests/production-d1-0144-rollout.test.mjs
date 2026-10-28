import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {
  targetSchemaObjects,
  assertPendingTargetSchemaClean,
  assertFacebookArticles0144Schema,
  assert0144AdditiveOnlySql,
  SUPPORTED_PRODUCTION_TARGETS,
} from "../scripts/production-d1-migrate.mjs";

const target = "0144_facebook_articles_shared_calendar.sql";
const source = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE managed_articles (id INTEGER PRIMARY KEY, title TEXT);
    CREATE TABLE facebook_image_posts (id TEXT PRIMARY KEY, title TEXT);
    INSERT INTO managed_articles(id,title) VALUES (1,'Existing article');
    INSERT INTO facebook_image_posts(id,title) VALUES ('existing','Existing Facebook photo');
  `);
  return db;
}
function snapshot(db) {
  const query = sql => db.prepare(sql).all();
  return {
    objects: query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')"),
    managedArticleColumns: query("PRAGMA table_info('managed_articles')"),
    facebookImagePostColumns: query("PRAGMA table_info('facebook_image_posts')"),
    facebookImagePostForeignKeys: query("PRAGMA foreign_key_list('facebook_image_posts')"),
  };
}

test("0144 is a protected canonical target with a pristine preflight", () => {
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(target));
  const db = fixture();
  try {
    assert.deepEqual(targetSchemaObjects(snapshot(db),target),{partial:false});
    assert.doesNotThrow(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(snapshot(db),target)));
    db.exec("ALTER TABLE managed_articles ADD COLUMN social_caption TEXT NOT NULL DEFAULT ''");
    assert.deepEqual(targetSchemaObjects(snapshot(db),target),{partial:true});
    assert.throws(() => assertPendingTargetSchemaClean(target,targetSchemaObjects(snapshot(db),target)),/partial\/manual drift/);
  } finally {db.close();}
});

test("0144 complete migration preserves old rows, defaults and exact single-link constraints", () => {
  const db = fixture();
  try {
    db.exec(source);
    const state = snapshot(db);
    assert.deepEqual(targetSchemaObjects(state,target),{partial:true});
    assert.equal(assertFacebookArticles0144Schema(state),true);
    assert.equal(db.prepare("SELECT social_caption FROM managed_articles WHERE id=1").get().social_caption,"");
    const old = db.prepare("SELECT article_id,article_image_mode,article_include_link FROM facebook_image_posts WHERE id='existing'").get();
    assert.deepEqual({...old},{article_id:null,article_image_mode:"photo",article_include_link:1});
    assert.throws(() => db.exec("UPDATE facebook_image_posts SET article_image_mode='bad' WHERE id='existing'"),/CHECK constraint/);
    assert.throws(() => db.exec("UPDATE facebook_image_posts SET article_include_link=2 WHERE id='existing'"),/CHECK constraint/);
    db.exec("UPDATE facebook_image_posts SET article_id=1 WHERE id='existing'");
    assert.throws(() => db.exec("INSERT INTO facebook_image_posts(id,title,article_id) VALUES ('duplicate','no',1)"),/UNIQUE constraint/);
    db.exec("DELETE FROM managed_articles WHERE id=1");
    assert.equal(db.prepare("SELECT article_id FROM facebook_image_posts WHERE id='existing'").get().article_id,null);
  } finally {db.close();}
});

test("0144 rejects dropped uniqueness, altered defaults and relaxed image-mode constraints", () => {
  const db = fixture();
  try {
    db.exec(source);
    const state = snapshot(db);
    const withNoIndex = {...state,objects:state.objects.filter(row => row.name !== "facebook_image_posts_article_idx")};
    assert.throws(() => assertFacebookArticles0144Schema(withNoIndex),/unique article-to-post index/);
    const withWrongDefault = {...state,facebookImagePostColumns:state.facebookImagePostColumns.map(row =>
      row.name === "article_include_link" ? {...row,dflt_value:"0"} : row)};
    assert.throws(() => assertFacebookArticles0144Schema(withWrongDefault),/column definition drift/);
    const withWeakMode = {...state,objects:state.objects.map(row =>
      row.name === "facebook_image_posts" ? {...row,sql:row.sql.replace("CHECK(article_image_mode IN ('photo','graphic'))","")} : row)};
    assert.throws(() => assertFacebookArticles0144Schema(withWeakMode),/graphic mode CHECK/);
    const withWeakFk = {...state,facebookImagePostForeignKeys:[]};
    assert.throws(() => assertFacebookArticles0144Schema(withWeakFk),/foreign key missing/);
  } finally {db.close();}
});

test("0144 live postflight accepts only the canonical data-preserving DDL", () => {
  assert.equal(assert0144AdditiveOnlySql(source), true);
  assert.throws(() => assert0144AdditiveOnlySql(source + "\\nDELETE FROM managed_articles;"),
    /additive-only canonical DDL/);
  assert.throws(() => assert0144AdditiveOnlySql(source.replace(
    "CREATE UNIQUE INDEX IF NOT EXISTS facebook_image_posts_article_idx",
    "CREATE INDEX IF NOT EXISTS facebook_image_posts_article_idx")),
    /additive-only canonical DDL/);
  assert.throws(() => assert0144AdditiveOnlySql(source.replace(
    "ALTER TABLE managed_articles ADD COLUMN social_caption TEXT NOT NULL DEFAULT ''",
    "UPDATE managed_articles SET title='changed'")),
    /additive-only canonical DDL/);
});
