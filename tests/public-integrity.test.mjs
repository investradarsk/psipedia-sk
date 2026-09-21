import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = async (path) => import(pathToFileURL(new URL(path, root).pathname).href);

test("Slovak count formatter handles article forms", async () => {
  const { formatSlovakCount } = await importTs("lib/slovak-count.ts");
  const forms = { one: "článok", few: "články", many: "článkov" };
  assert.equal(formatSlovakCount(1, forms), "1 článok");
  assert.equal(formatSlovakCount(2, forms), "2 články");
  assert.equal(formatSlovakCount(4, forms), "4 články");
  assert.equal(formatSlovakCount(5, forms), "5 článkov");
  assert.equal(formatSlovakCount(13, forms), "13 článkov");
});

test("organization copy cleaner removes only merge-history sentences and preserves paragraphs", async () => {
  const { cleanPublicOrganizationCopy } = await importTs("lib/help-organization-store.ts");
  const input = "Pomáhame psom v núdzi a hľadáme im bezpečné domovy.\n\nStarší samostatný profil bol zlúčený, aby sa nepublikoval dvakrát.\n\nVenujeme sa adopciám.";
  assert.equal(
    cleanPublicOrganizationCopy(input),
    "Pomáhame psom v núdzi a hľadáme im bezpečné domovy.\n\nVenujeme sa adopciám.",
  );
});

test("placeholder detector catches obvious production garbage without rejecting normal copy", async () => {
  const { isSuspiciousPlaceholderText, isSuspiciousNumericText } = await importTs("lib/public-integrity.ts");
  assert.equal(isSuspiciousPlaceholderText("gfhfghfghfgh"), true);
  assert.equal(isSuspiciousPlaceholderText("qwerty"), true);
  assert.equal(isSuspiciousPlaceholderText("krátka hladká srsť"), false);
  assert.equal(isSuspiciousNumericText("454545"), true);
  assert.equal(isSuspiciousNumericText("45 cm"), false);
});

test("legacy malformed article slugs have permanent redirect aliases and cleanup migration", async () => {
  const redirects = await fs.readFile(new URL("../lib/legacy-public-redirects.ts", import.meta.url), "utf8");
  const migration = await fs.readFile(new URL("../drizzle/0058_public_integrity_cleanup.sql", import.meta.url), "utf8");
  for (const slug of [
    "co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit",
    "zakladny-vycvik-psat",
    "ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk",
    "viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka",
    "banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py",
  ]) {
    assert.ok(redirects.includes(slug), "missing redirect alias for " + slug);
    assert.ok(migration.includes(slug), "missing cleanup migration for " + slug);
  }
});

test("public route contracts cover help, legacy shelters, lost/found hub and Magazín", async () => {
  const help = await fs.readFile(new URL("../components/help-browser.tsx", import.meta.url), "utf8");
  const shelters = await fs.readFile(new URL("../app/adresar/utulky-a-zachrana/page.tsx", import.meta.url), "utf8");
  const lostFound = await fs.readFile(new URL("../app/pomoc-psom/stratene-a-najdene/page.tsx", import.meta.url), "utf8");
  const magazine = await fs.readFile(new URL("../app/clanky/page.tsx", import.meta.url), "utf8");
  assert.match(help, /samostatnom prehľade adopcií/);
  assert.match(shelters, /permanentRedirect\("\/pomoc-psom\/utulky"\)/);
  assert.match(lostFound, /\/pomoc-psom\/stratene-psy/);
  assert.match(lostFound, /\/pomoc-psom\/najdene-psy/);
  assert.match(magazine, /Magazín pre život so psom/);
});

test("article slug generator no longer hard-cuts the final word", async () => {
  const source = await fs.readFile(new URL("../lib/article-store.ts", import.meta.url), "utf8");
  assert.match(source, /lastWordBoundary/);
  assert.doesNotMatch(source, /replace\(\/\^-\+\|-\+\$\/g, ""\)\s*\.slice\(0, 90\)/);
});
