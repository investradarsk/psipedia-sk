import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  verifiedCanonicalRendererForGroup,
  ownerGroupsAlreadyShareRenderer,
} from "../lib/visual-library-canonical-renderers.ts";

const read = (path) => readFileSync(path, "utf8");

test("the veterinary/article, homepage, breed and Help photo banners already share one public renderer", () => {
  const ids = ["magazine", "rescue", "closing", "photo-callout"];
  const renderers = ids.map((id) => verifiedCanonicalRendererForGroup(id));
  for (const item of renderers) {
    assert.equal(item.name, "PublicMagazineBanner");
    assert.equal(item.path, "components/public-visual-system/public-magazine-banner.tsx");
  }
  assert.deepEqual(renderers[1].chain, [
    "PublicHelpPhotoBanner", "PublicPhotoCallout", "PublicMagazineBanner",
  ]);
  assert.deepEqual(renderers[2].chain, [
    "PublicHelpClosingBanner", "PublicPhotoCallout", "PublicMagazineBanner",
  ]);
  assert.equal(verifiedCanonicalRendererForGroup("unknown"), null);
  assert.equal(ownerGroupsAlreadyShareRenderer("rescue", "magazine"), true);
  assert.equal(ownerGroupsAlreadyShareRenderer("closing", "photo-callout"), true);
  assert.equal(ownerGroupsAlreadyShareRenderer("magazine", "context"), false);
});

test("renderer identity is proven by real production import and call chains, not assumed from styles", () => {
  const photo = read("components/public-visual-system/public-photo-callout.tsx");
  const help = read("components/public-visual-system/public-help-banner.tsx");
  const magazine = read("components/public-visual-system/public-magazine-banner.tsx");
  const banners = read("lib/visual-library-banners.ts");
  assert.match(photo, /import \{ PublicMagazineBanner \}/);
  assert.match(photo, /return \(\s*<PublicMagazineBanner/);
  assert.match(help, /return <PublicPhotoCallout promo=\{promo\}/);
  assert.match(help, /<PublicPhotoCallout[\s\S]*?promo=\{helpClosingPromo\}/);
  assert.match(magazine, /export function PublicMagazineBanner/);
  assert.match(banners, /id: "homepage:profil"/);
  assert.match(banners, /id: "plemena:kluby"/);
  assert.match(banners, /id: "help:lost-found"/);
  assert.match(banners, /articlePromoKeys\.map/);
});

test("all six admin views use one real-banner adapter rather than copying its JSX", () => {
  const names = [
    "components/admin-visual-library.tsx",
    "components/admin-visual-library-editor.tsx",
    "components/admin-visual-library-owner-compare.tsx",
    "components/admin-visual-library-visual-catalog.tsx",
    "components/admin-visual-library-coverage.tsx",
    "components/admin-visual-library-duplicates.tsx",
  ];
  const adapter = read("components/admin-visual-library-banner-preview.tsx");
  assert.match(adapter, /<PublicMagazineBanner/);
  assert.match(adapter, /compact=\{banner\.group === "clanky"\}/);
  assert.match(adapter, /photoTone=\{banner\.photoTone\}/);
  assert.match(adapter, /copy\?\.label \?\? banner\.ctaLabel/);
  for (const path of names) {
    const src = read(path);
    assert.match(src, /<AdminVisualLibraryBannerPreview/);
    assert.doesNotMatch(src, /<PublicMagazineBanner/);
  }
});

test("canonical status and known cross-page evidence are shown to the owner; no auto-merge", () => {
  const suggestions = read("lib/visual-library-owner-suggestions.ts");
  const compare = read("components/admin-visual-library-owner-compare.tsx");
  const catalog = read("components/admin-visual-library-visual-catalog.tsx");
  assert.match(suggestions, /ownerGroupsAlreadyShareRenderer\(a\.id, b\.id\)/);
  assert.match(compare, /ownerGroupsAlreadyShareRenderer\(left\.id, right\.id\)/);
  assert.match(catalog, /verifiedCanonicalRendererForGroup\(chosen\.id\)/);
  assert.match(catalog, /sharedRendererUses\.map/);
  assert.match(catalog, /Ďalšie doložené umiestnenia spoločného zdroja/);
  assert.doesNotMatch(catalog, /method:\s*"(POST|PUT|DELETE)"|DB\.prepare/);
});
