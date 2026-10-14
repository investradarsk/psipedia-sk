import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DOG_NAME_DAY_TIME_ZONE, dogNameDayDateKey, resolveDogNameDay } from "../lib/dog-name-days.ts";

const read = (path) => readFileSync(path, "utf8");

const source = readFileSync("components/public-visual-system/public-visual-system.tsx", "utf8");
const styles = readFileSync("components/public-visual-system/public-visual-system.module.css", "utf8");
const barrel = readFileSync("components/public-visual-system/index.ts", "utf8");
const breedDetail = readFileSync("app/plemena/[slug]/page.tsx", "utf8");
const searchPage = readFileSync("app/hladat/page.tsx", "utf8");
const articleCard = readFileSync("components/article-card.tsx", "utf8");
const articleListItem = readFileSync("components/article-list-item.tsx", "utf8");
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
  assert.match(contract, /date\?: ReactNode/);
  assert.match(contract, /image\?: \{ src: string; alt: string; mode\?: SmartImageMode; focusX\?: number \| null; focusY\?: number \| null; config\?: ImageDisplayConfig \| null \}/);
  assert.match(contract, /image \? \(/);
  assert.match(contract, /<ImageDisplay context="thumbnail" config=\{image\.config\} legacyMode=\{image\.mode\} legacyFocusX=\{image\.focusX\} legacyFocusY=\{image\.focusY\} src=\{image\.src\}/);
  assert.match(contract, /srcSet=\{responsiveMediaSrcSet\(image\.src,/);
  assert.match(contract, /date \? <span aria-hidden="true">·<\/span> : null/);
  assert.match(contract, /date \? \(dateTime \? <time dateTime=\{dateTime\} data-article-date>\{date\}<\/time>/);
  assert.doesNotMatch(contract, /excerpt|readTime|actionLabel/);
  assert.match(styles, /\.articleListItemWithImage\s*\{[^}]*grid-template-columns:\s*132px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.articleListMedia img\s*\{[^}]*aspect-ratio:\s*4 \/ 3/s);
  assert.match(articleListItem, /image=\{article\.image \? \{ src: article\.image, alt: imageAlt, mode: article\.imageDisplay, focusX: article\.imageFocusX, focusY: article\.imageFocusY, config: article\.thumbnailImageDisplay \} : undefined\}/);
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
  assert.match(articleDetailStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.modernArticle \.heroMedia,[\s\S]*?border-radius:\s*0/);
  assert.match(adoptionStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.card\s*\{\s*border-radius:\s*0/);
  assert.match(helpStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.card\s*\{\s*border-radius:\s*0/);
  assert.match(lostFoundStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.detailImage[\s\S]*?border-radius:\s*0/);
  assert.match(directoryStyles, /PUBLIC-POLISH-2 photo contract[\s\S]*?\.cardImage[\s\S]*?border-radius:\s*0/);
  assert.match(styles, /\.action\s*\{[^}]*border-radius:\s*var\(--pv-radius-control/s);
});

test("PUBLIC-POLISH-2 homepage section CTAs follow their content", () => {
  const editorialLayout = homeEditorial.indexOf('<HomeArticleFeatureLayout articles={articles} testId={testId} />');
  const editorialCta = homeEditorial.indexOf('data-home-section-cta={testId}');
  assert.ok(editorialLayout >= 0 && editorialCta > editorialLayout);

  const latestLayout = homeEditorial.indexOf('<HomeArticleFeatureLayout articles={articles} testId="latest" />');
  const latestCta = homeEditorial.indexOf('data-home-section-cta="latest"');
  assert.ok(latestLayout >= 0 && latestCta > latestLayout);

  // PR #815 moved these CTAs to shared magazine components. The sidebar
  // action must follow its children, and editorial section CTAs follow features
  // (or their empty states) via HomeEditorialSection above.
  const sidebarStart = homeEditorial.indexOf('export function HomeMagazineSidebar(');
  const sidebarChildren = homeEditorial.indexOf('{children}', sidebarStart);
  const sidebarAction = homeEditorial.indexOf('className="home-magazine-sidebar-action"', sidebarChildren);
  const sidebarEnd = homeEditorial.indexOf('export function HomeMagazineBanner(', sidebarStart);
  assert.ok(sidebarStart >= 0 && sidebarChildren > sidebarStart && sidebarAction > sidebarChildren && sidebarEnd > sidebarAction);

  const vetSidebar = homePage.indexOf('title="Veterinárna starostlivosť na jednom mieste"');
  const vetList = homePage.indexOf('className="home-vet-list"', vetSidebar);
  const vetEmpty = homePage.indexOf('data-home-veterinarians-empty', vetSidebar);
  const vetEnd = homePage.indexOf('</HomeMagazineSidebar>', vetSidebar);
  assert.ok(vetSidebar >= 0 && vetList > vetSidebar && vetEmpty > vetList && vetEnd > vetEmpty);

  const helpSection = homePage.indexOf('<div data-home-help>');
  const helpGrid = homePage.indexOf('className="home-help-grid"', helpSection);
  const helpEmpty = homePage.indexOf('data-home-help-empty', helpSection);
  const helpSectionCtaProps = homePage.indexOf('testId="help"', helpSection);
  assert.ok(helpSection >= 0 && helpGrid > helpSection && helpEmpty > helpGrid && helpSectionCtaProps > helpEmpty);
});

test("PUBLIC-POLISH-2 event cards preserve photo display and accessible fallbacks", () => {
  // The newer EventImage component provides a category illustration when
  // an event has no usable photo. Older deployments keep the image-free layout.
  if (eventCard.includes('import { EventImage } from "@/components/event-image";')) {
    const eventImage = read("components/event-image.tsx");
    assert.match(eventCard, /const ownImage = getEventOwnImage\(event\.imageUrl\)/);
    assert.match(eventCard, /data-event-has-image=\{ownImage \? "true" : "false"\}/);
    assert.match(eventCard, /<EventImage imageUrl=\{event\.imageUrl\} eventType=\{event\.eventType\} mode=\{event\.imageDisplay\}/);
    assert.match(eventImage, /getEventFallbackImage\(eventType\)/);
    assert.match(eventImage, /return real \? <ImageDisplay/);
    assert.match(eventImage, /legacyMode=\{mode\}/);
    assert.match(eventImage, /onError: \(\) =>/);
  } else {
    assert.match(eventCard, /event\.imageUrl \? styles\.eventCardWithImage/);
    assert.match(eventCard, /data-event-has-image=\{event\.imageUrl \? "true" : "false"\}/);
    assert.match(eventCard, /<SmartCardImage src=\{event\.imageUrl\} mode=\{event\.imageDisplay\} alt="" loading="lazy" decoding="async"/);
  }
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


test("global public article surfaces use shared featured, grid and compact presentation", () => {
  assert.match(articleCard, /export type ArticleCardVariant = "featured" \| "grid" \| "compact"/);
  assert.match(articleCard, /resolvedVariant === "compact"/);
  assert.match(articleCard, /<ArticleListItem/);
  assert.match(articleCard, /data-article-variant=\{resolvedVariant\}/);
  assert.match(homeEditorial, /variant="featured"/);
  assert.match(homeEditorial, /variant="compact"/);
  assert.match(homeStyles, /\.homeV2 :global\(\.home-latest-item > \[data-article-list-item\]\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(homeStyles, /\.homeV2 :global\(\.home-latest-item > \[data-article-list-item\]:has\(\[data-article-image\]\)\)\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)/s);
  assert.match(newsHub, /<ArticleListItem/);
  assert.match(editorialSection, /<ArticleListItem/);
  assert.match(breedDetail, /<PublicContentList label="Súvisiace články k plemenu">/);
  assert.match(breedDetail, /<PublicArticleListItem/);
  for (const [label, value] of [["article card", articleCard], ["homepage article layout", homeEditorial], ["news hub", newsHub], ["section lists", editorialSection]]) {
    assert.doesNotMatch(value, /readTime[^\n]*čítania/, `${label} renders reading time`);
  }
});

test("SEARCH-1 keeps heterogeneous results in one unified presentation", () => {
  assert.match(searchPage, /result\.items\.map\(\(item\) =>/);
  assert.match(searchPage, /\{item\.type\}/);
  assert.match(searchPage, /\{item\.title\}/);
  assert.match(searchPage, /item\.description/);
  assert.doesNotMatch(searchPage, /<PublicArticleListItem/);
});


test("PUBLIC-UX-FOUNDATION-1 provides one two-mode crawlable subcategory navigator", () => {
  const navigator = read("components/public-visual-system/public-subcategory-navigator.tsx");
  const navigatorCss = read("components/public-visual-system/public-subcategory-navigator.module.css");
  const portalTabs = read("components/portal-section-tabs.tsx");
  const publicIndex = read("components/public-visual-system/index.ts");

  assert.match(navigator, /PublicSubcategoryNavigatorMode = "landing" \| "compact"/);
  assert.match(navigator, /data-public-subcategory-mode="landing"/);
  assert.match(navigator, /data-public-subcategory-mode="compact"/);
  assert.match(navigator, /section-tabs-inner/);
  assert.match(navigator, /section-tab/);
  assert.match(navigator, /<Link[\s\S]*href=\{item\.href\}/);
  assert.match(navigator, /aria-current=\{item\.current \? "page" : undefined\}/);
  assert.match(navigator, /loading=\{item\.image\.loading \?\? "lazy"\}/);
  assert.match(navigator, /width=\{item\.image\.width \?\? 640\}/);
  assert.match(navigator, /height=\{item\.image\.height \?\? 360\}/);
  assert.doesNotMatch(navigator, /useState|useEffect|onClick/);
  assert.doesNotMatch(navigator, /\.slice\(/);
  assert.match(navigatorCss, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(navigatorCss, /@media \(max-width: 620px\)[\s\S]*grid-auto-columns:\s*minmax\(228px, 79%\)/);
  assert.match(navigatorCss, /scroll-snap-type:\s*x mandatory/);
  assert.match(navigatorCss, /min-height:\s*44px/);
  assert.match(navigatorCss, /-webkit-line-clamp:\s*2/);
  assert.match(navigatorCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(portalTabs, /<PublicSubcategoryNavigator/);
  assert.match(portalTabs, /mode="compact"/);
  assert.match(publicIndex, /PublicSubcategoryNavigator/);
});

test("PUBLIC-UX-FOUNDATION-1 provides a reusable compact contextual banner", () => {
  const banner = read("components/public-visual-system/public-context-banner.tsx");
  const bannerCss = read("components/public-visual-system/public-context-banner.module.css");
  const publicIndex = read("components/public-visual-system/index.ts");

  assert.match(banner, /PublicContextBannerTone = "forest" \| "sage" \| "coral" \| "sand"/);
  assert.match(banner, /data-public-context-banner/);
  assert.match(banner, /<PublicActionLink href=\{ctaHref!\}/);
  assert.match(banner, /loading=\{image\.loading \?\? "lazy"\}/);
  assert.match(banner, /width=\{image\.width \?\? 720\}/);
  assert.match(banner, /height=\{image\.height \?\? 480\}/);
  assert.match(bannerCss, /grid-template-columns:\s*minmax\(0, 1\.25fr\) minmax\(220px, \.75fr\)/);
  assert.match(bannerCss, /@media \(max-width: 720px\)[\s\S]*aspect-ratio:\s*16 \/ 7/);
  assert.match(publicIndex, /PublicContextBanner/);
});

test("PUBLIC-UX-FOUNDATION-1 centralizes future public spacing without changing approved shell geometry", () => {
  const layoutCss = read("components/public-visual-system/public-landing-layout.module.css");
  const hero = read("components/public-visual-system/unified-section-hero.tsx");

  assert.match(layoutCss, /--public-space-functional:\s*24px/);
  assert.match(layoutCss, /--public-space-section:\s*36px/);
  assert.match(layoutCss, /@media \(max-width: 620px\)[\s\S]*--public-space-functional:\s*20px[\s\S]*--public-space-section:\s*32px/);
  assert.match(hero, /const hasTools = Boolean\(resolvedSearch \|\| resolvedCta \|\| metaSlot \|\| config\.metaLabel \|\| quickLinks\.length\)/);
  assert.match(hero, /\{hasTools \? \([\s\S]*data-unified-section-hero-tools[\s\S]*\) : null\}/);
});

test("mobile public shells use one 12px gutter and swipe-only grip stays out of keyboard tab order", () => {
  assert.match(designSystem, /max\(12px, env\(safe-area-inset-left, 0px\)\)/);
  assert.match(designSystem, /max\(12px, env\(safe-area-inset-right, 0px\)\)/);
  const editorialStyles = read("components/editorial-section.module.css");
  assert.doesNotMatch(editorialStyles, /\.foundation :global\(\.public-shell\)/, "editorial routes must not override the canonical public gutter");
  assert.match(siteHeader, /tabIndex=\{-1\}\s+data-menu-dismiss-grip/);
  assert.ok(siteHeader.includes('button:not([disabled]):not([tabindex="-1"])'));
});
