import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Help landing renders exactly one named CTA per category, even for an empty preview", () => {
  const source = read("components/help-overview.tsx");
  assert.match(source, /data-help-overview-section=\{section\.slug\}/);
  assert.match(source, /data-help-overview-cta=\{section\.slug\}/);
  assert.equal((source.match(/className=\{styles\.overviewSectionFooter\}/g) ?? []).length, 1);
  assert.equal((source.match(/<PublicActionLink\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /section\.items\.length > 0 && \(/);
  assert.doesNotMatch(source, /Všetky organizácie\s*<\/PublicActionLink>/);
  assert.doesNotMatch(source, /Otvoriť kategóriu\s*<ArrowIcon/);
  assert.match(source, /overviewActionLabels\[section\.slug\]/);
  assert.match(source, /section\.items\.slice\(0, 5\)/);
});

test("The organizations CTA points to the actual canonical published organizations hub", () => {
  const source = read("components/help-overview.tsx");
  const canonical = read("app/organizacie/page.tsx");
  const helpRoot = read("app/pomoc-psom/page.tsx");
  assert.match(source, /utulky: "Zobraziť všetky organizácie"/);
  assert.match(source, /href=\{section\.slug === "utulky" \? "\/organizacie" : section\.href\}/);
  assert.match(canonical, /path: "\/organizacie"/);
  assert.match(helpRoot, /href: categoryDestination\(category\.slug\)/);
  for (const label of [
    "Zobraziť všetkých psov na adopciu",
    "Zobraziť všetky ponuky dočasnej opatery",
    "Zobraziť všetky zbierky a výzvy",
    "Zobraziť všetky hlásenia",
    "Zobraziť všetky možnosti pomoci",
  ]) assert.ok(source.includes(label), `Missing label: ${label}`);
});

test("Spacing is compact between Help sections without changing shared banner geometry", () => {
  const css = read("components/help-public.module.css");
  const banner = read("components/public-visual-system/public-help-banner.tsx");
  const source = read("components/help-overview.tsx");
  assert.match(css, /\.overviewSectionFooter\s*\{[^}]*margin-top:\s*8px/s);
  assert.match(css, /\.overviewSection\s*\{\s*padding-block:\s*16px 18px/s);
  assert.match(css, /@media \(max-width: 650px\)\s*\{\s*\.overviewSection\s*\{\s*padding-block:\s*14px 16px/s);
  assert.match(css, /\.overviewSectionFooter a\s*\{\s*min-height:\s*44px/s);
  assert.match(source, /<PublicHelpPhotoBanner promo=\{promo\}/);
  assert.match(banner, /<PublicPhotoCallout promo=\{promo\}/);
});
