import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inferSmartImageFit, normalizeSmartImageMode } from "../lib/smart-image.ts";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("photos fill cards and logos/posters remain fully visible", () => {
  assert.equal(inferSmartImageFit({width:1600,height:900,src:"/media/dog.webp"}), "cover");
  assert.equal(inferSmartImageFit({width:3000,height:700}), "contain");
  assert.equal(inferSmartImageFit({width:700,height:1200}), "contain");
  assert.equal(inferSmartImageFit({width:1600,height:900,src:"/media/club-logo.webp"}), "contain");
  assert.equal(inferSmartImageFit({width:1600,height:900,lightBackgroundShare:.6}), "contain");
  assert.equal(inferSmartImageFit({width:1600,height:900,lightBackgroundShare:.1}), "cover");
});
test("admin can persist only supported fitting modes", () => {
  assert.equal(normalizeSmartImageMode(undefined), "auto");
  assert.equal(normalizeSmartImageMode("cover"), "cover");
  assert.equal(normalizeSmartImageMode("contain"), "contain");
  assert.throws(() => normalizeSmartImageMode("bad"), /nie je platný/);
});
test("homepage and entity cards use the shared smart image renderer", () => {
  // Homepage still owns direct SmartCardImage instances. Other entities route
  // through ImageDisplay, which delegates real photographs to SmartCardImage.
  assert.match(read("app/page.tsx"), /<SmartCardImage/);
  for (const path of ["components/directory-card.tsx", "components/help-card.tsx"]) {
    assert.match(read(path), /<ImageDisplay[^>]*context="thumbnail"[^>]*config=/, path);
  }
  const renderer = read("components/image-display.tsx");
  assert.match(renderer, /<SmartCardImage/);
  assert.match(renderer, /legacyMode/);
  const eventImage = read("components/event-image.tsx");
  assert.match(eventImage, /real \? <ImageDisplay/);
  assert.match(eventImage, /legacyMode=\{mode\}/);
  assert.match(eventImage, /getEventFallbackImage\(eventType\)/);
  for (const path of ["components/event-card.tsx", "components/event-detail.tsx"]) {
    assert.match(read(path), /<EventImage[^>]*mode=\{event\.imageDisplay\}/, path);
  }
  assert.match(read("components/event-card.tsx"), /config=\{event\.thumbnailImageDisplay\}/);
  assert.match(read("components/event-detail.tsx"), /config=\{event\.detailImageDisplay\}/);
  assert.ok(read("app/page.tsx").includes("mode={event.imageDisplay}"));
});
test("legacy event image mode survives roundtrip alongside independent new overrides", () => {
  const editor = read("components/admin-event-editor.tsx");
  const store = read("lib/event-store.ts");
  assert.match(editor, /event\?\.imageDisplay \?\? "auto"/);
  assert.match(editor, /<ImageDisplayEditor/);
  assert.match(editor, /thumbnailImageDisplay, detailImageDisplay/);
  assert.match(editor, /imageDisplay: imageDisplay/);
  assert.match(store, /image_display = \?/);
  assert.match(store, /thumbnail_display_json = \?, detail_display_json = \?/);
  assert.match(store, /payload\.imageDisplay === undefined \? existing\.imageDisplay/);
  assert.match(read("drizzle/0118_event_image_display.sql"), /DEFAULT 'auto'/);
  const migration = read("drizzle/0122_entity_image_display_config.sql");
  assert.match(migration, /ALTER TABLE managed_events ADD COLUMN thumbnail_display_json TEXT/);
  assert.match(migration, /ALTER TABLE managed_events ADD COLUMN detail_display_json TEXT/);
});

test("all article image surfaces use shared non-destructive rendering with legacy focal compatibility", () => {
  for (const path of [
    "components/article-card.tsx",
    "components/article-detail.tsx",
    "components/public-visual-system/public-visual-system.tsx",
  ]) assert.match(read(path), /<ImageDisplay/, path);
  assert.match(read("components/smart-card-image.tsx"), /avoidSevereArticleCrop/);
  assert.match(read("components/smart-card-image.tsx"), /objectPosition/);
  assert.match(read("components/admin-article-editor.tsx"), /<ImageDisplayEditor/);
  assert.match(read("lib/article-store.ts"), /image_focus_y = \?/);
});

test("IMAGE-EDITOR-1 renders article thumbnails and detail using independently saved configurations", () => {
  for (const path of ["components/article-card.tsx", "components/article-detail.tsx", "components/public-visual-system/public-visual-system.tsx"]) {
    assert.match(read(path), /<ImageDisplay/, path);
  }
  assert.match(read("components/article-card.tsx"), /config=\{article\.thumbnailImageDisplay\}/);
  assert.match(read("components/article-list-item.tsx"), /config: article\.thumbnailImageDisplay/);
  assert.match(read("components/article-detail.tsx"), /config=\{detailImageConfig\}/);
});
