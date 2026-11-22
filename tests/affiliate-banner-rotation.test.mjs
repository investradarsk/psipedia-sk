import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AFFILIATE_BANNER_PARTNERS,
  AFFILIATE_BANNER_ORIGINAL_CREATIVES,
  getAvailableAffiliateOriginalBanners,
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

test("global ad is on editorial pages but not admin, partner, forms, or legal pages", () => {
  for (const path of [
    "/", "/plemena", "/plemena/labradorsky-retriever",
    "/adresar", "/adresar/veterinari/example", "/podujatia",
    "/pomoc-psom", "/novinky", "/zdravie", "/steniatka",
    "/recenzie", "/clanky", "/kontakt",
  ]) assert.equal(canShowGlobalAffiliateBanner(path), true, path);

  for (const path of [
    "/admin", "/admin/clanky", "/partner", "/partner/spravy",
    "/recenzia/napisat", "/recenzia/prihlasenie",
    "/recenzie/eshopy/test/hodnotit",
    "/adresar/veterinari/test/upravit",
    "/novinky/poslat-tip", "/overenie-profilu/test",
    "/cookies", "/sukromie", "/pravne-informacie",
    "/podmienky-pouzivania",
  ]) assert.equal(canShowGlobalAffiliateBanner(path), false, path);
});

test("ads have fixed mobile/desktop geometry, label and sponsored link", () => {
  const component = source("components/affiliate-rotating-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  assert.match(component, /Reklama · affiliate/);
  assert.match(component, /nofollow sponsored noopener noreferrer/);
  assert.doesNotMatch(component, /sessionStorage|localStorage|setInterval/);
  assert.match(component, /nextAffiliateRotation/);
  assert.match(css, /min-height: 100px/);
  assert.match(css, /min-height: 600px/);
  assert.match(css, /max-width: 680px/);
  assert.match(component, /let nextBannerIndex/);
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
  assert.deepEqual(sidebar.map((item) => item.id), ["zoohit", "abc-zoo", "abc-zoo"]);
  assert.equal(AFFILIATE_BANNER_ORIGINAL_CREATIVES.fera, undefined);

  assert.deepEqual(
    [...mobile, ...sidebar.filter((item) => item.id === "abc-zoo")].map((item) => item.creative),
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

test("mobile uses square originals and sidebar uses tall originals", () => {
  const component = source("components/affiliate-rotating-banner.tsx");
  const css = source("components/affiliate-rotating-banner.module.css");
  assert.match(component, /matchMedia/);
  assert.match(component, /"mobile"/);
  assert.match(component, /getAvailableAffiliateOriginalBanners\(format\)/);
  assert.match(css, /min-height: 300px/);
  assert.match(css, /object-fit: contain/);
  assert.doesNotMatch(component, /styles\.message|styles\.shop|styles\.title|styles\.description|styles\.cta/);
});

test("mobile article shows one original banner after introduction, not at footer", () => {
  const article = source("components/article-detail.tsx");
  const articleCSS = source("components/article-detail.module.css");
  const footerCSS = source("components/sitewide-affiliate-banner.module.css");
  const intro = article.indexOf('keyPrefix="article-intro"');
  const inline = article.indexOf('data-article-mobile-affiliate-banner');
  const takeaway = article.indexOf('showTakeaway ? (');
  assert.ok(intro !== -1 && inline > intro && inline < takeaway);
  assert.match(article, /data-article-mobile-affiliate-banner>[\s\S]*?<AffiliateRotatingBanner placement="horizontal"\s*\/>/);
  assert.match(articleCSS, /\.mobileAffiliateBanner\s*\{\s*display:\s*none;/);
  assert.match(articleCSS, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.mobileAffiliateBanner\s*\{\s*display:\s*block;/);
  assert.match(footerCSS, /@media\s*\(max-width:\s*767px\)[\s\S]*?body:has\(\[data-article-layout\]\)/);
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
  assert.match(component, /failedImage === original\.src\) return null/);
  assert.match(component, /onLoad=\{\(\) => setLoadedImage\(original\.src\)\}/);
  assert.match(component, /onError=\{\(\) => setFailedImage\(original\.src\)\}/);
  assert.match(component, /styles\.pending/);
  assert.match(css, /\.pending\s*\{\s*visibility:\s*hidden;/);
  assert.doesNotMatch(component, /styles\.placeholder/);
});
