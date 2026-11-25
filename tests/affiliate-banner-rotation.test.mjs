import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
  AFFILIATE_BANNER_PARTNERS,
  AFFILIATE_BANNER_ORIGINAL_CREATIVES,
  getAvailableAffiliateOriginalBanners,
  getAffiliateBannerCandidates,
  canShowGlobalAffiliateBanner,
  nextAffiliateRotation,
} from "../lib/affiliate-banner-rotation.ts";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("merchant rotation covers all three approved advertisers without skipping", () => {
  assert.deepEqual(AFFILIATE_BANNER_PARTNERS.map((partner) => partner.id), ["zoohit", "abc-zoo", "fera"]);
  let value = null;
  const sequence = [];
  for (let i = 0; i < 9; i++) {
    const rotated = nextAffiliateRotation(value);
    sequence.push(AFFILIATE_BANNER_PARTNERS[rotated.selected].id);
    value = rotated.next;
  }
  assert.deepEqual(sequence, ["zoohit", "abc-zoo", "fera", "zoohit", "abc-zoo", "fera", "zoohit", "abc-zoo", "fera"]);
});

test("merchant links use the owner's actual Dognet tracking channel", () => {
  for (const partner of AFFILIATE_BANNER_PARTNERS) {
    const url = new URL(partner.href);
    assert.equal(url.hostname, "go.dognet.com");
    assert.equal(url.searchParams.get("chid"), "PW4rE4bS");
    assert.equal(new URL(url.searchParams.get("url")).protocol, "https:");
  }
});

test("global ad is on every public and partner page but not admin or API routes", () => {
  for (const path of [
    "/", "/plemena", "/plemena/labradorsky-retriever",
    "/adresar", "/adresar/veterinari/example", "/podujatia",
    "/pomoc-psom", "/novinky", "/zdravie", "/steniatka",
    "/recenzie", "/clanky", "/kontakt", "/mapa",
    "/partner", "/partner/spravy", "/partner/profily/novy",
    "/recenzia/napisat", "/recenzia/prihlasenie",
    "/recenzie/eshopy/test/hodnotit",
    "/adresar/veterinari/test/upravit",
    "/novinky/poslat-tip", "/overenie-profilu/test",
    "/cookies", "/sukromie", "/pravne-informacie",
    "/podmienky-pouzivania", "/partner/", "/admin-like",
  ]) assert.equal(canShowGlobalAffiliateBanner(path), true, path);

  for (const path of ["/admin", "/admin/clanky", "/admin/", "/api", "/api/partner", "//other", "", null, undefined]) {
    assert.equal(canShowGlobalAffiliateBanner(path), false, String(path));
  }
});

test("ads have fixed mobile/desktop geometry, label and sponsored link", () => {
  const component = source("components/affiliate-rotating-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  assert.match(component, /Reklama · affiliate/);
  assert.match(component, /nofollow sponsored noopener noreferrer/);
  assert.doesNotMatch(component, /sessionStorage|localStorage|setInterval/);
  assert.match(component, /nextAffiliateRotation/);
  assert.match(css, /min-height: 100px/);
  assert.match(css, /\.sidebar \.creative,[\s\S]*?min-height: 0/);
  assert.match(css, /\.horizontal \.image\s*\{\s*max-height: 100px/);
  assert.match(css, /max-width: 767px/);
  assert.match(component, /nextBannerIndexBySlot/);
  assert.match(component, /<img[\s\S]*src=\{original\.src\}/);
  assert.doesNotMatch(component, /styles\.message|styles\.shop|styles\.title|styles\.description|styles\.cta/);
  assert.match(source("app/layout.tsx"), /<SitewideAffiliateBanner\s*\/>/);
  assert.match(source("app/page.tsx"), /<AffiliateRotatingBanner placement="horizontal"\s*\/>/);
  assert.match(source("components/article-detail.tsx"), /<AffiliateRotatingBanner placement="sidebar"\s*\/>/);
});

test("only original Dognet images appear in compatible placements", () => {
  const horizontal = getAvailableAffiliateOriginalBanners("horizontal");
  const mobile = getAvailableAffiliateOriginalBanners("mobile");
  const sidebar = getAvailableAffiliateOriginalBanners("sidebar");

  assert.deepEqual(horizontal.map((item) => item.id), ["zoohit"]);
  assert.deepEqual(mobile.map((item) => item.id), ["abc-zoo"]);
  assert.deepEqual(sidebar.map((item) => item.id), ["zoohit", "abc-zoo", "abc-zoo", "abc-zoo"]);
  assert.ok(horizontal.every(({ creative }) => creative.width > creative.height));
  assert.ok(mobile.every(({ creative }) => creative.width === creative.height));
  assert.ok(sidebar.every(({ creative }) => creative.width <= creative.height));
  assert.equal(AFFILIATE_BANNER_ORIGINAL_CREATIVES.fera, undefined);

  assert.deepEqual(
    [...mobile, ...sidebar.filter((item) => item.id === "abc-zoo" && item.creative.height > item.creative.width)].map((item) => item.creative),
    [
      {
        src: "https://api.app.dognet.com/files/t/a4f/a4f633806f17fbe0b73988aa2f02eadd1eef84f1.png",
        width: 1080, height: 1080,
      },
      {
        src: "https://api.app.dognet.com/files/t/00f/00fd437025798c026a889b20e1f19ec0f6bf45f8.png",
        width: 1080, height: 1350,
      },
      {
        src: "https://api.app.dognet.com/files/t/027/027698d3980d5d99f5d9dab9e67530ead4c2cbcd.png",
        width: 1080, height: 1920,
      },
    ],
  );

  for (const item of [...horizontal, ...mobile, ...sidebar]) {
    const url = new URL(item.creative.src);
    assert.ok(
      url.hostname === "api.app.dognet.com" || url.hostname === "visibility.postaffiliatepro.com",
      "original image must originate from an existing Dognet creative host",
    );
    assert.ok(item.creative.width > 0);
    assert.ok(item.creative.height > 0);
  }
  assert.deepEqual(nextAffiliateRotation(0, 1), { selected: 0, next: 0 });
  assert.deepEqual(nextAffiliateRotation(0, 3), { selected: 0, next: 1 });
  assert.deepEqual(nextAffiliateRotation(2, 3), { selected: 2, next: 0 });
});

test("mobile uses square originals and sidebar uses tall or square originals", () => {
  const component = source("components/affiliate-rotating-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  assert.match(component, /matchMedia/);
  assert.match(component, /"mobile"/);
  assert.match(component, /"horizontal"/);
  assert.doesNotMatch(component, /"adaptive"/);
  assert.match(component, /referrerPolicy="no-referrer"/);
  assert.match(component, /getAvailableAffiliateOriginalBanners\(format\)/);
  assert.match(css, /min-height: 300px/);
  assert.match(css, /object-fit: contain/);
  assert.doesNotMatch(component, /styles\.message|styles\.shop|styles\.title|styles\.description|styles\.cta/);
});

test("single-column article shows one compatible banner after introduction, not at footer", () => {
  const article = source("components/article-detail.tsx");
  const articleCSS = source("components/article-detail.module.css");
  const footerCSS = source("components/sitewide-affiliate-banner.module.css");
  const intro = article.indexOf('keyPrefix="article-intro"');
  const inline = article.indexOf('data-article-mobile-affiliate-banner');
  const takeaway = article.indexOf('showTakeaway ? (');
  assert.ok(intro !== -1 && inline > intro && inline < takeaway);
  assert.match(article, /data-article-mobile-affiliate-banner>[\s\S]*?<AffiliateRotatingBanner placement="horizontal"\s*\/>/);
  assert.match(articleCSS, /\.mobileAffiliateBanner\s*\{\s*display:\s*none;/);
  assert.match(articleCSS, /@media\s*\(max-width:\s*1199px\)[\s\S]*?\.mobileAffiliateBanner\s*\{\s*display:\s*block;/);
  assert.match(footerCSS, /@media\s*\(max-width:\s*1199px\)[\s\S]*?body:has\(\[data-article-layout\] \[data-article-mobile-affiliate-banner\] \[data-affiliate-shop\]\)/);
  assert.match(footerCSS, /display:\s*none;/);
  assert.match(article, /<AffiliateRotatingBanner placement="sidebar"\s*\/>/);
});

test("mapped directory and event details allow only original Dognet image hosts", () => {
  const worker = source("worker/index.ts");
  const imgSrcPolicy = worker.match(/"img-src 'self'[^"]+"/)?.[0] ?? "";
  assert.match(imgSrcPolicy, /https:\/\/api\.app\.dognet\.com/);
  assert.match(imgSrcPolicy, /https:\/\/visibility\.postaffiliatepro\.com/);
  assert.doesNotMatch(imgSrcPolicy, /(?:^|\s)\*(?:\s|$)/);
  assert.match(worker, /if \(isGoogleMapsPublicRoute\(url\.pathname\)\)/);
  assert.match(worker, /\^\\\/adresar/);
  assert.match(worker, /\^\\\/podujatia/);
});

test("an unavailable external artwork never leaves a blank affiliate label", () => {
  const component = source("components/affiliate-rotating-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  assert.match(component, /if \(!selected \|\| !original\) return null/);
  assert.match(component, /!failedSources\.includes\(creative\.src\)/);
  assert.match(component, /onLoad=\{\(\) => setLoadedImage\(\{ key: selectionKey, src: original\.src \}\)\}/);
  assert.match(component, /onError=\{\(\) => setFailedImages/);
  assert.match(component, /styles\.pending/);
  assert.match(css, /\.pending\s*\{\s*visibility:\s*hidden;/);
  assert.doesNotMatch(component, /styles\.placeholder/);
});

test("sitewide fallback reuses the existing component and yields to loaded contextual ads", () => {
  const sitewide = source("components/sitewide-affiliate-banner.tsx");
  const css = source("components/sitewide-affiliate-banner.module.css");
  assert.match(sitewide, /<AffiliateRotatingBanner placement="horizontal" sitewide\s*\/>/);
  assert.match(sitewide, /canShowGlobalAffiliateBanner\(pathname\)/);
  assert.match(css, /\[data-affiliate-rotating-banner="sidebar"\]\[data-affiliate-shop\]/);
  assert.match(css, /:not\(\[data-sitewide-affiliate-banner\] \*\)/);
});

test("every placement can retry each compatible creative exactly once", () => {
  for (const format of ["mobile", "horizontal", "sidebar"]) {
    const primary = getAvailableAffiliateOriginalBanners(format);
    for (let index = 0; index < primary.length; index++) {
      const candidates = getAffiliateBannerCandidates(format, index);
      assert.equal(candidates[0].creative.src, primary[index].creative.src);
      assert.equal(candidates.length, primary.length);
      assert.deepEqual(new Set(candidates.map((item) => item.creative.src)), new Set(primary.map((item) => item.creative.src)));
      assert.equal(new Set(candidates.map((item) => item.creative.src)).size, primary.length);
    }
  }
});

test("all public and partner page templates inherit the root banner policy", () => {
  const app = new URL("../app/", import.meta.url);
  const pages = readdirSync(app, { recursive: true }).filter((path) => /(?:^|[/\\\\])page\.tsx$/.test(path));
  assert.ok(pages.length > 100);
  for (const page of pages) {
    const normalized = page.replace(/\\\\/g, "/");
    const route = "/" + normalized.replace(/(?:^|\/)page\.tsx$/, "").replace(/\[[^\]]+\]/g, "example");
    assert.equal(canShowGlobalAffiliateBanner(route), !normalized.startsWith("admin/"), normalized);
  }
});

test("empty slots collapse and stacked article layouts never show portrait sidebar ads", () => {
  const footer = source("components/sitewide-affiliate-banner.module.css");
  const article = source("components/article-detail.module.css");
  assert.match(footer, /\.wrapper:not\(:has\(:global\(\[data-affiliate-rotating-banner\]\)\)\)\s*\{\s*display:\s*none;/);
  assert.match(footer, /@media \(min-width: 1200px\)/);
  assert.match(article, /@media \(max-width: 1199px\)[\s\S]*?\.sidebar :global\(\[data-affiliate-rotating-banner="sidebar"\]\)\s*\{\s*display:\s*none;/);
  assert.match(article, /\.mobileAffiliateBanner:has\(:global\(\[data-affiliate-rotating-banner\]\)\)/);
});

test("portrait placements are in right columns, never in stacked content or footer", () => {
  const article = source("components/article-detail.tsx");
  const home = source("app/page.tsx");
  const directory = source("components/directory-page.tsx");
  const calendar = source("components/event-calendar.tsx");
  const sitewide = source("components/sitewide-affiliate-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  const railCSS = source("components/sitewide-affiliate-banner.module.css");
  assert.match(article, /className=\{styles\.sidebarSticky\}>\s*<AffiliateRotatingBanner placement="sidebar"\s*\/>/);
  assert.match(home, /<AffiliateRotatingBanner placement="sidebar"\s*\/>\s*<HomeMagazineSidebar/);
  assert.match(source("app/home-v2.module.css"), /\.home-magazine-side\)\s*\{\s*display: flex;\s*flex-direction: column;/);
  assert.match(directory, /className=\{styles\.directorySidebar\}[^>]*>\s*<AffiliateRotatingBanner placement="sidebar"\s*\/>/);
  assert.match(calendar, /<AffiliateRotatingBanner placement="sidebar"\s*\/>\s*<div data-events-popularity>/);
  assert.match(sitewide, /data-sitewide-affiliate-rail>\s*<AffiliateRotatingBanner placement="sidebar" sitewide\s*\/>/);
  assert.match(css, /@media \(max-width: 1199px\)\s*\{\s*\.sidebar\s*\{\s*display: none;/);
  assert.match(railCSS, /@media \(min-width: 1600px\)/);
  assert.match(railCSS, /left: calc\(50% \+/);
});
