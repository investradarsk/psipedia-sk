import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { responsiveMediaSrcSet } from "../lib/responsive-media.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared photo galleries download bounded responsive thumbnails and retain original gallery links", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.tsx");
  assert.equal((gallery.match(/srcSet=\{responsiveMediaSrcSet\(image\.src/g) ?? []).length, 3);
  assert.equal((gallery.match(/loading="lazy"/g) ?? []).length, 3);
  assert.match(gallery, /sizes="\(max-width: 600px\) 50vw, 33vw"/);
  assert.match(gallery, /data-pswp-gallery-item/);
  assert.match(gallery, /href=\{href\}/);
});

test("article blocks and prominent profile images keep source URLs but request responsive variants", () => {
  for (const [path, token] of [
    ["components/article-blocks.tsx", "block.url"],
    ["components/article-detail.tsx", "article.image"],
    ["components/directory-profile-detail.tsx", "presentation.imageUrl"],
    ["components/adoption-detail.tsx", "dog.mainImage"],
  ]) {
    const source = read(path);
    assert.ok(source.includes(`srcSet={responsiveMediaSrcSet(${token},`), path);
    assert.match(source, /sizes=/, path);
  }
  assert.match(read("components/article-blocks.tsx"), /loading="lazy" decoding="async"/);
  assert.match(read("components/article-detail.tsx"), /loading="eager" fetchPriority="high"/);
});

test("responsive variants never rewrite remote photos, source media URLs or private files", () => {
  assert.equal(responsiveMediaSrcSet("https://example.com/photo.jpg"), undefined);
  assert.equal(responsiveMediaSrcSet("/media/safe/private.webp"), undefined);
  assert.equal(responsiveMediaSrcSet("/media/events/2026/photo.jpg", [320, 640]),
    "/media/events/2026/photo.jpg?w=320 320w, /media/events/2026/photo.jpg?w=640 640w");
});
