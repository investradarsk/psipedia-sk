import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const layout = read("components/public-visual-system/public-landing-layout.tsx");
const layoutCss = read("components/public-visual-system/public-landing-layout.module.css");
const globals = read("app/globals.css");
const events = read("components/events-page.tsx");
const eventsCss = read("components/events-public.module.css");
const directory = read("components/directory-page.tsx");
const directoryCss = read("components/directory-public.module.css");
const helpOverview = read("components/help-overview.tsx");
const helpPage = read("components/help-page.tsx");
const helpBrowser = read("components/help-browser.tsx");
const helpCss = read("components/help-public.module.css");
const adoption = read("components/adoption-catalog.tsx");
const lostFoundHub = read("app/pomoc-psom/stratene-a-najdene/page.tsx");
const lostFoundListing = read("components/lost-found-dogs-page.tsx");
const lostFoundCss = read("components/lost-found-dogs.module.css");
const reviews = read("components/reviews-hub.tsx");
const reviewsCss = read("components/reviews-hub.module.css");
const portalTopic = read("components/portal-topic.tsx");
const editorial = read("components/editorial-section.tsx");
const editorialCss = read("components/editorial-section.module.css");
const news = read("app/clanky/page.tsx");
const breeds = read("app/plemena/page.tsx");

test("canonical post-hero shells reuse PageContainer instead of inventing another max width", () => {
  assert.match(layout, /import \{ PageContainer \}/);
  assert.match(layout, /<PageContainer/);
  assert.match(layout, /data-public-content-shell/);
  assert.match(layout, /data-public-content-variant=\{variant\}/);
  assert.match(layoutCss, /\.shell\s*\{\s*min-width:\s*0;\s*\}/);
  assert.match(globals, /\.shell\s*\{[\s\S]*width:\s*min\(var\(--ps-content-max\),\s*calc\(100% - 48px\)\)/);
  assert.match(globals, /@media \(max-width: 820px\)[\s\S]*\.shell\s*\{[\s\S]*width:\s*min\(100% - 32px,\s*680px\)/);
  assert.match(globals, /@media \(max-width: 620px\)[\s\S]*\.shell\s*\{[\s\S]*width:\s*min\(100% - 24px,\s*520px\)/);
});

test("landing and listing variants own the canonical vertical rhythm", () => {
  assert.match(layoutCss, /\.landing\s*\{\s*padding-top:\s*26px/);
  assert.match(layoutCss, /\.listing\s*\{\s*padding-top:\s*16px/);
  assert.match(layoutCss, /@media \(max-width: 820px\)[\s\S]*\.landing\s*\{\s*padding-top:\s*24px/);
  assert.match(layoutCss, /@media \(max-width: 620px\)[\s\S]*\.landing\s*\{\s*padding-top:\s*18px[\s\S]*\.listing\s*\{\s*padding-top:\s*12px/);
});

test("shared landing heading owns typography and heading-to-content spacing", () => {
  assert.match(layout, /data-public-landing-section-heading/);
  assert.match(layout, /data-public-landing-eyebrow/);
  assert.match(layout, /data-public-landing-heading/);
  assert.match(layoutCss, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 500px\)/);
  assert.match(layoutCss, /gap:\s*clamp\(12px, 2vw, 24px\)/);
  assert.match(layoutCss, /margin-bottom:\s*16px/);
  assert.match(layoutCss, /font-size:\s*\.7rem/);
  assert.match(layoutCss, /font-weight:\s*900/);
  assert.match(layoutCss, /letter-spacing:\s*\.09em/);
  assert.match(layoutCss, /\.heading h2\s*\{[\s\S]*margin:\s*5px 0 0[\s\S]*font-size:\s*clamp\(1\.55rem, 2\.8vw, 2\.35rem\)[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*1\.08/);
  assert.match(layoutCss, /\.description\s*\{[\s\S]*max-width:\s*500px[\s\S]*font-size:\s*\.82rem[\s\S]*line-height:\s*1\.55/);
  assert.match(layoutCss, /@media \(max-width: 700px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*gap:\s*8px/);
});

test("directory root and categories retain shared content shell and canonical routes", () => {
  assert.match(directory, /<PublicContentShell variant="listing" className=\{styles\.resultsShell\}>/);
  assert.match(directory, /DirectoryCategoryNavigation/);
  assert.match(directory, /directoryCategoryHref\(category\)/);
  assert.match(directory, /UnifiedSectionHeroShell/);
  assert.doesNotMatch(events, /PublicSubcategoryNavigator/);
  assert.match(reviews, /PublicCategoryTiles/);
  assert.match(helpOverview, /overviewCategoryGrid/);
});


test("filter-first landings use the explicit listing variant", () => {
  for (const source of [news, breeds, events, directory, helpBrowser, adoption, lostFoundListing, lostFoundHub, portalTopic]) {
    assert.match(source, /PublicContentShell/);
    assert.match(source, /variant="listing"|variant=\{active \? "listing" : "landing"\}/);
  }
});

test("help no longer owns a second horizontal shell system", () => {
  assert.doesNotMatch(helpCss, /\.shell\s*\{/);
  for (const source of [helpOverview, helpPage, helpBrowser]) assert.doesNotMatch(source, /styles\.shell/);
  assert.match(helpOverview, /<PageContainer className=\{styles\.overviewSectionInner\}>/);
  assert.match(helpOverview, /<PageContainer className=\{styles\.overviewPromoCopy\}>/);
  assert.match(helpOverview, /<PageContainer className=\{styles\.closingCtaInner\}>/);
  assert.match(helpBrowser, /<PageContainer className=\{styles\.results\}>/);
  assert.match(helpCss, /@media\(max-width:900px\)[\s\S]*\.overviewCategoryGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(helpCss, /@media\(max-width:620px\)[\s\S]*\.overviewCategoryGrid\{grid-template-columns:1fr;gap:9px\}/);
});

test("adoption keeps hero outside the canonical listing content shell", () => {
  assert.match(adoption, /<UnifiedSectionHeroShell>[\s\S]*<\/UnifiedSectionHeroShell>[\s\S]*<PublicContentShell variant="listing">[\s\S]*className=\{styles\.filters\}[\s\S]*className=\{styles\.grid\}/);
  assert.doesNotMatch(adoption, /<PublicContentShell[^>]*>[\s\S]*<UnifiedSectionHeroShell>/);
});

test("lost-found hub is no longer a legacy page-hero route", () => {
  assert.doesNotMatch(lostFoundHub, /page-hero/);
  assert.match(lostFoundHub, /UnifiedSectionHeroShell/);
  assert.match(lostFoundHub, /getSectionHeroVisual\("help\.stratene-a-najdene"\)/);
  assert.match(lostFoundHub, /PublicContentShell variant="listing"/);
});

test("directory has one canonical post-hero search and category navigation", () => {
  assert.match(directory, /data-directory-main-search/);
  assert.match(directory, /<DirectoryCategoryNavigation items=\{categoryItems\}/);
  assert.match(directory, /<PublicContentShell variant="listing" className=\{styles\.resultsShell\}>/);
  assert.match(directoryCss, /\.directoryColumns\s*\{/);
  assert.match(directoryCss, /\.resultsSection\s*\{\s*padding-block:\s*0;/);
});


test("reviews use shared headings while only the first category section loses legacy top padding", () => {
  assert.doesNotMatch(reviews, /styles\.(?:modeHeading|sectionHeading|eyebrow)/);
  assert.doesNotMatch(reviewsCss, /\.modeHeading|\.sectionHeading/);
  assert.match(reviews, /PublicLandingSectionHeading/);
  assert.match(portalTopic, /review-topic-first-section/);
  assert.match(globals, /\.section\.review-topic-first-section\s*\{\s*padding-top:\s*0/);
});

test("editorial second-pass headings share the same contract without changing callouts or carousel", () => {
  assert.doesNotMatch(editorial, /styles\.sectionHeading/);
  assert.doesNotMatch(editorialCss, /\.sectionHeading/);
  assert.match(editorial, /PublicLandingSectionHeading/);
  assert.match(editorial, /HubCallout/);
  assert.match(editorial, /HorizontalCarouselControls/);
  assert.match(editorial, /PortalSectionTabs/);
});

test("event category listing and lost-found listing do not stack old top padding on the listing variant", () => {
  assert.match(eventsCss, /\.calendarSectionListing\s*\{\s*padding-top:\s*0/);
  assert.doesNotMatch(lostFoundCss, /\.listingShell\s*\{[^}]*padding-top/s);
});


test("SERVICES-V2 has one main GET search, no category preview data path and no duplicate visible search", () => {
  const root = read("app/adresar/page.tsx");
  const category = read("app/adresar/[category]/page.tsx");
  const form = read("components/directory-filter-form.tsx");
  const results = read("components/directory-results.tsx");
  const query = read("lib/directory-query.ts");
  assert.match(root, /listPublishedDirectoryProfiles\(\{ filters \}\)/);
  assert.doesNotMatch(root, /getDirectoryCategoryPreviews|getDirectoryCategoryCounts|showOverview/);
  assert.match(directory, /SectionHeroSearch[\s\S]*formScope="services"/);
  assert.doesNotMatch(form, /<input name="q"/);
  assert.match(form, /directoryQueryFields\(filters/);
  assert.match(results, /directoryPageHref\(basePath, filters, result\.page/);
  assert.match(query, /directoryQueryFields/);
  assert.match(query, /directoryEmptyQueryRedirect/);
  assert.match(category, /directoryCategoryListingMetadata/);
  assert.match(category, /resolveListingIndexPolicy/);
});


test("SERVICES-V2 map and provider CTAs remain safe and above real popularity", () => {
  assert.match(directory, /data-directory-map-cta/);
  assert.match(directory, /data-directory-provider-cta/);
  assert.match(directory, /mapHref\(filters, active\?\.slug\)/);
  assert.match(directory, /serializeMapUiFilters/);
  assert.match(directory, /href="\/o-nas#kontakt"/);
  assert.match(directory, /getArticleDiscoveryData/);
  assert.match(directory, /ArticlePopularitySidebar/);
  assert.doesNotMatch(directory, /<MapExperience/);
});


test("SERVICES-V2 category navigation preserves canonical hrefs and accessible more", () => {
  const navigation = read("components/directory-category-navigation.tsx");
  const navigator = read("components/public-visual-system/public-subcategory-navigator.tsx");
  assert.match(directory, /href: directoryCategoryHref\(category\)/);
  assert.doesNotMatch(directory, /\?category=/);
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  assert.match(navigation, /<PublicSubcategoryNavigator/);
  assert.match(navigator, /aria-current=\{item\.current \? "page" : undefined\}/);
});


test("SERVICES-V2 renders search, categories, filters, cards and sidebar in approved order", () => {
  const search = directory.indexOf("<SectionHeroSearch");
  const nav = directory.indexOf("<DirectoryCategoryNavigation");
  const filter = directory.indexOf("<DirectoryFilterForm");
  const results = directory.indexOf("<DirectoryResults");
  const sidebar = directory.indexOf('data-directory-map-cta');
  assert.ok(search >= 0 && nav > search && filter > nav && results > filter && sidebar > results);
  assert.match(directory, /data-directory-columns/);
  assert.match(read("components/directory-filter-form.tsx"), /data-directory-filter-disclosure/);
  assert.match(directory, /getSectionHeroVisual\(active \? `directory\.\$\{active\.slug\}` : "section\.adresar"\)/);
});


test("SERVICES-V2 keeps cards and URLs while preventing narrow three-column thumbnails", () => {
  const cards = read("components/directory-card.tsx");
  const results = read("components/directory-results.tsx");
  assert.match(directoryCss, /grid-template-columns: 220px minmax\(0,1fr\) 255px/);
  assert.match(directoryCss, /@media \(max-width: 820px\)[\s\S]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(directoryCss, /\.directoryColumns \.listGrid:global\(\.directory-grid\)/);
  assert.match(cards, /directoryProfileHref\(profile\)/);
  assert.match(cards, /profile\.imageUrl &&/);
  assert.match(results, /directoryPageHref\(basePath, filters/);
});


test("SERVICES-V2 root shows published profiles and never fetches hidden category previews", () => {
  const root = read("app/adresar/page.tsx");
  const cat = read("app/adresar/[category]/page.tsx");
  assert.doesNotMatch(root, /getDirectoryCategoryPreviews|showOverview|categoryPreviews/);
  assert.match(root, /<DirectoryPage result=\{result\} filters=\{filters\} \/>/);
  assert.match(cat, /<DirectoryPage result=\{result\} filters=\{filters\} initialCategory=\{category.slug\}/);
  assert.doesNotMatch(directory, /showResults|DirectoryCategoryOverview/);
  assert.match(directory, /<DirectoryResults/);
});


test("PUBLIC-MOBILE-GUTTER-1 uses the homepage 12px gutter for all PageContainer public routes", () => {
  const ds = read("app/design-system.css");
  assert.match(ds, /\.public-shell\s*\{[^}]*max\(12px, env\(safe-area-inset-left, 0px\)\)[^}]*max\(12px, env\(safe-area-inset-right, 0px\)\)/s);
  assert.match(ds, /--ps-space-stack:\s*16px;/);
  assert.match(layoutCss, /@media \(max-width: 620px\)[\s\S]*?\.heading\s*\{\s*margin-bottom:\s*12px;/);
});
