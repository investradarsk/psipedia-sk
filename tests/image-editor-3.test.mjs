import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automaticThumbnailFit, DEFAULT_DETAIL, DEFAULT_THUMBNAIL,
  normalizeImageDisplayConfig, readImageDisplayConfig,
} from "../lib/image-display.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("IMAGE-EDITOR-3: landscape, portrait and square respect the actual card aspect ratio", () => {
  assert.equal(automaticThumbnailFit(1600, 900, 16 / 9), "cover");
  assert.equal(automaticThumbnailFit(900, 1600, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(1000, 1000, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(1000, 1000, 4 / 3), "cover");
  assert.equal(automaticThumbnailFit(900, 1600, 4 / 3), "contain");
  assert.equal(automaticThumbnailFit(1800, 1100, 8 / 5), "cover");
  assert.equal(automaticThumbnailFit(3000, 600, 16 / 9), "contain");
  assert.equal(automaticThumbnailFit(0, 600, 16 / 9), "cover");
  assert.equal(automaticThumbnailFit(1200, 0, 16 / 9), "cover");
});

test("IMAGE-EDITOR-3: manual crop/blur/position/zoom remains normalized and independent", () => {
  const crop = normalizeImageDisplayConfig({mode:"crop",x:23,y:65,zoom:1.7}, "thumbnail");
  const blur = normalizeImageDisplayConfig({mode:"blur",x:82,y:12,zoom:2}, "detail");
  assert.deepEqual(crop, {mode:"crop",x:23,y:65,zoom:1.7});
  assert.deepEqual(blur, {mode:"blur",x:82,y:12,zoom:2});
  assert.equal(readImageDisplayConfig(null, "thumbnail"), null);
  assert.equal(DEFAULT_THUMBNAIL.mode, "auto");
  assert.equal(DEFAULT_DETAIL.mode, "natural");
});

test("IMAGE-EDITOR-3: shared renderer uses loaded dimensions and responds to changed src", () => {
  const source = read("components/image-display.tsx");
  const smart = read("components/smart-card-image.tsx");
  assert.match(source, /automaticThumbnailFit\(width, height, frameRatio\)/);
  assert.match(source, /autoFit\?\.src === src/);
  assert.match(source, /settings\.mode === "auto"/);
  assert.match(source, /settings\.mode === "blur"/);
  assert.match(source, /settings\.mode === "crop" \? "cover"/);
  assert.match(source, /data-image-display=/);
  assert.match(smart, /image\.naturalWidth/);
  assert.match(smart, /image\.naturalHeight/);
  assert.match(smart, /parent\.clientWidth \/ parent\.clientHeight/);
  assert.match(smart, /if \(imageRef\.current\?\.complete\)/);
  assert.doesNotMatch(read("lib/image-display.ts").match(/export function automaticThumbnailFit[\s\S]*?\n}/)?.[0] ?? "", /src|url|filename|canvas/i);
});

test("IMAGE-EDITOR-3: blur is accessible and reuses the same responsive candidate", () => {
  const renderer = read("components/image-display.tsx");
  const css = read("components/image-display.module.css");
  assert.match(renderer, /className=\{styles\.blurBackground\} src=\{src\} srcSet=\{imageProps\.srcSet\}/);
  assert.match(renderer, /sizes=\{imageProps\.sizes\} loading=\{imageProps\.loading\}/);
  assert.match(renderer, /alt="" aria-hidden="true"/);
  assert.doesNotMatch(renderer, /backgroundImage:/);
  assert.match(css, /filter: blur\(18px\)/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.frame\.natural/);
});

test("IMAGE-EDITOR-3: homepage images use saved thumbnail overrides", () => {
  const page = read("app/page.tsx");
  assert.match(page, /<EventImage [^>]*config=\{event\.thumbnailImageDisplay\}/);
  assert.match(page, /<ImageDisplay [^>]*config=\{profile\.thumbnailImageDisplay\}/);
  assert.match(page, /<ImageDisplay [^>]*config=\{item\.thumbnailImageDisplay\}/);
  assert.doesNotMatch(page, /<SmartCardImage/);
  const card = read("components/article-card.tsx");
  assert.match(card, /config=\{article\.thumbnailImageDisplay\}/);
  assert.match(card, /fetchPriority=\{imagePriority \? "high" : "auto"\}/);
  assert.match(card, /loading=\{imagePriority \? "eager" : "lazy"\}/);
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
  assert.match(read("components/image-display.tsx"), /context === "detail" && settings\.mode === "natural"/);
});

test("IMAGE-EDITOR-3: natural portraits can grow without cropping in each detail layout", () => {
  for (const [path, selector] of [
    ["components/public-profile/public-profile.module.css", "media"],
    ["components/help-details/help-detail.module.css", "visual"],
    ["components/events-public.module.css", "detailVisual"],
    ["components/adoption-detail.module.css", "detailVisual"],
    ["components/lost-found-dogs.module.css", "detailImage"],
  ]) {
    const css = read(path);
    assert.ok(css.includes(`.${selector}:has([data-image-display="natural"])`), path);
  }
});

test("IMAGE-EDITOR-3: editor keeps independent tabs, gestures and reset semantics", () => {
  const editor = read("components/image-display-editor.tsx");
  assert.match(editor, /setDraftThumbnail\(value\)/);
  assert.match(editor, /setDraftDetail\(value\)/);
  assert.match(editor, /change\(null\)/);
  assert.match(editor, /Vycentrovať obrázok/);
  assert.match(editor, /onPointerMove=\{onPointerMove\}/);
  assert.match(editor, /onPointerCancel=\{onPointerEnd\}/);
  assert.match(editor, /onKeyDown=\{onPreviewKey\}/);
  assert.match(editor, /onSave\(draftThumbnail, draftDetail\)/);
});

test("IMAGE-EDITOR-3: existing event fallback and compatibility remain intact", () => {
  const event = read("components/event-image.tsx");
  assert.match(event, /getEventFallbackImage\(eventType\)/);
  assert.match(event, /onError:/);
  assert.match(event, /legacyMode=\{mode\}/);
  for (const table of ["managed_events","directory_profiles","help_cases","help_organizations","adoption_dogs","lost_found_dog_reports"]) {
    assert.match(read("drizzle/0122_entity_image_display_config.sql"), new RegExp(`ALTER TABLE ${table} ADD COLUMN thumbnail_display_json TEXT`));
  }
});

test("IMAGE-EDITOR-3: no AI processor, new migration or expensive image pipeline introduced", () => {
  const renderer = read("components/image-display.tsx");
  assert.doesNotMatch(renderer, /generateImage|sharp\(|fetch\(/);
  const card = read("components/event-card.tsx");
  assert.match(card, /loading="lazy"/);
  assert.match(read("components/event-detail.tsx"), /fetchPriority="high"/);
});
