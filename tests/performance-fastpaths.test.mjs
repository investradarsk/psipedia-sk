import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Guard performance fast paths that must remain safe across future refactors.
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/site-header.tsx", import.meta.url), "utf8");
const nameDays = readFileSync(new URL("../lib/dog-name-day-store.ts", import.meta.url), "utf8");
const publicPartnerSession = readFileSync(new URL("../lib/public-partner-session.ts", import.meta.url), "utf8");
const directoryProfile = readFileSync(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8");

test("admin access still verifies every JWT, but reuses JWK fetches and imported keys", () => {
  assert.match(worker, /const accessJwksLoads = new Map/);
  assert.match(worker, /const importedAccessKeys = new WeakMap/);
  assert.match(worker, /crypto\.subtle\.verify\("RSASSA-PKCS1-v1_5"/);
  assert.match(worker, /getImportedAccessKey\(jwk\)/);
  assert.match(worker, /accessJwksLoads\.delete\(cacheKey\)/);
  assert.match(worker, /importedAccessKeys\.delete\(jwk\)/);
  assert.match(worker, /ACCESS_JWKS_TTL_MS = 5 \* 60 \* 1000/);
});

test("public layout overlaps navigation and optional partner authentication", () => {
  assert.match(layout, /const navigationPromise = getNavigationItems\(\)/);
  assert.match(layout, /Promise\.all\(\[\s*navigationPromise,/);
  assert.match(layout, /partnerToken \? getPublicPartnerSession/);
});

test("name-day public lookup transfers only fields required for today's strip", () => {
  const start = nameDays.indexOf("export async function getPublishedDogNameDaysForDate");
  const end = nameDays.indexOf("export async function listDogNameDayRecords", start);
  const source = nameDays.slice(start, end);
  assert.match(source, /SELECT month, day, name, status/);
  assert.doesNotMatch(source, /SELECT id, month, day/);
  assert.match(source, /resolveDogNameDay\(date, result\.results\)/);
});

test("public header throttles today's name-day fetch, pauses hidden tabs, and handles date change", () => {
  assert.match(header, /lastDateKey === dateKey && now - lastSuccessfulFetch < 5 \* 60_000/);
  assert.match(header, /document\.visibilityState === "hidden"/);
  assert.match(header, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(header, /timeZone: "Europe\/Bratislava"/);
});

test("partner session is memoized for one React request, and directory detail overlaps D1 reads", () => {
  assert.match(publicPartnerSession, /cache\(async \(token: string\)/);
  assert.match(publicPartnerSession, /getPartnerSession\(\{ token \}\)/);
  assert.match(layout, /getPublicPartnerSession\(partnerToken\)/);
  assert.match(directoryProfile, /getPublicPartnerSession\(token\)/);
  assert.match(directoryProfile, /partnerIdentityPromise\.then/);
  assert.match(directoryProfile, /await Promise\.all\(\[/);
});

test("breed redirects deduplicate D1 lookups with a short bounded isolate cache", () => {
  assert.match(worker, /BREED_REDIRECT_CACHE_TTL_MS = 15_000/);
  assert.match(worker, /BREED_REDIRECT_CACHE_MAX_ENTRIES = 400/);
  assert.match(worker, /cachedCanonicalBreedRedirect\(env\.DB,breedMatch\[1\]\)/);
  assert.match(worker, /breedRedirectCache\.delete\(slug\)/);
  assert.match(worker, /canonicalBreedRedirect\(database, slug\)/);
});

const fs = readFileSync;
const uiSources = {
  footer: fs(new URL("../components/site-footer.tsx", import.meta.url), "utf8"),
  articles: fs(new URL("../components/public-visual-system/public-article-card.tsx", import.meta.url), "utf8"),
  home: fs(new URL("../components/home-editorial.tsx", import.meta.url), "utf8"),
  categories: fs(new URL("../components/admin-directory-module-nav.tsx", import.meta.url), "utf8"),
  dashboard: fs(new URL("../components/admin-workspace-dashboard.tsx", import.meta.url), "utf8"),
  events: fs(new URL("../components/admin-event-dashboard.tsx", import.meta.url), "utf8"),
  help: fs(new URL("../components/admin-help-dashboard.tsx", import.meta.url), "utf8"),
  breeds: fs(new URL("../components/admin-breed-dashboard.tsx", import.meta.url), "utf8"),
};

test("long public lists and admin tables do not trigger speculative RSC prefetches", () => {
  for (const [name, source] of Object.entries(uiSources)) {
    const links = [...source.matchAll(/<Link\b[^>]*>/gs)].map((match) => match[0]);
    assert.ok(links.length > 0, name + ": expected navigational links");
    for (const link of links) {
      assert.match(link, /\bprefetch=\{false\}/, name + ": no automatic prefetch for large link collections");
    }
  }
});

test("public Google Maps renderer JavaScript loads only on test mode or consent", () => {
  const source = readFileSync(new URL("../components/map/map-experience.tsx", import.meta.url), "utf8");
  assert.match(source, /const GoogleMapRenderer = dynamic\(/);
  assert.match(source, /import\("\.\/google-map-renderer"\)/);
  assert.match(source, /testRenderer \|\| \(effectiveRendererEnabled && googleMapsConsent\) \? \(/);
  assert.match(source, /<MapRendererPlaceholder \/>/);
  assert.match(source, /<GoogleMapRenderer/);
});

test("admin feature styles do not block unrelated admin routes", () => {
  const adminLayout = readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
  const uppy = readFileSync(new URL("../components/admin-uppy-gallery-upload.tsx", import.meta.url), "utf8");
  const tour = readFileSync(new URL("../components/admin-tour-button.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(adminLayout, /@uppy\/|driver\.js\/dist\/driver\.css/);
  assert.match(uppy, /import "@uppy\/core\/css\/style\.min\.css"/);
  assert.match(uppy, /import "@uppy\/dashboard\/css\/style\.min\.css"/);
  assert.match(tour, /import\("driver\.js\/dist\/driver\.css"\)/);
  assert.match(tour, /const stylesPromise = import\("driver\.js\/dist\/driver\.css"\)/);
  assert.match(tour, /await import\("driver\.js"\)/);
  assert.match(tour, /await stylesPromise/);
});


test("public hero uses a bounded in-isolate read cache; admin visual reads remain fresh", () => {
  const visual = readFileSync(new URL("../lib/section-visual-store.ts", import.meta.url), "utf8");
  const heroStart = visual.indexOf("export async function getSectionHeroVisual");
  const heroEnd = visual.indexOf("export function resolveSectionVisualList", heroStart);
  const editorStart = visual.indexOf("export async function getStoredSectionVisual");
  const editorEnd = visual.indexOf("export async function getResolvedSectionVisual", editorStart);
  const heroSource = visual.slice(heroStart, heroEnd);
  const editorSource = visual.slice(editorStart, editorEnd);
  assert.match(visual, /PUBLIC_HERO_VISUAL_CACHE_TTL_MS = 15_000/);
  assert.match(visual, /PUBLIC_HERO_VISUAL_CACHE_MAX_KEYS = 128/);
  assert.match(visual, /publicHeroVisualRows\.size >= PUBLIC_HERO_VISUAL_CACHE_MAX_KEYS/);
  assert.match(visual, /publicHeroVisualRows\.delete\(oldest\)/);
  assert.match(heroSource, /publicHeroVisualCache\(visualKey\)\.get\(\(\) => getStoredSectionVisual\(visualKey\)\)/);
  assert.match(heroSource, /resolveSectionVisual\(definition, stored\)/);
  assert.doesNotMatch(editorSource, /publicHeroVisualCache|publicHeroVisualRows/);
});

test("public hero cache invalidates after successful image writes and deletions", () => {
  const visual = readFileSync(new URL("../lib/section-visual-store.ts", import.meta.url), "utf8");
  const saveStart = visual.indexOf("export async function saveStoredSectionVisual");
  const deleteStart = visual.indexOf("export async function deleteStoredSectionVisual");
  const saved = visual.slice(saveStart, deleteStart);
  const deleted = visual.slice(deleteStart);
  assert.match(saved, /\.run\(\);[\s\S]*publicHeroVisualRows\.get\(input\.definition\.visualKey\)\?\.invalidate\(\)/);
  assert.match(deleted, /\.run\(\);[\s\S]*publicHeroVisualRows\.get\(visualKey\)\?\.invalidate\(\)/);
  assert.match(visual, /createShortLivedAsyncCache<StoredSectionVisual \| null>/);
});

test("homepage streams LCP hero before slower editorial D1 reads, keeping all six collection calls", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const loadStart = home.indexOf("function loadHomepageContent()");
  const belowStart = home.indexOf("async function HomeBelowHero");
  const homeStart = home.indexOf("export default async function Home()");
  assert.ok(loadStart >= 0 && belowStart > loadStart && homeStart > belowStart);

  const contentLoader = home.slice(loadStart, belowStart);
  for (const call of [
    "getPublishedArticleSummaries({ limit: 120 })",
    "getHomepageUpcomingEventsWithImages(8)",
    "getHomepageHighlightedHelpCasesWithImages(3)",
    'getHomepageDirectoryProfilesByCategoriesWithImages(["veterinari", "treneri"], 8)',
    "listHomepageFeaturedBreeds(8)",
    'getPublishedDesktopBannerColorsBatch(["homepage:profil", "help:lost-found"])',
  ]) assert.ok(contentLoader.includes(call), "homepage content missing: " + call);
  assert.doesNotMatch(contentLoader, /getSectionHeroVisual\(/);
  assert.match(contentLoader, /return Promise\.all\(\[/);
  assert.match(home.slice(belowStart, homeStart), /\] = await contentPromise/);

  const homeRenderer = home.slice(homeStart);
  assert.match(homeRenderer, /const heroPromise = getSectionHeroVisual\("home\.hero"\);[\s\S]*const contentPromise = loadHomepageContent\(\);[\s\S]*const homeHero = await heroPromise/);
  // The new nonempty fallback reserves the page layout; it must not block
  // the hero or await editorial collections before the first response.
  assert.match(homeRenderer, /<UnifiedSectionHeroShell[\s\S]*visual=\{homeHero\}[\s\S]*<\/UnifiedSectionHeroShell>[\s\S]*<Suspense[\s\S]*data-home-stream-fallback[\s\S]*<HomeBelowHero contentPromise=\{contentPromise\} \/>/);
  assert.doesNotMatch(homeRenderer, /<Suspense fallback=\{null\}>/);
  assert.doesNotMatch(homeRenderer, /await contentPromise|await Promise\.all/);
  assert.match(homeRenderer, /<main id="obsah" className=\{styles\.homeV2\}>/);
});

test("section LCP photos use visible SSR img, eager load and one high priority hint without duplicate preloads", () => {
  const hero = readFileSync(new URL("../components/public-visual-system/unified-section-hero.tsx", import.meta.url), "utf8");
  const media = hero.slice(hero.indexOf('data-unified-section-hero-media'));
  assert.match(media, /<img[\s\S]*src=\{publicHeroImageSrc\(visual\.imageUrl\)\}/);
  assert.match(media, /srcSet=\{publicHeroImageSrcSet\(visual\.imageUrl/);
  assert.match(media, /loading="eager"/);
  assert.match(media, /fetchPriority=\{variant === "homepage-style" \? "high" : undefined\}/);
  assert.doesNotMatch(media, /<link[^>]*rel="preload"/);
  assert.doesNotMatch(media, /preload\(/);
  assert.match(media, /alt=\{visual\.altText\}/);
});


test("PhotoSwipe lightbox and lower homepage calculator are not part of initial interactive chunks", () => {
  const gallery = readFileSync(new URL("../components/public-visual-system/public-photo-gallery.tsx", import.meta.url), "utf8");
  const lightbox = readFileSync(new URL("../components/public-visual-system/public-photoswipe-enhancer.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const island = readFileSync(new URL("../components/lazy-dog-age-calculator.tsx", import.meta.url), "utf8");
  const calculator = readFileSync(new URL("../components/dog-age-calculator.tsx", import.meta.url), "utf8");

  // PhotoSwipe core was already lazy; its Lightbox controller must now also
  // load asynchronously. Preserve the original SSR image links and cleanup.
  assert.match(gallery, /href=\{href\}/);
  assert.match(gallery, /variant === "linked" \? <PublicPhotoSwipeEnhancer>/);
  assert.match(lightbox, /import type PhotoSwipeLightbox from "photoswipe\/lightbox"/);
  assert.doesNotMatch(lightbox, /import PhotoSwipeLightbox from "photoswipe\/lightbox"/);
  assert.match(lightbox, /import\("photoswipe\/lightbox"\)/);
  assert.match(lightbox, /pswpModule: \(\) => import\("photoswipe"\)/);
  assert.match(lightbox, /onFirstClick\(event: MouseEvent\)/);
  assert.match(lightbox, /event\.preventDefault\(\)/);
  assert.match(lightbox, /instance\.loadAndOpen\(index\)/);
  assert.match(lightbox, /window\.location\.assign\(anchor\.href\)/);
  assert.match(lightbox, /lightbox\.destroy\(\)/);
  assert.match(lightbox, /rootMargin: "600px 0px"/);
  // display:contents isn't an IntersectionObserver target with a layout box.
  assert.match(lightbox, /observer\.observe\(links\(\)\.item\(0\) \?\? gallery\)/);
  assert.doesNotMatch(lightbox, /observer\.observe\(gallery\)/);

  assert.match(home, /import \{ LazyDogAgeCalculator \} from "@\/components\/lazy-dog-age-calculator"/);
  assert.match(home, /<LazyDogAgeCalculator \/>/);
  assert.doesNotMatch(home, /import \{ DogAgeCalculator \} from/);
  assert.match(island, /^"use client"/);
  assert.match(island, /lazy\(async \(\) => \{[\s\S]*import\("\.\/dog-age-calculator"\)/);
  assert.match(island, /IntersectionObserver/);
  assert.match(island, /rootMargin: "600px 0px"/);
  assert.match(island, /<Suspense fallback=\{<CalculatorPlaceholder \/>\}>/);
  assert.match(island, /data-home-calculator-island/);
  assert.match(calculator, /export function DogAgeCalculator\(\)/);
  assert.match(calculator, /onChange=\{\(event\) => setAge/);
});


test("article image projection shares its cold-start D1 probe across concurrent public reads", () => {
  const articles = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");
  const start = articles.indexOf("const articleImageProjectionCache");
  const end = articles.indexOf("export async function getPublishedArticleSummaries", start);
  assert.ok(start >= 0 && end > start);
  const projection = articles.slice(start, end);
  assert.match(projection, /new WeakMap<D1Database, string>\(\)/);
  assert.match(projection, /new WeakMap<D1Database, Promise<string>>\(\)/);
  assert.match(projection, /articleImageProjectionLoads\.get\(database\)/);
  assert.match(projection, /if \(pending\) return pending/);
  assert.match(projection, /articleImageProjectionLoads\.set\(database, load\)/);
  assert.match(projection, /await database\.prepare\("PRAGMA table_info\('managed_articles'\)"\)\.all/);
  assert.match(projection, /articleImageProjectionCache\.set\(database, projection\)/);
  assert.match(projection, /return await load/);
  assert.match(projection, /articleImageProjectionLoads\.delete\(database\)/);
  assert.match(projection, /DEFAULT_IMAGE_PROJECTION/);
  assert.match(projection, /thumbnail_display_json/);
  assert.match(projection, /detail_display_json/);
  // A failed/missing legacy projection must retain the existing fallbacks.
  assert.match(projection, /catch \{[\s\S]*old fixture or a staged production rollout/);
});
