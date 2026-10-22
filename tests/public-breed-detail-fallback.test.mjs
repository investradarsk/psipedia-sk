import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("breed detail uses the canonical public missing-photo visual for hero and related breeds", () => {
  const detail = read("app/plemena/[slug]/page.tsx");
  const styles = read("app/plemena/[slug]/breed-profile.module.css");
  const shared = read("components/public-visual-system/public-media-fallback.tsx");
  assert.match(detail, /import \{ PublicMediaFallback \}/);
  assert.match(detail, /breed\.image \? \(/);
  assert.match(detail, /<BreedPhoto[\s\S]*?src=\{breed\.image\}/);
  assert.match(detail, /<PublicMediaFallback size="detail" label=/);
  assert.match(detail, /item\.image\s*\?\s*<BreedPhoto src=\{item\.image\}/);
  assert.match(detail, /: <span aria-hidden="true"><PublicMediaFallback \/><\/span>/);
  assert.match(styles, /\.photoPlaceholder \{[^}]*width: 100%;[^}]*place-items: stretch;/);
  assert.match(shared, /Fotografia sa pripravuje/);
  assert.match(shared, /data-public-media-fallback/);
});

test("BreedPhoto retains real-photo image rendering and replaces broken-image icons with one shared fallback", () => {
  const photo = read("components/breed-photo.tsx");
  assert.match(photo, /"use client"/);
  assert.match(photo, /useState/);
  assert.match(photo, /responsiveMediaSrcSet\(props\.src,/);
  assert.match(photo, /return <img \{\.\.\.props\}/);
  assert.match(photo, /onError=\{\(\)=>setFailed\(String\(props\.src\)\)\}/);
  assert.match(photo, /!props\.src\|\|failed===props\.src/);
  assert.match(photo, /<PublicMediaFallback size=\{detailFrame \? "detail" : "thumbnail"\} label="Fotografia nie je dostupná"/);
  assert.doesNotMatch(photo, /<PawMark/);
});

test("breed hero retain the established test and image safety contract", () => {
  const detail = read("app/plemena/[slug]/page.tsx");
  assert.match(detail, /data-testid="breed-hero-photo"/);
  assert.match(detail, /data-image-fallback="breed-photo"/);
  assert.match(detail, /Fotografia plemena/);
});
