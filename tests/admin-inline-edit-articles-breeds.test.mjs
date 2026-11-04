import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Articles and Puppies reuse one grid and an authenticated excerpt-only edit", () => {
  const route = read("app/api/admin/articles/[id]/route.ts");
  const store = read("lib/article-store.ts");
  const ui = read("components/admin-dashboard.tsx");
  assert.match(read("app/admin/clanky/page.tsx"), /AdminDashboard/);
  assert.match(read("app/admin/steniatka/page.tsx"), /AdminDashboard/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /action === "set-inline-excerpt"/);
  assert.match(route, /Object\.keys\(values\)\.length !== 3/);
  assert.match(route, /updateManagedArticleInlineExcerpt\(/);
  assert.match(route, /writeBackDraftArticleContentToNotion/);
  assert.match(store, /export async function updateManagedArticleInlineExcerpt/);
  assert.match(store, /WHERE id=\? AND updated_at=\? AND status=\? RETURNING id/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"set-inline-excerpt"/);
  assert.match(ui, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(ui, /styles\.inlineDesktop/);
});

test("Article row SQL preserves status, Lexical blocks, SEO, slug and all other content", () => {
  const code = read("lib/article-store.ts");
  const start = code.indexOf("export async function updateManagedArticleInlineExcerpt");
  const end = code.indexOf("export async function updateManagedArticle(", start);
  assert.ok(start > -1 && end > start);
  const match = code.slice(start, end).match(/database\.prepare\(`(UPDATE managed_articles[\s\S]*?RETURNING id)`\)/);
  assert.ok(match, "Article narrow SQL must be present");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_articles(id INTEGER PRIMARY KEY, excerpt TEXT, updated_at TEXT, updated_by TEXT, status TEXT, slug TEXT, blocks_json TEXT, seo_title TEXT)");
    const add = db.prepare("INSERT INTO managed_articles VALUES(?,?,?,?,?,?,?,?)");
    add.run(1, "Starý popis", "v1", "owner", "draft", "source-slug", '[{"type":"text"}]', "SEO nadpis");
    add.run(2, "Iný popis", "v1", "owner", "published", "published-slug", "[]", "SEO");
    const stmt = db.prepare(match[1]);
    assert.equal(stmt.get("Nový popis", "v2", "editor", 1, "stale", "draft"), undefined);
    assert.equal(stmt.get("Nový popis", "v2", "editor", 1, "v1", "published"), undefined);
    assert.equal(stmt.get("Nový popis", "v2", "editor", 1, "v1", "draft").id, 1);
    const row = db.prepare("SELECT * FROM managed_articles WHERE id=1").get();
    assert.equal(row.excerpt, "Nový popis");
    assert.equal(row.status, "draft");
    assert.equal(row.slug, "source-slug");
    assert.equal(row.blocks_json, '[{"type":"text"}]');
    assert.equal(row.seo_title, "SEO nadpis");
    assert.equal(db.prepare("SELECT excerpt FROM managed_articles WHERE id=2").get().excerpt, "Iný popis");
  } finally { db.close(); }
});

test("Breeds intro editor keeps identity and relationships and uses draft Notion writeback", () => {
  const store = read("lib/breed-store.ts");
  const route = read("app/api/admin/breeds/[id]/route.ts");
  const ui = read("components/admin-breed-dashboard.tsx");
  assert.match(store, /export async function updateManagedBreedInlineIntro/);
  assert.match(store, /SET intro=\?, updated_at=\?/);
  assert.match(store, /WHERE id=\? AND updated_at=\? RETURNING id/);
  assert.match(store, /"officialFciName"\s*\|\s*"intro"\s*\|\s*"updatedAt"/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /body\.action !== "set-inline-intro"/);
  assert.match(route, /Object\.keys\(body\)\.length !== 3/);
  assert.match(route, /writeBackDraftBreedEditorialToNotion/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"set-inline-intro"/);
  assert.match(ui, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(ui, /styles\.inlineDesktop/);
});

test("Breed intro CAS changes only intro and timestamp, preserving canonical FCI identity", () => {
  const store = read("lib/breed-store.ts");
  const section = store.slice(store.indexOf("export async function updateManagedBreedInlineIntro"),store.indexOf("export async function updateManagedBreed("));
  const match = section.match(/database\s*\.prepare\(\s*`(UPDATE managed_breeds[\s\S]*?RETURNING id)`\s*,?\s*\)/);
  assert.ok(match, "Breed CAS SQL missing");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,intro TEXT,updated_at TEXT,slug TEXT,fci_number INTEGER,seo_json TEXT)");
    db.prepare("INSERT INTO managed_breeds VALUES(?,?,?,?,?,?)").run(1,"Starý úvod","v1","labrador-retriever",122,'{"title":"FCI"}');
    const stmt = db.prepare(match[1]);
    assert.equal(stmt.get("Nový úvod","v2",1,"stale"), undefined);
    assert.equal(stmt.get("Nový úvod","v2",1,"v1").id,1);
    const row = db.prepare("SELECT * FROM managed_breeds WHERE id=1").get();
    assert.equal(row.intro,"Nový úvod");
    assert.equal(row.slug,"labrador-retriever");
    assert.equal(row.fci_number,122);
    assert.equal(row.seo_json,'{"title":"FCI"}');
  } finally { db.close(); }
});
