import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { EVENT_NOTION_FIELDS, eventChangedAdminFields } from "../lib/notion-event-field-contract.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("event photo alt and private notes are independent Notion editorial fields", () => {
  assert.equal(EVENT_NOTION_FIELDS.imageAlt, "Alt text obrázka");
  assert.equal(EVENT_NOTION_FIELDS.internalNotes, "Poznámky");
  const old = { imageAlt: "Fotografia", internalNotes: "iba ja", title: "Podujatie" };
  assert.deepEqual(eventChangedAdminFields(old, { ...old, imageAlt: "Pes na stope" }), ["imageAlt"]);
  assert.deepEqual(eventChangedAdminFields(old, { ...old, internalNotes: "Nová súkromná poznámka" }), ["internalNotes"]);
});

test("private notes are never put onto public DogEvent or in public event components", () => {
  const events = read("lib/events.ts");
  const store = read("lib/event-store.ts");
  const eventDetail = read("components/event-detail.tsx");
  const fromSql = store.slice(store.indexOf("function rowToEvent("),
    store.indexOf("function parseSeo(", store.indexOf("function rowToEvent(")));
  assert.doesNotMatch(events, /internalNotes|internal_notes/);
  assert.doesNotMatch(fromSql, /internalNotes|internal_notes/);
  assert.match(store, /getManagedEventInternalNotesById/);
  assert.match(eventDetail, /alt=\{event\.imageAlt/);
  assert.doesNotMatch(eventDetail, /internalNotes|internal_notes/);
});

test("additive event migration stores alt and notes without modifying existing records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
    db.exec("INSERT INTO managed_events (id,title) VALUES (145,'Akadémia Sírius')");
    db.exec(read("drizzle/0161_event_image_alt_private_notes.sql"));
    const row = db.prepare("SELECT image_alt,internal_notes,title FROM managed_events WHERE id=145").get();
    assert.equal(row.image_alt, "");
    assert.equal(row.internal_notes, "");
    assert.equal(row.title, "Akadémia Sírius");
  } finally { db.close(); }
});

test("one GEO API is used by the three profile types, including unlinks", () => {
  const types = read("lib/geo.ts");
  const client = read("components/admin-profile-google-maps.tsx");
  const org = read("components/admin-organization-editor.tsx");
  const orgAlias = read("app/api/admin/organizations/[id]/google-place/route.ts");
  const api = read("app/api/admin/geo/[targetType]/[id]/route.ts");
  const store = read("lib/geo-store.ts");
  for (const type of ["DIRECTORY_PROFILE", "MANAGED_EVENT", "ORGANIZATION_LOCATION"])
    assert.ok(types.includes(type));
  assert.match(client, /action: "detach-google-place"/);
  assert.match(client, /expectedGeoRevision: snapshot\.point\.updatedAt/);
  assert.match(org, /targetId=\{location\.id\}/);
  assert.match(orgAlias, /sharedPOST\(request, target\)/);
  assert.match(api, /detachGooglePlace\(/);
  assert.match(store, /GOOGLE_PLACE_UNLINK_CONFLICT/);
  const unlink = store.slice(store.indexOf("export async function detachGooglePlace"),
    store.indexOf("export async function applyGooglePlaceResolution"));
  for (const field of ["google_place_id=NULL", "latitude=NULL", "longitude=NULL", "provider=NULL",
    "resolved_source_fingerprint=NULL"])
    assert.ok(unlink.includes(field), "missing cleanup: " + field);
  assert.doesNotMatch(unlink, /UPDATE managed_events|UPDATE directory_profiles|UPDATE organization_locations/);
  assert.match(unlink, /GOOGLE_PLACE_UNLINKED/);
});
