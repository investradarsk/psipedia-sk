import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared public gallery preserves uncut native image presentation and mobile grid", () => {
  const src = read("components/public-visual-system/public-photo-gallery.tsx");
  const css = read("components/public-visual-system/public-photo-gallery.module.css");
  const index = read("components/public-visual-system/index.ts");
  assert.ok(index.includes("PublicPhotoGallery"));
  assert.ok(src.includes("export function PublicPhotoGallery"));
  for (const fragment of [
    "data-public-photo-gallery", 'data-photo-fit={fit}', 'alt={image.alt}',
    'loading="lazy"', 'decoding="async"', "maxImages = 6",
    "images.filter((image) => image.src.trim()).slice"
  ]) assert.ok(src.includes(fragment), fragment);
  for (const fragment of [
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
    "aspect-ratio: 4 / 3", "object-fit: contain",
    '@media (max-width: 600px)',
    "grid-template-columns: repeat(2, minmax(0, 1fr))"
  ]) assert.ok(css.includes(fragment), fragment);
  assert.doesNotMatch(src, /"use client"|window\.|localStorage|fetch\(/);
});

test("adoption detail uses the canonical gallery, preserving photo alt and six-image cap", () => {
  const adoption = read("components/adoption-detail.tsx");
  const css = read("components/adoption-detail.module.css");
  assert.ok(adoption.includes("sections.gallery &&"));
  assert.ok(adoption.includes("<PublicPhotoGallery"));
  assert.ok(adoption.includes("dog.gallery.filter(Boolean).slice(0, 6)"));
  assert.ok(adoption.includes("index + 2"));
  assert.ok(adoption.includes("Galéria"));
  assert.doesNotMatch(css, /\.detailGallery\s*\{/);
});


test("gallery photos open full-size images using native accessible links", () => {
  const src = read("components/public-visual-system/public-photo-gallery.tsx");
  const css = read("components/public-visual-system/public-photo-gallery.module.css");

  assert.match(src, /<a[\s\S]*?href=\{image\.src\}/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
  assert.match(src, /aria-label=\{image\.alt \?/);
  assert.match(src, /src=\{image\.src\}/);
  assert.match(src, /alt=\{image\.alt\}/);
  assert.match(css, /\.gallery a:focus-visible \{/);
  assert.match(css, /\.gallery a:hover img,/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(src, /"use client"|window\.open|onClick/);
});
