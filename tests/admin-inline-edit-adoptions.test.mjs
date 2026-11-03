import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("adoption inline edit uses protected canonical server path and Notion sync", () => {
  const api = read("app/api/admin/adoptions/[id]/route.ts");
  const store = read("lib/adoption-store.ts");
  const ui = read("components/admin-adoption-dashboard.tsx");
  assert.match(api, /export async function PATCH/);
  assert.match(api, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(api, /body\.action !== "set-inline-name"/);
  assert.match(api, /Object\.keys\(body\)\.length !== 3/);
  assert.match(api, /updateAdoptionInlineName\(id, body\.name, body\.expectedUpdatedAt, auth\.user\.email\)/);
  assert.match(api, /agenda: "adoptions"/);
  assert.match(store, /export async function updateAdoptionInlineName/);
  assert.match(store, /buildAdoptionSearchText\(/);
  assert.match(store, /status <> 'ARCHIVED' RETURNING id/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"set-inline-name"/);
  assert.match(ui, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(ui, /styles\.inlineDesktop/);
  assert.match(ui, /Zoznam adopcií – mobilné karty/);
});

test("adoption update SQL never changes lifecycle, slug, source or matching version of other profiles", () => {
  const store = read("lib/adoption-store.ts");
  const section = store.slice(store.indexOf("export async function updateAdoptionInlineName"), store.indexOf("export async function createManagedAdoption("));
  const match = section.match(/database\.prepare\(`(UPDATE adoption_dogs[\s\S]*?RETURNING id)`/);
  assert.ok(match, "Adoption update SQL missing");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,name TEXT,search_text TEXT,updated_at TEXT,updated_by TEXT,status TEXT,slug TEXT,organization_id INTEGER)");
    const insert=db.prepare("INSERT INTO adoption_dogs VALUES(?,?,?,?,?,?,?,?)");
    insert.run(1,"Neo","neo","v1","editor","ACTIVE","neo-slug",47);
    insert.run(2,"Archív","archiv","v1","editor","ARCHIVED","archiv-slug",48);
    const stmt=db.prepare(match[1]);
    assert.equal(stmt.get("Rex","rex","v2","editor",1,"outdated"),undefined);
    assert.equal(stmt.get("Rex","rex","v2","editor",2,"v1"),undefined);
    assert.equal(stmt.get("Rex","rex","v2","editor",1,"v1").id,1);
    const item=db.prepare("SELECT * FROM adoption_dogs WHERE id=1").get();
    assert.equal(item.name,"Rex");
    assert.equal(item.search_text,"rex");
    assert.equal(item.slug,"neo-slug");
    assert.equal(item.status,"ACTIVE");
    assert.equal(item.organization_id,47);
  } finally { db.close(); }
});
