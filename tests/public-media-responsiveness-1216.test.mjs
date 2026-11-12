import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { responsiveMediaSrcSet } from "../lib/responsive-media.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared photo galleries download bounded responsive thumbnails and retain original gallery links", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.tsx");
  assert.equal((gallery.match(/srcSet=\{responsiveMediaSrcSet\(image\.src/g) ?? []).length, 3);
  assert.equal((gallery.match(/loading="lazy"/g) ?? []).length, 3);
  assert.ok(gallery.includes('sizes="(max-width: 600px) calc((100vw - 40px) / 2), (max-width: 1250px) calc((100vw - 72px) / 3), 394px"'));
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
  assert.match(read("components/article-blocks.tsx"), /loading="lazy"\s+decoding="async"/);
  assert.match(read("components/article-detail.tsx"), /loading="eager"\s+fetchPriority="high"/);
});

test("responsive variants never rewrite remote photos, source media URLs or private files", () => {
  assert.equal(responsiveMediaSrcSet("https://example.com/photo.jpg"), undefined);
  assert.equal(responsiveMediaSrcSet("/media/safe/private.webp"), undefined);
  assert.equal(responsiveMediaSrcSet("/media/events/2026/photo.jpg", [320, 640]),
    "/media/events/2026/photo.jpg?w=320 320w, /media/events/2026/photo.jpg?w=640 640w");
});


test("step 7: compact listing and prominent profile photos use bounded R2 responsive variants", () => {
  const records = [
    ["components/directory-card.tsx", "profile.imageUrl", "[160, 320]", "76px, 88px"],
    ["components/help-card.tsx", "item.imageUrl", "[160, 320, 480, 640]", "112px, 180px"],
    ["components/adoption-card-media.tsx", "mainImage", "[160, 320, 480, 640, 768, 960]", "46vw, 380px"],
    ["components/public-profile/public-profile-hero.tsx", "imageUrl", "[320, 480, 640, 768, 960, 1280]", "48vw, 610px"],
  ];
  for (const [path, src, widths, slotHint] of records) {
    const source = read(path);
    assert.ok(source.includes("srcSet={responsiveMediaSrcSet(" + src + ", " + widths + ")}"), path);
    assert.ok(source.includes("src={" + src + "}"), path);
    assert.ok(source.includes(slotHint), path);
    assert.match(source, /decoding="async"/);
  }
  const directory = read("components/directory-card.tsx");
  assert.match(directory, /width=\{88\}[\s\S]*height=\{76\}/);
  const home = read("app/page.tsx");
  assert.match(home, /<EventImage[\s\S]*?sizes="76px"[\s\S]*?loading="lazy"/);
});

test("step 7: primary breed and profile photos remain eager while lower galleries are lazy", () => {
  const breed = read("app/plemena/[slug]/page.tsx");
  const profile = read("components/public-profile/public-profile-hero.tsx");
  const atlas = read("components/breed-card.tsx");
  const comparison = read("components/breed-comparison.tsx");
  const start = breed.indexOf('data-testid="breed-hero-photo"');
  const end = breed.indexOf('data-testid="breed-hero-image"', start);
  assert.ok(start > 0 && end > start);
  const hero = breed.slice(start, end + 60);
  assert.match(hero, /<BreedPhoto/);
  assert.match(hero, /sizes="\(max-width: 700px\)[^"]+520px"/);
  assert.match(hero, /loading="eager"/);
  assert.match(hero, /fetchPriority="high"/);
  assert.match(profile, /srcSet=\{responsiveMediaSrcSet\(imageUrl, \[320, 480, 640, 768, 960, 1280\]\)\}/);
  assert.match(profile, /loading="eager"[\s\S]*?fetchPriority="high"/);
  assert.match(breed, /renderImage=\{\(image\) => <BreedPhoto[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(breed, /<BreedPhoto src=\{item\.image\}[^>]*sizes="[^"]*180px"[^>]*loading="lazy"/);
  assert.match(atlas, /<BreedPhoto[^>]*sizes="[^"]*300px"[^>]*loading="lazy"/);
  assert.match(comparison, /sizes="\(max-width: 760px\) 45vw, 320px"/);
});

test("step 7: gallery image hints match column grid and reserve intrinsic dimensions", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.tsx");
  const css = read("components/public-visual-system/public-photo-gallery.module.css");
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(gallery, /sizes="\(max-width: 650px\) calc\(\(100vw - 40px\) \/ 2\), \(max-width: 1250px\) calc\(\(100vw - 72px\) \/ 3\), 394px"/);
  assert.match(gallery, /image\.size === "wide"/);
  assert.equal((gallery.match(/width=\{1280\}/g) ?? []).length, 2);
  assert.equal((gallery.match(/height=\{960\}/g) ?? []).length, 2);
  assert.match(gallery, /width=\{640\}[\s\S]*height=\{480\}/);
  assert.match(gallery, /data-pswp-gallery-item/);
  assert.match(gallery, /href=\{href\}/);
});

test("step 7: original URLs and private or remote sources are not rewritten", () => {
  assert.equal(responsiveMediaSrcSet("/media/directory/vet.webp", [160, 320]),
    "/media/directory/vet.webp?w=160 160w, /media/directory/vet.webp?w=320 320w");
  assert.equal(responsiveMediaSrcSet("/media/safe/candidate.jpg", [160, 320]), undefined);
  assert.equal(responsiveMediaSrcSet("https://remote.example/photo.jpg", [160, 320]), undefined);
  assert.equal(responsiveMediaSrcSet("/media/breeds/lab.webp?version=4", [160]), undefined);
  assert.equal(responsiveMediaSrcSet("/images/homepage.webp", [160, 320]), undefined);
});
