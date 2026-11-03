import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("organization inline summary reuses protected canonical API and never edits a full record", () => {
  const api = read("app/api/admin/organizations/[id]/route.ts");
  const writer = read("lib/help-organization-admin-write.ts");
  const ui = read("components/admin-organization-publication-dashboard.tsx");
  assert.match(api, /body\.action === "set-inline-summary"/);
  assert.match(api, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(api, /Object\.keys\(fields\)\.length !== 2/);
  assert.match(api, /\["name", "shortDescription"\]/);
  assert.match(api, /updateOrganizationInlineSummaryFromAdmin/);
  assert.match(api, /agenda: "organizations"/);
  assert.match(api, /invalidateVersionedPublicHtmlCacheUrl/);
  assert.match(writer, /export async function updateOrganizationInlineSummaryFromAdmin/);
  assert.match(writer, /WHERE id=\? AND updated_at=\? AND status IN \('DRAFT','PUBLISHED'\)/);
  assert.match(writer, /AND archived_at IS NULL/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"set-inline-summary"/);
  assert.match(ui, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(ui, /item\.status !== "ARCHIVED"/);
});

test("organization SQL updates only name and short description under revision guard", () => {
  const writer = read("lib/help-organization-admin-write.ts");
  const block = writer.slice(writer.indexOf("export async function updateOrganizationInlineSummaryFromAdmin"),writer.indexOf("export async function changeOrganizationPublicationFromAdmin"));
  const match = block.match(/db\.prepare\(`(UPDATE help_organizations[\s\S]*?archived_at IS NULL)`/);
  assert.ok(match, "Organization narrow CAS not present");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,name TEXT,short_description TEXT,status TEXT,slug TEXT,updated_at TEXT,updated_by TEXT,archived_at TEXT)");
    db.prepare("INSERT INTO help_organizations VALUES(?,?,?,?,?,?,?,?)").run(1,"Pôvodná","Staré","DRAFT","source-slug","v1","seed",null);
    db.prepare("INSERT INTO help_organizations VALUES(?,?,?,?,?,?,?,?)").run(2,"Archív","Staré","ARCHIVED","archived-slug","v1","seed","2026");
    const sql = db.prepare(match[1]);
    assert.equal(sql.run("Nové","Popis","v2","editor",1,"wrong").changes,0);
    assert.equal(sql.run("Nové","Popis","v2","editor",2,"v1").changes,0);
    assert.equal(sql.run("Nové","Popis","v2","editor",1,"v1").changes,1);
    const row = db.prepare("SELECT * FROM help_organizations WHERE id=1").get();
    assert.equal(row.name,"Nové");
    assert.equal(row.short_description,"Popis");
    assert.equal(row.slug,"source-slug");
    assert.equal(row.status,"DRAFT");
    assert.equal(row.archived_at,null);
  } finally { db.close(); }
});

test("lost-found name quick edit preserves moderation, private data and updates search text", () => {
  const api = read("app/api/admin/lost-found/[id]/route.ts");
  const store = read("lib/lost-found-dog-store.ts");
  const ui = read("components/admin-lost-found-dashboard.tsx");
  assert.match(api, /export async function PATCH/);
  assert.match(api, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(api, /Object\.keys\(input\)\.length !== 3/);
  assert.match(api, /input\.action !== "set-inline-dog-name"/);
  assert.match(api, /agenda: "lost-found"/);
  assert.match(store, /export async function updateAdminDogReportInlineName/);
  assert.match(store, /before\.status === "ARCHIVED"/);
  assert.match(store, /before\.duplicate_of_id !== null/);
  assert.match(store, /SET dog_name=\?,search_text=\?,updated_at=\?/);
  assert.match(store, /AND duplicate_of_id IS NULL RETURNING id/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"set-inline-dog-name"/);
  assert.match(ui, /expectedUpdatedAt: draft\.expectedUpdatedAt/);
  assert.match(read("components/admin-lost-found.module.css"), /max-width: 899px/);
});

test("lost-found exact SQL preserves statuses, PII, slug and all other source columns", () => {
  const store = read("lib/lost-found-dog-store.ts");
  const block = store.slice(store.indexOf("export async function updateAdminDogReportInlineName"), store.indexOf("export async function updateAdminDogReport("));
  const match = block.match(/database\.prepare\(`(UPDATE lost_found_dog_reports[\s\S]*?RETURNING id)`/);
  assert.ok(match,"Lost-found narrow CAS SQL missing");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,dog_name TEXT,search_text TEXT,updated_at TEXT,status TEXT,duplicate_of_id INTEGER,slug TEXT,source TEXT)");
    db.prepare("INSERT INTO lost_found_dog_reports VALUES(?,?,?,?,?,?,?,?)").run(1,"Neo","neo","v1","ACTIVE",null,"neo-slug","PUBLIC");
    db.prepare("INSERT INTO lost_found_dog_reports VALUES(?,?,?,?,?,?,?,?)").run(2,"Archív","archiv","v1","ARCHIVED",null,"archive-slug","EDITORIAL");
    db.prepare("INSERT INTO lost_found_dog_reports VALUES(?,?,?,?,?,?,?,?)").run(3,"Duplikát","duplicita","v1","ACTIVE",1,"dup-slug","PUBLIC");
    const stmt=db.prepare(match[1]);
    assert.equal(stmt.get("Rex","rex","v2",1,"wrong"),undefined);
    assert.equal(stmt.get("Rex","rex","v2",2,"v1"),undefined);
    assert.equal(stmt.get("Rex","rex","v2",3,"v1"),undefined);
    assert.equal(stmt.get("Rex","rex","v2",1,"v1").id,1);
    const a=db.prepare("SELECT * FROM lost_found_dog_reports WHERE id=1").get();
    assert.equal(a.dog_name,"Rex");
    assert.equal(a.search_text,"rex");
    assert.equal(a.status,"ACTIVE");
    assert.equal(a.slug,"neo-slug");
    assert.equal(a.source,"PUBLIC");
  } finally {db.close();}
});
