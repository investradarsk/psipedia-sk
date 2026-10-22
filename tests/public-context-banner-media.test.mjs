import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("context banner renders photo only if a nonempty image URL is supplied", () => {
  const source = read("components/public-visual-system/public-context-banner.tsx");
  const css = read("components/public-visual-system/public-context-banner.module.css");

  assert.match(source, /const hasImage = Boolean\(image\?\.src\.trim\(\)\)/);
  assert.match(source, /hasImage && styles\.hasImage/);
  assert.match(source, /\{hasImage && image \? \(/);
  assert.match(source, /data-public-context-banner-media=\{hasImage \? "image" : "text"\}/);
  assert.match(source, /src=\{image\.src\}/);
  assert.match(source, /alt=\{image\.alt \?\? ""\}/);
  assert.match(source, /loading=\{image\.loading \?\? "lazy"\}/);
  assert.match(css, /\.hasImage \{/);
  assert.match(css, /@media \(max-width: 720px\)/);
});

test("banner tones and public CTA keep the established shared contract", () => {
  const source = read("components/public-visual-system/public-context-banner.tsx");
  assert.match(source, /"forest" \| "sage" \| "coral" \| "sand"/);
  assert.match(source, /data-public-context-banner-tone=\{tone\}/);
  assert.match(source, /data-public-context-banner-layout=\{inline \? "inline" : "stacked"\}/);
  assert.match(source, /<PublicActionLink href=\{ctaHref!\}/);
  assert.match(source, /const hasCta = Boolean\(ctaLabel && ctaHref\)/);
});
