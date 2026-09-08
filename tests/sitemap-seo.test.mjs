import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertValidSitemap, isSelfCanonical, latestModified, sitemapEntry } from "../lib/sitemap-seo.ts";

test("lastModified uses the latest real timestamp and omits unknown dates", () => {
  assert.equal(latestModified(["2026-08-17", "2026-09-07T12:30:00Z"])?.toISOString(), "2026-09-07T12:30:00.000Z");
  assert.equal(latestModified([undefined, "", "not-a-date"]), undefined);
  assert.equal("lastModified" in sitemapEntry("/sukromie", { changeFrequency: "monthly", priority: 0.5 }), false);
});

test("only indexable self-canonical content is eligible for sitemap", () => {
  assert.equal(isSelfCanonical(undefined, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labradorsky-retriever" }, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ noindex: true }, "/plemena/labradorsky-retriever"), false);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labrador" }, "/plemena/labradorsky-retriever"), false);
});

test("sitemap QA rejects duplicates, parameters, internal paths and redirect sources", () => {
  const entry = (path) => ({ url: `https://psipedia.sk${path}` });
  assert.throws(() => assertValidSitemap([entry("/plemena"), entry("/plemena")]), /sitemap-duplicate-url/);
  assert.throws(() => assertValidSitemap([entry("/plemena?fciGroup=1")]), /sitemap-parametric-url/);
  assert.throws(() => assertValidSitemap([entry("/admin")]), /sitemap-internal-url/);
  assert.throws(() => assertValidSitemap([entry("/adresar/psie-skoly")]), /sitemap-redirect-source/);
});

test("generated sitemap uses canonical public sources and no hardcoded fake dates", () => {
  const source = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(source, /listPublishedCanonicalBreedIndex/);
  assert.match(source, /isSelfCanonical/);
  assert.match(source, /assertValidSitemap/);
  assert.doesNotMatch(source, /new Date\(["']2026-08-(?:17|29)["']\)/);
  assert.doesNotMatch(source, /resolvedCanonical/);
});

test("filtered listings keep a clean base canonical", () => {
  const breeds = fs.readFileSync(new URL("../app/plemena/page.tsx", import.meta.url), "utf8");
  const directory = fs.readFileSync(new URL("../app/adresar/page.tsx", import.meta.url), "utf8");
  const directoryCategory = fs.readFileSync(new URL("../app/adresar/[category]/page.tsx", import.meta.url), "utf8");
  assert.match(breeds, /path:\s*["']\/plemena["']/);
  assert.match(directory, /path:\s*["']\/adresar["']/);
  assert.match(directoryCategory, /path:\s*`\/adresar\/\$\{category\.slug\}`/);
});
