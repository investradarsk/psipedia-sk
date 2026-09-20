import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DOG_NAME_DAY_TIME_ZONE, dogNameDayDateKey, resolveDogNameDay } from "../lib/dog-name-days.ts";

const source = readFileSync("components/public-visual-system/public-visual-system.tsx", "utf8");
const styles = readFileSync("components/public-visual-system/public-visual-system.module.css", "utf8");
const barrel = readFileSync("components/public-visual-system/index.ts", "utf8");
const breedDetail = readFileSync("app/plemena/[slug]/page.tsx", "utf8");
const searchPage = readFileSync("app/hladat/page.tsx", "utf8");
const articleCard = readFileSync("components/article-card.tsx", "utf8");
const editorialSection = readFileSync("components/editorial-section.tsx", "utf8");
const newsHub = readFileSync("components/news-hub.tsx", "utf8");
const siteHeader = readFileSync("components/site-header.tsx", "utf8");
const siteHeaderStyles = readFileSync("components/site-header.module.css", "utf8");
const globalStyles = readFileSync("app/globals.css", "utf8");
const icons = readFileSync("components/icons.tsx", "utf8");
const designSystem = readFileSync("app/design-system.css", "utf8");
const homePage = readFileSync("app/page.tsx", "utf8");
const homeEditorial = readFileSync("components/home-editorial.tsx", "utf8");
const homeStyles = readFileSync("app/home-v2.module.css", "utf8");
const eventCard = readFileSync("components/event-card.tsx", "utf8");
const eventStyles = readFileSync("components/events-public.module.css", "utf8");
const articleDetailStyles = readFileSync("components/article-detail.module.css", "utf8");
const adoptionStyles = readFileSync("components/adoption.module.css", "utf8");
const helpStyles = readFileSync("components/help-public.module.css", "utf8");
const lostFoundStyles = readFileSync("components/lost-found-dogs.module.css", "utf8");
const directoryStyles = readFileSync("components/directory-public.module.css", "utf8");


test("public visual system exposes opt-in public-only foundation primitives", () => {
  for (const name of [
    "PublicFoundation",
    "PublicSectionHeader",
    "PublicContentList",
    "PublicArticleListItem",
    "PublicContentListItem",
    "PublicDataCard",
    "PublicActionLink",
    "PublicActionButton",
    "PublicIcon",
  ]) {
    assert.match(source, new RegExp(`export function ${name}\\b`), `${name} export is missing`);
    assert.match(barrel, new RegExp(`\\b${name}\\b`), `${name} barrel export is missing`);
  }
  assert.doesNotMatch(source, /(?:admin|editor)[/-]/i);
  assert.doesNotMatch(styles, /\\.(?:admin|editor)\\b/i);
  assert.doesNotMatch(styles, /(^|[,{]\\s*)(html|body|:root)\\b/m);
});

test("header policy distinguishes editorial, compact, image and data/service presentation", () => {
  assert.match(source, /type PublicHeaderVariant = "editorial" \| "compact" \| "image" \| "data"/);
  assert.match(source, /image\?: \{ src: string; alt: string \}/);
  assert.match(source, /const sideVisual = image \?/);
  assert.match(source, /: visual \?/);
  assert.match(styles, /\.headerEditorial h1,\s*\.headerImage h1/);
  assert.match(styles, /\.headerCompact h1,\s*\.headerData h1/);
  assert.match(styles, /\.headerData\s*\{[^}]*border:/s);
  assert.doesNotMatch(source, /image:\s*\{ src:/);
});

test("typography is compact and keeps editorial versus data heading hierarchy", () => {
  assert.match(styles, /--pv-type-body:\s*\.9375rem/);
  assert.match(styles, /--pv-type-body-dense:\s*\.875rem/);
  assert.match(styles, /--pv-type-data-heading:\s*clamp\(1\.9rem, 3\.4vw, 3\.15rem\)/);
  assert.match(styles, /--pv-type-editorial-heading:\s*clamp\(2\.35rem, 5vw, 4\.25rem\)/);
  assert.match(styles, /--pv-leading-body:\s*1\.62/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /--pv-type-body:\s*\.9rem/);
});

test("content list and data cards are compact, explicit interactive surfaces", () => {
  assert.match(source, /className=\{cx\(styles\.contentItem/);
  assert.match(source, /className=\{cx\(styles\.dataCard/);
  assert.match(source, /<ArrowIcon size=\{16\}/);
  assert.match(source, /<ArrowIcon size=\{17\}/);
  assert.match(styles, /\.contentItemWithImage\s*\{[^}]*grid-template-columns:\s*148px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.dataCard\s*\{[^}]*min-height:\s*82px/s);
  assert.match(styles, /\.dataCard:hover\s*\{[^}]*border-color:\s*var\(--forest\)/s);
  assert.match(styles, /\.contentItem:focus-visible,\s*\.dataCard:focus-visible/s);
});

test("CTA hierarchy and icon policy stay reusable and emoji-independent", () => {
  assert.match(source, /type PublicActionVariant = "primary" \| "secondary" \| "tertiary"/);
  assert.match(styles, /\.actionPrimary\s*\{/);
  assert.match(styles, /\.actionSecondary\s*\{/);
  assert.match(styles, /\.actionTertiary\s*\{/);
  assert.match(styles, /\.action\s*\{[^}]*min-height:\s*44px/s);
  assert.match(source, /icon: ReactElement/);
  assert.match(source, /aria-hidden="true"/);
  assert.doesNotMatch(source, /🐾|🔎|📍|📅|➡️|👉/u);
});

test("mobile contract protects 390px layouts from horizontal overflow", () => {
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /grid-template-columns:\s*88px minmax\(0, 1fr\)/);
  assert.match(styles, /\.headerCopy,\s*\.headerVisual,\s*\.contentCopy,\s*\.dataCardBody\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /max-width:\s*100%/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styles, /position:\s*(?:fixed|sticky)/);
});


test("article list contract keeps text minimal while allowing an optional thumbnail", () => {
  const start = source.indexOf("export function PublicArticleListItem");
  const end = source.indexOf("export function PublicContentListItem", start);
  assert.ok(start >= 0 && end > start, "PublicArticleListItem contract is missing");
  const contract = source.slice(start, end);
  assert.match(contract, /title: ReactNode/);
  assert.match(contract, /topic: ReactNode/);
  assert.match(contract, /date: ReactNode/);
  assert.match(contract, /image\?: \{ src: string; alt: string \}/);
  assert.match(contract, /image \? \(/);
  assert.match(contract, /<img src=\{image\.src\} alt=\{image\.alt\}/);
  assert.match(contract, /<time dateTime=\{dateTime\} data-article-date>\{date\}<\/time>/);
  assert.doesNotMatch(contract, /excerpt|readTime|actionLabel/);
  assert.match(styles, /\.articleListItemWithImage\s*\{[^}]*grid-template-columns:\s*132px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.articleListMedia img\s*\{[^}]*aspect-ratio:\s*4 \/ 3/s);
});

test("BRAND-1 keeps semantic palette aliases and HEADER-NAV-2 preserves the public navigation contract", () => {
  assert.match(globalStyles, /--brand-forest:\s*var\(--forest\)/);
  assert.match(globalStyles, /--brand-canvas:\s*var\(--cream\)/);
  assert.match(globalStyles, /--brand-accent:\s*var\(--coral\)/);
  assert.match(globalStyles, /--brand-focus:\s*var\(--coral-dark\)/);
  assert.match(siteHeader, /ChevronDownIcon/);
  assert.match(siteHeader, /data-active=\{isPathActive/);
  assert.doesNotMatch(siteHeader, /⌄/u);
  assert.match(icons, /export function ChevronDownIcon/);
  assert.match(siteHeader, /data-header-masthead/);
  assert.match(siteHeader, /data-header-nav-band/);
  assert.match(siteHeader, /data-mobile-name-day/);
  assert.match(siteHeaderStyles, /@media \(min-width: 1200px\)/);
  assert.match(siteHeaderStyles, /\.desktopNavBand/);
  assert.match(siteHeaderStyles, /text-transform:\s*uppercase/);
  assert.match(siteHeaderStyles, /--brand-accent-strong/);
  assert.match(siteHeaderStyles, /min-height:\s*49px/);
});

test("dog name day resolver uses Europe\/Bratislava boundaries and fails closed", () => {
  assert.equal(DOG_NAME_DAY_TIME_ZONE, "Europe/Bratislava");
  assert.equal(dogNameDayDateKey(new Date("2026-09-18T21:59:00Z")), "09-18");
  assert.equal(dogNameDayDateKey(new Date("2026-09-18T22:01:00Z")), "09-19");
  assert.deepEqual(resolveDogNameDay(new Date("2026-09-19T10:00:00Z"), []), []);
  assert.deepEqual(resolveDogNameDay(new Date("2026-09-19T10:00:00Z"), [
    { month: 9, day: 19, name: "Bruno", status: "published" },
    { month: 9, day: 19, name: " Bety ", status: "published" },
    { month: 9, day: 19, name: "bruno", status: "published" },
    { month: 9, day: 19, name: "", status: "published" },
    { month: 9, day: 19, name: "Draft", status: "draft" },
  ]), ["Bruno", "Bety"]);
});


test("PUBLIC-POLISH-2 keeps public photography square without flattening UI controls", () => {
  assert.match(designSystem, /--ps-radius-media:\s*0;/);
  assert.match(styles, /\.photoVisual\s*\{[^}]*border-radius:\s*0/s);
  assert.match(styles, /\.articleListMedia\s*\{[^}]*border-radius:\s*0/s);
  assert.match(styles, /\.contentMedia\s*\{[^}]*border-radius:\s*0/s);
  assert.match(homeStyles, /\.homeV2 :global\(\.hero-card\)[\s\S]*?border-radius:\s*0/);
  assert.match(articleDetailStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.midRelatedImage[\s\S]*?border-radius:\s*0/);
  assert.match(adoptionStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.card\s*\{\s*border-radius:\s*0/);
  assert.match(helpStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.card\s*\{\s*border-radius:\s*0/);
  assert.match(lostFoundStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.detailImage[\s\S]*?border-radius:\s*0/);
  assert.match(directoryStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.cardImage[\s\S]*?border-radius:\s*0/);
  assert.match(styles, /\.action\s*\{[^}]*border-radius:\s*var\(--pv-radius-control/s);
});

test("PUBLIC-POLISH-2 homepage section CTAs follow their content", () => {
  const editorialGrid = homeEditorial.indexOf('className="home-editorial-grid"');
  const editorialCta = homeEditorial.indexOf('data-home-section-cta={testId}');
  assert.ok(editorialGrid >= 0 && editorialCta > editorialGrid);

  const latestLayout = homeEditorial.indexOf('className="home-latest-layout"');
  const latestCta = homeEditorial.indexOf('data-home-section-cta="latest"');
  assert.ok(latestLayout >= 0 && latestCta > latestLayout);

  const vetList = homePage.indexOf('className="home-vet-list"');
  const vetCta = homePage.indexOf('data-home-section-cta="veterinari"');
  const helpGrid = homePage.indexOf('className="home-help-grid"');
  const helpCta = homePage.indexOf('data-home-section-cta="pomoc"');
  assert.ok(vetList >= 0 && vetCta > vetList);
  assert.ok(helpGrid >= 0 && helpCta > helpGrid);
});

test("PUBLIC-POLISH-2 event cards consume canonical preview images and keep an image-free fallback layout", () => {
  assert.match(eventCard, /event\.imageUrl \? styles\.eventCardWithImage/);
  assert.match(eventCard, /data-event-has-image=\{event\.imageUrl \? "true" : "false"\}/);
  assert.match(eventCard, /<img src=\{event\.imageUrl\} alt="" loading="lazy" decoding="async"/);
  assert.match(eventStyles, /\.cardMedia\s*\{[^}]*border-radius:\s*0/s);
  assert.match(eventStyles, /\.eventCardWithImage[\s\S]*grid-template-columns:\s*78px 128px minmax\(0, 1fr\) auto/s);
});

test("HEADER-NAV-2 separates the editorial masthead, forest navigation band and mobile name-day row", () => {
  assert.match(siteHeaderStyles, /grid-template-columns:\s*max-content minmax\(220px, 1fr\) max-content/);
  assert.match(siteHeaderStyles, /\.desktopNavBand\s*\{[\s\S]*?background:[\s\S]*?var\(--brand-forest\)/);
  assert.match(siteHeaderStyles, /\.desktopNav[\s\S]*?min-height:\s*46px/);
  assert.match(siteHeaderStyles, /\.desktopNameDay[\s\S]*?border-inline:/);
  assert.match(siteHeaderStyles, /\.mobileNameDay\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(siteHeaderStyles, /@media \(min-width: 1200px\) and \(max-width: 1350px\)[\s\S]*?font-size:\s*\.68rem/);
  assert.match(siteHeaderStyles, /@media \(max-width: 1199px\)[\s\S]*?\.mobileNameDay\s*\{\s*display:\s*flex;/);
});


test("global public article surfaces use the shared minimal presentation", () => {
  assert.match(articleCard, /if \(!large\) return <ArticleListItem/);
  assert.match(articleCard, /ArticleListItem article=\{article\}/);
  assert.match(newsHub, /<ArticleListItem/);
  assert.match(editorialSection, /<ArticleListItem/);
  assert.match(breedDetail, /<PublicContentList label="Súvisiace články k plemenu">/);
  assert.match(breedDetail, /<PublicArticleListItem/);
  assert.match(searchPage, /<PublicArticleListItem/);
  for (const [label, value] of [["article card", articleCard], ["news hub", newsHub], ["section lists", editorialSection]]) {
    assert.doesNotMatch(value, /readTime[^\n]*čítania/, `${label} renders reading time`);
  }
});
