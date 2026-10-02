import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const unified = read("components/public-visual-system/unified-section-hero.tsx");
const unifiedCss = read("components/public-visual-system/unified-section-hero.module.css");
const adminVisuals = read("components/admin-section-visuals.tsx");
const editorial = read("components/editorial-section.tsx");
const portalHub = read("components/portal-hub.tsx");
const portalTopic = read("components/portal-topic.tsx");
const directory = read("components/directory-page.tsx");
const events = read("components/events-page.tsx");
const helpOverview = read("components/help-overview.tsx");
const helpPage = read("components/help-page.tsx");
const adoption = read("components/adoption-catalog.tsx");
const lostFound = read("components/lost-found-dogs-page.tsx");
const reviews = read("components/reviews-hub.tsx");
const breeds = read("app/plemena/page.tsx");
const news = read("app/clanky/page.tsx");
const home = read("app/page.tsx");
const searchPage = read("app/hladat/page.tsx");
const portalSearch = read("lib/portal-search.ts");
const sectionRoute = read("app/[section]/page.tsx");
const contentRoute = read("app/[section]/[slug]/page.tsx");

test("one canonical UnifiedSectionHero contract owns the section header", () => {
  assert.match(unified, /data-unified-section-hero/);
  assert.match(unified, /data-section-visual-key/);
  assert.match(unified, /data-unified-section-hero-media/);
  assert.match(unified, /data-unified-section-hero-copy/);
  assert.match(unified, /data-unified-section-hero-tools/);
  assert.match(unified, /<h1>/);
});

test("desktop remains image-led and uses the low 16:6 contract", () => {
  assert.match(unifiedCss, /object-position:\s*var\(--section-visual-desktop-x/);
  assert.match(unifiedCss, /--section-visual-desktop-y/);
  assert.match(unifiedCss, /--section-visual-desktop-zoom/);
  assert.match(read("lib/section-visual-contract.ts"), /SECTION_VISUAL_DESKTOP_ASPECT = \[16, 7\]/);
});

test("mobile is a standalone low 16:6 media block with no overlay", () => {
  assert.match(unifiedCss, /@media \(max-width: 767px\)/);
  assert.match(unifiedCss, /\.copy\s*\{[\s\S]*order:\s*1/);
  assert.match(unifiedCss, /\.media\s*\{[\s\S]*position:\s*relative[\s\S]*order:\s*2[\s\S]*aspect-ratio:\s*4 \/ 3/);
  assert.match(unifiedCss, /\.tools\s*\{[\s\S]*order:\s*3/);
  assert.match(unifiedCss, /\.shade\s*\{\s*display:\s*none/);
  assert.match(read("lib/section-visual-contract.ts"), /SECTION_VISUAL_MOBILE_ASPECT = \[4, 3\]/);
});

test("desktop and mobile independently consume X Y zoom", () => {
  for (const token of [
    "--section-visual-desktop-x", "--section-visual-desktop-y", "--section-visual-desktop-zoom",
    "--section-visual-mobile-x", "--section-visual-mobile-y", "--section-visual-mobile-zoom",
  ]) assert.match(unified + unifiedCss, new RegExp(token));
});

test("mobile admin preview has no text search CTA safe zone", () => {
  assert.doesNotMatch(adminVisuals, /styles\.mobileSafeZone/);
  assert.match(adminVisuals, /mode === "desktop"[\s\S]*styles\.desktopSafeZone/);
  assert.match(adminVisuals, /16 : 6.*potiahni obrázok do správnej polohy/);
});

test("main editorial sections use canonical hero and section visual keys", () => {
  assert.match(editorial, /UnifiedSectionHero/);
  assert.match(editorial, /getSectionHeroVisual/);
  assert.match(editorial, /section\./);
  for (const slug of ["steniatka", "starostlivost", "aktivity"]) assert.match(editorial, new RegExp(slug));
});

test("editorial subsections use subsection visual keys and real topic search scope", () => {
  assert.match(editorial, /subsection\./);
  assert.match(editorial, /subpage\.slug/);
  assert.match(editorial, /name: "podsekcia", value: subpage\.slug/);
  assert.match(portalSearch, /a\.portal_subpage = \?/);
  assert.match(searchPage, /podsekcia/);
});

test("Novinky uses section.novinky and never derives hero from article image", () => {
  assert.match(news, /getSectionHeroVisual\("section\.novinky"\)/);
  assert.doesNotMatch(news, /articles\.find\([^)]*article\.image/);
  assert.match(news, /action="\/clanky"/);
  assert.match(news, /inputName="hladat"/);
});

test("Plemena uses section.plemena and existing q browser contract", () => {
  assert.match(breeds, /getSectionHeroVisual\("section\.plemena"\)/);
  assert.match(breeds, /action="\/plemena"/);
  assert.match(breeds, /initialFilters\.query/);
});

test("directory root and categories resolve only section visual keys", () => {
  assert.match(directory, /directory\./);
  assert.match(directory, /section\.adresar/);
  assert.doesNotMatch(directory, /visual=\{[^}]*profile\.imageUrl/);
  assert.match(directory, /\/adresar\//);
});

test("events root and categories resolve section events keys without event images", () => {
  assert.match(events, /section\.podujatia/);
  assert.match(events, /events\./);
  assert.doesNotMatch(events, /visual=\{[^}]*event\.imageUrl/);
  assert.match(events, /initialQuery/);
});

test("Help root is help-only search and hero never uses dynamic case image", () => {
  assert.match(helpOverview, /getSectionHeroVisual\("section\.pomoc-psom"\)/);
  assert.match(helpOverview, /name: "sekcia", value: "pomoc-psom"/);
  assert.match(portalSearch, /section === "pomoc-psom"/);
  assert.doesNotMatch(helpOverview, /visual=\{[^}]*imageUrl/);
});

test("Help categories preserve their existing area-specific search mechanisms", () => {
  assert.match(helpPage, /help\./);
  assert.match(helpPage, /initialQuery/);
  assert.match(adoption, /getSectionHeroVisual\("help\.adopcia"\)/);
  assert.match(adoption, /action="\/pomoc-psom\/adopcia"/);
  assert.match(lostFound, /getSectionHeroVisual\("help\.stratene-a-najdene"\)/);
  assert.match(lostFound, /action=\{basePath\}/);
});

test("Reviews root and categories preserve review scope", () => {
  assert.match(reviews, /getSectionHeroVisual\("section\.recenzie"\)/);
  assert.match(reviews, /name: "sekcia", value: "recenzie"/);
  assert.match(portalTopic, /reviews\./);
  assert.match(portalTopic, /name: "podsekcia", value: subpage\.slug/);
});

test("legacy PortalHub no longer chooses first article as hero", () => {
  assert.doesNotMatch(portalHub, /find\([^\n]*article\.image/);
  assert.doesNotMatch(portalHub, /portalSectionHeroImage/);
  assert.match(portalHub, /getSectionHeroVisual/);
});

test("homepage remains separate but keeps home.hero visual store", () => {
  assert.match(home, /getResolvedSectionVisual\("home\.hero"\)/);
  assert.doesNotMatch(home, /UnifiedSectionHero/);
});

test("detail page routing remains intact and out of section hero scope", () => {
  assert.match(contentRoute, /<ArticleDetail/);
  assert.match(contentRoute, /<EventDetail/);
  assert.doesNotMatch(read("components/article-detail.tsx"), /UnifiedSectionHero/);
  assert.doesNotMatch(read("components/event-detail.tsx"), /UnifiedSectionHero/);
});

test("main route preserves SEO structured data while delegating section heroes", () => {
  assert.match(sectionRoute, /buildCollectionPageJsonLd/);
  assert.match(sectionRoute, /<ReviewsHub/);
  assert.match(sectionRoute, /<EventsPage/);
  assert.match(sectionRoute, /<PortalHub/);
});

test("SECTION-HERO-V2 adds only the approved 0107 hero config migration", () => {
  const migrations = readdirSync("drizzle").filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  assert.equal(migrations.at(-1), "0107_section_hero_config.sql");
  assert.equal(migrations.filter((name) => name.startsWith("0107_")).length, 1);
});

test("cards retain dynamic images while hero sources are stable", () => {
  assert.match(directory, /profile\.imageUrl/);
  assert.match(helpOverview, /item\.imageUrl/);
  assert.match(adoption, /mainImage/);
  assert.match(lostFound, /report\.mainImage/);
  assert.match(read("components/article-card.tsx"), /article\.image/);
});
