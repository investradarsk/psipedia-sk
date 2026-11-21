import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { shouldShowSitewideDognetBanner } from "../lib/dognet-banner-visibility.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public route banner covers homepage, editorial hubs, lists and details", () => {
  for (const route of [
    "/", "/plemena", "/plemena/labradorsky-retriever", "/adresar/veterinari",
    "/adresar/veterinari/example", "/podujatia", "/podujatia/example",
    "/pomoc-psom", "/steniatka", "/zdravie", "/vycvik",
    "/recenzie", "/clanky", "/novinky", "/organizacie", "/kontakt",
  ]) {
    assert.equal(shouldShowSitewideDognetBanner(route), true, route);
  }
});

test("banner never enters private/admin or public contribution and privacy flows", () => {
  for (const route of [
    "/admin", "/admin/clanky", "/partner", "/partner/spravy",
    "/recenzia/prihlasenie", "/recenzia/napisat",
    "/overenie-profilu/example", "/odhlasenie-osloveni/example",
    "/novinky/poslat-tip", "/pomoc-psom/stratene-a-najdene/nahlasit",
    "/adresar/veterinari/moja-klinika/upravit",
    "/cookies", "/sukromie", "/podmienky-pouzivania", "/pravne-informacie",
    "/zasady-obsahu", "/opravy-a-podnety",
  ]) {
    assert.equal(shouldShowSitewideDognetBanner(route), false, route);
  }
  assert.equal(shouldShowSitewideDognetBanner(null), false);
  assert.equal(shouldShowSitewideDognetBanner(""), false);
});

test("global and relevant listing placements reuse the existing labeled Dognet creative", () => {
  assert.match(source("app/layout.tsx"), /<SitewideDognetBanner\s*\/>/);
  assert.match(source("components/sitewide-dognet-banner.tsx"), /<DognetTestBanner format="horizontal"\s*\/>/);
  for (const file of [
    "components/directory-page.tsx",
    "components/events-page.tsx",
    "components/portal-hub.tsx",
  ]) {
    assert.match(source(file), /<DognetTestBanner format="horizontal"\s*\/>/, file);
  }
  const creative = source("components/dognet-test-banner.tsx");
  assert.match(creative, /nofollow sponsored noopener noreferrer/);
  assert.match(creative, /Reklama · affiliate/);
});
