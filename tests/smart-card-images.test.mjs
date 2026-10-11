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
test("homepage, events, directory and help use smart cards", () => {
  for(const f of ["app/page.tsx","components/directory-card.tsx","components/help-card.tsx"]) assert.ok(read(f).includes("<SmartCardImage"),f);
  for(const f of ["components/event-card.tsx","components/event-detail.tsx"]) assert.ok(read(f).includes("<EventImage"), f);
  assert.ok(read("app/page.tsx").includes("mode={event.imageDisplay}"));
});
test("manual override roundtrip and migration default", () => {
  assert.ok(read("components/admin-event-editor.tsx").includes("value={imageDisplay}"));
  assert.ok(read("lib/event-store.ts").includes("image_display = ?"));
  assert.ok(read("drizzle/0118_event_image_display.sql").includes("DEFAULT 'auto'"));
});

test("all article image surfaces use the shared smart crop with optional persisted focal point", () => {
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


test("IMAGE-EDITOR-1 applies unified photo rendering in homepage and magazine article lists", () => {
  for (const path of ["components/article-card.tsx", "components/article-detail.tsx", "components/public-visual-system/public-visual-system.tsx"]) {
    assert.match(read(path), /<ImageDisplay/);
  }
  assert.match(read("components/article-card.tsx"), /config={article.thumbnailImageDisplay}/);
  assert.match(read("components/article-list-item.tsx"), /config: article.thumbnailImageDisplay/);
  assert.match(read("components/article-detail.tsx"), /config={detailImageConfig}/);
});
