import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("directory map and provider use the same two-theme public banner component", () => {
  const source = read("components/directory-page.tsx");
  const map = source.match(/<div data-directory-map-cta>([\s\S]*?)<\/div>/)?.[1];
  const provider = source.match(/<div data-directory-provider-cta>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(map, "map CTA placement must exist");
  assert.ok(provider, "provider CTA placement must exist");
  for (const block of [map, provider]) {
    assert.match(block, /<PublicMagazineBanner/);
    assert.match(block, /\bcompact\b/);
    assert.match(block, /size="small"/);
    assert.doesNotMatch(block, /ps-public-banner-frame/);
  }
  assert.match(map, /visual="light"/);
  assert.match(map, /href=\{mapHref\(filters, active\?\.slug\)\}/);
  assert.match(map, /anchorId=\{CTA_DIRECTORY_MAP_ANCHOR\}/);
  assert.match(map, /filters\.canonicalService/);
  assert.match(provider, /visual="dark"/);
  assert.match(provider, /href="\/o-nas#kontakt"/);
  assert.match(source, /<ArticlePopularitySidebar/);
  assert.match(read("app/banner-visuals.css"), /border-radius:\s*var\(--ps-bnr-radius\)\s*!important/);
});

test("the two existing placements are findable in Admin's banner library", () => {
  const catalog = read("lib/visual-library-banners.ts");
  assert.match(catalog, /id: "adresar:mapa"/);
  assert.match(catalog, /id: "adresar:poskytovatelia"/);
  assert.match(catalog, /url: "https:\/\/psipedia\.sk\/adresar"/);
  const drafts = read("lib/visual-library-drafts.ts");
  assert.match(drafts, /banner\.id === "adresar:poskytovatelia" \? "dark" : "light"/);
  assert.match(drafts, /banner\.id\.startsWith\("adresar:"\)/);
  const preview = read("components/admin-visual-library-banner-preview.tsx");
  assert.match(preview, /banner\.id\.startsWith\("adresar:"\)/);
  assert.match(preview, /compact=\{banner\.group === "clanky" \|\| directorySidebar\}/);
  // New public placements are intentionally draft-only until individually approved.
  const releases = read("lib/visual-library-edit-store.ts");
  assert.doesNotMatch(releases.match(/const ALLOWED_PUBLICATIONS:[\s\S]*?\};/)?.[0] ?? "", /"adresar:(mapa|poskytovatelia)"/);
});

test("directory CTAs are independent of original third-party ad media", () => {
  const directory = read("components/directory-page.tsx");
  const affiliate = read("components/affiliate-rotating-banner.tsx");
  assert.match(directory, /<AffiliateRotatingBanner/);
  assert.doesNotMatch(affiliate, /PublicMagazineBanner|data-banner-visual/);
});
