import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("four compact review choices include the existing all-view and three real review types", () => {
  const hub = read("components/reviews-hub.tsx");
  const categories = hub.slice(hub.indexOf("<PublicSubcategoryNavigator"), hub.indexOf("          </PublicContentShell>"));
  assert.match(categories, /mode="compact"/);
  assert.match(categories, /mobileLayout="grid"/);
  assert.match(categories, /columns=\{4\}/);
  assert.match(categories, /label="Kategórie recenzií a testov"/);
  for (const [view, label] of [
    ["all", "Všetko"],
    ["products", "Produkty"],
    ["services", "Služby"],
    ["eshops", "E-shopy"],
  ]) {
    assert.ok(categories.includes(`href: viewHref("${view}")`), `missing route ${view}`);
    assert.ok(categories.includes(`title: "${label}"`), `missing category ${label}`);
    assert.ok(categories.includes(`current: view === "${view}"`), `missing active state for ${view}`);
  }
  assert.equal((categories.match(/href: viewHref\(/g) ?? []).length, 4);
  assert.equal((categories.match(/rel: "nofollow"/g) ?? []).length, 4);
  assert.equal((categories.match(/prefetch: false/g) ?? []).length, 4);
  assert.doesNotMatch(hub, /<PublicCategoryTiles|<PortalMobileCategorySelect/);
});

test("mobile review categories are 2 × 2, desktop is visible grid without an extra carousel", () => {
  const css = read("components/reviews-hub.module.css");
  const navCss = read("components/public-visual-system/public-subcategory-navigator.module.css");
  assert.match(css, /\.reviewCategoryNav :global\(\[data-public-subcategory-track\]\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.reviewCategoryNav :global\(\[data-public-subcategory-track\]\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(navCss, /\.compactFour \.compactTrack \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(navCss, /min-height: 52px/);
});

test("category content appears immediately after links with consistent links to filtered sections", () => {
  const hub = read("components/reviews-hub.tsx");
  const links = hub.indexOf("<PublicSubcategoryNavigator");
  const products = hub.indexOf("{showProducts ? (");
  const services = hub.indexOf("{showServices ? (");
  const eshops = hub.indexOf("{showEshops ? (");
  const trust = hub.indexOf("styles.trustStrip");
  const methodology = hub.indexOf("styles.methodology");
  assert.ok(links >= 0 && products > links && services > products && eshops > services);
  assert.ok(trust > eshops && methodology > trust);
  assert.equal((hub.match(/className=\{styles\.sectionFooter\}/g) ?? []).length, 3);
  assert.equal((hub.match(/<PublicActionLink href=\{viewHref\("(?:products|services|eshops)"\)\}/g) ?? []).length, 3);
  assert.match(hub, /\(view === "all" \? reviewArticles\.slice\(0, 3\) : reviewArticles\)\.map/);
  assert.match(hub, /<PublicContentList className=\{styles\.eshopGrid\}/);
  assert.match(hub, /profileReviews\.map\(\(review\)/);
});

test("editorial classification, verified ratings and source separation remain intact", () => {
  const hub = read("components/reviews-hub.tsx");
  const page = read("app/[section]/page.tsx");
  assert.match(hub, /if \(article\.reviewFormat === "test"\) return "test"/);
  assert.match(hub, /productArticleKind\(article\)/);
  assert.match(hub, /Google ani iné externé skóre nikdy nemiešame do priemeru Psipedia/);
  assert.match(hub, /Affiliate a sponzorovaný obsah musí byť označený/);
  assert.match(hub, /shop\.averages\.overall/);
  assert.match(hub, /review\.overallRating/);
  assert.match(page, /listLatestPublicProfileReviews\(database, 8\)/);
  assert.match(page, /listPublishedEshops\(\)/);
  assert.match(hub, /view === "all" \|\| view === "products"/);
  assert.match(hub, /view === "all" \|\| view === "services"/);
  assert.match(hub, /view === "all" \|\| view === "eshops"/);
});
