import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { hasGeminiCanonicalOrigin } from "../lib/gemini-native-editor-origin.ts";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiImportAgenda } from "../lib/gemini-notion-provenance.ts";

const file = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("signed Gemini origin survives publication and matches only the exact D1 agenda/id", async () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE gemini_notion_created_pages (notion_page_id TEXT, import_agenda TEXT, canonical_entity_id INTEGER, imported_at TEXT);");
  sql.prepare("INSERT INTO gemini_notion_created_pages VALUES (?,?,?,?)").run("notion-signature", "directory", 91, "2026-10-22T12:00:00Z");
  sql.prepare("INSERT INTO gemini_notion_created_pages VALUES (?,?,?,?)").run("not-imported", "events", 92, null);
  const db = { prepare(statement) { return { bind(...args) { return { async first() { return sql.prepare(statement).get(...args) ?? null; } }; } }; } };
  try {
    assert.equal(await hasGeminiCanonicalOrigin(db, "directory", 91), true);
    assert.equal(await hasGeminiCanonicalOrigin(db, "events", 91), false);
    assert.equal(await hasGeminiCanonicalOrigin(db, "events", 92), false);
    assert.equal(await hasGeminiCanonicalOrigin(db, "directory", 0), false);
  } finally { sql.close(); }
});
test("all 22 categories are covered by the six existing native editor pages", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  const pages = {
    directory: "adresar", events: "podujatia", organizations: "organizacie",
    adoptions: "adopcie", "help-cases": "pomoc", "lost-found": "stratene-najdene",
  };
  for (const category of geminiAutomationCatalog) {
    const agenda = geminiImportAgenda(category.stableKey);
    const path = "app/admin/" + pages[agenda] + "/[id]/page.tsx";
    assert.match(file(path), /AdminGeminiOriginBadge/);
  }
  assert.match(file("components/admin-gemini-automation-settings.tsx"), /nativeOnly/);
  assert.match(file("components/admin-gemini-canonical-drafts.tsx"), /geminiCanonicalEditorUrl\(row\)/);
  assert.doesNotMatch(file("components/admin-gemini-canonical-drafts.tsx"), /AdminGeminiAgendaDraftEditor|AdminDirectoryEditor/);
});
