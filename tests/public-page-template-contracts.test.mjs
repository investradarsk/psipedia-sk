import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Guard actual public route -> shared template wiring, not only shared CSS.
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

const details = [
  ["plemeno", "app/plemena/[slug]/page.tsx", /getPublishedBreed\(slug\)/, /export default async function BreedDetailPage/, /data-testid="breed-content-layout"/],
  ["článok", "app/clanky/[slug]/page.tsx", /getPublishedArticle\(slug\)/, /<ArticleDetail article=\{article\}/],
  ["článok v rubrike", "app/[section]/[slug]/page.tsx", /getPublishedArticle\(slug\)/, /<ArticleDetail article=\{article\}/],
  ["Adresár", "app/adresar/[category]/[slug]/page.tsx", /getPublishedDirectoryProfile\(category, resolvedSlug\)/, /<DirectoryProfileDetail presentation=\{presentation\}/],
  ["podujatie", "app/[section]/[slug]/page.tsx", /getPublishedEvent\(slug\)/, /<EventDetail event=\{event\}/],
  ["všeobecná Pomoc psom", "app/pomoc-psom/[category]/[slug]/page.tsx", /getPublishedHelpCase\(category, slug\)/, /<HelpDetail item=\{item\}/],
  ["adopcia", "app/pomoc-psom/adopcia/[slug]/page.tsx", /getAdoptionBySlug\(slug\)/, /<AdoptionDetail dog=\{dog\} organization=\{organization\}/],
  ["organizácia", "app/organizacie/[slug]/page.tsx", /getPublicOrganizationCompositionBySlug\(slug, requireDatabase\(\)\)/, /<OrganizationProfileDetail composition=\{composition\}/],
  ["e-shop", "app/recenzie/eshopy/[slug]/page.tsx", /getPublishedEshopBySlug\(slug\)/, /export default async function EshopProfilePage/, /<PublicActionLink variant="primary"/],
];

test("public detail routes select one canonical renderer and load their own content", () => {
  assert.equal(details.length, 9);
  for (const [name, route, loader, renderer, layout] of details) {
    const source = read(route);
    assert.match(source, loader, name + " must load public content");
    assert.match(source, renderer, name + " must use a shared detail implementation");
    if (layout) assert.match(source, layout, name + " must preserve its layout");
  }
});

test("stratené a nájdené psy have one shared detail with explicit variant", () => {
  for (const [route, type] of [
    ["app/pomoc-psom/stratene-psy/[slug]/page.tsx", "LOST"],
    ["app/pomoc-psom/najdene-psy/[slug]/page.tsx", "FOUND"],
  ]) {
    const source = read(route);
    assert.match(source, new RegExp('<LostFoundDogDetail type="' + type + '" slug=\\{slug\\}'));
    assert.match(source, new RegExp('lostFoundDogMetadata\\("' + type + '", slug\\)'));
  }
});

test("FCI has a purpose-built subdetail rather than a second breed profile", () => {
  const fci = read("app/plemena/[slug]/fci-standard/page.tsx");
  assert.match(fci, /getPublishedBreed\(slug\)/);
  assert.match(fci, /export default async function BreedFciStandardPage/);
  assert.doesNotMatch(fci, /<ArticleDetail|<DirectoryProfileDetail/);
});

const listings = [
  ["plemená", "app/plemena/page.tsx", /<BreedBrowser/],
  ["články", "app/clanky/page.tsx", /<ArticleBrowser/],
  ["Adresár", "app/adresar/[category]/page.tsx", /<DirectoryPage result=\{result\}/],
  ["Adresár podľa polohy", "app/adresar/[category]/kraj/[locationSlug]/page.tsx", /<DirectoryLocationLandingPage landing=\{landing\}/],
  ["Adresár podľa mesta", "app/adresar/[category]/mesto/[locationSlug]/page.tsx", /<DirectoryLocationLandingPage landing=\{landing\}/],
  ["Adresár podľa okresu", "app/adresar/[category]/okres/[locationSlug]/page.tsx", /<DirectoryLocationLandingPage landing=\{landing\}/],
  ["chovateľské stanice", "app/adresar/chovatelske-stanice/plemeno/[breedSlug]/page.tsx", /<BreedingStationLandingPage landing=\{landing\}/],
  ["chovateľské stanice podľa kraja", "app/adresar/chovatelske-stanice/kraj/[regionSlug]/page.tsx", /<BreedingStationLandingPage landing=\{landing\}/],
  ["chovateľské stanice podľa plemena a kraja", "app/adresar/chovatelske-stanice/plemeno/[breedSlug]/kraj/[regionSlug]/page.tsx", /<BreedingStationLandingPage landing=\{landing\}/],
  ["redakčné témy", "app/tema/[slug]/page.tsx", /<ArticleCard article=\{article\}/],
  ["porovnanie plemien", "app/porovnat-plemena/page.tsx", /<BreedComparison breeds=\{breeds\}/],
  ["Pomoc psom", "app/pomoc-psom/[category]/page.tsx", /<HelpPage items=\{items\}/],
  ["adopcie", "app/pomoc-psom/adopcia/page.tsx", /<AdoptionCatalog/],
  ["stratené psy", "app/pomoc-psom/stratene-psy/page.tsx", /<LostFoundDogsPage type="LOST"/],
  ["nájdené psy", "app/pomoc-psom/najdene-psy/page.tsx", /<LostFoundDogsPage type="FOUND"/],
];

test("public category and listing routes reuse existing shared presentations", () => {
  for (const [name, route, renderer] of listings)
    assert.match(read(route), renderer, name + " listing template missing");
  const section = read("app/[section]/page.tsx");
  for (const renderer of [/<PortalHub section=\{section\}/, /<ReviewsHub section=\{section\}/, /<EventsPage listing=\{events\}/])
    assert.match(section, renderer);
  const subpage = read("app/[section]/[slug]/page.tsx");
  for (const renderer of [/<PortalTopic/, /<NewsHub/, /<EventsPage listing=\{events\}/])
    assert.match(subpage, renderer);
});

test("generic Help cannot show a duplicate adoption or shelter template", () => {
  const dispatcher = read("components/help-detail.tsx");
  const variants = read("components/help-details/help-detail-types.tsx");
  assert.match(dispatcher, /item\.category === "adopcia"/);
  assert.match(variants, /Exclude<HelpCategorySlug, "utulky" \| "adopcia">/);
  assert.doesNotMatch(variants, /\bAdoptionHelpDetail\b/);
  const route = read("app/pomoc-psom/[category]/[slug]/page.tsx");
  assert.match(route, /permanentRedirect/);
  assert.match(route, /organizacie/);
});

test("redakčné kategórie keep one navigator and intended hero variations", () => {
  const topic = read("components/portal-topic.tsx");
  const hub = read("components/portal-hub.tsx");
  assert.equal((topic.match(/<PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/g) ?? []).length, 1);
  assert.match(hub, /<UnifiedSectionHero/);
  assert.match(topic, /<UnifiedSectionHero/);
  assert.match(topic, /<SectionHero/);
});

test("visual fixtures cover actual canonical details in desktop/mobile screenshot mode", () => {
  const fixture = read("tests/public-details-v2-ui.test.mjs");
  for (const name of ["directory", "event", "adoption", "organization", "lost", "lost-resolved", "found",
    "help-docasna-opatera", "help-zbierky", "help-dobrovolnictvo", "help-urgentne-pripady"])
    assert.ok(fixture.includes("'" + name + "'"), "missing fixture " + name);
  assert.doesNotMatch(fixture, /'help-adopcia'|'help-stratene-a-najdene'/);
  assert.match(fixture, /const shots=process\.env\.DETAIL_TEST_SCREENSHOTS/);
  assert.match(fixture, /width === 1440 \|\| width === 320/);
});
