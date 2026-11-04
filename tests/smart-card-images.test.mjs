import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inferSmartImageFit, normalizeSmartImageMode } from "../lib/smart-image.ts";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("photos fill cards and logos/posters remain fully visible", () => {
  assert.equal(inferSmartImageFit({ width: 1600, height: 900, src: "/media/dog.webp" }), "cover");
  assert.equal(inferSmartImageFit({ width: 3000, height: 700 }), "contain");
  assert.equal(inferSmartImageFit({ width: 700, height: 1200 }), "contain");
  assert.equal(
    inferSmartImageFit({ width: 1600, height: 900, src: "/media/club-logo.webp" }),
    "contain",
  );
  assert.equal(
    inferSmartImageFit({ width: 1600, height: 900, lightBackgroundShare: 0.6 }),
    "contain",
  );
  assert.equal(
    inferSmartImageFit({ width: 1600, height: 900, lightBackgroundShare: 0.1 }),
    "cover",
  );
});
test("admin can persist only supported fitting modes", () => {
  assert.equal(normalizeSmartImageMode(undefined), "auto");
  assert.equal(normalizeSmartImageMode("cover"), "cover");
  assert.equal(normalizeSmartImageMode("contain"), "contain");
  assert.throws(() => normalizeSmartImageMode("bad"), /nie je platný/);
});
test("homepage and entity cards use the shared smart image renderer", () => {
  // Homepage is integrated in the same display contract as all other entities.
  // The low-level SmartCardImage remains the internal image element.
  assert.match(read("app/page.tsx"), /<ImageDisplay/);
  assert.match(read("app/page.tsx"), /<EventImage/);
  for (const path of ["components/directory-card.tsx", "components/help-card.tsx"]) {
    assert.match(read(path), /<ImageDisplay[^>]*context="thumbnail"[^>]*config=/, path);
  }
  const renderer = read("components/image-display.tsx");
  assert.match(renderer, /<SmartCardImage/);
  assert.match(renderer, /legacyMode/);
  const eventImage = read("components/event-image.tsx");
  assert.match(eventImage, /real\s*\?\s*\(\s*?\s*<ImageDisplay/);
  assert.match(eventImage, /legacyMode=\{\s*mode\s*\}/);
  assert.match(eventImage, /getEventFallbackImage\(\s*eventType\s*\)/);
  for (const path of ["components/event-card.tsx", "components/event-detail.tsx"]) {
    assert.match(read(path), /<EventImage[^>]*mode=\{\s*event\s*\.imageDisplay\s*\}/, path);
  }
  assert.match(
    read("components/event-card.tsx"),
    /config=\{\s*event\s*\.thumbnailImageDisplay\s*\}/,
  );
  assert.match(
    read("components/event-detail.tsx"),
    /config=\{\s*event\s*\.detailImageDisplay\s*\}/,
  );
  assert.ok(read("app/page.tsx").includes("mode={event.imageDisplay}"));
});
test("legacy event image mode survives roundtrip alongside independent new overrides", () => {
  const editor = read("components/admin-event-editor.tsx");
  const store = read("lib/event-store.ts");
  assert.match(editor, /event\?\s*\.imageDisplay\s*\?\?\s*"auto"/);
  assert.match(editor, /<ImageDisplayEditor/);
  assert.match(editor, /thumbnailImageDisplay,\s*detailImageDisplay/);
  assert.match(editor, /imageDisplay:\s*imageDisplay/);
  assert.match(store, /image_display\s*=\s*\?/);
  assert.match(store, /thumbnail_display_json\s*=\s*\?,\s*detail_display_json\s*=\s*\?/);
  assert.match(
    store,
    /payload\s*\.imageDisplay\s*===\s*undefined\s*\?\s*existing\s*\.imageDisplay/,
  );
  assert.match(read("drizzle/0118_event_image_display.sql"), /DEFAULT\s*'auto'/);
  const migration = read("drizzle/0122_entity_image_display_config.sql");
  assert.match(
    migration,
    /ALTER\s*TABLE\s*managed_events\s*ADD\s*COLUMN\s*thumbnail_display_json\s*TEXT/,
  );
  assert.match(
    migration,
    /ALTER\s*TABLE\s*managed_events\s*ADD\s*COLUMN\s*detail_display_json\s*TEXT/,
  );
});

test("all article image surfaces use shared non-destructive rendering with legacy focal compatibility", () => {
  for (const path of [
    "components/public-visual-system/public-article-card.tsx",
    "components/article-detail.tsx",
    "components/public-visual-system/public-visual-system.tsx",
  ])
    assert.match(read(path), /<ImageDisplay/, path);
  assert.match(read("components/smart-card-image.tsx"), /avoidSevereArticleCrop/);
  assert.match(read("components/smart-card-image.tsx"), /objectPosition/);
  assert.match(read("components/admin-article-editor.tsx"), /<ImageDisplayEditor/);
  assert.match(read("lib/article-store.ts"), /image_focus_y\s*=\s*\?/);
});

test("IMAGE-EDITOR-1 renders article thumbnails and detail using independently saved configurations", () => {
  for (const path of [
    "components/public-visual-system/public-article-card.tsx",
    "components/article-detail.tsx",
    "components/public-visual-system/public-visual-system.tsx",
  ]) {
    assert.match(read(path), /<ImageDisplay/, path);
  }
  assert.match(
    read("lib/article-card-presentation.ts"),
    /config: article\s*\.thumbnailImageDisplay/,
  );
  assert.match(read("components/article-list-item.tsx"), /variant="row"/);
  assert.match(read("components/article-detail.tsx"), /config=\{\s*detailImageConfig\s*\}/);
});
