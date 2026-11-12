import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publicHeroImageSrc,
  publicHeroImageSrcSet,
  HERO_IMAGE_SIZES,
} from "../lib/public-hero-image.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("known static homepage photo uses real Cloudflare Images variants, not a full-size 1536px original", () => {
  const src = "/images/hero-labrador.webp";
  const set = publicHeroImageSrcSet(src);
  assert.equal(publicHeroImageSrc(src), "/_vinext/image?url=%2Fimages%2Fhero-labrador.webp&w=1200&q=72");
  assert.ok(set?.includes("w=384&q=72 384w"));
  assert.ok(set?.includes("w=640&q=72 640w"));
  assert.ok(set?.includes("w=828&q=72 828w"));
  assert.ok(set?.includes("w=1200&q=72 1200w"));
  assert.ok(set?.includes("w=1920&q=72 1920w"));
  assert.equal(set?.split(", ").length, 5);
  assert.ok(HERO_IMAGE_SIZES.includes("max-width: 620px"));
  assert.ok(HERO_IMAGE_SIZES.includes("100vw"));
});

test("managed D1 photo and external images keep their existing media identity", () => {
  const media = "/media/section-visuals/custom-picture.webp";
  const remote = "https://cdn.example.com/picture.webp";
  assert.equal(publicHeroImageSrc(media), media);
  assert.match(publicHeroImageSrcSet(media), /\/media\/section-visuals\/custom-picture\.webp\?w=640 640w/);
  assert.equal(publicHeroImageSrc(remote), remote);
  assert.equal(publicHeroImageSrcSet(remote), undefined);
});

test("homepage preload and visible photo share the same candidate function and sizes", () => {
  const home = read("app/page.tsx");
  const hero = read("components/public-visual-system/unified-section-hero.tsx");
  const worker = read("worker/index.ts");
  assert.match(home, /imageSrcSet=\{publicHeroImageSrcSet\(homeHero\.imageUrl\)\}/);
  assert.match(home, /href=\{publicHeroImageSrc\(homeHero\.imageUrl\)\}/);
  assert.match(home, /imageSizes=\{HERO_IMAGE_SIZES\}/);
  assert.match(hero, /srcSet=\{publicHeroImageSrcSet\(visual\.imageUrl\)\}/);
  assert.match(hero, /src=\{publicHeroImageSrc\(visual\.imageUrl\)\}/);
  assert.match(hero, /sizes=\{HERO_IMAGE_SIZES\}/);
  assert.match(worker, /url\.pathname === "\/_vinext\/image"/);
  assert.match(worker, /env\.IMAGES\.input\(body\)/);
});

test("breed reference stays outside the Vite CSS dependency graph", () => {
  const nested = read("app/plemena/layout.tsx");
  const referenced = read("public/styles/breed-reference-3f5dab25d000.css");
  const root = read("app/layout.tsx");
  assert.match(nested, /<link rel="stylesheet" href=\{BREED_STYLESHEET\} precedence="high" \/>/);
  assert.match(nested, /\/styles\/breed-reference-3f5dab25d000\.css/);
  assert.doesNotMatch(nested, /import "\.\/breed-reference\.css"/);
  assert.doesNotMatch(root, /breed-reference/);
  assert.match(referenced, /\/\* Breed encyclopedia UI \*\//);
  assert.ok(referenced.length > 60_000);
});

test("scroll-to-top JS and its CSS are loaded only after the button becomes useful", () => {
  const layout = read("app/layout.tsx");
  const wrapper = read("components/lazy-back-to-top.tsx");
  const widget = read("components/back-to-top.tsx");
  assert.match(layout, /<LazyBackToTop \/>/);
  assert.doesNotMatch(layout, /import \{ BackToTop \} from/);
  assert.match(wrapper, /lazy\(async \(\) =>/);
  assert.match(wrapper, /import\("\.\/back-to-top"\)/);
  assert.match(wrapper, /window\.scrollY <= 480/);
  assert.match(wrapper, /\{ passive: true \}/);
  assert.match(wrapper, /activated \? \(/);
  assert.match(widget, /aria-label="Späť hore"/);
});
