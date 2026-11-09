import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (name) => readFileSync(name, "utf8");

test("service summaries and descriptions render independently for all categories", () => {
  const detail = file("components/directory-profile-detail.tsx");
  assert.match(detail, /showExcerpt=\{true\}/);
  assert.match(detail, /showExcerpt && presentation\.excerpt/);
  assert.match(detail, /<DetailParagraphs value=\{presentation\.description\}/);
  assert.match(detail, /presentation\.imageAlt \|\| "Fotografia služby "/);
});

test("events, help cases, organizations and adoptions retain both public texts", () => {
  assert.match(file("components/event-detail.tsx"), /event\.excerpt && <p/);
  assert.match(file("components/event-detail.tsx"), /event\.description && \(/);
  assert.match(file("components/help-details/help-detail-shell.tsx"), /item\.excerpt && <p/);
  assert.match(file("components/organization-profile-detail.tsx"), /lead=\{presentation\.shortDescription\}/);
  assert.match(file("components/organization-profile-detail.tsx"), /presentation\.description \? \(/);
  assert.match(file("components/adoption-detail.tsx"), /dog\.shortDescription && <p/);
  assert.match(file("components/adoption-detail.tsx"), /dog\.description/);
});

test("lost/found editor has independent short and long text with migration-safe reads and writes", () => {
  const editor = file("components/admin-lost-found-editor.tsx");
  const detail = file("components/lost-found-dog-detail.tsx");
  const store = file("lib/lost-found-dog-store.ts");
  const migration = file("drizzle/0162_lost_found_short_description.sql");
  assert.match(editor, /set\("shortDescription",next\)/);
  assert.match(editor, /shortDescription:state\.shortDescription/);
  assert.match(detail, /report\.shortDescription\?\.trim\(\)/);
  assert.match(detail, /report\.description/);
  assert.match(store, /hasShortDescriptionColumn/);
  assert.match(store, /selectWithOptionalShortDescription/);
  assert.match(migration, /ADD COLUMN short_description/);
  assert.doesNotMatch(detail, /report\.contactPhone|report\.contactEmail/);
});

test("directory organization and focus edit existing imported facts without changing service catalog", () => {
  const editor = file("components/admin-directory-editor.tsx");
  const route = file("app/api/admin/directory/[id]/route.ts");
  const sync = file("lib/notion-directory-sync.ts");
  const presentation = file("lib/directory-detail-presentation.ts");
  assert.match(editor, /directory-public-organization/);
  assert.match(editor, /directory-public-focus/);
  assert.match(editor, /\["Organizácia", publicOrganization\]/);
  assert.match(editor, /\["Zameranie", publicFocus\]/);
  assert.match(sync, /"Organizácia", "Zameranie"/);
  assert.match(sync, /source_data_json = json_set/);
  assert.match(route, /savePilotDirectoryMetadataField/);
  assert.match(presentation, /"Zameranie"/);
  assert.match(presentation, /"Organizácia"/);
});
