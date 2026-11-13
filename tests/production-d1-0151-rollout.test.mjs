import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVED_0151_SHA256, SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  UNACTIVATED_PRODUCTION_TARGETS, assertApproved0151Target,
  assertPendingTargetSchemaClean, targetSchemaObjects,
  selectMigrationsThrough, validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";
import {
  PINNED_SHA256_0151, OBJECTS_0151,
  assertContentHistory0151Prerequisites,
  assertContentHistory0151Schema,
  assertContentHistory0151NotApplied,
} from "../scripts/production-d1-0151-schema.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const TARGET = "0151_admin_content_revision_history.sql";

function state(db) {
  return {
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    portalSectionSettingsColumns: db.prepare("PRAGMA table_info('portal_section_settings')").all(),
    sectionVisualColumns: db.prepare("PRAGMA table_info('section_visuals')").all(),
  };
}
function seededDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(read("drizzle/0107_section_hero_config.sql"));
  db.exec(read("drizzle/0106_section_visuals.sql"));
  db.prepare("INSERT INTO portal_section_settings(slug,label,eyebrow,description,intro,hero_config_json,subpages_json,position,visible,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("plemena", "Plemená", "Sprievodca", "Popis", "Intro", "{}", "[]", 1, 1, "2026-11-02", "editor");
  db.prepare("INSERT INTO section_visuals(visual_key,section_slug,subsection_slug,image_url,image_key,alt_text,desktop_x,desktop_y,desktop_zoom,mobile_x,mobile_y,mobile_zoom,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("home.hero", null, null, "/images/hero-labrador.webp", null, "Pes", .5, .5, 1, .5, .5, 1, "2026-11-02", "editor");
  return db;
}
test("0151 is approved only by pinned SHA and protected canonical DB identity", () => {
  const sql = read("drizzle/" + TARGET);
  const hash = createHash("sha256").update(sql).digest("hex");
  assert.equal(hash, PINNED_SHA256_0151);
  assert.equal(hash, APPROVED_0151_SHA256);
  assert.doesNotThrow(() => assertApproved0151Target("psipedia-sk-db", hash));
  assert.throws(() => assertApproved0151Target("test-db", hash), /canonical/);
  assert.throws(() => assertApproved0151Target("psipedia-sk-db", "different-hash"), /SHA256 differs/);
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(TARGET));
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(TARGET));
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  assert.deepEqual(UNACTIVATED_PRODUCTION_TARGETS, [
    "0158_admin_directory_list_indexes.sql",
    "0159_breed_notion_workcopy_links.sql",
    "0160_event_contacts_admission.sql",
    "0161_event_image_alt_private_notes.sql",
    "0162_lost_found_short_description.sql",
    "0163_breed_notion_controlled_values.sql",
    "0164_admin_record_lifecycle.sql",
    "0165_lost_found_public_contacts.sql",
    "0166_facebook_weekly_template.sql",
  ]);
  assert.ok(!SUPPORTED_PRODUCTION_TARGETS.includes("0158_admin_directory_list_indexes.sql"));
});
test("0151 is one-shot and requires exact 0150 ledger predecessor", () => {
  const prior = [
    ...Array.from({ length: 62 }, (_, i) => String(i).padStart(4, "0") + "_prior.sql"),
    ...SUPPORTED_PRODUCTION_TARGETS.filter(name => Number(name.slice(0, 4)) <= 151),
  ];
  const scope = selectMigrationsThrough([...prior, "0152_future.sql"], TARGET);
  assert.deepEqual(scope.selected, prior);
  assert.deepEqual(scope.excludedFuture, ["0152_future.sql"]);
  const state = validateProductionTargetHistory(prior.slice(0, -1), prior, TARGET);
  assert.deepEqual(state, { latestIndex: 150, targetApplied: false });
  assert.throws(() => validateProductionTargetHistory(prior.slice(0, -2), prior, TARGET), /expected exactly 0150/);
  assert.throws(() => assertContentHistory0151NotApplied(TARGET, true), /already applied/);
  assert.doesNotThrow(() => assertContentHistory0151NotApplied(TARGET, false));
});
test("0151 migration modifies only schema and preserves existing stored sections and visual data", () => {
  const db = seededDb();
  try {
    const before = {
      sections: db.prepare("SELECT * FROM portal_section_settings ORDER BY slug").all(),
      visuals: db.prepare("SELECT * FROM section_visuals ORDER BY visual_key").all(),
    };
    assert.equal(assertContentHistory0151Prerequisites(state(db)), true);
    assert.deepEqual(targetSchemaObjects(state(db), TARGET), { partial: false });
    db.exec(read("drizzle/" + TARGET));
    assert.deepEqual(db.prepare("SELECT * FROM portal_section_settings ORDER BY slug").all(), before.sections);
    assert.deepEqual(db.prepare("SELECT * FROM section_visuals ORDER BY visual_key").all(), before.visuals);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_content_revision_history").get().n, 0);
    assert.deepEqual(targetSchemaObjects(state(db), TARGET), { partial: true });
    assert.equal(assertContentHistory0151Schema(state(db)), true);
    db.prepare("UPDATE portal_section_settings SET label=?,updated_by=? WHERE slug=?")
      .run("Plemená psov", "admin-editor", "plemena");
    db.prepare("UPDATE section_visuals SET alt_text=?,updated_by=? WHERE visual_key=?")
      .run("Čierny labrador", "admin-editor", "home.hero");
    const rows = db.prepare("SELECT entity_type,entity_key,actor,before_json,after_json FROM admin_content_revision_history ORDER BY id").all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.entity_type), ["section", "section_visual"]);
    assert.equal(JSON.parse(rows[0].before_json).label, "Plemená");
    assert.equal(JSON.parse(rows[0].after_json).label, "Plemená psov");
    assert.equal(rows[1].actor, "admin-editor");
    assert.throws(() => db.exec("DELETE FROM admin_content_revision_history"), /append-only/);
    assert.throws(() => db.exec("UPDATE admin_content_revision_history SET actor='no'"), /append-only/);
  } finally { db.close(); }
});
test("0151 rejects partial audit schema and rejects missing or changed trigger and source columns", () => {
  const db = seededDb();
  try {
    assert.deepEqual(targetSchemaObjects(state(db), TARGET), { partial: false });
    db.exec(read("drizzle/" + TARGET));
    for (const name of OBJECTS_0151) {
      assert.deepEqual(targetSchemaObjects({ objects: [{name}] }, TARGET), { partial: true });
      assert.throws(() => assertPendingTargetSchemaClean(TARGET, { partial: true }), /partial\/manual drift/);
    }
    db.exec("DROP TRIGGER admin_visual_revision_update");
    assert.throws(() => assertContentHistory0151Schema(state(db)), /missing audit trigger/);
  } finally { db.close(); }
  assert.throws(() => assertContentHistory0151Prerequisites({
    objects: [{ name: "portal_section_settings", type: "table" }, {name: "section_visuals",type:"table"}],
    portalSectionSettingsColumns: [{name: "slug"}], sectionVisualColumns: [],
  }), /missing sections source field/);
});
test("0151 rollout uses the protected main-only manual workflow with time-travel bookmark", () => {
  const workflow = read(".github/workflows/production-d1-migrate.yml");
  const runner = read("scripts/production-d1-migrate.mjs");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /- 0151_admin_content_revision_history\.sql/);
  assert.match(workflow, /0151_admin_content_revision_history\.sql\) expected_confirmation="APPLY-0151-psipedia-sk-db"/);
  assert.match(workflow, /node scripts\/production-d1-migrate\.mjs preflight/);
  assert.match(workflow, /steps\.preflight\.outputs\.target_applied != 'true'/);
  assert.match(workflow, /node scripts\/production-d1-migrate\.mjs verify/);
  assert.match(runner, /d1", "time-travel", "info"/);
  assert.match(runner, /assertContentHistory0151NotApplied\(targetMigration, state\.targetApplied\)/);
  assert.match(runner, /assertContentHistory0151Schema\(schema\)/);
  assert.match(runner, /assertApproved0151Target\(resources\.d1\.database_name, targetMigrationSha256\)/);
  assert.doesNotMatch(workflow, /wrangler deploy|d1 time-travel restore/);
});
