import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(read("drizzle/0107_section_hero_config.sql"));
  db.exec(read("drizzle/0106_section_visuals.sql"));
  db.exec(read("drizzle/0151_admin_content_revision_history.sql"));
  return db;
}

test("revision triggers observe actual D1 section edits and ignore no-op content saves", () => {
  const db = database();
  try {
    db.prepare("INSERT INTO portal_section_settings (slug,label,eyebrow,description,intro,hero_config_json,subpages_json,position,visible,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("plemena", "Plemená", "Atlas", "Popis", "Úvod", "{}", "[]", 1, 1, "2026-11-02T10:00:00Z", "admin@test.invalid");

    db.prepare("UPDATE portal_section_settings SET label=?,updated_at=?,updated_by=? WHERE slug=?")
      .run("Plemená psov", "2026-11-02T10:10:00Z", "admin@test.invalid", "plemena");
    const entry = db.prepare("SELECT operation,before_json,after_json FROM admin_content_revision_history").get();
    assert.equal(entry.operation, "UPDATE");
    assert.equal(JSON.parse(entry.before_json).label, "Plemená");
    assert.equal(JSON.parse(entry.after_json).label, "Plemená psov");

    db.prepare("UPDATE portal_section_settings SET updated_at=? WHERE slug=?")
      .run("2026-11-02T10:11:00Z", "plemena");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_content_revision_history").get().n, 1);

    assert.throws(() => db.prepare("UPDATE admin_content_revision_history SET actor='hacked'").run(), /append-only/);
    assert.throws(() => db.prepare("DELETE FROM admin_content_revision_history").run(), /append-only/);
  } finally { db.close(); }
});

test("visual revision history remains append-only across insert, edit and reset", () => {
  const db = database();
  try {
    db.prepare("INSERT INTO section_visuals (visual_key,section_slug,subsection_slug,image_url,image_key,alt_text,desktop_x,desktop_y,desktop_zoom,mobile_x,mobile_y,mobile_zoom,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("home.hero", null, null, "/images/hero-labrador.webp", null, "Pes", .5,.5,1,.5,.5,1,
        "2026-11-02T10:00:00Z", "admin@test.invalid");
    db.prepare("UPDATE section_visuals SET alt_text=?, updated_at=? WHERE visual_key=?")
      .run("Čierny labrador", "2026-11-02T10:01:00Z", "home.hero");
    db.prepare("DELETE FROM section_visuals WHERE visual_key=?").run("home.hero");
    const entries = db.prepare("SELECT operation,before_json,after_json FROM admin_content_revision_history ORDER BY id").all();
    assert.deepEqual(entries.map(entry => entry.operation), ["INSERT", "UPDATE", "DELETE"]);
    assert.equal(entries[0].before_json, null);
    assert.equal(JSON.parse(entries[0].after_json).alt_text, "Pes");
    assert.equal(JSON.parse(entries[1].before_json).alt_text, "Pes");
    assert.equal(JSON.parse(entries[1].after_json).alt_text, "Čierny labrador");
    assert.equal(JSON.parse(entries[2].before_json).alt_text, "Čierny labrador");
    assert.equal(entries[2].after_json, null);
  } finally { db.close(); }
});

test("revisions are accessed only by authenticated GET and strict-provenance explicit POST", () => {
  const route = read("app/api/admin/content-history/route.ts");
  const store = read("lib/admin-content-history.ts");
  assert.match(route, /getAdminApiUser\(\)/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /input\.intent !== "restore-last"/);
  assert.match(route, /cache-control": "no-store"/);
  assert.match(store, /parseHistoryTarget/);
  assert.match(store, /SELECT MAX\(id\)/);
  assert.match(store, /historySnapshotSql\(type\)/);
  assert.match(store, /currentSql/);
  assert.match(store, /RETURNING slug AS id/);
  assert.match(store, /RETURNING visual_key AS id/);
  assert.match(store, /if \(!changed\) throw new ContentHistoryError/);
  assert.doesNotMatch(store, /from ["\']@\/lib\/notion|UPDATE directory_profiles|UPDATE adoption_dogs|UPDATE lost_found_dog_reports/i);
});

test("admin timeline is not automatic and cannot restore unsaved editor drafts", () => {
  const timeline = read("components/admin-content-history.tsx");
  const sections = read("components/admin-section-editor.tsx");
  const visuals = read("components/admin-section-visuals.tsx");
  assert.match(timeline, /window\.confirm\(/);
  assert.match(timeline, /"restore-last"/);
  assert.match(timeline, /!canRestore/);
  assert.match(timeline, /role="alert"/);
  assert.match(sections, /<AdminContentHistory/);
  assert.match(sections, /disabled=\{saving \|\| dirty\}/);
  assert.match(visuals, /entityType="section_visual"/);
  assert.match(visuals, /entityType="section"/);
  assert.match(visuals, /disabled=\{saving \|\| uploading \|\| draftChanged\}/);
});
