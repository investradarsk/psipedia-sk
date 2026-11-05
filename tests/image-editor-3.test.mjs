import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automaticThumbnailFit,
  DEFAULT_DETAIL,
  DEFAULT_THUMBNAIL,
  normalizeImageDisplayConfig,
  readImageDisplayConfig,
} from "../lib/image-display.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("IMAGE-EDITOR-3: landscape, portrait and square respect the actual card aspect ratio", () => {
  assert.equal(automaticThumbnailFit(1600, 900, 16 / 9), "cover");
  assert.equal(automaticThumbnailFit(900, 1600, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(1000, 1000, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(1000, 1000, 4 / 3), "cover");
  assert.equal(automaticThumbnailFit(900, 1600, 4 / 3), "contain");
  assert.equal(automaticThumbnailFit(1800, 1100, 8 / 5), "cover");
  // Light-background artwork should preserve the complete original image.
  assert.equal(automaticThumbnailFit(1000, 600, 8 / 5, 0.9), "contain");
  assert.equal(automaticThumbnailFit(1000, 600, 8 / 5, 0.1), "cover");
  assert.equal(automaticThumbnailFit(1000, 600, 8 / 5, undefined), "cover");
  assert.equal(automaticThumbnailFit(3000, 600, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(0, 600, 16 / 9), "cover");
  assert.equal(automaticThumbnailFit(1200, 0, 16 / 9), "cover");
});

test("IMAGE-EDITOR-3: manual crop/blur/position/zoom remains normalized and independent", () => {
  const crop = normalizeImageDisplayConfig({ mode: "crop", x: 23, y: 65, zoom: 1.7 }, "thumbnail");
  const blur = normalizeImageDisplayConfig({ mode: "blur", x: 82, y: 12, zoom: 2 }, "detail");
  assert.deepEqual(crop, { mode: "crop", x: 23, y: 65, zoom: 1.7 });
  assert.deepEqual(blur, { mode: "blur", x: 82, y: 12, zoom: 2 });
  assert.equal(readImageDisplayConfig(null, "thumbnail"), null);
  assert.equal(DEFAULT_THUMBNAIL.mode, "auto");
  assert.equal(DEFAULT_DETAIL.mode, "natural");
});

test("IMAGE-EDITOR-3: shared renderer uses loaded dimensions and responds to changed src", () => {
  const source = read("components/image-display.tsx");
  const smart = read("components/smart-card-image.tsx");
  assert.match(
    source,
    /automaticThumbnailFit\(\s*width,\s*height,\s*frameRatio,\s*lightBackgroundShare,\s*?\s*\)/,
  );
  assert.match(source, /autoFit\?\s*\.src\s*===\s*src/);
  assert.match(source, /settings\s*\.mode\s*===\s*"auto"/);
  assert.match(source, /settings\s*\.mode\s*===\s*"blur"/);
  assert.match(source, /settings\s*\.mode\s*===\s*"crop"\s*\?\s*"cover"/);
  assert.match(source, /data-image-display=/);
  assert.match(smart, /image\s*\.naturalWidth/);
  assert.match(smart, /image\s*\.naturalHeight/);
  assert.match(smart, /parent\s*\.clientWidth\s*\/\s*parent\s*\.clientHeight/);
  assert.match(smart, /image\?\s*\.complete/);
  assert.match(smart, /lightShareCache/);
  assert.match(smart, /sampleLightBackground\(\s*image\s*\)/);
  assert.match(source, /lightBackgroundShare/);
  assert.doesNotMatch(
    read("lib/image-display.ts").match(/export function automaticThumbnailFit[\s\S]*?\n}/)?.[0] ??
      "",
    /src|url|filename|canvas/i,
  );
});

test("IMAGE-EDITOR-3: blur is accessible and reuses the same responsive candidate", () => {
  const renderer = read("components/image-display.tsx");
  const css = read("components/image-display.module.css");
  assert.match(
    renderer,
    /className=\{\s*styles\s*\.blurBackground\s*\}\s*src=\{\s*src\s*\}\s*srcSet=\{\s*imageProps\s*\.srcSet\s*\}/,
  );
  assert.match(
    renderer,
    /sizes=\{\s*imageProps\s*\.sizes\s*\}\s*loading=\{\s*imageProps\s*\.loading\s*\}/,
  );
  assert.match(renderer, /alt=""[\s\S]*?aria-hidden="true"/);
  assert.doesNotMatch(renderer, /backgroundImage:/);
  assert.match(css, /filter:\s*blur\(\s*18px\s*\)/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\s*\.frame\s*\.natural/);
});

test("IMAGE-EDITOR-3: homepage images use saved thumbnail overrides", () => {
  const page = read("app/page.tsx");
  assert.match(page, /<EventImage\s[^>]*config=\{\s*event\s*\.thumbnailImageDisplay\s*\}/);
  assert.match(page, /<ImageDisplay\s[^>]*config=\{\s*profile\s*\.thumbnailImageDisplay\s*\}/);
  assert.match(page, /<ImageDisplay\s[^>]*config=\{\s*item\s*\.thumbnailImageDisplay\s*\}/);
  assert.doesNotMatch(page, /<SmartCardImage/);
  const card = read("components/public-visual-system/public-article-card.tsx");
  assert.match(
    read("lib/article-card-presentation.ts"),
    /config: article\s*\.thumbnailImageDisplay/,
  );
  assert.match(card, /fetchPriority=\{\s*imagePriority\s*\?\s*"high"\s*:\s*"auto"\s*\}/);
  assert.match(card, /loading=\{\s*imagePriority\s*\?\s*"eager"\s*:\s*"lazy"\s*\}/);
});

test("IMAGE-EDITOR-3: every entity detail respects manual config, with natural fallback", () => {
  const components = [
    ["components/event-image.tsx", /config=\{config\}/],
    ["components/public-profile/public-profile-hero.tsx", /config=\{imageConfig\}/],
    ["components/help-details/help-detail-shell.tsx", /config=\{item\.detailImageDisplay\}/],
    ["components/adoption-detail.tsx", /config=\{dog\.detailImageDisplay\}/],
    ["components/lost-found-dog-detail.tsx", /config=\{report\.detailImageDisplay\}/],
    ["components/article-detail.tsx", /config=\{detailImageConfig\}/],
  ];
  for (const [path, expression] of components) assert.match(read(path), expression, path);
  assert.match(read("components/admin-event-editor.tsx"), /DEFAULT_DETAIL/);
  assert.match(
    read("components/image-display.tsx"),
    /context\s*===\s*"detail"\s*&&\s*settings\s*\.mode\s*===\s*"natural"/,
  );
});

test("IMAGE-EDITOR-3: natural portraits can grow without cropping in each detail layout", () => {
  const hero = read("components/detail-primitives/detail-primitives.tsx");
  const universal = read("components/public-visual-system/unified-section-hero.tsx");
  const universalCss = read("components/public-visual-system/unified-section-hero.module.css");
  const frameCss = read("components/image-display.module.css");
  // Detail imagery is now inside the sole universal HERO, not a second
  // independent heroMedia frame. Natural photos must remain uncropped.
  assert.match(hero, /mediaSlot=\{kind\s*===\s*"organization"\s*\|\|\s*imageUrl\s*\?\s*media\s*:\s*undefined\}/);
  assert.match(universal, /data-public-hero-configured-media/);
  assert.match(universalCss, /\.mediaSlot\s+\[data-image-display="natural"\] img/);
  assert.match(frameCss, /\.frame\s+\.naturalPhoto\s*\{/);
  assert.match(frameCss, /object-fit:\s*contain/);
  for (const path of [
    "components/public-profile/public-profile-hero.tsx",
    "components/help-details/help-detail-shell.tsx",
    "components/event-detail.tsx",
    "components/adoption-detail.tsx",
    "components/lost-found-dog-detail.tsx",
    "components/directory-profile-detail.tsx",
  ])
    assert.match(read(path), /<DetailHero/, path);
});

test("IMAGE-EDITOR-3: editor keeps independent tabs, gestures and reset semantics", () => {
  const editor = read("components/image-display-editor.tsx");
  assert.match(editor, /setDraftThumbnail\(\s*value\s*\)/);
  assert.match(editor, /setDraftDetail\(\s*value\s*\)/);
  assert.match(editor, /change\(\s*null\s*\)/);
  assert.match(editor, /Vycentrovať\s*obrázok/);
  assert.match(editor, /onPointerMove=\{\s*onPointerMove\s*\}/);
  assert.match(editor, /onPointerCancel=\{\s*onPointerEnd\s*\}/);
  assert.match(editor, /onKeyDown=\{\s*onPreviewKey\s*\}/);
  assert.match(editor, /onSave\(\s*draftThumbnail,\s*draftDetail\s*\)/);
});

test("IMAGE-EDITOR-3: existing event fallback and compatibility remain intact", () => {
  const event = read("components/event-image.tsx");
  assert.match(event, /getEventFallbackImage\(\s*eventType\s*\)/);
  assert.match(event, /onImageFailure:/);
  assert.match(event, /legacyMode=\{\s*mode\s*\}/);
  for (const table of [
    "managed_events",
    "directory_profiles",
    "help_cases",
    "help_organizations",
    "adoption_dogs",
    "lost_found_dog_reports",
  ]) {
    assert.match(
      read("drizzle/0122_entity_image_display_config.sql"),
      new RegExp(`ALTER TABLE ${table} ADD COLUMN thumbnail_display_json TEXT`),
    );
  }
});

test("IMAGE-EDITOR-3: no AI processor, new migration or expensive image pipeline introduced", () => {
  const renderer = read("components/image-display.tsx");
  assert.doesNotMatch(renderer, /generateImage|sharp\(\s*|fetch\(\s*/);
  const card = read("components/event-card.tsx");
  assert.match(card, /loading="lazy"/);
  assert.match(read("components/event-detail.tsx"), /fetchPriority="high"/);
});
