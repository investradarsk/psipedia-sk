import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const route = read("app/api/admin/directory/[id]/route.ts");
const directory = read("components/admin-directory-dashboard.tsx");
const events = read("components/admin-event-dashboard.tsx");

test("shared inline controls expose accessible save, cancel, text, and select inputs without performing writes", () => {
  const component = read("components/admin-inline-edit-controls.tsx");
  assert.match(component, /export function AdminInlineRowActions/);
  assert.match(component, /export function AdminInlineCellInput/);
  assert.match(component, /export function AdminInlineCellSelect/);
  assert.match(component, /onSave: \(\) => void/);
  assert.match(component, /onCancel: \(\) => void/);
  assert.match(component, /aria-label=\{label\}/);
  assert.doesNotMatch(component, /fetch\(|\/" + "api\//);
});

test("directory quick edit exposes only name and excerpt and requires same-origin authenticated CAS", () => {
  assert.match(route, /body\.action === "set-inline-editorial"/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /request\.headers\.get\("origin"\) !== new URL\(request\.url\)\.origin/);
  assert.match(route, /Object\.keys\(data\)\.length !== 2/);
  assert.match(route, /\["name", "excerpt"\]/);
  assert.match(route, /name\.length > 180 \|\| excerpt\.length > 700/);
  assert.match(route, /WHERE id=\?5 AND updated_at=\?6 AND status IN \('draft','published'\)/);
  assert.match(route, /runNotionDirectorySyncSweep/);
  assert.match(route, /targetProfileId: id/);
  assert.doesNotMatch(route.slice(route.indexOf('if (body.action === "set-inline-editorial")'),route.indexOf('if (body.action === "set-category-filters")')), /SET (?:slug|category|source_data_json|services_json|city|region|status)=/);
});

test("directory inline mutation refuses stale, archived, and foreign IDs and leaves all unrelated fields unchanged", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles(
      id INTEGER PRIMARY KEY, name TEXT, excerpt TEXT, slug TEXT, status TEXT, 
      source_data_json TEXT, city TEXT, updated_at TEXT, updated_by TEXT
    );`);
    const initial = ["Pôvodný názov", "Starý popis", "original-slug", "draft", '{"keep":true}', "Nitra", "v1", "seed"];
    db.prepare("INSERT INTO directory_profiles(id,name,excerpt,slug,status,source_data_json,city,updated_at,updated_by) VALUES(1,?,?,?,?,?,?,?,?)").run(...initial);
    db.prepare("INSERT INTO directory_profiles(id,name,excerpt,slug,status,source_data_json,city,updated_at,updated_by) VALUES(2,?,?,?,?,?,?,?,?)").run(...initial);
    db.prepare("UPDATE directory_profiles SET status='archived' WHERE id=2").run();

    // This is the exact SQL body from the protected PATCH branch, not a
    // synthetic alternative update statement.
    const block = route.slice(route.indexOf('if (body.action === "set-inline-editorial")'),route.indexOf('if (body.action === "set-category-filters")'));
    const match = block.match(/await db\.prepare\(`([\s\S]*?UPDATE directory_profiles[\s\S]*?RETURNING id)`\)/);
    assert.ok(match, "exact directory CAS UPDATE not found");
    const stmt = db.prepare(match[1]);
    assert.equal(stmt.get("Zmenený názov", "Nový popis", "v2", "editor", 1, "stale"), undefined);
    assert.equal(stmt.get("Zmenený názov", "Nový popis", "v2", "editor", 2, "v1"), undefined);
    assert.equal(stmt.get("Zmenený názov", "Nový popis", "v2", "editor", 3, "v1"), undefined);
    assert.equal(stmt.get("Zmenený názov", "Nový popis", "v2", "editor", 1, "v1").id, 1);
    const edited = db.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
    assert.equal(edited.name, "Zmenený názov");
    assert.equal(edited.excerpt, "Nový popis");
    assert.equal(edited.slug, "original-slug");
    assert.equal(edited.city, "Nitra");
    assert.equal(edited.status, "draft");
    assert.equal(edited.source_data_json, '{"keep":true}');
    assert.equal(db.prepare("SELECT name FROM directory_profiles WHERE id=2").get().name, "Pôvodný názov");
  } finally { db.close(); }
});

test("directory service list and main directory both use same grid, inline controls and compare-and-set", () => {
  const one = read("app/admin/adresar/page.tsx");
  const two = read("app/admin/sluzby-pre-psov/page.tsx");
  assert.match(one, /<AdminDirectoryDashboard/);
  assert.match(two, /<AdminDirectoryDashboard/);
  assert.match(directory, /AdminInlineRowActions/);
  assert.match(directory, /AdminInlineCellInput/);
  assert.match(directory, /"set-inline-editorial"/);
  assert.match(directory, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(directory, /"name", label: "Profil"/);
  assert.match(directory, /"excerpt", label: "Krátky popis"/);
  assert.match(directory, /profile\.status !== "archived"/);
  assert.match(read("lib/directory-admin-query.ts"), /SELECT id, slug, name, excerpt, category/);
});

test("events inline editing uses existing validated quick-edit endpoint without changing venue or publish status", () => {
  const route = read("app/api/admin/events/[id]/route.ts");
  assert.match(events, /AdminInlineRowActions/);
  assert.match(events, /beginInlineEdit\(event\)/);
  assert.match(events, /AdminInlineCellSelect/);
  assert.match(events, /checked=\{quickCancelled\}/);
  assert.match(events, /quickEvent\.updatedAt/);
  assert.match(events, /method: "PATCH"/);
  assert.match(events, /setInlineEventId\(null\)/);
  assert.match(route, /quickEditManagedEvent/);
  assert.match(route, /syncSavedNotionRecord/);
});
