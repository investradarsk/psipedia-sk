import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const hero = read("components/public-visual-system/unified-section-hero.tsx");
const heroCss = read("components/public-visual-system/unified-section-hero.module.css");
const visualContract = read("lib/section-visual-contract.ts");
const sectionStore = read("lib/section-store.ts");
const portal = read("lib/portal.ts");
const admin = read("components/admin-section-visuals.tsx");
const adminCss = read("components/admin-section-visuals.module.css");
const events = read("components/events-page.tsx");
const home = read("app/page.tsx");

test("SECTION-HERO-V2 keeps one canonical hero and a homepage-style separate tools panel", () => {
  assert.match(hero, /export async function UnifiedSectionHero/);
  assert.match(hero, /data-unified-section-hero-visual/);
  assert.match(hero, /data-unified-section-hero-tools/);
  assert.match(hero, /<div className=\{styles\.visual\}[\s\S]*<\/div>[\s\S]*hasTools \? \(/);
  assert.match(heroCss, /\.visual[\s\S]*height:\s*clamp\(260px,\s*24vw,\s*330px\)/);
  assert.match(heroCss, /\.tools[\s\S]*background:\s*#fff/);
  assert.match(heroCss, /\.tools[\s\S]*margin:\s*-25px auto 0/);
});

test("SECTION-HERO-V2 keeps desktop 16:7 crop and uses low 16:6 mobile crop", () => {
  assert.match(visualContract, /SECTION_VISUAL_DESKTOP_ASPECT = \[16, 7\]/);
  assert.match(visualContract, /SECTION_VISUAL_MOBILE_ASPECT = \[16, 6\]/);
  assert.match(heroCss, /aspect-ratio:\s*16 \/ 6/);
  assert.doesNotMatch(heroCss, /aspect-ratio:\s*4 \/ 3/);
  assert.match(admin, /mode === "desktop" \? "16 : 7" : "16 : 6"/);
  assert.match(adminCss, /\.desktopPreview[\s\S]*aspect-ratio:\s*16 \/ 7/);
  assert.match(adminCss, /\.mobilePreview[\s\S]*aspect-ratio:\s*16 \/ 6/);
});

test("mobile copy, image and tools stay separate with no photo overlay", () => {
  assert.match(heroCss, /@media \(max-width: 767px\)/);
  assert.match(heroCss, /\.copy[\s\S]*order:\s*1/);
  assert.match(heroCss, /\.media[\s\S]*order:\s*2/);
  assert.match(heroCss, /\.shade\s*\{\s*display:\s*none/);
  assert.match(heroCss, /\.tools[\s\S]*margin:\s*12px 0 0/);
});

test("desktop overlay text uses light contrast while the search panel is not in its safe zone", () => {
  assert.match(heroCss, /\.breadcrumbs[\s\S]*color:\s*rgba\(255,255,255/);
  assert.match(heroCss, /\.eyebrow[\s\S]*color:\s*rgba\(255,255,255/);
  assert.match(heroCss, /\.copy h1[\s\S]*color:\s*#fff/);
  assert.match(heroCss, /\.intro[\s\S]*color:\s*rgba\(255,255,255/);
  assert.match(admin, /breadcrumb · eyebrow · H1 · intro/);
  assert.doesNotMatch(admin, /text · vyhľadávanie · CTA/);
});

test("admin edits content, search copy, CTA, meta and quick links without exposing scope or CSS", () => {
  for (const copy of [
    "Eyebrow",
    "H1 / názov",
    "Krátky popis",
    "Placeholder",
    "Text tlačidla",
    "CTA zapnuté",
    "Text CTA",
    "URL CTA",
    "CTA variant",
    "Krátky meta text",
    "Quick links",
  ]) assert.equal(admin.includes(copy), true, "missing admin field: " + copy);
  assert.match(admin, /Backend, route a scope zostávajú zamknuté v kóde/);
  assert.doesNotMatch(admin, /visualKey.*onChange|search backend.*onChange/i);
  assert.match(admin, /Text je dlhý a môže zväčšiť hero/);
});

test("admin search text cannot alter the route, hidden filters or category scope", () => {
  assert.match(hero, /const overrides: SearchElementProps = \{\}/);
  assert.match(hero, /config\.searchPlaceholder[\s\S]*overrides\.placeholder/);
  assert.match(hero, /config\.searchButtonLabel[\s\S]*overrides\.buttonLabel/);
  assert.match(hero, /cloneElement\(searchSlot as ReactElement<SearchElementProps>, overrides\)/);
  assert.doesNotMatch(hero, /cloneElement\(searchSlot[\s\S]*action\s*:/);
  assert.doesNotMatch(hero, /cloneElement\(searchSlot[\s\S]*hidden\s*:/);
  assert.doesNotMatch(hero, /cloneElement\(searchSlot[\s\S]*inputName\s*:/);
});

test("hero config uses existing canonical stores and section_visuals stays image-only", () => {
  assert.match(sectionStore, /hero_config_json/);
  assert.match(sectionStore, /subpages_json/);
  assert.match(sectionStore, /stored\.heroConfig/);
  assert.match(read("lib/section-visual-store.ts"), /getManagedPortalSection/);
  assert.match(read("drizzle/0107_section_hero_config.sql"), /ALTER TABLE portal_section_settings[\s\S]*ADD COLUMN hero_config_json/);
  assert.doesNotMatch(read("drizzle/0106_section_visuals.sql"), /searchPlaceholder|ctaLabel|quickLinks|hero_config_json/);
});

test("CTA and quick link URLs fail closed and CTA variants are constrained", () => {
  assert.match(sectionStore, /value\.startsWith\("\/"\) \|\| \/\^https:/);
  assert.match(sectionStore, /CTA URL musí byť interná/);
  assert.match(sectionStore, /Quick link URL musí byť interná/);
  assert.match(sectionStore, /item\.ctaVariant === "primary" \|\| item\.ctaVariant === "accent" \|\| item\.ctaVariant === "secondary"/);
  assert.match(heroCss, /\.managedCta\[data-variant="accent"\][\s\S]*#d95f45/);
});

test("events have a safe default coral CTA and no implementation copy", () => {
  assert.match(portal, /slug: "podujatia"[\s\S]*ctaLabel: "\+ Pridať podujatie"[\s\S]*ctaVariant: "accent"/);
  assert.doesNotMatch(events, /Rýchle vstupy používajú existujúce verejné kategórie/);
  assert.match(events, /Vyberte si typ podujatia a zobrazte aktuálne termíny, miesto a ďalšie detaily/);
});

test("missing hero config falls back to route copy and static canonical defaults", () => {
  assert.match(hero, /const managedTitle = visual\.heroContent\?\.title \|\| title/);
  assert.match(hero, /const config: SectionHeroConfig = visual\.heroContent\?\.config \?\? \{\}/);
  assert.match(read("lib/section-visual-store.ts"), /heroContent: subpage/);
  assert.match(sectionStore, /heroConfig: \{ \.\.\.\(base\.heroConfig \?\? \{\}\), \.\.\.cleanHeroConfig/);
  assert.match(sectionStore, /if \(!db\) return defaultManagedSections\(\)/);
});
test("homepage remains its own design and only keeps the existing home.hero visual source", () => {
  assert.match(home, /getResolvedSectionVisual\("home\.hero"\)/);
  assert.doesNotMatch(home, /UnifiedSectionHero/);
  assert.match(home, /data-home-hero/);
});

test("detail pages remain outside SECTION-HERO-V2", () => {
  for (const path of [
    "components/article-detail.tsx",
    "components/event-detail.tsx",
    "components/directory-profile-detail.tsx",
    "components/organization-profile-detail.tsx",
    "components/adoption-detail.tsx",
  ]) {
    assert.doesNotMatch(read(path), /UnifiedSectionHero/);
  }
});

test("hero images still come only from section visuals, never list entities", () => {
  for (const path of [
    "components/directory-page.tsx",
    "components/events-page.tsx",
    "components/help-overview.tsx",
    "components/adoption-catalog.tsx",
    "components/lost-found-dogs-page.tsx",
    "components/reviews-hub.tsx",
    "app/clanky/page.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /getSectionHeroVisual/);
    assert.doesNotMatch(source, /visual=\{[^}]*(?:profile|event|article|dog|report)\.(?:image|imageUrl|mainImage)/);
  }
});
