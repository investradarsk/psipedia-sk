import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("visual gallery reuses actual production banner, not a drawn imitation", () => {
  const gallery = read("components/admin-visual-library.tsx");
  assert.match(gallery, /import \{ PublicMagazineBanner \} from "@\/components\/public-visual-system\/public-magazine-banner"/);
  assert.match(gallery, /<PublicMagazineBanner compact/);
  assert.match(gallery, /chosen\.uses\.map/);
  assert.match(gallery, /href=\{use\.url\}/);
});

test("verified page banner references stay tied to existing public route components", () => {
  const homepage = read("app/page.tsx");
  const atlas = read("app/plemena/page.tsx");
  const catalog = read("lib/visual-library-banners.ts");
  assert.match(homepage, /<HomeMagazineBanner[\s\S]*?testId="profil"/);
  assert.match(atlas, /<PublicMagazineBanner[\s\S]*?testId="breed-clubs"/);
  assert.match(catalog, /url: "https:\/\/psipedia\.sk\/", label: "Úvodná stránka"/);
  assert.match(catalog, /url: "https:\/\/psipedia\.sk\/plemena", label: "Atlas plemien"/);
});

test("editorial promotions never invent article URLs", () => {
  const catalog = read("lib/visual-library-banners.ts");
  assert.match(catalog, /articlePromoKeys\.map/);
  assert.match(catalog, /uses: \[\]/);
  assert.match(catalog, /dynamicNote:/);
  assert.doesNotMatch(catalog, /url: "https:\/\/psipedia\.sk\/clanky\/\[slug\]"/);
});

test("technical registry remains available but is not the main owner view", () => {
  const page = read("app/admin/komponenty/page.tsx");
  assert.match(page, /<AdminVisualLibrary \/>/);
  assert.match(page, /<details/);
  assert.match(page, /<AdminComponentRegistry/);
});
