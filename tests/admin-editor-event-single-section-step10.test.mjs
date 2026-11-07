import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EDITOR-10/11: seven mounted event panels with single-section navigation", () => {
  const src = read("components/admin-event-editor.tsx");
  const css = read("components/admin-event-editor.module.css");
  const ids = ["basics", "schedule", "location", "contacts", "details", "media", "seo"];
  for (const name of ids) {
    assert.match(src, new RegExp('<EditorSection id="event-' + name + '"'));
  }
  assert.equal((src.match(/<EditorSection id="event-/g) ?? []).length, 7);
  assert.match(src, /sectionMode="switch"/);
  assert.match(src, /activeSectionId=\{activeEventSection\}/);
  assert.match(src, /onSectionChange=\{setActiveEventSection\}/);
  assert.match(src, /aria-label="Prechod medzi sekciami podujatia"/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
  assert.match(src, /<AdminEventMarkdownEditor/);
  assert.match(src, /<AdminProfileGoogleMaps/);
  assert.match(src, /<AdminGeoLocation/);
});

test("EDITOR-10: invalid publication reveals its section without blocking legacy draft/unpublish flow", () => {
  const src = read("components/admin-event-editor.tsx");
  assert.match(src, /<form id="event-editor-v3-form" noValidate/);
  assert.match(src, /status === "published" && nextStatus === "draft"/);
  assert.match(src, /nextStatus === "published" && status !== "published"/);
  assert.match(src, /setActiveEventSection\(missing\.section\)/);
  assert.match(src, /setActiveEventSection\("event-contacts"\)/);
  assert.match(src, /<AdminFormFeedback message=\{message\} error=\{error\} pending=\{saving\}/);
  assert.match(src, /onSubmit=\{\(submitEvent\)/);
  assert.match(src, /void save\("published"\)/);
  assert.match(src, /setConfirmUnpublish\(true\)/);
  assert.match(src, /<EditorUnsavedChangesGuard/);
});

test("EDITOR-10: additive optional contacts/fee persist through normalized D1 and appear publicly", () => {
  const editor = read("components/admin-event-editor.tsx");
  const store = read("lib/event-store.ts");
  const model = read("lib/events.ts");
  const schema = read("db/schema.ts");
  const sql = read("drizzle/0160_event_contacts_admission.sql");
  const detail = read("components/event-detail.tsx");
  for (const field of ["contactPhone", "contactEmail", "admissionFee"]) {
    assert.ok(editor.includes(field), "missing editor " + field);
    assert.ok(store.includes(field), "missing storage " + field);
    assert.ok(schema.includes(field), "missing schema " + field);
    assert.ok(model.includes(field), "missing model " + field);
    assert.ok(detail.includes(field), "missing public presentation " + field);
  }
  for (const column of ["contact_phone", "contact_email", "admission_fee"]) {
    assert.ok(sql.includes("ADD COLUMN " + column));
    assert.ok(store.includes(column));
  }
  const insert = store.match(/INSERT INTO managed_events \(([\s\S]*?)\) VALUES \(([^)]*)\)/);
  assert.ok(insert, "canonical INSERT exists");
  assert.equal(insert[1].split(",").filter(Boolean).length, (insert[2].match(/\?/g) ?? []).length);
  assert.match(store, /payload\.contactPhone === undefined \? existing\.contactPhone/);
  assert.match(store, /payload\.contactEmail === undefined \? existing\.contactEmail/);
  assert.match(store, /payload\.admissionFee === undefined \? existing\.admissionFee/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE managed_events/i);
});
