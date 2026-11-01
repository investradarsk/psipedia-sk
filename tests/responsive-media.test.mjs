import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RESPONSIVE_MEDIA_WIDTHS, responsiveMediaSrcSet } from "../lib/responsive-media.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("R2 image thumbnails use only approved responsive widths and preserve original image URLs", () => {
  assert.deepEqual(RESPONSIVE_MEDIA_WIDTHS, [160, 320, 480, 640, 768, 960, 1280, 1600, 1920]);
  assert.equal(
    responsiveMediaSrcSet("/media/articles/2026/dog.png", [640, 320, 640]),
    "/media/articles/2026/dog.png?w=320 320w, /media/articles/2026/dog.png?w=640 640w",
  );
  assert.equal(responsiveMediaSrcSet("/media/breeds/labrador.webp", [160]), "/media/breeds/labrador.webp?w=160 160w");
  assert.equal(responsiveMediaSrcSet("/media/breeds/labrador.webp", [1, 99999, 100]), undefined);
});

test("unowned, private, malformed and previously parameterized images cannot enter responsive variants", () => {
  for (const src of [
    "https://example.org/dog.png",
    "//example.org/dog.png",
    "/images/hero-labrador.webp",
    "/migrated-media/articles/dog.webp",
    "/media/safe/private.webp",
    "/media/quarantine/private.webp",
    "/media/../safe/private.webp",
    "/media/foo/bar.webp?key=123",
    "/media/foo/bar.webp#fragment",
    "/media/foo/<script>.webp",
    "/media/foo/../bar.webp",
    "",
  ]) assert.equal(responsiveMediaSrcSet(src), undefined, src);
});

test("media route transforms only approved raster widths and preserves original R2 response fallback", () => {
  const route = read("app/media/[...key]/route.ts");
  assert.match(route, /RESPONSIVE_MEDIA_WIDTHS\.some/);
  assert.match(route, /new URL\(request\.url\)\.searchParams\.get\("w"\)/);
  assert.match(route, /bindings\.IMAGES/);
  assert.match(route, /\.transform\(\{ width \}\)/);
  assert.match(route, /image\/webp/);
  assert.match(route, /const key = segments\.join\("\/"\)/);
  assert.match(route, /segments\[0\] === "quarantine"/);
  assert.match(route, /segments\[0\] === "safe"/);
  assert.match(route, /object = await bucket\.get\(key\)/);
  assert.match(route, /object\.writeHttpMetadata\(headers\)/);
});

test("homepage uses the shared responsive hero and cards use R2 srcsets", () => {
  const homepage = read("app/page.tsx");
  const unifiedHero = read("components/public-visual-system/unified-section-hero.tsx");
  // The homepage now delegates its hero image, crop and priority to this shared component.
  assert.match(homepage, /<UnifiedSectionHero\s+[\s\S]*?visual=\{homeHero\}/);
  assert.match(unifiedHero, /responsiveMediaSrcSet\(visual\.imageUrl/);
  assert.match(unifiedHero, /sizes=/);
  assert.match(unifiedHero, /fetchPriority=\{variant === "homepage-style" \? "high" : undefined\}/);
  assert.match(unifiedHero, /style=\{visualStyle\(visual\)\}/);
  for (const [path, token] of [
    ["components/article-card.tsx", "article.image"],
    ["components/public-visual-system/public-visual-system.tsx", "image.src"],
    ["components/breed-photo.tsx", "props.src"],
  ]) {
    const source = read(path);
    assert.match(source, new RegExp(`responsiveMediaSrcSet\\(${token.replaceAll(".", "\\.")}`), path);
    assert.match(source, /sizes=/, path);
  }
  assert.match(homepage, /loading="lazy"/);
});
