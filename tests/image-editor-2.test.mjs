import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeImageDisplayConfig, readImageDisplayConfig, DEFAULT_THUMBNAIL, DEFAULT_DETAIL, legacyArticleThumbnail } from "../lib/image-display.ts";

const read = (path) => readFileSync(path, "utf8");

test("IMAGE-EDITOR-2 bounded modes, valid numeric fields, legacy event fallback", () => {
  assert.deepEqual(normalizeImageDisplayConfig({ mode: "crop", x: -11, y: 150, zoom: 9 }, "thumbnail"), { mode: "crop", x: 0, y: 100, zoom: 2.5 });
  assert.deepEqual(normalizeImageDisplayConfig({ mode: "natural", x: 50, y: 50, zoom: 1 }, "detail"), DEFAULT_DETAIL);
  assert.throws(() => normalizeImageDisplayConfig({ mode: "natural", x: 50, y: 50, zoom: 1 }, "thumbnail"), /režim/);
  assert.throws(() => normalizeImageDisplayConfig({ mode: "auto", x: 50, y: 50, zoom: 1 }, "detail"), /režim/);
  assert.throws(() => normalizeImageDisplayConfig({ mode: "crop", x: Infinity, y: 50, zoom: 1 }, "detail"), /čísla/);
  assert.deepEqual(readImageDisplayConfig(JSON.stringify(DEFAULT_THUMBNAIL), "thumbnail"), DEFAULT_THUMBNAIL);
  assert.equal(readImageDisplayConfig("{broken", "thumbnail"), null);
  assert.equal(readImageDisplayConfig('{"mode":"invalid","x":50,"y":50,"zoom":1}', "detail"), null);
  assert.equal(legacyArticleThumbnail("contain")?.mode, "blur");
});
test("IMAGE-EDITOR-2 guides are frame-local, independent tabs, and touch/keyboard accessible", () => {
  const editor = read("components/image-display-editor.tsx");
  const css = read("components/image-display-editor.module.css");
  assert.match(editor, /Vycentrovať obrázok/);
  assert.match(editor, /x: 50, y: 50/);
  assert.match(editor, /change\(\{ \.\.\.current, x: 50, y: 50 \}\)/);
  assert.match(editor, /const isCentered = Math\.abs\(current\.x - 50\)/);
  assert.match(editor, /onPointerDown=\{onPointerDown\}/);
  assert.match(editor, /onPointerUp=\{onPointerEnd\}/);
  assert.match(editor, /onPointerCancel=\{onPointerEnd\}/);
  assert.match(editor, /onKeyDown=\{onPreviewKey\}/);
  assert.match(editor, /onPointerDown=\{showGuides\}/);
  assert.match(editor, /setDraftThumbnail\(value\)/);
  assert.match(editor, /setDraftDetail\(value\)/);
  assert.match(editor, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(editor, /entityLabel/);
  assert.match(editor, /thumbnailAspectRatio/);
  assert.match(css, /\.guides \{ position: absolute; inset: 0/);
  assert.match(css, /\.centerPoint/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /touch-action: none/);
});
test("IMAGE-EDITOR-2 six canonical entity tables have independent nullable JSON settings", () => {
  const sql = read("drizzle/0122_entity_image_display_config.sql");
  for (const table of ["managed_events", "directory_profiles", "help_cases", "help_organizations", "adoption_dogs", "lost_found_dog_reports"]) {
    assert.match(sql, new RegExp("ALTER TABLE " + table + " ADD COLUMN thumbnail_display_json TEXT"));
    assert.match(sql, new RegExp("ALTER TABLE " + table + " ADD COLUMN detail_display_json TEXT"));
  }
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE\s+\w+\s+SET/i);
  assert.match(read("scripts/production-d1-migrate.mjs"), /0122_entity_image_display_config\.sql/);
  assert.match(read(".github/workflows/production-d1-migrate.yml"), /APPLY-0122-psipedia-sk-db/);
});
test("IMAGE-EDITOR-2 six admin editors share the same dialog and persist both configs", () => {
  for (const file of ["components/admin-directory-editor.tsx","components/admin-event-editor.tsx","components/admin-help-editor.tsx","components/admin-organization-editor.tsx","components/admin-adoption-editor.tsx","components/admin-lost-found-editor.tsx"]) {
    const contents = read(file);
    assert.match(contents, /<ImageDisplayEditor /, file);
    assert.match(contents, /thumbnailImageDisplay/, file);
    assert.match(contents, /detailImageDisplay/, file);
    assert.match(contents, /onSave=/, file);
    assert.match(contents, /Upraviť zobrazenie/, file);
  }
});
test("IMAGE-EDITOR-2 public cards and detail components consume the same renderer", () => {
  for (const file of ["components/event-image.tsx","components/directory-card.tsx","components/help-card.tsx","components/adoption-card-media.tsx","components/lost-found-dogs-page.tsx","components/public-profile/public-profile-hero.tsx","components/help-details/help-detail-shell.tsx","components/adoption-detail.tsx","components/lost-found-dog-detail.tsx"]) {
    assert.match(read(file), /<ImageDisplay /, file);
  }
  assert.match(read("components/event-card.tsx"), /config=\{event\.thumbnailImageDisplay\}/);
  assert.match(read("components/event-detail.tsx"), /config=\{event\.detailImageDisplay\}/);
  assert.match(read("components/organization-profile-detail.tsx"), /imageConfig=\{presentation\.detailImageDisplay\}/);
  assert.match(read("components/adoption-catalog.tsx"), /imageConfig=\{dog\.thumbnailImageDisplay\}/);
});
test("IMAGE-EDITOR-2 store boundaries normalize and read configs, preserve previous and event legacy presentation", () => {
  for (const file of ["lib/event-store.ts", "lib/directory-store.ts", "lib/help-store.ts", "lib/help-organization-admin-input.ts", "lib/lost-found-dog-store.ts", "lib/adoption.ts"]) {
    assert.match(read(file), /normalizeImageDisplayConfig\(/, file);
  }
  for (const file of ["lib/event-store.ts", "lib/directory-store.ts", "lib/help-store.ts", "lib/help-organization-store.ts", "lib/lost-found-dog-store.ts", "lib/adoption-store.ts"]) {
    assert.match(read(file), /readImageDisplayConfig\(/, file);
  }
  const events = read("lib/event-store.ts");
  assert.match(events, /image_display/);
  assert.match(events, /payload\.imageDisplay === undefined \? existing\.imageDisplay/);
  assert.match(read("components/event-image.tsx"), /legacyMode=\{mode\}/);
});
test("IMAGE-EDITOR-2 SQL column/placeholder counts remain in sync for fixed INSERTs", () => {
  for (const [file, table] of [["lib/event-store.ts","managed_events"],["lib/help-store.ts","help_cases"],["lib/lost-found-dog-store.ts","lost_found_dog_reports"]]) {
    const sql = read(file);
    const re = new RegExp("INSERT INTO " + table + " \\(\\s*([\\s\\S]*?)\\) VALUES \\(\\s*([?,\\s]+)\\)");
    const match = sql.match(re);
    assert.ok(match, file);
    assert.equal(match[1].split(",").length, (match[2].match(/\?/g) ?? []).length, file);
  }
});
