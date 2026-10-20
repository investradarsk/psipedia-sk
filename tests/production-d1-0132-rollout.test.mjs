import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  APPROVED_0132_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assertApproved0132Target, assert0132NotAlreadyApplied,
  assertFacebookImagePostsSchema, assertFacebookImagePublisherSchema,
  assertFacebookImageTrashSchema, assertFacebookImageDirectConsentSchema,
  assertPendingTargetSchemaClean,
  targetSchemaObjects, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const target = "0132_facebook_image_direct_consent.sql";
const previous = "0131_facebook_image_trash.sql";
const sql = readFileSync(new URL("../drizzle/" + target, import.meta.url), "utf8");
const sql128 = readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql", import.meta.url), "utf8");
const sql130 = readFileSync(new URL("../drizzle/0130_facebook_image_publisher.sql", import.meta.url), "utf8");
const sql131 = readFileSync(new URL("../drizzle/0131_facebook_image_trash.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-d1-migrate.yml", import.meta.url), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const sqlText of [sql128, sql130, sql131]) db.exec(sqlText);
  const id = "00000000-0000-4000-8000-000000000001";
  const key = "facebook-images/2030/" + id + ".jpg";
  db.prepare(`INSERT INTO facebook_image_posts
    (id, title, image_url, image_key, caption, scheduled_at, status,
      notion_page_id, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, "Existujúci príspevok", "/media/" + key, key,
      "Pôvodný text", "2030-01-02T11:00:00.000Z", "scheduled",
      "3e0793fc-1d18-8138-8bb7-f0e0a7495728",
      "2030-01-01T09:00:00.000Z", "2030-01-01T09:00:00.000Z", "admin", "admin");
  db.prepare(`INSERT INTO facebook_image_publish_attempts
    (post_id, snapshot_version, state, started_at, completed_at, error_code)
    VALUES (?, 1, 'UNCERTAIN', '2030-01-01T09:00:00.000Z', '2030-01-01T09:01:00.000Z', 'META_HTTP_401')`).run(id);
  const schema = () => ({
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),
    facebookImagePostColumns: db.prepare("PRAGMA table_info('facebook_image_posts')").all(),
  });
  return { db, id, schema };
}

test("0132 is explicitly pinned and gated by manual approval on canonical main", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-2), target);
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-3), previous);
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, ["0134_services_admin_change_audit.sql","0135_facebook_image_safe_retry.sql","0136_gemini_global_stop.sql"]);
  assert.equal(createHash("sha256").update(sql).digest("hex"), APPROVED_0132_SHA256);
  assert.doesNotThrow(() => assertApproved0132Target("psipedia-sk-db", APPROVED_0132_SHA256));
  assert.throws(() => assertApproved0132Target("other-db", APPROVED_0132_SHA256), /canonical/);
  assert.throws(() => assertApproved0132Target("psipedia-sk-db", "unapproved"), /SHA256/);
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /- 0132_facebook_image_direct_consent\.sql/);
  assert.match(workflow, /0132_facebook_image_direct_consent\.sql\) expected_confirmation="APPLY-0132-psipedia-sk-db"/);
  assert.doesNotMatch(workflow, /^\s*(?:push|schedule|pull_request):/m);
});

test("0132 refuses missing predecessor, unexpected ledger, and a second APPLY", () => {
  const chain = [...Array.from({ length: 62 }, (_, i) => String(i).padStart(4, "0") + "_prior.sql"), ...SUPPORTED_PRODUCTION_TARGETS.filter(name => Number(name.slice(0,4)) <= 132)];
  const before = chain.slice(0, -1);
  assert.deepEqual(validateProductionTargetHistory(before, chain, target), { latestIndex: 131, targetApplied: false });
  assert.deepEqual(validateProductionTargetHistory(chain, chain, target), { latestIndex: 132, targetApplied: true });
  assert.throws(() => validateProductionTargetHistory(before.slice(0, -1), chain, target), /expected exactly 0131/);
  assert.throws(() => validateProductionTargetHistory([...before.slice(0, -1), "0131_rogue.sql"], chain, target), /does not exactly match/);
  assert.throws(() => assert0132NotAlreadyApplied(target, true), /already applied/);
  assert.doesNotThrow(() => assert0132NotAlreadyApplied(target, false));
});

test("0132 adds only DENY-by-default consent columns and preserves old posts, Notion ID, attempt audit", () => {
  const f = fixture();
  try {
    assertFacebookImagePostsSchema(f.schema());
    assertFacebookImagePublisherSchema(f.schema());
    assertFacebookImageTrashSchema(f.schema());
    // Full-chain integrity is tested by the clean D1 CI job. This fixture contains only Facebook tables.
    assert.deepEqual(targetSchemaObjects(f.schema(), target), { partial: false });
    assert.doesNotThrow(() => assertPendingTargetSchemaClean(target, targetSchemaObjects(f.schema(), target)));
    assert.throws(() => assertFacebookImageDirectConsentSchema(f.schema()), /0132/);
    const postsBefore = f.db.prepare("SELECT * FROM facebook_image_posts").all();
    const attemptsBefore = f.db.prepare("SELECT * FROM facebook_image_publish_attempts").all();
    f.db.exec(sql);
    assert.deepEqual(targetSchemaObjects(f.schema(), target), { partial: true });
    assert.doesNotThrow(() => assertFacebookImageDirectConsentSchema(f.schema()));
    assertFacebookImageTrashSchema(f.schema());
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM facebook_image_posts").get().count, 1);
    const postsAfter = f.db.prepare("SELECT * FROM facebook_image_posts").all();
    for (const key of Object.keys(postsBefore[0])) assert.equal(postsAfter[0][key], postsBefore[0][key], key);
    assert.deepEqual(f.db.prepare("SELECT * FROM facebook_image_publish_attempts").all(), attemptsBefore);
    assert.equal(postsAfter[0].direct_publish_consent, 0);
    assert.equal(postsAfter[0].direct_consent_at, null);
    assert.equal(postsAfter[0].direct_consent_by, null);
    assert.throws(() => f.db.prepare("UPDATE facebook_image_posts SET direct_publish_consent=2 WHERE id=?").run(f.id), /CHECK constraint/);
    assert.throws(() => f.db.exec(sql), /duplicate column name/);
  } finally { f.db.close(); }
});

test("0132 rejects any partial/manual schema changes and invalid consent definitions", () => {
  for (const statement of [
    "ALTER TABLE facebook_image_posts ADD COLUMN direct_publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (direct_publish_consent IN (0,1))",
    "ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_at TEXT",
    "ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_by TEXT",
  ]) {
    const f = fixture();
    try {
      f.db.exec(statement);
      assert.deepEqual(targetSchemaObjects(f.schema(), target), { partial: true });
      assert.throws(() => assertPendingTargetSchemaClean(target, targetSchemaObjects(f.schema(), target)), /partial\/manual drift/);
      assert.throws(() => assertFacebookImageDirectConsentSchema(f.schema()), /0132/);
    } finally { f.db.close(); }
  }
  const f = fixture();
  try {
    f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN direct_publish_consent INTEGER NOT NULL DEFAULT 1");
    f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_at TEXT");
    f.db.exec("ALTER TABLE facebook_image_posts ADD COLUMN direct_consent_by TEXT");
    assert.throws(() => assertFacebookImageDirectConsentSchema(f.schema()), /invalid column definition/);
  } finally { f.db.close(); }
});
