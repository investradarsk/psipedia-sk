import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("native Help inline edits preserve domain isolation and optimistic revision checks", () => {
  const route = read("app/api/admin/help/[id]/route.ts");
  assert.match(route, /export async function PATCH\(/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /isHelpAdminCreateCategory\(input\.expectedCategory\)/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /Object\.keys\(changes\)\.length !== 2/);
  assert.match(route, /\["title", "excerpt"\]/);
  assert.match(route, /AND updated_at=\?6 AND category=\?7 AND \$\{HELP_ADMIN_DOMAIN_SQL\}/);
  assert.match(route, /agenda: "help-cases"/);
  const grid = read("components/admin-help-unified-table.tsx");
  assert.match(grid, /canInlineEditHelp = canBulkEdit/);
  assert.match(grid, /"set-inline-editorial"/);
  assert.match(grid, /expectedCategory: category/);
  assert.match(grid, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(grid, /<AdminInlineRowActions/);
  const page = read("app/admin/pomoc-psom/page.tsx");
  assert.match(page, /inlineHelp: \{ title: item\.title, excerpt: item\.excerpt, editable: true \}/);
});

test("native Help inline SQL changes only the selected versioned domain row and only editorial fields", () => {
  const route = read("app/api/admin/help/[id]/route.ts");
  const block = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  const m = block.match(/db\.prepare\(`(UPDATE help_cases[\s\S]*?RETURNING id)`\)/);
  assert.ok(m, "inline native Help SQL not found");
  const statement = m[1].replace("${HELP_ADMIN_DOMAIN_SQL}", "category IN ('dobrovolnictvo','zbierky','docasna-opatera')");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_cases(id INTEGER PRIMARY KEY,category TEXT,title TEXT,excerpt TEXT,slug TEXT,status TEXT,updated_at TEXT,updated_by TEXT)");
    const ins = db.prepare("INSERT INTO help_cases VALUES(?,?,?,?,?,?,?,?)");
    ins.run(1, "dobrovolnictvo", "Pomoc so psami", "Starý text", "pomoc-so-psami", "draft", "v1", "seed");
    ins.run(2, "utulky", "Legacy útulok", "Starý text", "legacy", "draft", "v1", "seed");
    ins.run(3, "zbierky", "Zbierka", "Pôvodný popis", "zbierka", "published", "v1", "seed");
    const sql = db.prepare(statement);
    assert.equal(sql.get("Zmenené", "Popis", "v2", "editor", 1, "old", "dobrovolnictvo"), undefined);
    assert.equal(sql.get("Zmenené", "Popis", "v2", "editor", 1, "v1", "zbierky"), undefined);
    assert.equal(sql.get("Zmenené", "Popis", "v2", "editor", 2, "v1", "utulky"), undefined);
    assert.equal(sql.get("Zmenené", "Popis", "v2", "editor", 1, "v1", "dobrovolnictvo").id, 1);
    assert.equal(sql.get("Nový popis", "Popis", "v3", "editor", 3, "v1", "zbierky").id, 3);
    const item = db.prepare("SELECT * FROM help_cases WHERE id=1").get();
    assert.equal(item.title, "Zmenené");
    assert.equal(item.excerpt, "Popis");
    assert.equal(item.slug, "pomoc-so-psami");
    assert.equal(item.status, "draft");
    assert.equal(db.prepare("SELECT title FROM help_cases WHERE id=2").get().title, "Legacy útulok");
  } finally { db.close(); }
});
