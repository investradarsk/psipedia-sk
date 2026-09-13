import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");

function helpImportSql() {
  const marker = "INSERT INTO help_cases (";
  const insertStart = source.indexOf(marker);
  assert.notEqual(insertStart, -1, "help_cases INSERT must exist");

  const templateStart = source.lastIndexOf("`", insertStart);
  const templateEnd = source.indexOf("`).bind(", insertStart);
  assert.notEqual(templateStart, -1, "help_cases INSERT must be inside a SQL template");
  assert.notEqual(templateEnd, -1, "help_cases INSERT template must be bound");

  return source.slice(templateStart + 1, templateEnd);
}

test("helpItems import re-runs the read-only preview gate before any write statements", () => {
  const previewCall = source.indexOf("const helpPreview = await previewHelpItems(");
  const statements = source.indexOf("const statements: D1PreparedStatement[] = [];");
  const unsafeGate = source.indexOf("helpPreview.rows.filter((row) => !row.safeForImport)");

  assert.notEqual(previewCall, -1, "helpItems import must call previewHelpItems");
  assert.notEqual(unsafeGate, -1, "helpItems import must reject rows that are not SAFE FOR IMPORT");
  assert.ok(previewCall < statements, "preview gate must run before write statements are prepared");
});

test("help_cases import is create-only and cannot update an existing (category, slug)", () => {
  const sql = helpImportSql();
  assert.match(sql, /INSERT INTO help_cases/i);
  assert.doesNotMatch(sql, /ON\s+CONFLICT/i);
  assert.doesNotMatch(sql, /DO\s+UPDATE/i);
});

test("helpItems unsafe preview abort message tells admin to preview again", () => {
  assert.match(source, /Import Pomoc psom zastavený/);
  assert.match(source, /Spustite Preview znova/);
});
