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
  assert.match(globals, /\.shell\s*\{[\s\S]*width:\s*min\(1180px,\s*calc\(100% - 48px\)\)/);
  assert.match(globals, /@media \(max-width: 820px\)[\s\S]*\.shell\s*\{[\s\S]*width:\s*min\(100% - 32px,\s*680px\)/);
  assert.match(globals, /@media \(max-width: 620px\)[\s\S]*\.shell\s*\{[\s\S]*width:\s*min\(100% - 24px,\s*520px\)/);
});

test("landing and listing variants own the canonical vertical rhythm", () => {
  assert.match(layoutCss, /\.landing\s*\{\s*padding-top:\s*40px/);
  assert.match(layoutCss, /\.listing\s*\{\s*padding-top:\s*24px/);
  assert.match(layoutCss, /@media \(max-width: 820px\)[\s\S]*\.landing\s*\{\s*padding-top:\s*32px/);
  assert.match(layoutCss, /@media \(max-width: 620px\)[\s\S]*\.landing\s*\{\s*padding-top:\s*24px[\s\S]*\.listing\s*\{\s*padding-top:\s*18px/);
});

test("shared landing heading owns typography and heading-to-content spacing", () => {
  assert.match(layout, /data-public-landing-section-heading/);
  assert.match(layout, /data-public-landing-eyebrow/);
  assert.match(layout, /data-public-landing-heading/);
  assert.match(layoutCss, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 500px\)/);
  assert.match(layoutCss, /gap:\s*32px/);
  assert.match(layoutCss, /margin-bottom:\s*16px/);
  assert.match(layoutCss, /font-size:\s*\.7rem/);
  assert.match(layoutCss, /font-weight:\s*900/);
  assert.match(layoutCss, /letter-spacing:\s*\.09em/);
  assert.match(layoutCss, /\.heading h2\s*\{[\s\S]*margin:\s*5px 0 0[\s\S]*font-size:\s*clamp\(1\.55rem, 2\.8vw, 2\.35rem\)[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*1\.08/);
  assert.match(layoutCss, /\.description\s*\{[\s\S]*max-width:\s*500px[\s\S]*font-size:\s*\.82rem[\s\S]*line-height:\s*1\.55/);
  assert.match(layoutCss, /@media \(max-width: 700px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*gap:\s*8px/);
});

test("all four comparable category landing roots use the same landing shell and shared heading", () => {
  for (const source of [events, directory, helpOverview, reviews]) {
    assert.match(source, /PublicContentShell/);
    assert.match(source, /variant="landing"|variant=\{active \? "listing" : "landing"\}/);
    assert.match(source, /PublicLandingSectionHeading/);
  }
  assert.match(events, /PublicCategoryTiles/);
  assert.match(directory, /PublicCategoryTiles/);
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

test("directory has one post-hero spacing owner instead of legacy double spacing", () => {
  assert.doesNotMatch(directoryCss, /\.discoveryHeading|\.sectionHeading|\.overviewHeading/);
  assert.doesNotMatch(directoryCss, /\.discovery\s*\{[^}]*?(?:margin-top|padding-top)/s);
  assert.doesNotMatch(directoryCss, /\.categoryNav(?:Compact)?\s*\{[^}]*margin-top/s);
  assert.equal((directoryCss.match(/PUBLIC-LANDING-ALIGNMENT-1: one compact category-navigation contract/g) ?? []).length, 1);
  assert.doesNotMatch(directory, /className=.*shell.*styles\.(?:overview|secondaryShell|providerCta|resultsShell)/);
  assert.match(directory, /<PageContainer className=\{styles\.overview\}>/);
  assert.match(directory, /<PageContainer className=\{styles\.resultsShell\}>/);
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
