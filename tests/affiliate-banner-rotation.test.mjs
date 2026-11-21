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

test("only existing Dognet merchant images can appear, without guessed creatives", () => {
  const horizontal = getAvailableAffiliateOriginalBanners("horizontal");
  const sidebar = getAvailableAffiliateOriginalBanners("sidebar");
  assert.deepEqual(horizontal.map((item) => item.id), ["zoohit"]);
  assert.deepEqual(sidebar.map((item) => item.id), ["zoohit"]);
  assert.equal(AFFILIATE_BANNER_ORIGINAL_CREATIVES["abc-zoo"], undefined);
  assert.equal(AFFILIATE_BANNER_ORIGINAL_CREATIVES.fera, undefined);
  for (const item of [...horizontal, ...sidebar]) {
    assert.match(item.creative.src, /^https:\/\/visibility\.postaffiliatepro\.com\/accounts\/default1\/banners\//);
    assert.ok(item.creative.width > 0);
    assert.ok(item.creative.height > 0);
  }
  assert.deepEqual(nextAffiliateRotation(0, 1), { selected: 0, next: 0 });
});
