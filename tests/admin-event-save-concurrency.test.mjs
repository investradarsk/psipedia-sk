import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const store = read("lib/event-store.ts");
const editor = read("components/admin-event-editor.tsx");
const route = read("app/api/admin/events/[id]/route.ts");
const createRoute = read("app/api/admin/events/route.ts");

function fullUpdateSource() {
  return store.split("export async function updateManagedEvent(")[1]
    ?.split("export async function deleteManagedEvent(")[0] ?? "";
}

/** Exercise the actual UPDATE template, including its version predicate. */
function fullUpdateSql() {
  const match = fullUpdateSource().match(/const statement = database\.prepare\(`([\s\S]*?)`\)\.bind\(/);
  assert.ok(match, "canonical full-update SQL exists");
  // The source template interpolations are only the pre-existing, fixed
  // contact columns and optional private notes. No user input is evaluated.
  return new Function("hasContactColumns", "payload", "return `" + match[1] + "`;")(
    true, { internalNotes: "edited notes" },
  );
}

function sqlArguments(expectedUpdatedAt, nextUpdatedAt) {
  return [
    "club-show", "Nový názov", "Nový perex", "Výstava", "published",
    "2026-12-11", "10:00", "2026-12-12", "15:00",
    "Športová hala", "Nitra", "Nitriansky kraj", "Kvetná 1", "Klub retrieverov",
    "**Program**\n\n- Prehliadka", "Parkovanie na mieste",
    "0911123456", "info@example.sk", "Zdarma",
    "https://example.sk", "https://registracia.example.sk",
    "/media/novy.webp", "r2-new-image", "Fotografia výstavy",
    "edited notes", "auto", null, null,
    0, JSON.stringify({ title: "SEO výstava" }),
    nextUpdatedAt, "2026-11-23T20:00:00.000Z", "editor@example.sk", 1, expectedUpdatedAt,
  ];
}

test("full Admin event save requires the original snapshot, not just a fresh SELECT", () => {
  assert.match(editor, /useState\(event\?\.updatedAt \?\? ""\)/);
  assert.match(editor, /expectedUpdatedAt: event \? expectedUpdatedAt : undefined/);
  assert.match(route, /typeof raw\?\.expectedUpdatedAt !== "string"/);
  assert.match(route, /raw\.expectedUpdatedAt !== before\.updatedAt/);
  assert.match(route, /new EventWriteConflictError\(\)/);
  assert.match(route, /code: "EVENT_VERSION_REQUIRED"/);
  assert.match(route, /status: 428/);
  assert.match(route, /code: "EVENT_VERSION_CONFLICT"/);
  assert.match(route, /status: 409/);

  const update = fullUpdateSource();
  assert.match(update, /WHERE id = \? AND updated_at = \? RETURNING \*/);
  assert.match(update, /editorEmail, id, existing\.updatedAt/);
  assert.match(update, /if \(!row\) throw new EventWriteConflictError\(\)/);
  assert.match(update, /nextManagedEventUpdatedAt\(existing\.updatedAt\)/);
  assert.match(editor, /data\.code === "EVENT_VERSION_CONFLICT"/);
  assert.match(editor, /setExpectedUpdatedAt\(data\.event\.updatedAt\)/);
  assert.match(editor, /setSavedSnapshot\(editorSnapshot\)/);
  assert.match(editor, /Tvoje zmeny zostali vo formulári/);
  assert.doesNotMatch(editor, /if \(response\.status === 409[\s\S]*?router\.refresh\(\)/);
});

test("exact full UPDATE SQL rejects stale and replayed writes without changing D1", () => {
  const sql = fullUpdateSql();
  assert.match(sql, /WHERE id = \? AND updated_at = \? RETURNING \*/);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE managed_events (
      id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, excerpt TEXT,
      event_type TEXT, status TEXT, start_date TEXT, start_time TEXT,
      end_date TEXT, end_time TEXT, venue TEXT, city TEXT, region TEXT,
      address TEXT, organizer TEXT, description TEXT, practical_info TEXT,
      contact_phone TEXT, contact_email TEXT, admission_fee TEXT,
      website_url TEXT, registration_url TEXT, image_url TEXT, image_key TEXT,
      image_alt TEXT, internal_notes TEXT, image_display TEXT,
      thumbnail_display_json TEXT, detail_display_json TEXT, cancelled INTEGER,
      seo_json TEXT, updated_at TEXT, published_at TEXT, updated_by TEXT
    )`);
    db.prepare(`INSERT INTO managed_events(id, slug, title, status, updated_at)
      VALUES(1, 'club-show', 'Pôvodný názov', 'draft', 'revision-1')`).run();
    // Another browser writes first. A stale form MUST NOT update this row.
    db.prepare("UPDATE managed_events SET title=?, updated_at=? WHERE id=1")
      .run("Novšie údaje z iného okna", "revision-2");
    const statement = db.prepare(sql);
    assert.equal(statement.get(...sqlArguments("revision-1", "revision-3")), undefined);
    assert.equal(db.prepare("SELECT title FROM managed_events WHERE id=1").get().title,
      "Novšie údaje z iného okna");

    const saved = statement.get(...sqlArguments("revision-2", "revision-3"));
    assert.equal(saved.title, "Nový názov");
    assert.equal(saved.status, "published");
    assert.equal(saved.description, "**Program**\n\n- Prehliadka");
    assert.equal(saved.image_key, "r2-new-image");
    assert.equal(saved.address, "Kvetná 1");
    assert.equal(saved.internal_notes, "edited notes");
    assert.equal(JSON.parse(saved.seo_json).title, "SEO výstava");
    assert.equal(saved.updated_at, "revision-3");
    assert.equal(statement.get(...sqlArguments("revision-2", "revision-4")), undefined,
      "a second submission of the same form is rejected");
    assert.equal(db.prepare("SELECT updated_at FROM managed_events WHERE id=1").get().updated_at,
      "revision-3");
  } finally {
    db.close();
  }
});

test("event update tokens strictly advance even for two writes in one millisecond", () => {
  const helper = store.match(/export function nextManagedEventUpdatedAt\([\s\S]*?\n\}/)?.[0];
  assert.ok(helper);
  const runnable = stripTypeScriptTypes(helper).replace(/^export /, "");
  const next = new Function(runnable + "\nreturn nextManagedEventUpdatedAt;")();
  const instant = new Date("2026-11-23T21:01:02.100Z");
  assert.equal(next("2026-11-23T21:01:02.100Z", instant), "2026-11-23T21:01:02.101Z");
  assert.equal(next("2026-11-23T21:01:02.099Z", instant), "2026-11-23T21:01:02.100Z");
  assert.equal(next("2026-11-23T21:01:02.200Z", instant), "2026-11-23T21:01:02.201Z");
});

test("D1 success and Notion writeback are separate API outcomes", () => {
  const put = route.split("export async function PUT(")[1]?.split("export async function PATCH(")[0] ?? "";
  assert.ok(put.indexOf("await updateManagedEvent(") < put.indexOf("await syncSavedNotionRecord("));
  assert.match(put, /savedToD1: true, notionFieldSync, notionWarnings, fieldWarnings/);
  assert.match(put, /await writeBackPublishedEventToNotion\([\s\S]*?\.catch\(/);
  assert.match(put, /await syncSavedNotionRecord\([\s\S]*?\.catch\(/);
  assert.match(put, /notionWarnings\.push/);
  assert.match(put, /await acknowledgeAdminPublication\([\s\S]*?\.catch\(/);
  assert.match(editor, /data\.notionWarnings\?\.length/);
  assert.match(editor, /Fotografia je uložená v Admine, ale jej URL zatiaľ nie je potvrdená v Notione/);
  assert.match(put, /eventPreserveUneditedAdminFields/);
  assert.match(put, /eventChangedAdminFields/);
});

test("publication, Google Place and quick edits keep existing event-only paths", () => {
  assert.match(store, /if \(managedEventGeoSourceChanged\(existing, event\)\)/);
  assert.match(store, /await reconcileManagedEventGeo\(event\.id, editorEmail, database\)/);
  assert.match(store, /GOOGLE_CONFIRMATION_CONFLICT/);
  assert.match(store, /WHERE id=\? AND updated_at=\?/);
  const quick = store.split("export async function quickEditManagedEvent(")[1] ?? "";
  assert.match(quick, /WHERE id = \? AND updated_at = \?/);
  assert.match(quick, /nextManagedEventUpdatedAt\(updatedAt\)/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /quickEditManagedEvent/);
  assert.match(editor, /status: nextStatus/);
  assert.match(editor, /<AdminProfileGoogleMaps/);
  assert.match(editor, /<AdminEventMarkdownEditor/);
  assert.match(editor, /<AdminSeoFields/);
  assert.match(createRoute, /createManagedEvent/);
  assert.doesNotMatch(createRoute, /expectedUpdatedAt/);
});
